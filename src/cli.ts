// Entry point. Everything above the guard must parse on node 16.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { processIo, writeJson } from './io';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR, type GuardOutcome } from './node-guard';
import { dispatch, type CommandTable } from './dispatch';
import { message, render } from './hooks/output';
import { runKernel } from './kernel/cli';
import { runJournal } from './journal/cli';
import { runTelemetry } from './journal/telemetry-cli';
import { runHook } from './hooks/cli';
import { runInit } from './init/cli';
import { runSettingsMerge } from './install/cli';
import { runBypass } from './bypass/cli';
import { runGen } from './gen/cli';
import { runEvals } from './evals/run';
import { runBench } from './bench/run';
import { runUsageReport } from './report/usage';
import { runValidate } from './validate/cli';

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
      // hooks/output.ts imports nothing, so the guard can render through the same
      // writer every hook uses even on the node it is about to refuse.
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

const table: CommandTable = {
  kernel: runKernel,
  journal: runJournal,
  telemetry: runTelemetry,
  hook: runHook,
  init: runInit,
  'settings-merge': runSettingsMerge,
  bypass: runBypass,
  gen: runGen,
  evals: runEvals,
  bench: runBench,
  'usage-report': runUsageReport,
  validate: runValidate,
};
const code = dispatch(table, argv, io);
if (typeof code === 'number') {
  process.exit(code);
} else {
  // Exit as soon as the command settles rather than when the event loop drains:
  // a keep-alive socket from the decision layer's fetch must not hold the hook
  // open after its answer is already written.
  code.then(
    (status) => process.exit(status),
    (e: unknown) => {
      io.err(`[engineos] ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    },
  );
}
