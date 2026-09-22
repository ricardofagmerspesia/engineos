import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from '../dispatch';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import type { BenchDeps, BenchSpawn } from './measure';
import { runBench } from './run';

// src/cli.ts registers this as a CommandTable entry, so the injected-deps
// parameter has to stay optional. This binding pins that shape.
const asCommand: Command = runBench;

interface Call {
  command: string;
  args: readonly string[];
  input: string;
  env: NodeJS.ProcessEnv | undefined;
}

interface Fixture {
  root: string;
  bytes: number;
}

// A root with the CLAUDE.md and rules/ files the always-on measurement stats.
// scripts/ and hooks/ are never created: every command is faked, and a case that
// accidentally reached the real ones would spawn this checkout's hooks.
function fixtureRoot(t: TestContext): Fixture {
  const root = tempRoot(t);
  const claudeMd = '# EngineOS\n@rules/base.md\n@rules/security.md\n';
  const base = '# base\n';
  const security = '# security\n';
  mkdirSync(join(root, 'rules'), { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), claudeMd);
  writeFileSync(join(root, 'rules', 'base.md'), base);
  writeFileSync(join(root, 'rules', 'security.md'), security);
  return { root, bytes: Buffer.byteLength(claudeMd) + Buffer.byteLength(base) + Buffer.byteLength(security) };
}

// Five samples each for the three kernel/advisor budgets, seven for the cache
// hit. The warm route-before-change run is not timed, so it consumes none.
function durations(routeIntent = 41): number[] {
  return [
    ...new Array<number>(5).fill(routeIntent),
    ...new Array<number>(5).fill(100),
    ...new Array<number>(5).fill(200),
    ...new Array<number>(7).fill(20),
  ];
}

function clock(values: number[]): () => number {
  let index = 0;
  let base = 0;
  let atStart = true;
  return () => {
    if (atStart) {
      atStart = false;
      return base;
    }
    atStart = true;
    const end = base + (values[index] ?? 0);
    index += 1;
    base = end + 1000;
    return end;
  };
}

interface Harness {
  deps: BenchDeps;
  calls: Call[];
  temps: string[];
}

// `failing` names a command suffix whose spawn answers non-zero, which is how the
// "a hot path failed" path gets exercised without a real child process.
function harness(root: string, values: number[], failing?: string): Harness {
  const calls: Call[] = [];
  const temps: string[] = [];
  const spawn: BenchSpawn = (command, args, options) => {
    calls.push({ command, args, input: options.input, env: options.env });
    const failed = failing !== undefined && command.endsWith(failing);
    return { status: failed ? 1 : 0, signal: null };
  };
  return {
    calls,
    temps,
    deps: {
      spawn,
      now: clock(values),
      mkdtemp: () => {
        const dir = mkdtempSync(join(root, 'bench-'));
        temps.push(dir);
        return dir;
      },
    },
  };
}

function run(root: string, deps: BenchDeps, env: NodeJS.ProcessEnv = {}): { status: number; stdout: string; stderr: string } {
  const io = memoryIo({ env: { ENGINEOS_ROOT: root, ...env } });
  const status = runBench([], io, deps);
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

test('the report is the header and the five budgets, in order', (t) => {
  const { root, bytes } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  const result = run(root, deps);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    [
      '== EngineOS runtime budgets ==',
      'ok   route-intent: median=41.0ms budget<250.0ms',
      'ok   resolve-task: median=100.0ms budget<500.0ms',
      'ok   prompt-advisor (end to end): median=200.0ms budget<600.0ms',
      'ok   route-before-change (cache hit): median=20.0ms budget<150.0ms',
      `ok   always-on context: ${bytes} bytes budget<32000 bytes`,
      '',
    ].join('\n'),
  );
  assert.equal(result.status, 0);
});

test('one budget over its bound turns the run red without hiding the other four', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations(300));
  const result = run(root, deps);
  assert.match(result.stdout, /^FAIL route-intent: median=300\.0ms budget<250\.0ms$/m);
  assert.match(result.stdout, /^ok {3}resolve-task: /m);
  assert.equal(result.status, 1);
});

test('the multiplier raises every budget and can turn a red run green', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations(300));
  const result = run(root, deps, { ENGINEOS_PERF_MULTIPLIER: '2' });
  assert.match(result.stdout, /^ok {3}route-intent: median=300\.0ms budget<500\.0ms$/m);
  assert.match(result.stdout, /^ok {3}always-on context: \d+ bytes budget<64000 bytes$/m);
  assert.equal(result.status, 0);
});

test('a bad multiplier is refused before anything is spawned', (t) => {
  const { root } = fixtureRoot(t);
  const { deps, calls } = harness(root, durations());
  const result = run(root, deps, { ENGINEOS_PERF_MULTIPLIER: 'fast' });
  assert.deepEqual(result, { status: 1, stdout: '', stderr: 'ENGINEOS_PERF_MULTIPLIER must be numeric\n' });
  assert.equal(calls.length, 0);
});

