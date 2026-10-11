// Entry point for the per-call hooks (S3 of the routing-replacement speed plan),
// bundled by scripts/build.mjs into dist/engineos-hot.cjs. The five hooks below
// fire on every Edit/Write, Bash and Agent tool call, so they get a bundle that
// carries neither the validator, the generators, the evals, the bench nor the
// session hooks. Everything else stays on dist/engineos.cjs, whose surface is
// unchanged; this entry answers `hook <name>` and `--version` only.
//
// Everything above the guard must parse on node 16, same as ./cli.ts.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { processIo, writeJson } from './io';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR, type GuardOutcome } from './node-guard';
import { dispatch, exitWith, type CommandTable } from './dispatch';
import { message, render } from './hooks/output';
import { runHookWith, type HookTable } from './hooks/adapter';
import { run as gitWriteGuard } from './hooks/git-write-guard';
import { run as routeBeforeChange } from './hooks/route-before-change';
import { run as markUnrecorded } from './hooks/mark-unrecorded';
import { run as announceAgentDispatch } from './hooks/announce-agent-dispatch';
import { run as announceAgentReturn } from './hooks/announce-agent-return';

const io = processIo();
const argv = process.argv.slice(2);

// The names hooks.json registers against this bundle. Adding one here without
// the matching hooks.json change is harmless; the reverse is an unknown hook.
const HOT_HOOKS: HookTable = {
  'git-write-guard': gitWriteGuard,
  'route-before-change': routeBeforeChange,
  'mark-unrecorded': markUnrecorded,
  'announce-agent-dispatch': announceAgentDispatch,
  'announce-agent-return': announceAgentReturn,
};

// The unknown-hook message names where every other hook lives.
const NOT_HOT = ' (not in the per-call bundle; run it through dist/engineos.cjs)';

// Same node floor handling as ./cli.ts: re-exec a newer node when one is
// installed, otherwise go silent or say why per SILENT_HOOKS.
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// The dist/ loader node was started with, as in ./cli.ts.
function entryScript(): string {
  return require.main?.filename ?? __filename;
}

function applyOutcome(outcome: GuardOutcome): void {
  switch (outcome.kind) {
    case 'proceed':
      return;
    case 'reexec': {
      const r = spawnSync(outcome.bin, [entryScript(), ...argv], { stdio: 'inherit', env: { ...process.env, ENGINEOS_REEXEC: '1' } });
      if (r.error === undefined && r.status !== null) {
        process.exit(r.status);
      }
      applyOutcome(guardOutcome(argv, process.versions.node, null));
      return;
    }
    case 'silent':
      process.exit(0);
      break;
    case 'skip':
      process.exit(render(message(outcome.message), io));
      break;
    case 'refuse':
      writeJson(io, { error: outcome.message });
      process.exit(1);
  }
}

if (currentMajor() < MIN_NODE_MAJOR) {
  const newer = process.env['ENGINEOS_REEXEC'] === '1' ? null : findNewerNode(process.env, existsSync, readdirSync, isExecutable);
  applyOutcome(guardOutcome(argv, process.versions.node, newer));
}

// The adapter of src/hooks/cli.ts over the hot table only: ./hooks/adapter
// imports no hook, so this bundle carries the five below and nothing else. An
// unknown name, an unreadable payload and a throwing or rejecting hook answer
// exactly as the full table answers them.
const table: CommandTable = { hook: runHookWith(HOT_HOOKS, NOT_HOT) };
exitWith(dispatch(table, argv, io), (code) => process.exit(code));
