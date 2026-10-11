// The prompt advisor's semantic half: consult the opt-in Jev judge for one user
// prompt and turn its outcome into the fact the kernel folds, plus the span
// outcome and the judge event's data (contracts.md@rev3 §10.5); and consult the
// opt-in embedding tie-break for an ambiguous deterministic route (§10.6).
//
// Split out of ./prompt-advisor so each file stays one concern. The telemetry
// CALLS stay in the advisor — contracts §6.4 names it as the judge event's
// writer, and it owns the sink — so this module only answers what to record.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve, type Registries } from '../kernel';
import type { KernelContext } from '../kernel/context';
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
import { nodeTiebreakDeps, tiebreak, tiebreakEnabled, type TiebreakCandidate } from '../judge/tiebreak';
import { KernelError } from '../lib/json';
import { loadProjectConfig } from '../registry/project-config';
import { editContext } from './edit-context';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import type { EventData, SpanFacts, SpanFields } from './telemetry';

// The S0 refusal's name: the route event's `skipped` value, and the judge
// outcome reason that declares no fact at all.
export const NOT_USER_INPUT = 'not-user-input';

// The hook's own deadline sits just past the judge's: the judge's abort must
// win so it can count the timeout against its breaker before process exit
// discards the pending timer. Judge 400 ms + slack + kernel stays inside the
// 600 ms prompt-advisor budget.
const JUDGE_GUARD_SLACK_MS = 50;
const GUARD_TIMEOUT: JudgeOutcome = { kind: 'failed', reason: 'timeout' };

// contracts §6.4 `latency_bucket`, upper bounds exclusive; anything slower is `over`.
const LATENCY_BUCKETS: readonly [number, string][] = [[100, 'lt100'], [200, 'lt200'], [300, 'lt300'], [400, 'lt400']];

// A change record links its spec when one was required (CLAUDE.md #5).
const ACTIVE_RECORD = /^status:[ \t\f\v\r]*active/m;
const SPEC_LINK = /docs\/specs\//;

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

// The kernel's `tiebreak` fact (contracts §3.1): intent id -> similarity.
export type TiebreakScores = Record<string, number>;

export interface Semantics {
  consultation: Consultation;
  tiebreak: TiebreakScores | null;   // null: no scores to pass, the deterministic answer stands
}

// Both opt-in consultations for one prompt. The deterministic route does not
// depend on the judge, so the tie-break runs beside it inside the same budget
// (its own 150 ms deadline under the judge's guard). The one exception is an
// enabled authoritative judge: its `jev` fact folds, and the kernel ignores a
// tie-break on the fold, so the client is consulted only after the judge
// answered something else (§10.6 step 2).
export async function consultSemantics(env: HookEnvelope, ctx: HookContext, kernel: KernelContext): Promise<Semantics> {
  const regs = kernel.registries;
  if (judgeMayFold(ctx, regs)) {
    const consultation = await consultJudge(env, ctx, regs);
    const scores = folds(consultation) ? null : await consultTiebreak(env.prompt, ctx, kernel);
    return { consultation, tiebreak: scores };
  }
  const [consultation, scores] = await Promise.all([consultJudge(env, ctx, regs), consultTiebreak(env.prompt, ctx, kernel)]);
  return { consultation, tiebreak: scores };
}

