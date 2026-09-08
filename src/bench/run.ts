// `engineos bench` — deterministic runtime budgets for the EngineOS hot paths.
// Port of scripts/bench-runtime.sh, which is now a shim over this command.
//
// Measures warm medians, not single noisy samples. ENGINEOS_PERF_MULTIPLIER may
// be raised explicitly for a known-slow CI host; the published budgets remain
// the source values. The five names, their order and the budgets are the ones CI
// asserts on, so they are literals here rather than registry entries.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { alwaysOnBytes, formatMeasurement, medianMs, parseMultiplier, runOnce, type BenchDeps, type BenchSpawn, type Measurement, type TimedCommand } from './measure';

const PROMPT = 'add a paginated orders endpoint and mirror the screen to mobile';
const SESSION_ID = 'performance-budget';
const HEADER = '== EngineOS runtime budgets ==';

// `spawnSync` is an overload set whose first signature returns Buffers; binding
// the utf8 overload here is what makes the real call satisfy `BenchSpawn`.
const defaultSpawn: BenchSpawn = (command, args, options) => spawnSync(command, args, options);

const DEFAULT_DEPS: BenchDeps = {
  spawn: defaultSpawn,
  now: () => performance.now(),
  mkdtemp: () => mkdtempSync(join(tmpdir(), 'engineos-bench-')),
};

// Deliberately not annotated `Command`: the third parameter is the seam tests
// inject through, and the annotation would hide it from callers. The shape is a
// Command (the extra parameter is optional) and src/cli.ts registers it as one.
export function runBench(_argv: string[], io: Io, deps: BenchDeps = DEFAULT_DEPS): number {
  try {
    // Parsed before anything is spawned: a mistyped multiplier must fail at
    // once, not after all five hot paths have been measured for nothing.
    const multiplier = parseMultiplier(io.env['ENGINEOS_PERF_MULTIPLIER']);
    const root = resolveRoot(io.env);
    const measurements = measureAll(root, io.env, deps);
    const lines = [HEADER];
    let failed = false;
    for (const measurement of measurements) {
      const rendered = formatMeasurement(measurement, multiplier);
      if (rendered.failed) failed = true;
      lines.push(rendered.line);
    }
    io.out(`${lines.join('\n')}\n`);
    return failed ? 1 : 0;
  } catch (e) {
    if (e instanceof KernelError) {
      // python raised SystemExit(message): the text on stderr, exit 1.
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

// Measured in this order, and printed only once all five are in: a partial
// report next to a failed hot path would read as a passing run with a short tail.
function measureAll(root: string, env: NodeJS.ProcessEnv, deps: BenchDeps): Measurement[] {
  const kernel = join(root, 'scripts/kernel.sh');
  const advisor = join(root, 'hooks/prompt-advisor.sh');
  const routeIntent = medianMs({ command: [kernel, 'route-intent', PROMPT], samples: 5 }, deps);
  const resolveTask = medianMs({ command: [kernel, 'resolve-task', '--prompt', PROMPT], samples: 5 }, deps);
  const promptAdvisor = medianMs(
    {
      command: [advisor],
      stdin: JSON.stringify({ prompt: PROMPT, cwd: '/tmp', session_id: SESSION_ID }),
      env: hookEnv(env),
      samples: 5,
    },
    deps,
  );
  const routeBeforeChange = routeBeforeChangeMedian(root, env, deps);
  return [
    { name: 'route-intent', actual: routeIntent, budget: 250, unit: 'ms' },
    { name: 'resolve-task', actual: resolveTask, budget: 500, unit: 'ms' },
    { name: 'prompt-advisor (end to end)', actual: promptAdvisor, budget: 600, unit: 'ms' },
    { name: 'route-before-change (cache hit)', actual: routeBeforeChange, budget: 150, unit: 'ms' },
    { name: 'always-on context', actual: alwaysOnBytes(root), budget: 32000, unit: 'bytes' },
  ];
}

// The budget is a CACHE HIT, so the throwaway repo gets one warm run before the
// samples start — the first call populates the route cache and is not what the
// 150ms bound describes.
function routeBeforeChangeMedian(root: string, env: NodeJS.ProcessEnv, deps: BenchDeps): number {
  const tmp = deps.mkdtemp();
  try {
    runOnce({ command: ['git', 'init', '-q', tmp], samples: 1 }, deps);
    const target = join(tmp, 'src', 'Button.tsx');
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(target, '');
    const cmd: TimedCommand = {
      command: [join(root, 'hooks/route-before-change.sh')],
      stdin: JSON.stringify({ tool_input: { file_path: target }, cwd: tmp, session_id: SESSION_ID }),
      env: hookEnv(env),
      samples: 7,
    };
    runOnce(cmd, deps);
    return medianMs(cmd, deps);
  } finally {
    // python's TemporaryDirectory removed the tree however the block ended; a
    // failed hot path must not also leak a repo into /tmp.
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The hooks are timed with their own switches pinned: an operator's real bypass
// flag would measure a no-op, and telemetry would measure a disk write nobody
// budgeted for.
function hookEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass', ENGINEOS_TELEMETRY: '0' };
}
