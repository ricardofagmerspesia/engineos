import { join } from 'node:path';
import type { LifecyclePhase, LifecycleSample } from './lifecycle';
import { medianMs, runOnce, type BenchDeps, type TimedCommand } from './measure';

const PROMPT = 'add a paginated orders endpoint and mirror the screen to mobile';
const SESSION_ID = 'lifecycle-benchmark';

// A scenario is one observable segment of a real task's lifecycle. `warm`
// declares whether a discarded run precedes the samples: a cache-hit path that
// measured its own cold first call would report the miss as the hit.
export interface Scenario {
  name: string;
  phase: LifecyclePhase;
  samples: number;
  warm: boolean;
  hook: string;
  payload: (target: string) => string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'prompt-routing',
    phase: 'routing',
    samples: 5,
    warm: false,
    hook: 'hooks/prompt-advisor.sh',
    payload: () => JSON.stringify({ prompt: PROMPT, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-cold',
    phase: 'routing',
    samples: 5,
    warm: false,
    hook: 'hooks/route-before-change.sh',
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-warm',
    phase: 'routing',
    samples: 7,
    warm: true,
    hook: 'hooks/route-before-change.sh',
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-dispatch',
    phase: 'execution',
    samples: 5,
    warm: false,
    hook: 'hooks/announce-agent-dispatch.sh',
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-return',
    phase: 'integration',
    samples: 5,
    warm: false,
    hook: 'hooks/announce-agent-return.sh',
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'final-gate',
    phase: 'verification',
    samples: 3,
    warm: false,
    hook: 'hooks/stop-verify.sh',
    payload: () => JSON.stringify({ cwd: '/tmp', session_id: SESSION_ID }),
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
    command: [join(root, scenario.hook)],
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
      cacheHit: scenario.warm ? true : null,
      retries: 0,
    });
  }
  return samples;
}

// The same pinning the five-budget bench uses: an operator's real bypass flag
// would measure a no-op, and telemetry would measure a disk write nobody
// budgeted for.
function hookEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass', ENGINEOS_TELEMETRY: '0' };
}