test('the cache-hit budget gets one warm run before its seven samples', (t) => {
  const { root } = fixtureRoot(t);
  const { deps, calls, temps } = harness(root, durations());
  assert.equal(run(root, deps).status, 0);
  // 5 + 5 + 5 kernel/advisor samples, one git init, then the warm run and 7 samples.
  assert.equal(calls.length, 24);
  assert.equal(calls[0]?.command, join(root, 'scripts/kernel.sh'));
  assert.deepEqual(calls[0]?.args, ['route-intent', 'add a paginated orders endpoint and mirror the screen to mobile']);
  assert.deepEqual(calls[5]?.args, ['resolve-task', '--prompt', 'add a paginated orders endpoint and mirror the screen to mobile']);
  assert.equal(calls[10]?.command, join(root, 'hooks/prompt-advisor.sh'));
  assert.equal(calls[15]?.command, 'git');
  assert.deepEqual(calls[15]?.args, ['init', '-q', temps[0]]);
  const hook = join(root, 'hooks/route-before-change.sh');
  assert.deepEqual(
    calls.slice(16).map((call) => call.command),
    new Array<string>(8).fill(hook),
  );
});

test('the timed hooks run with the bypass flag and telemetry pinned', (t) => {
  const { root } = fixtureRoot(t);
  const { deps, calls, temps } = harness(root, durations());
  run(root, deps);
  const advisor = calls[10];
  assert.deepEqual(advisor?.env, {
    ENGINEOS_ROOT: root,
    ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass',
    ENGINEOS_TELEMETRY: '0',
  });
  assert.equal(advisor?.input, JSON.stringify({ prompt: 'add a paginated orders endpoint and mirror the screen to mobile', cwd: '/tmp', session_id: 'performance-budget' }));
  // The kernel measurements inherit the environment, as python's env=None did.
  assert.equal(calls[0]?.env, undefined);
  const target = join(temps[0] ?? '', 'src', 'Button.tsx');
  assert.equal(calls[17]?.input, JSON.stringify({ tool_input: { file_path: target }, cwd: temps[0], session_id: 'performance-budget' }));
});

test('a failing hot path reports red and still removes its throwaway repo', (t) => {
  const { root } = fixtureRoot(t);
  const { deps, temps } = harness(root, durations(), 'route-before-change.sh');
  const result = run(root, deps);
  assert.deepEqual(result, {
    status: 1,
    stdout: '',
    stderr: `bench: ${join(root, 'hooks/route-before-change.sh')} exited 1\n`,
  });
  assert.equal(temps.length, 1);
  assert.equal(existsSync(temps[0] ?? ''), false);
});

test('the command binding is the one src/cli.ts registers', (t) => {
  const { root } = fixtureRoot(t);
  // Driven through the two-parameter Command shape: the real deps would spawn
  // this checkout's hooks, so only the pre-spawn refusal is exercised here.
  const io = memoryIo({ env: { ENGINEOS_ROOT: root, ENGINEOS_PERF_MULTIPLIER: '0' } });
  assert.equal(asCommand([], io), 1);
  assert.equal(io.stderr.join(''), 'ENGINEOS_PERF_MULTIPLIER must be greater than zero\n');
});

// The lifecycle scenarios draw 30 timed runs from the same fake clock the five
// budgets draw 22 from. A short array does not fail to compile — it silently
// measures a zero — so the extra readings are explicit here.
function lifecycleDurations(): number[] {
  return [...durations(), ...new Array<number>(8).fill(30)];
}

function runArgv(root: string, argv: string[], deps: BenchDeps, env: NodeJS.ProcessEnv = {}): { status: number; stdout: string; stderr: string } {
  const io = memoryIo({ env: { ...env, ENGINEOS_ROOT: root }, cwd: root });
  const status = runBench(argv, io, deps);
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

test('a bare bench invocation still prints the five budget lines', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  assert.equal(run(root, deps).stdout.includes('== EngineOS runtime budgets =='), true);
});

test('bench lifecycle prints a scenario line per measured scenario', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, lifecycleDurations());
  const result = runArgv(root, ['lifecycle'], deps);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes('== EngineOS task lifecycle =='), true);
  assert.equal(result.stdout.includes('direct-edit-warm'), true);
  // A scenario that ran out of clock readings would report 0.0ms here, which is
  // the failure mode a shorter array produces silently.
  assert.equal(/p50=0\.0ms/.test(result.stdout), false);
});

test('bench baseline refuses to compare when no baseline exists for this host', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, lifecycleDurations());
  const result = runArgv(root, ['baseline'], deps);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('no baseline'), true);
});

test('an unknown bench subcommand is refused rather than silently running the budgets', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, lifecycleDurations());
  const result = runArgv(root, ['nonsense'], deps);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('nonsense'), true);
  assert.equal(result.stdout.includes('== EngineOS runtime budgets =='), false);
});
