// The repository facts an edit hook needs, read once per fire (S4 of the
// routing-replacement speed plan).
//
// route-before-change (PreToolUse) and mark-unrecorded (PostToolUse) each spent
// two `git rev-parse` processes per edit — one inside bypassActive for the
// per-repo marker, one of their own — and mark-unrecorded parsed
// registries/routing.json on every call for `excluded.self_dirs`. Both now ask
// here: one git process answers the bypass marker, the worktree facts and the
// git dir together, and self_dirs is read from a file kept beside the route
// cache, keyed by the same registry signature.
//
// The bypass POLICY stays in ./bypass; this module only hands it the git dir it
// would otherwise have resolved with a second process.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRouting } from '../registry/routing';
import { bypassMarkedAt, bypassSwitchedOn } from './bypass';
import { routeCachePaths } from './cache';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';

// What `git rev-parse --show-toplevel --absolute-git-dir --show-prefix` answered
// before this module existed; all three empty outside a work tree.
export interface WorktreeFacts {
  repo: string;
  gitDir: string;
  prefix: string;
}

const NO_WORKTREE: WorktreeFacts = { repo: '', gitDir: '', prefix: '' };

// `gitDir` is the answer `git rev-parse --absolute-git-dir` alone gives: set
// inside a bare repository or a .git directory too, where `worktree` is empty.
// The bypass marker and the unrecorded marker both live there.
export type EditContext =
  | { status: 'bypassed' }
  | { status: 'active'; worktree: WorktreeFacts; gitDir: string | null };

interface RepositoryFacts {
  worktree: WorktreeFacts;
  gitDir: string | null;
}

const NOT_A_REPOSITORY: RepositoryFacts = { worktree: NO_WORKTREE, gitDir: null };

// `--show-toplevel` goes LAST because it is the one argument that can fail inside
// a repository (bare, or cwd inside .git: git >= 2.25 dies there, older git
// prints nothing). rev-parse prints in argument order and die() flushes stdout,
// so the lines before it still arrive; `--is-inside-work-tree` says whether a
// top level line is owed at all. Outside any repository repo discovery fails
// before anything prints, which is exactly when `--absolute-git-dir` alone fails.
const REV_PARSE_ARGS: readonly string[] = ['rev-parse', '--absolute-git-dir', '--is-inside-work-tree', '--show-prefix', '--show-toplevel'];

export function editContext(from: string, ctx: HookContext): EditContext {
  // The two switches that need no repository come first, so a bypassed session
  // spends no git process at all — same as bypassActive.
  if (bypassSwitchedOn(ctx.io.env)) return { status: 'bypassed' };
  const facts = repositoryFacts(from, ctx);
  if (bypassMarkedAt(facts.gitDir)) return { status: 'bypassed' };
  return { status: 'active', worktree: facts.worktree, gitDir: facts.gitDir };
}

function repositoryFacts(from: string, ctx: HookContext): RepositoryFacts {
  const result = ctx.spawn('git', ['-C', from, ...REV_PARSE_ARGS], { encoding: 'utf8' });
  if (result.error !== undefined) return NOT_A_REPOSITORY;
  const lines = (typeof result.stdout === 'string' ? result.stdout : '').split('\n');
  const gitDir = lines[0] ?? '';
  if (gitDir === '') return NOT_A_REPOSITORY;
  const insideWorkTree = lines[1] === 'true';
  const repo = lines[3] ?? '';
  if (!insideWorkTree || result.status !== 0 || repo === '') return { worktree: NO_WORKTREE, gitDir };
  return { worktree: { repo, gitDir, prefix: lines[2] ?? '' }, gitDir };
}

// bash `stat -f '%m-%z'` / `stat -c '%Y-%s'`: mtime seconds and size. Any edit to
// the registry invalidates every route entry, and the self_dirs entry with them,
// without touching a project file.
export function routingSignature(root: string): string {
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

export function routeCacheBuster(env: NodeJS.ProcessEnv): string {
  return env['ENGINEOS_ROUTE_CACHE_BUSTER'] ?? '';
}

// EngineOS's own meta dirs (routing.json `.excluded.self_dirs`). Only an edit
// under the EngineOS checkout can match one, so every other edit is answered
// without opening the registry.
export function underSelfDir(env: HookEnvelope, gitDir: string | null, ctx: HookContext): boolean {
  if (!env.file.startsWith(`${ctx.root}/`)) return false;
  for (const dir of selfDirs(env.sessionId, gitDir, ctx)) {
    if (dir === '') continue;
    if (env.file.startsWith(`${ctx.root}/${dir}/`)) return true;
  }
  return false;
}

function selfDirs(sessionId: string, gitDir: string | null, ctx: HookContext): readonly string[] {
  const cache = gitDir === null ? null : selfDirsCachePath(gitDir, sessionId, ctx);
  const cached = cache === null ? null : readStrings(cache);
  if (cached !== null) return cached;
  let dirs: string[];
  try {
    dirs = loadRouting(ctx.root).excluded.self_dirs;
  } catch {
    // bash `jq ... 2>/dev/null`: an unreadable registry yields no exclusions and
    // the hook carries on rather than losing the flag. Not cached: the fix to the
    // registry changes its signature anyway, and a refusal is not an answer.
    return [];
  }
  if (cache !== null) writeAtomic(cache, `${JSON.stringify(dirs)}\n`);
  return dirs;
}

const SELF_DIRS_PROBE = 'engineos-self-dirs';
const PROBE_SUFFIX = `/${SELF_DIRS_PROBE}.route`;

// `<cache>/<key>.self-dirs`: a sibling of the session's `<key>/` directory rather
// than an entry inside it, so no repository path can collide with it, and the
// SessionStart wipe of the cache tree reaps it with everything else. The key
// comes from ./cache itself; a layout this function does not recognise means no
// caching, never a guessed path.
function selfDirsCachePath(gitDir: string, sessionId: string, ctx: HookContext): string | null {
  const probe = routeCachePaths(gitDir, sessionId, routingSignature(ctx.root), routeCacheBuster(ctx.io.env), SELF_DIRS_PROBE);
  if (probe === null || !probe.route.endsWith(PROBE_SUFFIX)) return null;
  return `${probe.route.slice(0, -PROBE_SUFFIX.length)}.self-dirs`;
}

// Lenient for the same reason the route cache is: the format is internal and
// wiped every SessionStart, so anything unreadable is a miss, never an error.
function readStrings(path: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const strings: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string') return null;
    strings.push(entry);
  }
  return strings;
}

// tmp + rename, so a concurrent hook fire never reads half an entry.
export function writeAtomic(path: string, contents: string): void {
  const cut = path.lastIndexOf('/');
  try {
    if (cut > 0) mkdirSync(path.slice(0, cut), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch {
    // A cache that cannot be written costs a recomputation next time and nothing
    // else. Reporting it would turn an unwritable git dir into hook noise on
    // every single edit.
  }
}
