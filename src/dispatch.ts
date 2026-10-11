import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson, type Io } from './io';

export type Command = (argv: string[], io: Io) => number;
// A command that may await before answering its exit code. Only the hook
// adapter is one today (the prompt advisor awaits the judge); every other
// command stays synchronous, and a Command is assignable to this type.
export type MaybeAsyncCommand = (argv: string[], io: Io) => number | Promise<number>;
export interface SyncCommandTable { [name: string]: Command }
export interface CommandTable { [name: string]: MaybeAsyncCommand }

// Injected by scripts/build.mjs via `define`; falls back for tsc test builds.
declare const ENGINEOS_VERSION: string | undefined;

// A table of synchronous commands answers synchronously, so callers that need a
// plain exit code (in-process drives, tests) keep one.
export function dispatch(table: SyncCommandTable, argv: string[], io: Io): number;
export function dispatch(table: CommandTable, argv: string[], io: Io): number | Promise<number>;
export function dispatch(table: CommandTable, argv: string[], io: Io): number | Promise<number> {
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

// The entry points' exit: a synchronous answer exits in the same tick, exactly
// as before async commands existed; a pending one exits when it settles. The
// only asynchronous command is the hook adapter, whose contract is a silent
// exit 0 on any failure, so a rejection exits 0 too.
export function exitWith(result: number | Promise<number>, exit: (code: number) => void): void {
  if (typeof result === 'number') {
    exit(result);
    return;
  }
  void result.then(
    (code) => exit(code),
    () => exit(0),
  );
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
