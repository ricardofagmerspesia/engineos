// `router-golden run` (routing-decision-layer design §6, contracts §5): every
// mode graded on the curated set, end to end through the same path a real
// prompt takes — resolve-task (sync) then the prompt advisor's routeDecision
// (async), with the mode forced through ENGINEOS_ROUTER exactly as a developer
// would force it. Each case runs in a throwaway project holding its stack's
// manifests (./stack-routing stackProjects), so the floor's rebind and the
// decision layer's `offered` see the case's stack and nothing else.
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve, type Answer } from '../kernel';
import { lazyRegistries, type KernelContext, type Registries } from '../kernel/context';
import { repositoryStack } from '../kernel/resolve';
import { stackEligible, type StackFacts } from '../kernel/route';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import type { TaskAnswer } from '../hooks/prompt-advisor-guidance';
import { routeDecision, type RouterDeps } from '../hooks/prompt-advisor-router';
import type { RouterMode, RouterModeScores } from '../registry/policy-router-decision';
import type { GoldenCase } from './router-golden-cases';
import { stackProjects } from './stack-routing';

export interface CaseOutcome {
  intents: string[];
  fallback: boolean;
  escalate: boolean;
  latencyMs: number;
}

export type CaseRouter = (item: GoldenCase, mode: RouterMode) => Promise<CaseOutcome>;

export interface CaseRouterHandle {
  route: CaseRouter;
  dispose(): void;
}

export interface AdvisorRouterDeps extends RouterDeps {
  env: NodeJS.ProcessEnv;
}

export type CaseRouterFactory = (root: string, deps: AdvisorRouterDeps) => CaseRouterHandle;

export interface ModeScore extends RouterModeScores {
  escalate_rate: number;
  misses: { id: string; expected: string[]; decided: string[] }[];
}

export type Acceptance = { kind: 'winner'; mode: RouterMode } | { kind: 'none'; reason: string };

// The real path. `deps.fetch` reaches TypeSafe only when the developer runs
// `--mode jev` with a key in the environment; tests inject a fake.
export const advisorCaseRouter: CaseRouterFactory = (root, deps) => {
  const registries = lazyRegistries(root);
  const projects = stackProjects();
  const now = deps.now ?? (() => performance.now());
  return {
    async route(item, mode): Promise<CaseOutcome> {
      const dir = projects.projectFor(item.packages);
      const started = now();
      const stack = repositoryStack(dir, dir);
      const kernel: KernelContext = { root, registries, project: dir, projectCwd: dir };
      if (stack !== undefined) kernel.stack = stack;
      const task = taskAnswer(resolve({ prompt: item.prompt, taskContract: true }, kernel));
      const env: NodeJS.ProcessEnv = { ...deps.env, ENGINEOS_ROUTER: mode };
      const io: Io = { readStdin: () => '', out: () => undefined, err: () => undefined, env, cwd: () => dir };
      const routed = await routeDecision({
        prompt: item.prompt,
        task,
        project: { root: dir, cwd: dir, cacheDir: null, stack },
        ctx: { io, root, now: Date.now, spawn: spawnSync },
        regs: registries,
        deps: routerDeps(deps),
      });
      const view = routed.task.router;
      return {
        intents: routed.task.contract.intents,
        fallback: view?.fallback !== null && view?.fallback !== undefined,
        escalate: routed.task.route.escalate || (view?.escalation !== null && view?.escalation !== undefined),
        latencyMs: Math.max(0, now() - started),
      };
    },
    dispose(): void {
      projects.dispose();
    },
  };
};

function routerDeps(deps: AdvisorRouterDeps): RouterDeps {
  const out: RouterDeps = {};
  if (deps.fetch !== undefined) out.fetch = deps.fetch;
  if (deps.hasClaudeCli !== undefined) out.hasClaudeCli = deps.hasClaudeCli;
  if (deps.now !== undefined) out.now = deps.now;
  if (deps.schedule !== undefined) out.schedule = deps.schedule;
  return out;
}

// The prompt advisor's own narrowing of a resolve-task answer
// (src/hooks/prompt-advisor.ts narrow), restated because that one is private
// to the hook adapter.
function taskAnswer(answer: Answer): TaskAnswer {
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (contract === undefined || decisions === undefined || route === undefined || !('escalate' in route)) {
    throw new KernelError('resolve-task: the kernel answered no task contract');
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null, router: null };
}

export async function scoreMode(
  cases: readonly GoldenCase[],
  mode: RouterMode,
  route: CaseRouter,
  registries: Registries,
): Promise<ModeScore> {
  const intents = registries.intents.intents;
  let accurate = 0;
  let stackCorrect = 0;
  let fallbacks = 0;
  let escalations = 0;
  const latencies: number[] = [];
  const misses: ModeScore['misses'] = [];
  for (const item of cases) {
    const outcome = await route(item, mode);
    latencies.push(outcome.latencyMs);
    if (outcome.fallback) fallbacks += 1;
    if (outcome.escalate) escalations += 1;
    if (item.expectIntents.every((id) => outcome.intents.includes(id))) accurate += 1;
    else misses.push({ id: item.id, expected: item.expectIntents, decided: outcome.intents });
    const facts = caseStack(item);
    const foreign = outcome.intents.some((id) => {
      const row = intents.find((intent) => intent.id === id);
      return row !== undefined && !stackEligible(row, intents, facts);
    });
    if (!foreign) stackCorrect += 1;
  }
  const n = cases.length;
  return {
    intent_accuracy: ratio(accurate, n),
    stack_correctness: ratio(stackCorrect, n),
    p95_ms: p95(latencies),
    fallback_rate: ratio(fallbacks, n),
    escalate_rate: ratio(escalations, n),
    misses,
  };
}

