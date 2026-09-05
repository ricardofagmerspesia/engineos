// Wiring for `engineos init`: build the deps the port needs and hand over. The
// command's own behaviour — argument parsing, refusals, exit codes — lives in
// ./project, where a test can drive it without spawning the CLI.
import { spawnSync } from 'node:child_process';
import type { Command } from '../dispatch';
import type { Io } from '../io';
import { resolveRoot } from '../registry/paths';
import { initProject } from './project';

export const runInit: Command = (argv: string[], io: Io): number => {
  let root: string;
  try {
    root = resolveRoot(io.env);
  } catch {
    // Same class as the sibling checks in ./project: the runtime cannot find the
    // registries it is supposed to seed from, which is a broken checkout, not a
    // bad invocation.
    io.err('[engineos] broken checkout: cannot locate the EngineOS root (no registries/routing.json above the runtime)\n');
    return 1;
  }
  return initProject(argv, { io, root, spawn: spawnSync });
};
