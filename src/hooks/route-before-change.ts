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
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lazyRegistries, type KernelContext } from '../kernel/context';
import { resolve } from '../kernel/resolve';
import { findUpFile } from '../lib/git';
import { isRecord } from '../lib/json';
import { routeCachePaths, type RouteCachePaths } from './cache';
import { activeChangeRecords } from './change-records';
import { editContext, routeCacheBuster, routingSignature, writeAtomic, type WorktreeFacts } from './edit-context';
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

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (env.file === '') return silent;
  const start = dirOf(env.file);
  // bash `${HOOK_CWD:-$START}`: a payload without cwd is answered from the
  // edited file's own directory, which is the repo the edit lands in.
  const from = env.cwd === '' ? start : env.cwd;

  // Before any kernel work, any cache work and any filesystem walk: a bypassed
  // session must cost nothing and say nothing. One git process answers both the
  // per-repo bypass marker and the worktree facts (./edit-context).
  const edit = editContext(from, ctx);
  if (edit.status === 'bypassed') return silent;

  const git = edit.worktree;
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

function cachePaths(env: HookEnvelope, git: WorktreeFacts, ctx: HookContext): RouteCachePaths | null {
  if (git.gitDir === '') return null;
  const rel = cacheRel(env.file, git, env.cwd);
  if (rel === '') return null;
  return routeCachePaths(git.gitDir, env.sessionId, routingSignature(ctx.root), routeCacheBuster(ctx.io.env), rel);
}

// The edited file as a repo-relative path: under the repo root directly, or
// under the harness cwd, in which case the repo prefix puts it back on the root.
// Empty means "not placeable", which means "do not cache".
function cacheRel(file: string, git: WorktreeFacts, cwd: string): string {
  if (git.repo !== '' && file.startsWith(`${git.repo}/`)) return file.slice(git.repo.length + 1);
  const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
  if (file.startsWith(`${base}/`)) return `${git.prefix}${file.slice(base.length + 1)}`;
  return '';
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
  // The first active record answers; the rest are never read.
  return activeChangeRecords(dir).next().done === true ? CHANGE_RECORD_NOTE : '';
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
