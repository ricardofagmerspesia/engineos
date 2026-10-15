// The EngineOS bypass switch — single source of truth for "is EngineOS off right
// now". Library half of hooks/bypass.sh; the `on|off|status` CLI is separate.
//
// Three switches, checked in this order, any one of which is enough:
//   ENGINEOS_BYPASS=1              — process-scoped escape hatch
//   ~/.claude/engineos.bypass      — machine-wide, sticky until toggled off
//   <git-dir>/ENGINEOS_BYPASS      — per-repo, expires at the next SessionStart
//
// The marker lives in the git dir so it is never committed and is per-worktree
// for free. It is deliberately not session-scoped: the /engineos:bypass command
// cannot see the session id, so SessionStart deletes the marker instead. That
// failure direction is the safe one — a forgotten bypass expires into gates-ON.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { spawnSync } from 'node:child_process';
import { gitDir, gitDirOnDisk } from '../lib/git';

// The per-repo marker's file name inside the git dir.
const MARKER = 'ENGINEOS_BYPASS';

// Overridable so a test run is never at the mercy of the operator's real machine
// state: point ENGINEOS_BYPASS_FLAG at a path that does not exist to isolate.
//
// Exported because `engineos bypass` has to NAME the switch that is on, not just
// answer whether one is (src/bypass/cli.ts) — a second copy of this resolution
// there is exactly the drift the single source of truth exists to prevent.
export function bypassFlagPath(env: NodeJS.ProcessEnv): string {
  const configured = env['ENGINEOS_BYPASS_FLAG'];
  if (configured !== undefined && configured !== '') return configured;
  const home = env['HOME'];
  return join(home !== undefined && home !== '' ? home : homedir(), '.claude', 'engineos.bypass');
}

// The two switches that need no repository: the process variable and the
// machine-wide flag. Exported so a hook that resolves the git dir itself
// (./edit-context) spends no git process at all on a bypassed session.
export function bypassSwitchedOn(env: NodeJS.ProcessEnv): boolean {
  return env['ENGINEOS_BYPASS'] === '1' || existsSync(bypassFlagPath(env));
}

// The per-repo switch, given a git dir the caller already resolved. Null is
// "not inside a repository", which has nowhere to keep the marker.
export function bypassMarkedAt(dir: string | null): boolean {
  return dir !== null && existsSync(`${dir}/${MARKER}`);
}

// Null when the directory is not inside a git repo: there is nowhere to put the
// flag, so nothing is bypassed and every hook behaves normally. The empty-cwd
// fallback mirrors bash `${1:-$PWD}` — a payload without cwd is the same repo in
// every case a hook actually fires.
export function bypassMarker(cwd: string, spawn: typeof spawnSync): string | null {
  const dir = gitDir(cwd === '' ? process.cwd() : cwd, spawn);
  return dir === null ? null : `${dir}/${MARKER}`;
}

export function bypassActive(cwd: string, env: NodeJS.ProcessEnv, spawn: typeof spawnSync): boolean {
  if (bypassSwitchedOn(env)) return true;
  return bypassMarkedAt(gitDir(cwd === '' ? process.cwd() : cwd, spawn));
}

// The same answer with no subprocess: for a hook path that must spawn nothing
// (the automatic Stop), the marker is looked up by walking the filesystem.
export function bypassActiveOnDisk(cwd: string, env: NodeJS.ProcessEnv): boolean {
  if (bypassSwitchedOn(env)) return true;
  return bypassMarkedAt(gitDirOnDisk(cwd === '' ? process.cwd() : cwd));
}
