import { join } from 'node:path';
import type { LifecyclePhase, LifecycleSample } from './lifecycle';
import { medianMs, runOnce, type BenchDeps, type TimedCommand } from './measure';

const PROMPT = 'add a paginated orders endpoint and mirror the screen to mobile';
const SESSION_ID = 'lifecycle-benchmark';

// Every scenario spawns a process whose floor is node's own startup, so the
// quantity being measured sits on top of OS scheduling noise that a handful of
// readings cannot average out. Five samples produced a p50 that moved 10-50%
// between consecutive runs on an idle machine, which made `bench baseline` fail
// against a baseline recorded minutes earlier, four runs out of four. Twenty-one
// readings cost about nine seconds for the whole suite and hold the p50 steady.
const SCENARIO_SAMPLES = 21;

// A scenario is one observable segment of a real task's lifecycle. `warm`
// declares whether a discarded run precedes the samples: a cache-hit path that
// measured its own cold first call would report the miss as the hit.
export interface Scenario {
  name: string;
  phase: LifecyclePhase;
  samples: number;
  warm: boolean;
  command: (root: string) => string[];
  payload: (target: string) => string;
}

// The six original scenarios spawn the deprecated hooks/*.sh shims, which run
// the full dist/engineos.cjs. They stay on them so their p50s remain comparable
// with the baselines already recorded under docs/perf/baselines/.
function shim(path: string): (root: string) => string[] {
  return (root) => [join(root, path)];
}

// The per-call scenarios spawn what hooks/hooks.json registers for those hooks:
// `node <root>/dist/engineos-hot.cjs hook <name>`, no shim in front.
function hotHook(name: string): (root: string) => string[] {
  return (root) => ['node', join(root, 'dist', 'engineos-hot.cjs'), 'hook', name];
}

function fullHook(name: string): (root: string) => string[] {
  return (root) => ['node', join(root, 'dist', 'engineos.cjs'), 'hook', name];
}

// An empty payload is one readEnvelope refuses, so the hook adapter answers
// silent before any hook body runs: what is left is node startup plus loading
// the bundle — the quantity the bundle split (S3) and the compile cache (S2) act on.
const NO_PAYLOAD = (): string => '';

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'prompt-routing',
    phase: 'routing',
    samples: SCENARIO_SAMPLES,
    // The only scenario that discards a run without measuring a cache: the
    // prompt advisor reads more of the tree than any other hook, so its cost is
    // filesystem-cache sensitive and its first spawn in a cold process is tens
    // of milliseconds slower than its steady state. cacheHit stays null for it —
    // see runScenario, which reports a hit only for a scenario that has one.
    warm: true,
    command: shim('hooks/prompt-advisor.sh'),
    payload: () => JSON.stringify({ prompt: PROMPT, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-cold',
    phase: 'routing',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: shim('hooks/route-before-change.sh'),
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-warm',
    phase: 'routing',
    samples: SCENARIO_SAMPLES,
    warm: true,
    command: shim('hooks/route-before-change.sh'),
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-dispatch',
    phase: 'execution',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: shim('hooks/announce-agent-dispatch.sh'),
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-return',
    phase: 'integration',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: shim('hooks/announce-agent-return.sh'),
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'final-gate',
    phase: 'verification',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: shim('hooks/stop-verify.sh'),
    payload: () => JSON.stringify({ cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    // A Bash call that names neither git nor gh: the git-write-guard fast path
    // (S1) on the per-call bundle, which is what most Bash calls now cost.
    name: 'bash-noop',
    phase: 'execution',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: hotHook('git-write-guard'),
    payload: () => JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    // The pair below measures the bundle split in one run, so the S3 delta does
    // not depend on a baseline recorded before the split existed.
    name: 'hot-bundle-load',
    phase: 'execution',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: hotHook('git-write-guard'),
    payload: NO_PAYLOAD,
  },
  {
    name: 'full-bundle-load',
    phase: 'execution',
    samples: SCENARIO_SAMPLES,
    warm: false,
    command: fullHook('git-write-guard'),
    payload: NO_PAYLOAD,
  },
];

export function runScenario(
  scenario: Scenario,
  root: string,
  env: NodeJS.ProcessEnv,
  deps: BenchDeps,
): LifecycleSample[] {
  const target = join(root, 'src', 'Button.tsx');
  const command: TimedCommand = {
    command: scenario.command(root),
    stdin: scenario.payload(target),
    env: hookEnv(env),
    samples: 1,
  };
  if (scenario.warm) runOnce(command, deps);
  const samples: LifecycleSample[] = [];
  for (let i = 0; i < scenario.samples; i += 1) {
    samples.push({
      scenario: scenario.name,
      phase: scenario.phase,
      durationMs: medianMs(command, deps),
      // Not observed by a hook-spawning benchmark. Wave 3's scheduler and a
      // model-owning runner supply these; until then the honest value is null.
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      cacheHit: scenario.name === 'direct-edit-warm' ? true : null,
      retries: 0,
    });
  }
  return samples;
}

// The same pinning the five-budget bench uses: an operator's real bypass flag
// would measure a no-op, and telemetry would measure a disk write nobody
// budgeted for. An operator's ENGINEOS_GIT_WRITES=auto would likewise turn
// bash-noop into a measurement of the guard's off switch, not its fast path.
function hookEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass', ENGINEOS_TELEMETRY: '0', ENGINEOS_GIT_WRITES: 'ask' };
}
