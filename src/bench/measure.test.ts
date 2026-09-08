import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import { alwaysOnBytes, formatMeasurement, medianMs, parseMultiplier, type BenchDeps, type BenchSpawn, type TimedCommand } from './measure';

interface Call {
  command: string;
  args: readonly string[];
  input: string;
  env: NodeJS.ProcessEnv | undefined;
}

interface Outcome {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
}

// No case in this file spawns anything: the fake answers, records what it was
// asked, and the clock below supplies the durations the median is taken over.
function recorder(outcome: Outcome = {}): { spawn: BenchSpawn; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: BenchSpawn = (command, args, options) => {
    calls.push({ command, args, input: options.input, env: options.env });
    return {
      status: outcome.status === undefined ? 0 : outcome.status,
      signal: outcome.signal === undefined ? null : outcome.signal,
      error: outcome.error,
    };
  };
  return { spawn, calls };
}

// Yields a start stamp then an end stamp per sample, so the nth duration is the
// nth value given. Samples are separated by a gap, so a start/end mix-up in the
// implementation produces an absurd number rather than a plausible one.
function clock(durations: number[]): () => number {
  let index = 0;
  let base = 0;
  let atStart = true;
  return () => {
    if (atStart) {
      atStart = false;
      return base;
    }
    atStart = true;
    const end = base + (durations[index] ?? 0);
    index += 1;
    base = end + 1000;
    return end;
  };
}

function deps(spawn: BenchSpawn, durations: number[] = []): BenchDeps {
  return {
    spawn,
    now: clock(durations),
    mkdtemp: () => {
      throw new Error('mkdtemp is not part of this case');
    },
  };
}

const NUMERIC_MESSAGE = 'ENGINEOS_PERF_MULTIPLIER must be numeric';
const POSITIVE_MESSAGE = 'ENGINEOS_PERF_MULTIPLIER must be greater than zero';

test('an unset or empty multiplier is the bash default of 1', () => {
  assert.equal(parseMultiplier(undefined), 1);
  assert.equal(parseMultiplier(''), 1);
});

test('the multiplier accepts what python float() accepted', () => {
  assert.equal(parseMultiplier('2'), 2);
  assert.equal(parseMultiplier('1e0'), 1);
  assert.equal(parseMultiplier('1.5'), 1.5);
  assert.equal(parseMultiplier(' 3 '), 3);
});

test('a non-numeric multiplier is refused with the python message', () => {
  for (const raw of ['abc', '1abc', '0x10', '   ', '--']) {
    assert.throws(() => parseMultiplier(raw), { message: NUMERIC_MESSAGE }, raw);
  }
});

test('a multiplier at or below zero is refused with the python message', () => {
  for (const raw of ['0', '-1', '-0.5']) {
    assert.throws(() => parseMultiplier(raw), { message: POSITIVE_MESSAGE }, raw);
  }
});

test('medianMs runs the command once per sample and takes the middle duration', () => {
  const { spawn, calls } = recorder();
  const cmd: TimedCommand = {
    command: ['/root/scripts/kernel.sh', 'route-intent', 'a prompt'],
    stdin: '{"a":1}',
    env: { ENGINEOS_TELEMETRY: '0' },
    samples: 5,
  };
  assert.equal(medianMs(cmd, deps(spawn, [41, 12, 90, 5, 60])), 41);
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.command, '/root/scripts/kernel.sh');
    assert.deepEqual(call.args, ['route-intent', 'a prompt']);
    assert.equal(call.input, '{"a":1}');
    assert.deepEqual(call.env, { ENGINEOS_TELEMETRY: '0' });
  }
});

test('a command with no stdin or env is spawned with an empty input and an inherited environment', () => {
  const { spawn, calls } = recorder();
  medianMs({ command: ['/root/scripts/kernel.sh'], samples: 1 }, deps(spawn, [7]));
  assert.equal(calls[0]?.input, '');
  assert.equal(calls[0]?.env, undefined);
});

test('a non-zero exit is a loud failure naming the command, not a fast median', () => {
  const { spawn, calls } = recorder({ status: 2 });
  assert.throws(
    () => medianMs({ command: ['/root/hooks/prompt-advisor.sh', '--x'], samples: 5 }, deps(spawn, [1, 1, 1, 1, 1])),
    { message: 'bench: /root/hooks/prompt-advisor.sh --x exited 2' },
  );
  // The loop stops at the first failure rather than measuring four more.
  assert.equal(calls.length, 1);
});

test('a command killed by a signal fails with the signal name', () => {
  const { spawn } = recorder({ status: null, signal: 'SIGKILL' });
  assert.throws(
    () => medianMs({ command: ['/root/scripts/kernel.sh'], samples: 1 }, deps(spawn, [1])),
    { message: 'bench: /root/scripts/kernel.sh exited SIGKILL' },
  );
});

test('a command that could not be spawned fails with the spawn error', () => {
  const { spawn } = recorder({ status: null, error: new Error('spawnSync /root/missing.sh ENOENT') });
  assert.throws(
    () => medianMs({ command: ['/root/missing.sh'], samples: 1 }, deps(spawn, [1])),
    { message: 'bench: /root/missing.sh exited spawnSync /root/missing.sh ENOENT' },
  );
});

test('alwaysOnBytes sums CLAUDE.md and the files it imports with @rules/ lines', (t) => {
  const root = tempRoot(t);
  // The @templates/ line must be ignored: it names a file that does not exist,
  // so a port that stats every import instead of the @rules/ ones fails here.
  const claudeMd = '# EngineOS\n@rules/base.md\n@rules/security.md\n@templates/absent.md\nnot an import\n';
  const base = '# base rules\n';
  const security = '# security rules, longer\n';
  mkdirSync(join(root, 'rules'), { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), claudeMd);
  writeFileSync(join(root, 'rules', 'base.md'), base);
  writeFileSync(join(root, 'rules', 'security.md'), security);
  const expected = Buffer.byteLength(claudeMd) + Buffer.byteLength(base) + Buffer.byteLength(security);
  assert.equal(alwaysOnBytes(root), expected);
});

test('an ok millisecond line pads the status to four columns', () => {
  assert.deepEqual(formatMeasurement({ name: 'route-intent', actual: 41, budget: 250, unit: 'ms' }, 1), {
    line: 'ok   route-intent: median=41.0ms budget<250.0ms',
    failed: false,
  });
});

test('a median equal to the budget fails, because python asked for strictly less', () => {
  assert.deepEqual(formatMeasurement({ name: 'route-intent', actual: 250, budget: 250, unit: 'ms' }, 1), {
    line: 'FAIL route-intent: median=250.0ms budget<250.0ms',
    failed: true,
  });
});

test('a byte line truncates rather than rounding', () => {
  assert.deepEqual(formatMeasurement({ name: 'always-on context', actual: 31999.7, budget: 32000, unit: 'bytes' }, 1), {
    line: 'ok   always-on context: 31999 bytes budget<32000 bytes',
    failed: false,
  });
});

test('the multiplier scales the budget, not the measurement', () => {
  assert.deepEqual(formatMeasurement({ name: 'resolve-task', actual: 300, budget: 250, unit: 'ms' }, 2), {
    line: 'ok   resolve-task: median=300.0ms budget<500.0ms',
    failed: false,
  });
  assert.deepEqual(formatMeasurement({ name: 'always-on context', actual: 40000, budget: 32000, unit: 'bytes' }, 1.5), {
    line: 'ok   always-on context: 40000 bytes budget<48000 bytes',
    failed: false,
  });
});
