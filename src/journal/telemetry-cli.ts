import { writeJson, type Io } from '../io';
import type { Command } from '../dispatch';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import {
  appendEvent,
  parseAppendArgs,
  requirePolicyPresent,
  TelemetryError,
  TelemetryUsageError,
  usage,
  validateTelemetry,
} from './telemetry';

// Two failure conventions, as in scripts/telemetry.sh: err() writes {"error": m}
// to STDOUT, usage() writes two lines to stderr. Both exit 1.
export const runTelemetry: Command = (argv: string[], io: Io): number => {
  const [name, ...args] = argv;
  try {
    // bash dispatches on the subcommand before it resolves anything, so an
    // unknown one is a usage error even with no registries in sight.
    if (name !== 'append' && name !== 'validate') throw new TelemetryUsageError();
    return name === 'append' ? runAppend(args, io) : runValidate(args, io);
  } catch (e) {
    if (e instanceof TelemetryUsageError) {
      io.err(usage());
      return 1;
    }
    if (e instanceof TelemetryError || e instanceof KernelError) {
      writeJson(io, { error: e.message });
      return 1;
    }
    throw e;
  }
};

function runAppend(args: string[], io: Io): number {
  if (args.length === 0) throw new TelemetryUsageError();
  const root = resolveRoot(io.env);
  // Ordered as bash orders it: the registry is checked before the flags are, so
  // a run that is wrong in both ways reports the missing registry.
  requirePolicyPresent(root);
  const { file, options } = parseAppendArgs(args);
  appendEvent(root, file, options);
  return 0;
}

function runValidate(args: string[], io: Io): number {
  const file = args[0];
  if (file === undefined) throw new TelemetryUsageError();
  const root = resolveRoot(io.env);
  const { lines, bad } = validateTelemetry(root, file);
  for (const line of bad) io.err(`line ${line}: does not match the telemetry schema\n`);
  if (bad.length > 0) {
    io.err(`${bad.length} invalid line(s) in ${file}\n`);
    return 1;
  }
  io.out(`${file}: ${lines} line(s), all valid\n`);
  return 0;
}
