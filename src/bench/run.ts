// `engineos bench` — deterministic runtime budgets for the EngineOS hot paths.
// Port of scripts/bench-runtime.sh, which is now a shim over this command.
//
// Measures warm medians, not single noisy samples. ENGINEOS_PERF_MULTIPLIER may
// be raised explicitly for a known-slow CI host; the published budgets remain
// the source values. The five names, their order and the budgets are the ones CI
// asserts on, so they are literals here rather than registry entries.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { compare, readBaseline, writeBaseline, type BaselineIo } from './baseline';
import { collectHost, type HostDeps } from './host';
import { summarize, type LifecycleReport } from './lifecycle';
import { alwaysOnBytes, formatMeasurement, medianMs, parseMultiplier, runOnce, type BenchDeps, type BenchSpawn, type Measurement, type TimedCommand } from './measure';
import { runScenario, SCENARIOS } from './scenarios';

const PROMPT = 'add a paginated orders endpoint and mirror the screen to mobile';
const SESSION_ID = 'performance-budget';
const HEADER = '== EngineOS runtime budgets ==';
const LIFECYCLE_HEADER = '== EngineOS task lifecycle ==';

// 10% over the recorded p50 before a scenario counts as regressed. Tighter than
// this and ordinary host noise fails CI; looser and a real regression lands.
const BASELINE_TOLERANCE = 0.1;

// Injected by scripts/build.mjs via `define`, the same way src/dispatch.ts reads
// it. A tsc test build has no define, and the version is metadata on the
// baseline file rather than part of the host id, so 'unknown' is harmless there.
declare const ENGINEOS_VERSION: string | undefined;

const DEFAULT_HOST_DEPS: HostDeps = {
  platform: () => platform(),
  cpus: () => cpus().map((cpu) => ({ model: cpu.model })),
  nodeVersion: () => process.version,
};

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
export function runBench(argv: string[], io: Io, deps: BenchDeps = DEFAULT_DEPS): number {
  const sub = argv[0];
  // An unknown subcommand is refused rather than falling through to the five
  // budgets: silently measuring something the caller did not ask for is how a
  // typo becomes a green CI step that proves nothing.
  if (sub !== undefined) {
    if (sub === 'lifecycle') return runLifecycle(io, deps);
    if (sub === 'baseline') return runBaseline(argv.slice(1), io, deps);
    io.err(`unknown bench subcommand: ${sub}\n`);
    return 1;
  }
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

function lifecycleReport(root: string, env: NodeJS.ProcessEnv, deps: BenchDeps): LifecycleReport {
  const host = collectHost(DEFAULT_HOST_DEPS, typeof ENGINEOS_VERSION === 'string' ? ENGINEOS_VERSION : 'unknown');
  const contextBytes = alwaysOnBytes(root);
  const scenarios = SCENARIOS.map((scenario) =>
    // `dispatches` is 0 because a hook-spawning benchmark launches no agent, not
    // because a measured task dispatched none. Wave 3 supplies the real count.
    summarize(scenario.name, runScenario(scenario, root, env, deps), contextBytes, 0),
  );
  return { host, scenarios };
}

function runLifecycle(io: Io, deps: BenchDeps): number {
  try {
    const root = resolveRoot(io.env);
    const report = lifecycleReport(root, io.env, deps);
    const lines = [LIFECYCLE_HEADER];
    for (const scenario of report.scenarios) {
      lines.push(`${scenario.scenario} p50=${scenario.p50Ms.toFixed(1)}ms p95=${scenario.p95Ms.toFixed(1)}ms`);
    }
    io.out(`${lines.join('\n')}\n`);
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

function runBaseline(argv: string[], io: Io, deps: BenchDeps): number {
  try {
    const root = resolveRoot(io.env);
    const report = lifecycleReport(root, io.env, deps);
    if (argv.includes('--write')) {
      io.out(`${writeBaseline(fileBaselineIo(), root, report)}\n`);
      return 0;
    }
    const baseline = readBaseline(fileBaselineIo(), root, report.host);
    if (baseline === null) {
      io.err("no baseline for this host — record one with 'engineos bench baseline --write'\n");
      return 1;
    }
    const found = compare(report, baseline, BASELINE_TOLERANCE);
    for (const regression of found) {
      const before = regression.baselineP50Ms === null ? 'none' : `${regression.baselineP50Ms.toFixed(1)}ms`;
      io.err(`${regression.scenario}: ${regression.reason} (${regression.currentP50Ms.toFixed(1)}ms vs ${before})\n`);
    }
    return found.length === 0 ? 0 : 1;
  } catch (e) {
    if (e instanceof KernelError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

function fileBaselineIo(): BaselineIo {
  return {
    read: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    write: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  };
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
