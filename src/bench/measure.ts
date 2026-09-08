// The measurement primitives behind `engineos bench`, ported from the python
// program scripts/bench-runtime.sh used to embed (python3 is no longer a runtime
// dependency). The five budget names, the ok/FAIL line format and
// ENGINEOS_PERF_MULTIPLIER are public surface (docs/COMPATIBILITY.md, CI's
// "Runtime performance budgets" step), so every formatting decision below is
// python's rather than a fresh one: `{status:4}` left-pads to four columns,
// `{:.1f}` keeps one decimal, `int()` truncates.
//
// Every I/O is an injected dependency so a unit test drives the whole ladder
// without spawning a hook or waiting on a real clock.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError } from '../lib/json';

export interface Measurement {
  name: string;
  actual: number;
  budget: number;
  unit: 'ms' | 'bytes';
}

export interface TimedCommand {
  command: string[];
  stdin?: string;
  env?: NodeJS.ProcessEnv;
  samples: number;
}

export interface BenchSpawnOptions {
  input: string;
  encoding: 'utf8';
  stdio: ('pipe' | 'ignore')[];
  env?: NodeJS.ProcessEnv | undefined;
}

// The exact slice of `spawnSync` this module uses, rather than `typeof spawnSync`
// itself: that is an overload set whose first signature returns Buffers, so a
// test fake cannot satisfy it without a type assertion. Same reasoning, and the
// same shape of answer, as `SpawnSyncLike` in src/hooks/runner.ts.
export type BenchSpawn = (
  command: string,
  args: readonly string[],
  options: BenchSpawnOptions,
) => {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error | undefined;
};

export interface BenchDeps {
  spawn: BenchSpawn;
  // Fractional milliseconds from a monotonic source — python's time.perf_counter().
  now: () => number;
  mkdtemp: () => string;
}

// python's float() accepts a decimal or exponent literal and nothing else, so a
// bare Number() (which would take "0x10") or a bare parseFloat (which would take
// "1abc" as 1) would both widen what CI accepts as a budget multiplier.
const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseMultiplier(raw: string | undefined): number {
  // bash spelled the default `${ENGINEOS_PERF_MULTIPLIER:-1}`, where an empty
  // value is an unset one.
  if (raw === undefined || raw === '') return 1;
  const text = raw.trim();
  if (!NUMERIC.test(text)) throw new KernelError('ENGINEOS_PERF_MULTIPLIER must be numeric');
  const value = Number.parseFloat(text);
  if (value <= 0) throw new KernelError('ENGINEOS_PERF_MULTIPLIER must be greater than zero');
  return value;
}

// One spawn, checked. python passed check=True: a hot path that fails is a loud
// red, never a fast median measured over a command that never did the work.
export function runOnce(cmd: TimedCommand, deps: BenchDeps): void {
  const bin = cmd.command[0];
  if (bin === undefined) throw new KernelError('bench: cannot run an empty command');
  const args = cmd.command.slice(1);
  const options: BenchSpawnOptions = {
    input: cmd.stdin ?? '',
    encoding: 'utf8',
    // python's stdout=DEVNULL, stderr=DEVNULL: the child's own output would
    // interleave with the budget report and is not what is being measured.
    stdio: ['pipe', 'ignore', 'ignore'],
    env: cmd.env,
  };
  const result = deps.spawn(bin, args, options);
  const label = cmd.command.join(' ');
  if (result.error !== undefined) throw new KernelError(`bench: ${label} exited ${result.error.message}`);
  if (result.signal !== null) throw new KernelError(`bench: ${label} exited ${result.signal}`);
  if (result.status !== 0) throw new KernelError(`bench: ${label} exited ${String(result.status)}`);
}

export function medianMs(cmd: TimedCommand, deps: BenchDeps): number {
  const durations: number[] = [];
  for (let sample = 0; sample < cmd.samples; sample += 1) {
    const started = deps.now();
    runOnce(cmd, deps);
    durations.push(deps.now() - started);
  }
  return median(durations);
}

// The size of CLAUDE.md plus every file it imports with an `@rules/` line — the
// context every session pays for before any routing happens.
export function alwaysOnBytes(root: string): number {
  const claudeMd = join(root, 'CLAUDE.md');
  let total = statSync(claudeMd).size;
  for (const line of readFileSync(claudeMd, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('@rules/')) continue;
    // python's `root / line[1:]`: the leading '@' is the import marker, the rest
    // is a path relative to the root.
    total += statSync(join(root, line.slice(1))).size;
  }
  return total;
}

export function formatMeasurement(m: Measurement, multiplier: number): { line: string; failed: boolean } {
  const effective = m.budget * multiplier;
  // python: ok iff actual < effective, so equality fails and a NaN median fails.
  const failed = !(m.actual < effective);
  const head = `${(failed ? 'FAIL' : 'ok').padEnd(4)} ${m.name}: `;
  const body = m.unit === 'ms'
    ? `median=${m.actual.toFixed(1)}ms budget<${effective.toFixed(1)}ms`
    : `${Math.trunc(m.actual)} bytes budget<${Math.trunc(effective)} bytes`;
  return { line: `${head}${body}`, failed };
}

// statistics.median: the middle of an odd sample count, the mean of the two
// middle values otherwise. Every call site uses an odd count; the even branch
// exists so a future one cannot silently get the wrong half.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) throw new KernelError('bench: cannot take the median of zero samples');
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}