// The case's stack as the floor reads it: one package per entry, no focus.
function caseStack(item: GoldenCase): StackFacts {
  return {
    packages: item.packages.map((pkg, i) => ({ dir: `pkg${i}`, language: pkg.language, framework: pkg.framework, compose_service: null })),
    focus: null,
  };
}

// Contracts §5: the winner has stack_correctness 1.0 and a strictly highest
// intent_accuracy. The default is chosen among EVERY mode the policy lists,
// so a run that skipped one cannot write it.
export function acceptance(scores: ReadonlyMap<RouterMode, ModeScore>, policyModes: readonly RouterMode[]): Acceptance {
  const missing = policyModes.filter((mode) => !scores.has(mode));
  if (missing.length > 0) return { kind: 'none', reason: `the default is chosen over every mode; this run did not score ${missing.join(', ')}` };
  const ranked = [...scores.entries()].sort((a, b) => b[1].intent_accuracy - a[1].intent_accuracy);
  const top = ranked[0];
  if (top === undefined) return { kind: 'none', reason: 'no mode was scored' };
  const tied = ranked.filter(([, score]) => score.intent_accuracy === top[1].intent_accuracy).map(([mode]) => mode);
  if (tied.length > 1) return { kind: 'none', reason: `tie on intent_accuracy ${fmt(top[1].intent_accuracy)} between ${tied.join(', ')}` };
  if (top[1].stack_correctness < 1) {
    return { kind: 'none', reason: `${top[0]} leads on intent_accuracy but its stack_correctness is ${fmt(top[1].stack_correctness)} < 1.0` };
  }
  return { kind: 'winner', mode: top[0] };
}

export interface ResultsFacts {
  date: string;
  head: string;
  casesPath: string;
  cases: readonly GoldenCase[];
  scores: ReadonlyMap<RouterMode, ModeScore>;
  verdict: Acceptance;
  defaultLine: string;
}

// Ids and intent ids only: the prompts live in cases.jsonl, never here.
export function renderResults(facts: ResultsFacts): string {
  const real = facts.cases.filter((item) => item.source === 'real').length;
  const synthetic = facts.cases.length - real;
  const lines = [
    '# Router golden set — results',
    '',
    `Written by \`scripts/router-golden.sh run\` on ${facts.date}. Do not edit by hand: the next run rewrites this file.`,
    '',
    `- Cases: ${facts.cases.length} (real ${real}, synthetic ${synthetic}) from \`${facts.casesPath}\``,
    `- EngineOS HEAD: ${facts.head}`,
    `- Acceptance: ${facts.verdict.kind === 'winner' ? `${facts.verdict.mode} wins` : `no winner — ${facts.verdict.reason}`}`,
    `- Default: ${facts.defaultLine}`,
  ];
  if (synthetic > real) lines.push('- Warning: synthetic cases outnumber real ones (design §6 says they never should).');
  lines.push('', '| Mode | Intent accuracy | Stack correctness | p95 ms | Fallback rate | Escalate rate |', '|---|---|---|---|---|---|');
  for (const [mode, score] of facts.scores) {
    lines.push(`| ${mode} | ${fmt(score.intent_accuracy)} | ${fmt(score.stack_correctness)} | ${score.p95_ms} | ${fmt(score.fallback_rate)} | ${fmt(score.escalate_rate)} |`);
  }
  const misses = [...facts.scores].flatMap(([mode, score]) => score.misses.map((miss) => ({ mode, ...miss })));
  if (misses.length > 0) {
    lines.push('', '## Misses', '', '| Case | Mode | Expected | Decided |', '|---|---|---|---|');
    for (const miss of misses) {
      lines.push(`| ${miss.id} | ${miss.mode} | ${miss.expected.join(', ')} | ${miss.decided.length > 0 ? miss.decided.join(', ') : 'none'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function scoresForPolicy(scores: ReadonlyMap<RouterMode, ModeScore>): Partial<Record<RouterMode, RouterModeScores>> {
  const out: Partial<Record<RouterMode, RouterModeScores>> = {};
  for (const [mode, score] of scores) {
    out[mode] = {
      intent_accuracy: score.intent_accuracy,
      stack_correctness: score.stack_correctness,
      p95_ms: score.p95_ms,
      fallback_rate: score.fallback_rate,
    };
  }
  return out;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 10_000) / 10_000;
}

// Nearest-rank p95, whole milliseconds.
function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return Math.round(sorted[index] ?? 0);
}

function fmt(value: number): string {
  return value.toFixed(3);
}
