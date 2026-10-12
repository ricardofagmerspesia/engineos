// The opt-in Jev judge consultation for one user prompt: its outcome becomes
// the fact the kernel folds, plus the span outcome (contracts.md@rev3 §10.5,
// §7). Split out of ./prompt-judge so each consultation is its own module;
// ./prompt-judge decides when it runs.
import type { Registries } from '../kernel';
import {
  buildQuestionSet,
  createFileBreakerStore,
  judge,
  type BreakerState,
  type BreakerStore,
  type JudgeFact,
  type JudgeInput,
  type JudgeOutcome,
  type JudgePolicy,
} from '../judge';
import { raceDeadline } from '../lib/deadline';
import { editContext } from './edit-context';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { repositoryFacts } from './prompt-judge-facts';
import { judgeMayReceive, sourceMarkersOf } from './prompt-source';
import type { SpanFacts, SpanFields } from './telemetry';

// The S0 refusal's name: the route event's `skipped` value, and the judge
// outcome reason that declares no fact at all.
export const NOT_USER_INPUT = 'not-user-input';

// The hook's own deadline sits just past the judge's: the judge's abort must
// win so it can count the timeout against its breaker before process exit
// discards the pending timer. Judge 400 ms + slack + kernel stays inside the
// 600 ms prompt-advisor budget.
const JUDGE_GUARD_SLACK_MS = 50;
const GUARD_TIMEOUT: JudgeOutcome = { kind: 'failed', reason: 'timeout' };

// What one ATTEMPTED judge call contributes to its span (contracts §7); the
// advisor supplies the span's kind, capability and tier.
export type JudgeSpanOutcome = Pick<SpanFacts, 'status' | 'fields'>;

export interface Consultation {
  fact: JudgeFact | null;           // what reaches the kernel; null: the judge could not be consulted
  policy: JudgePolicy | null;       // null: the registry declares no readable judge block
  latencyMs: number | null;         // attempted calls only
  span: JudgeSpanOutcome | null;    // attempted calls only
}

const NOT_CONSULTED: Consultation = { fact: null, policy: null, latencyMs: null, span: null };

// Outcome -> fact (contracts §10.5). Any throw on the way (an unreadable judge
// block, a question set the registries cannot build) declares no fact at all,
// which the kernel reports as `fallback: no-judge-fact` — never a guess.
export async function consultJudge(env: HookEnvelope, ctx: HookContext, regs: Registries): Promise<Consultation> {
  let policy: JudgePolicy;
  try {
    policy = regs.policy.judge;
    // The judge answers `disabled` first itself (§10.1); repeating that one
    // check here spares the hot path the git process, config read and question
    // set a disabled judge would discard.
    if (ctx.io.env[policy.enabled_env] !== policy.enabled_value) {
      return { fact: { source: 'fallback', reason: 'disabled' }, policy, latencyMs: null, span: null };
    }
  } catch {
    // Fail open: an unreadable judge block means no judge, and NOT_CONSULTED
    // (policy null) is already how the outcome says so: the advisor writes no
    // judge event for it. No field carries the load error, by design.
    return NOT_CONSULTED;
  }
  const noFact: Consultation = { fact: null, policy, latencyMs: null, span: null };
  // The strict, judge-only source test (D3): S0 in the advisor fails open for
  // routing, but text whose origin is in doubt never leaves the machine. Not
  // the user's input declares no fact, exactly as the judge's own
  // `not-user-input` skip does.
  if (!judgeMayReceive(env, () => sourceMarkersOf(regs))) return noFact;
  try {
    // One git process answers both the breaker's home and the repository facts.
    // Without a git dir there is nowhere to keep the breaker state, so the
    // judge is not consulted.
    const where = env.cwd === '' ? null : editContext(env.cwd, ctx);
    if (where === null || where.status !== 'active' || where.gitDir === null) return noFact;
    const breaker = firstReadRecorder(
      createFileBreakerStore({ gitDir: where.gitDir, stateFile: policy.breaker.state_file, failureThreshold: regs.policy.breaker.failure_threshold }),
    );
    const questions = buildQuestionSet({
      intents: regs.intents.intents.map((row) => ({ id: row.id, active: row.active })),
      rules: regs.decisionRules.rules.map((rule) => ({ id: rule.id, judge_fact: rule.judge_fact })),
    });
    const input: JudgeInput = { text: env.prompt, source: 'user', repository: repositoryFacts(where.worktree.repo), session: { last_intent: null } };
    const transport = typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;
    const started = ctx.now();
    const pending = judge(input, { fetch: transport, now: ctx.now, env: ctx.io.env, breaker: breaker.store, policy, questions });
    // The judge races its own abort; this second race is the hook's guarantee
    // for a judge that rejects late or never settles. Whatever the judge does
    // afterwards no longer matters.
    const outcome = await raceDeadline({ start: () => pending, ms: policy.timeout_ms + JUDGE_GUARD_SLACK_MS, onTimeout: () => GUARD_TIMEOUT });
    const latencyMs = Math.max(0, ctx.now() - started);
    if (outcome.kind === 'skipped') return { fact: factOf(outcome), policy, latencyMs: null, span: null };
    return { fact: factOf(outcome), policy, latencyMs, span: judgeSpanOutcome(outcome, policy, breaker.probe()) };
  } catch {
    // Fail open: the judge event already records this as `skipped_reason:
    // no-judge-fact` (fact null), the existing field for "no fact declared";
    // a more specific reason would change the emitted vocabulary (§6.4).
    return noFact;
  }
}

function factOf(outcome: JudgeOutcome): JudgeFact | null {
  if (outcome.kind === 'facts') return outcome.facts;
  if (outcome.reason === NOT_USER_INPUT) return null;
  return { source: 'fallback', reason: outcome.reason };
}

function judgeSpanOutcome(outcome: JudgeOutcome, policy: JudgePolicy, probe: boolean): JudgeSpanOutcome {
  const base: SpanFields = { provider: policy.provider, model: policy.model };
  if (outcome.kind !== 'facts') return { status: 'FAILED', fields: { ...base, note: `judge=${outcome.reason}` } };
  const { facts } = outcome;
  const fields: SpanFields = { ...base, model: facts.model, route: facts.primary.id };
  if (outcome.tokens_in !== null) fields.tokens_in = outcome.tokens_in;
  const late = facts.latency_ms > policy.timeout_ms;
  return { status: probe || late ? 'DEGRADED' : 'OK', fields };
}

// The judge reads its breaker once, at admission. A state that was open there
// and still let the call through was the half-open probe (§10.1), which the span
// reports as DEGRADED (§7).
function firstReadRecorder(inner: BreakerStore): { store: BreakerStore; probe: () => boolean } {
  let first: BreakerState | null = null;
  const store: BreakerStore = {
    read: (): BreakerState => {
      const state = inner.read();
      if (first === null) first = state;
      return state;
    },
    recordFailure: (now: number): void => inner.recordFailure(now),
    recordSuccess: (): void => inner.recordSuccess(),
  };
  return { store, probe: (): boolean => first !== null && first.opened_at !== null };
}
