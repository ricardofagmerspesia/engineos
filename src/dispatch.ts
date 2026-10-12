import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson, type Io } from './io';

export type Command = (argv: string[], io: Io) => number;
// A command that may finish after an await (the hook adapter, whose prompt
// advisor waits on the routing decision layer). Every other command stays a
// plain Command; a Command is an AsyncCommand, so the table takes either.
export type ExitCode = number | Promise<number>;
export type AsyncCommand = (argv: string[], io: Io) => ExitCode;
export interface CommandTable { [name: string]: Command | AsyncCommand }

// Injected by scripts/build.mjs via `define`; falls back for tsc test builds.
declare const ENGINEOS_VERSION: string | undefined;

// Returns the command's own answer untouched: a number stays a number, so a
// synchronous command exits exactly as it always did, and only an async one
// hands the entry point a promise to await.
export function dispatch(table: Readonly<Record<string, Command>>, argv: string[], io: Io): number;
export function dispatch(table: CommandTable, argv: string[], io: Io): ExitCode;
export function dispatch(table: CommandTable, argv: string[], io: Io): ExitCode {
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
  // Test builds run from build/, one level below the repo root. The bundle
  // never reaches this path (ENGINEOS_VERSION is inlined at build time), so
  // 'unknown' only ever surfaces in the tsc test build, never a shipped CLI.
  try {
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') {
      return parsed.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
