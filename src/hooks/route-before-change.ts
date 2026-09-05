// PreToolUse(Edit|Write|NotebookEdit): route the upcoming change to the right
// rules, skill and specialist agent. NON-BLOCKING — the decision is always a
// `context` injection or silence, never a block, and this hook never sets
// permissionDecision, so the user's normal edit-permission prompt is preserved.
//
// Ported from hooks/route-before-change.sh. The canonical mapping lives in
// registries/routing.json and is resolved by the kernel's route section: one
// in-process `resolve({ path })` call answers both `excluded` and
// `hook_guidance`, and the guidance string itself is rendered by the kernel
// (src/kernel/route.ts renderGuidance), never here.
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lazyRegistries, type KernelContext } from '../kernel/context';
import { resolve } from '../kernel/resolve';
import { findUpFile } from '../lib/git';
import { isRecord } from '../lib/json';
import { bypassActive } from './bypass';
import { routeCachePaths, type RouteCachePaths } from './cache';
import { context, silent, type HookContext, type HookDecision } from './output';
import type { HookEnvelope } from './envelope';

// The one value that is not guidance: an excluded meta/scaffolding file gets no
// routing at all, and the cache has to be able to remember that as distinctly as
// it remembers "routed to nothing" (which is the empty string).
const EXCLUDED_SENTINEL = '__ENGINEOS_EXCLUDED__';

// What a path with no domain still gets told: the always-on set.
const DEFAULT_GUIDE = 'base.md+git.md only';

const CHANGE_RECORD_NOTE = ' | no active .engineos/changes record — open one (.engineos/changes/_template.md)';

// The extensions that make an edit a CODE edit, and so worth a change-record
// reminder. Same list the bash case statement carried.
const CODE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.sql'];

// grep -l '^status:[[:space:]]*active' over one change record. The class is the
// horizontal whitespace of a single line: grep matches per line, so the newline
// members of [[:space:]] can never participate.
const ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;

interface GitInfo {
  repo: string;
  gitDir: string;
  prefix: string;
}

const NO_GIT: GitInfo = { repo: '', gitDir: '', prefix: '' };

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (env.file === '') return silent;
  const start = dirOf(env.file);
  // bash `${HOOK_CWD:-$START}`: a payload without cwd is answered from the
  // edited file's own directory, which is the repo the edit lands in.
  const from = env.cwd === '' ? start : env.cwd;

  // Before any kernel work, any cache work and any filesystem walk: a bypassed
  // session must cost nothing and say nothing.
  if (bypassActive(from, ctx.io.env, ctx.spawn)) return silent;

  const git = gitInfo(from, ctx);
  const cache = cachePaths(env, git, ctx);

  // A path's route is immutable until routing.json changes, so the compact
  // answer is cached per session in the worktree git dir (see ./cache for the
  // key). A hit skips the kernel entirely — that is the budget this hook is
  // measured against in scripts/bench-runtime.sh.
  let guide = cache === null ? null : readGuide(cache.route);
  if (guide === null) {
    guide = kernelGuide(env.file, ctx);
    if (cache !== null) writeAtomic(cache.route, `${guide}\n`);
  }
  if (guide === EXCLUDED_SENTINEL) return silent;

  const projectClaude = findUpFile(start, 'CLAUDE.md');
  const projectNote = projectClaude === null ? '' : ` | follow project CLAUDE.md (project > EngineOS): ${projectClaude}`;
  const changeNote = changeRecordNote(env.file, git.repo);

  if (guide === '' && projectNote === '' && changeNote === '') return silent;

  // The two notes are the only dynamic part of the message, so the decision may
  // be reused verbatim exactly when neither of them applies.
  const reusable = projectNote === '' && changeNote === '' ? cache : null;
  if (reusable !== null) {
    const cached = readDecision(reusable.output);
    if (cached !== null) return cached;
  }

  const decision = context('PreToolUse', `[router] ${guide === '' ? DEFAULT_GUIDE : guide}${projectNote}${changeNote}`);
  if (reusable !== null) writeAtomic(reusable.output, `${JSON.stringify(decision)}\n`);
  return decision;
}

// bash `case "$f" in */*) "${f%/*}" or "/" ;; *) "." ;; esac`. Not path.dirname:
// the walk in ../lib/git converges a relative path to "." and stops there.
function dirOf(file: string): string {
  const cut = file.lastIndexOf('/');
  if (cut === -1) return '.';
  return cut === 0 ? '/' : file.slice(0, cut);
}

