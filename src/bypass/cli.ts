// `engineos bypass on|off|status [cwd]` — the CLI half of the bypass switch.
//
// The switch itself lives in src/hooks/bypass.ts and is read in-process by every
// hook; this file only sets, clears and NAMES what that module resolves. Port of
// the CLI block at the bottom of hooks/bypass.sh, which is now a shim over this.
//
// `off` clears the per-repo marker and nothing else: the two sticky switches are
// machine- and process-scoped, so clearing them from a repo-scoped command would
// be a surprise. It reports which one still holds instead.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import type { Io } from '../io';
import { bypassFlagPath, bypassMarker } from '../hooks/bypass';

const EXIT_OK = 0;
// Not a git repository, or the marker could not be written.
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const USAGE = 'usage: engineos bypass on|off|status [cwd]';

export interface BypassDeps {
  spawn: typeof spawnSync;
}

const DEFAULT_DEPS: BypassDeps = { spawn: spawnSync };

// Deliberately not annotated `Command`: the third parameter is the seam a test
// injects through, and the annotation would hide it from callers. The shape is a
// Command (the extra parameter is optional) and src/cli.ts registers it as one.
export function runBypass(argv: string[], io: Io, deps: BypassDeps = DEFAULT_DEPS): number {
  const action = argv[0] ?? 'status';
  const target = argv[1] ?? io.cwd();
  // Resolved before the action is dispatched, as bash did: outside a git repo
  // there is nowhere to put the marker, so even `status` refuses rather than
  // answering a reassuring "active" about a switch that cannot be set.
  const marker = bypassMarker(target, deps.spawn);
  if (marker === null) {
    io.err('engineos: not a git repository — bypass has no effect here\n');
    return EXIT_FAILURE;
  }
  const flag = bypassFlagPath(io.env);
  switch (action) {
    case 'on':
      try {
        writeFileSync(marker, '');
      } catch (e) {
        io.err(`engineos: cannot create ${marker}: ${reason(e)}\n`);
        return EXIT_FAILURE;
      }
      io.out('engineos: BYPASSED — routing, agent dispatch, and Stop gates are off for this session\n');
      return EXIT_OK;
    case 'off':
      try {
        rmSync(marker, { force: true });
      } catch (e) {
        io.err(`engineos: cannot clear ${marker}: ${reason(e)}\n`);
        return EXIT_FAILURE;
      }
      if (io.env['ENGINEOS_BYPASS'] === '1') {
        io.err('engineos: repo marker cleared, but ENGINEOS_BYPASS=1 still bypasses everything — unset it to restore\n');
      } else if (existsSync(flag)) {
        io.err(`engineos: repo marker cleared, but ${flag} still bypasses everything — delete it to restore\n`);
      } else {
        io.out('engineos: active — routing, agent dispatch, and Stop gates restored\n');
      }
      return EXIT_OK;
    case 'status':
      io.out(`${statusLine(marker, flag, io.env)}\n`);
      return EXIT_OK;
    default:
      io.err(`${USAGE}\n`);
      return EXIT_USAGE;
  }
}

// The same three sources in the same order as bypassActive, probed again here
// because that function answers "is it on" and this one has to answer "which one
// is on" — a boolean cannot name the switch the operator has to go and remove.
function statusLine(marker: string, flag: string, env: NodeJS.ProcessEnv): string {
  if (env['ENGINEOS_BYPASS'] === '1') return 'bypassed (ENGINEOS_BYPASS=1)';
  if (existsSync(flag)) return `bypassed (${flag})`;
  return existsSync(marker) ? 'bypassed (repo marker)' : 'active';
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
