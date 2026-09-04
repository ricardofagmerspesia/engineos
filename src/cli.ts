// Entry point. Everything above the guard must parse on node 16.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { processIo, writeJson } from './io';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR, type GuardOutcome } from './node-guard';
import { dispatch, type CommandTable } from './dispatch';
import { runKernel } from './kernel/cli';

const io = processIo();
const argv = process.argv.slice(2);

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function applyOutcome(outcome: GuardOutcome): void {
  switch (outcome.kind) {
    case 'proceed':
      return;
    case 'reexec': {
      const r = spawnSync(outcome.bin, [__filename, ...argv], { stdio: 'inherit', env: { ...process.env, ENGINEOS_REEXEC: '1' } });
      if (r.error === undefined && r.status !== null) {
        process.exit(r.status);
      }
      // Re-exec never started (non-executable candidate, ENOENT) or the child died by
      // signal — fall through to the no-newer-node policy instead of exiting silently.
      applyOutcome(guardOutcome(argv, process.versions.node, null));
      return;
    }
    case 'silent':
      process.exit(0);
      break;
    case 'skip':
      writeJson(io, { systemMessage: outcome.message });
      process.exit(0);
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

const table: CommandTable = { kernel: runKernel };
process.exit(dispatch(table, argv, io));