// The three facts the rest of the hook needs, in one git process. It is the
// second `rev-parse` of the fire — ./bypass resolved the git dir on its own —
// and that is the deliberate trade: the alternative is a private copy of the
// bypass policy here, and the prefix is answered by no shared helper anyway.
function gitInfo(cwd: string, ctx: HookContext): GitInfo {
  const result = ctx.spawn('git', ['-C', cwd, 'rev-parse', '--show-toplevel', '--absolute-git-dir', '--show-prefix'], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) return NO_GIT;
  const lines = (typeof result.stdout === 'string' ? result.stdout : '').split('\n');
  return { repo: lines[0] ?? '', gitDir: lines[1] ?? '', prefix: lines[2] ?? '' };
}

function cachePaths(env: HookEnvelope, git: GitInfo, ctx: HookContext): RouteCachePaths | null {
  if (git.gitDir === '') return null;
  const rel = cacheRel(env.file, git, env.cwd);
  if (rel === '') return null;
  return routeCachePaths(git.gitDir, env.sessionId, routingSignature(ctx.root), ctx.io.env['ENGINEOS_ROUTE_CACHE_BUSTER'] ?? '', rel);
}

// The edited file as a repo-relative path: under the repo root directly, or
// under the harness cwd, in which case the repo prefix puts it back on the root.
// Empty means "not placeable", which means "do not cache".
function cacheRel(file: string, git: GitInfo, cwd: string): string {
  if (git.repo !== '' && file.startsWith(`${git.repo}/`)) return file.slice(git.repo.length + 1);
  const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
  if (file.startsWith(`${base}/`)) return `${git.prefix}${file.slice(base.length + 1)}`;
  return '';
}

// bash `stat -f '%m-%z'` / `stat -c '%Y-%s'`: mtime seconds and size. Any edit to
// the registry invalidates every entry without touching a project file.
function routingSignature(root: string): string {
  try {
    const stats = statSync(join(root, 'registries', 'routing.json'));
    return `${Math.floor(stats.mtimeMs / 1000)}-${stats.size}`;
  } catch {
    // A registry that cannot be stat'd still produces a stable key, so the fire
    // answers from cache instead of failing on the key alone. Same literal the
    // bash `|| printf unknown` fallback used.
    return 'unknown';
  }
}

// The first line of the cache entry, or null for a miss. An entry holding the
// empty guide is a HIT: "this path routes nowhere" is an answer worth caching.
function readGuide(path: string): string | null {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  if (contents === '') return null;
  const newline = contents.indexOf('\n');
  return newline === -1 ? contents : contents.slice(0, newline);
}

function kernelGuide(file: string, ctx: HookContext): string {
  try {
    const kernel: KernelContext = { root: ctx.root, registries: lazyRegistries(ctx.root) };
    const route = resolve({ path: file }, kernel).route;
    // `domain` is the path form's own key; the prompt forms of the route section
    // do not carry it.
    if (route === undefined || !('domain' in route)) return '';
    if (route.excluded) return EXCLUDED_SENTINEL;
    return route.domain === null ? '' : route.hook_guidance;
  } catch {
    // A broken registry must not block an edit. The bash hook swallowed the
    // kernel's failure the same way and fell through to the default guide.
    return '';
  }
}

// The cached decision, or null for a miss. Deliberately lenient: the cache
// format is internal and wiped every SessionStart, so a file from an older
// format or a truncated write is a miss, never an error.
function readDecision(path: string): HookDecision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed['kind'] !== 'context' || parsed['event'] !== 'PreToolUse') return null;
  const text = parsed['text'];
  return typeof text === 'string' ? context('PreToolUse', text) : null;
}

// Soft reminder: a code edit with no active change record. The repo root comes
// from `git rev-parse`, never from gluing "<root>/.git" — a linked worktree's
// .git is a file, not a directory, and the glued form breaks there.
function changeRecordNote(file: string, repo: string): string {
  if (repo === '') return '';
  if (!CODE_EXTENSIONS.some((extension) => file.endsWith(extension))) return '';
  const dir = join(repo, '.engineos', 'changes');
  if (!isDirectory(dir)) return '';
  return hasActiveRecord(dir) ? '' : CHANGE_RECORD_NOTE;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// The bash glob was `<dir>/*.md`: direct children only, dotfiles excluded. A
// directory that cannot be read counts as holding no active record, which is
// the same answer the failing grep produced.
function hasActiveRecord(dir: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.startsWith('.')) continue;
    let contents: string;
    try {
      contents = readFileSync(join(dir, entry), 'utf8');
    } catch {
      continue;
    }
    if (ACTIVE_RECORD.test(contents)) return true;
  }
  return false;
}

// tmp + rename, so a concurrent hook fire never reads half an entry.
function writeAtomic(path: string, contents: string): void {
  const cut = path.lastIndexOf('/');
  try {
    if (cut > 0) mkdirSync(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch {
    // A cache that cannot be written costs a kernel call next time and nothing
    // else. Reporting it would turn an unwritable git dir into hook noise on
    // every single edit.
  }
}
