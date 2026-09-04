import { readFileSync } from 'node:fs';

export interface Io {
  readStdin(): string;
  out(text: string): void;
  err(text: string): void;
  env: NodeJS.ProcessEnv;
  cwd(): string;
}

export function processIo(): Io {
  let consumed = false;
  return {
    readStdin(): string {
      // Hooks read stdin exactly once; a second read must not block on a closed pipe.
      if (consumed) return '';
      consumed = true;
      try {
        return readFileSync(0, 'utf8');
      } catch {
        return '';
      }
    },
    out(text: string): void {
      process.stdout.write(text);
    },
    err(text: string): void {
      process.stderr.write(text);
    },
    env: process.env,
    cwd: () => process.cwd(),
  };
}

export function memoryIo(opts: { stdin?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Io & { stdout: string[]; stderr: string[] } {
  let stdin = opts.stdin ?? '';
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    readStdin(): string {
      const s = stdin;
      stdin = '';
      return s;
    },
    out: (t) => { stdout.push(t); },
    err: (t) => { stderr.push(t); },
    env: opts.env ?? {},
    cwd: () => opts.cwd ?? '/',
  };
}

export function writeJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}
