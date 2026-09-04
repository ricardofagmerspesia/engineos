import type { Io } from './io';
import { writeJson } from './io';

export type Command = (argv: string[], io: Io) => number;
export interface CommandTable { [name: string]: Command }

// Injected by scripts/build.mjs via `define`; falls back for tsc test builds.
declare const ENGINEOS_VERSION: string | undefined;

export function dispatch(table: CommandTable, argv: string[], io: Io): number {
  const [name, ...rest] = argv;
  if (name === '--version' || name === '-v') {
    const v = typeof ENGINEOS_VERSION === 'string' ? ENGINEOS_VERSION : readPackageVersion();
    io.out(`engineos ${v}\n`);
    return 0;
  }
  const command = name === undefined ? undefined : table[name];
  if (command === undefined) {
    writeJson(io, { error: `unknown command: ${name ?? ''}` });
    return 1;
  }
  return command(rest, io);
}

function readPackageVersion(): string {
  // Test builds run from build/, one level below the repo root.
  const pkg = require('../package.json') as { version: string };
  return pkg.version;
}