// §10.6 steps 2-4. Scores only for an ambiguous route with at least two
// survivors, candidates drawn from route.ranked so every key is a ranked id the
// kernel accepts; any other outcome, or any throw, passes no fact.
export async function consultTiebreak(prompt: string, ctx: HookContext, kernel: KernelContext): Promise<TiebreakScores | null> {
  if (!tiebreakEnabled(ctx.io.env)) return null;
  try {
    // The same pure ranking the task contract reports, without a span: the
    // router span belongs to the one resolution the advisor publishes.
    const { route } = resolve({ prompt, escalate: true }, kernel);
    if (route === undefined || !('escalate' in route) || !route.ambiguous || route.intents.length < 2) return null;
    const regs = kernel.registries;
    const exemplars = new Map(regs.intents.intents.map((row): [string, readonly string[]] => [row.id, row.exemplars]));
    const candidates: TiebreakCandidate[] = route.ranked.map((ranked) => ({ id: ranked.id, exemplars: exemplars.get(ranked.id) ?? [] }));
    const outcome = await tiebreak({ text: prompt, ambiguous: true, candidates }, nodeTiebreakDeps(ctx.io.env, regs.policy.judge.redaction.patterns));
    return outcome.kind === 'scores' ? outcome.scores : null;
  } catch {
    return null;
  }
}

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
    return NOT_CONSULTED;
  }
  try {
    // One git process answers both the breaker's home and the repository facts.
    const where = env.cwd === '' ? null : editContext(env.cwd, ctx);
    if (where === null || where.status !== 'active' || where.gitDir === null) {
      throw new KernelError('judge: no git dir to keep the breaker state in');
    }
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
    const outcome = await withinDeadline(pending, policy.timeout_ms + JUDGE_GUARD_SLACK_MS);
    const latencyMs = Math.max(0, ctx.now() - started);
    if (outcome.kind === 'skipped') return { fact: factOf(outcome), policy, latencyMs: null, span: null };
    return { fact: factOf(outcome), policy, latencyMs, span: judgeSpanOutcome(outcome, policy, breaker.probe()) };
  } catch {
    return { fact: null, policy, latencyMs: null, span: null };
  }
}

// One judge event per user prompt (contracts §6.4), ids and a latency bucket
// only. A key with no value is left out: the append boundary refuses empties.
// Null when the registry declares no judge block, which writes no event.
export function judgeEventData(consultation: Consultation): EventData | null {
  const { fact, policy, latencyMs } = consultation;
  if (policy === null) return null;
  const data: EventData = { source: fact === null ? 'fallback' : fact.source, mode: policy.mode };
  data.model = fact !== null && fact.source === 'jev' ? fact.model : policy.model;
  if (fact === null) data.skipped_reason = 'no-judge-fact';
  else if (fact.source === 'fallback') data.skipped_reason = fact.reason;
  if (latencyMs !== null) data.latency_bucket = latencyBucket(latencyMs);
  return data;
}

// ------------------------------------------------------------------ internals

// An unreadable judge block declares no `jev` fact, so nothing can fold.
function judgeMayFold(ctx: HookContext, regs: Registries): boolean {
  try {
    const policy = regs.policy.judge;
    return policy.mode === 'authoritative' && ctx.io.env[policy.enabled_env] === policy.enabled_value;
  } catch {
    return false;
  }
}

function folds(consultation: Consultation): boolean {
  const { fact, policy } = consultation;
  return fact !== null && fact.source === 'jev' && policy !== null && policy.mode === 'authoritative';
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

// The judge races its own abort; this second race is the hook's guarantee for
// everything before the request (state build, breaker read) and for a judge
// that rejects late. Whatever the judge does afterwards no longer matters.
function withinDeadline(pending: Promise<JudgeOutcome>, ms: number): Promise<JudgeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<JudgeOutcome>((settle) => {
    timer = setTimeout(() => settle(GUARD_TIMEOUT), ms);
  });
  return Promise.race([pending, guard]).finally(() => clearTimeout(timer));
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

// Repository facts only (contracts §10.2): the declared stack's ids and two
// booleans. Nothing else from the project reaches the request.
function repositoryFacts(repo: string): JudgeInput['repository'] {
  if (repo === '') return { declared_stack: [], active_spec: false, open_change_record: false };
  const records = activeChangeRecords(join(repo, '.engineos', 'changes'));
  return {
    declared_stack: declaredStack(repo),
    active_spec: records.some((text) => SPEC_LINK.test(text)),
    open_change_record: records.length > 0,
  };
}

function declaredStack(repo: string): string[] {
  try {
    const config = loadProjectConfig(repo);
    if (config === null) return [];
    const ids = config.stack.packages.flatMap((pkg) => (pkg.framework === null ? [pkg.language] : [pkg.language, pkg.framework]));
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

// `<dir>/*.md`, dotfiles excluded, as route-before-change reads them; an
// unreadable directory or record counts as no active record.
function activeChangeRecords(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const active: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.startsWith('.')) continue;
    try {
      const text = readFileSync(join(dir, entry), 'utf8');
      if (ACTIVE_RECORD.test(text)) active.push(text);
    } catch {
      continue;
    }
  }
  return active;
}

function latencyBucket(ms: number): string {
  return LATENCY_BUCKETS.find(([bound]) => ms < bound)?.[1] ?? 'over';
}
