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
import { gitDir } from '../lib/git';

// Overridable so a test run is never at the mercy of the operator's real machine
// state: point ENGINEOS_BYPASS_FLAG at a path that does not exist to isolate.
function flagPath(env: NodeJS.ProcessEnv): string {
  const configured = env['ENGINEOS_BYPASS_FLAG'];
  if (configured !== undefined && configured !== '') return configured;
  const home = env['HOME'];
  return join(home !== undefined && home !== '' ? home : homedir(), '.claude', 'engineos.bypass');
}

// Null when the directory is not inside a git repo: there is nowhere to put the
// flag, so nothing is bypassed and every hook behaves normally. The empty-cwd
// fallback mirrors bash `${1:-$PWD}` — a payload without cwd is the same repo in
// every case a hook actually fires.
export function bypassMarker(cwd: string, spawn: typeof spawnSync): string | null {
  const dir = gitDir(cwd === '' ? process.cwd() : cwd, spawn);
  return dir === null ? null : `${dir}/ENGINEOS_BYPASS`;
}

export function bypassActive(cwd: string, env: NodeJS.ProcessEnv, spawn: typeof spawnSync): boolean {
  if (env['ENGINEOS_BYPASS'] === '1') return true;
  if (existsSync(flagPath(env))) return true;
  const marker = bypassMarker(cwd, spawn);
  return marker !== null && existsSync(marker);
}
