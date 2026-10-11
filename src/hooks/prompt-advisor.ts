// EngineOS UserPromptSubmit adapter. A source check, an optional judge call and
// one kernel call resolve routing, task scale, policy loads and decision gates;
// this hook only formats that contract and records best-effort telemetry.
// Non-blocking by design: every failure path is a silent exit 0.
//
// Port of hooks/prompt-advisor.sh. bash spawned `scripts/kernel.sh resolve-task
// --prompt <text>`; this calls the same resolver in-process. The routing
// replacement (contracts.md@rev2 §5, §10.5) put two steps in front of it: S0
// refuses text the user did not type, and the opt-in Jev judge turns the prompt
// into facts the kernel folds — replayably, because the kernel reads the fact,
// never the network. The guidance strings live in ./prompt-advisor-guidance.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve, type Answer, type Registries } from '../kernel';
import { isRiskTier, lazyRegistries, type KernelContext, type RiskTier } from '../kernel/context';
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
import { KernelError } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { loadProjectConfig } from '../registry/project-config';
import { bypassActive } from './bypass';
import { editContext } from './edit-context';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { guidanceLookups, guidanceNotes, judgeNote, type TaskAnswer } from './prompt-advisor-guidance';
import { classifyPromptSource } from './prompt-source';
import { promptNeedsStackQuestion, STACK_QUESTION_NOTE } from './stack-question';
import { event, recordSpan, telemetrySink, withSpan, type EventData, type SpanFacts, type SpanFields, type Sink } from './telemetry';

// The only thing a bypassed session is told, and the only reason this hook still
// speaks when EngineOS is off: a silent bypass is the failure mode
// (src/bypass/bypass.e2e.test.ts: the prompt advisor announces the active bypass).
const BYPASS_NOTICE =
  '[engineos] BYPASS ACTIVE — routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness\'s own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run `/engineos:bypass off` to restore EngineOS.';

// model_tier is `cheap` because resolving a task is a deterministic registry
// lookup with no model call at all — claiming `build` here would invent model
// spend in every consumer that sums by tier.
const ROUTER_SPAN: SpanFacts = { kind: 'router', capability: 'route', modelTier: 'cheap' };

// One per ATTEMPTED judge call (contracts §7); `cheap` is the router span's tier.
const JUDGE_SPAN: SpanFacts = { kind: 'model', capability: 'route', modelTier: 'cheap' };

// The span's own fallback when a prompt resolved no intent at all: a field the
// journal would reject empty, and `none` is what bash wrote.
const NO_ROUTE = 'none';

const NOT_USER_INPUT = 'not-user-input';

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

interface Consultation {
  fact: JudgeFact | null;     // what reaches the kernel; null: the judge could not be consulted
  policy: JudgePolicy | null; // null: the registry declares no readable judge block
  latencyMs: number | null;   // attempted calls only
}

const NOT_CONSULTED: Consultation = { fact: null, policy: null, latencyMs: null };

// The task and the judge fact the kernel actually folded into it.
interface ResolvedTask {
  task: TaskAnswer;
  fact: JudgeFact | null;
}

export async function run(env: HookEnvelope, ctx: HookContext): Promise<HookDecision> {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return context('UserPromptSubmit', BYPASS_NOTICE);
  // An empty prompt resolves nothing and is not evidence of anything, so it is
  // refused before the sink is built — building it would create the telemetry
  // directory for a prompt that never happened.
  if (env.prompt === '') return silent;
  // bypassed is false by construction: the bypass branch above already returned.
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const kernel: KernelContext = { root: ctx.root, registries: lazyRegistries(ctx.root) };
  // S0: text the user did not type gets no kernel call, no judge call and no
  // note — one route event says it was seen and skipped.
  if (!typedByUser(env, kernel.registries)) {
    event(sink, 'route', { skipped: NOT_USER_INPUT });
    return silent;
  }
  const consultation = await consultJudge(env, ctx, kernel.registries, sink);
  const resolved = resolveTask(env.prompt, consultation.fact, kernel, sink);
  if (resolved === null) return silent;
  const { task } = resolved;
  const judged: Consultation = { ...consultation, fact: resolved.fact };
  writeEvents(sink, task);
  writeJudgeEvent(sink, judged);
  const notes = notesFor(task, judged, kernel.registries);
  if (notes === null) return silent;
  // The fallback for a session whose SessionStart note scrolled away: repeated
  // only on prompts that are about to make a stack choice, never on questions.
  if (promptNeedsStackQuestion(task.contract.intents, env.cwd, ctx.spawn)) notes.push(STACK_QUESTION_NOTE);
  // A prompt that resolved nothing worth announcing stays silent — the events
  // and the span above are still the honest record that the call happened.
  if (notes.length === 0) return silent;
  return context('UserPromptSubmit', notes.join('\n'));
}

// A registry without source markers (one older than policy 1.8.0) cannot tell
// the frames apart, and reads every prompt as the user's — today's behaviour.
function typedByUser(env: HookEnvelope, regs: Registries): boolean {
  try {
    return classifyPromptSource(env, regs.policy.router.source_markers) === 'user';
  } catch {
    return true;
  }
}

// Outcome -> fact (contracts §10.5). Any throw on the way (an unreadable judge
// block, a question set the registries cannot build) declares no fact at all,
// which the kernel reports as `fallback: no-judge-fact` — never a guess.
async function consultJudge(env: HookEnvelope, ctx: HookContext, regs: Registries, sink: Sink | null): Promise<Consultation> {
  let policy: JudgePolicy;
  try {
    policy = regs.policy.judge;
    // The judge answers `disabled` first itself (§10.1); repeating that one
    // check here spares the hot path the git process, config read and question
    // set a disabled judge would discard.
    if (ctx.io.env[policy.enabled_env] !== policy.enabled_value) {
      return { fact: { source: 'fallback', reason: 'disabled' }, policy, latencyMs: null };
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
    if (outcome.kind === 'skipped') return { fact: factOf(outcome), policy, latencyMs: null };
    recordSpan(sink, { ...JUDGE_SPAN, ...judgeSpanOutcome(outcome, policy, breaker.probe()) }, latencyMs);
    return { fact: factOf(outcome), policy, latencyMs };
  } catch {
    return { fact: null, policy, latencyMs: null };
  }
}

function factOf(outcome: JudgeOutcome): JudgeFact | null {
  if (outcome.kind === 'facts') return outcome.facts;
  if (outcome.reason === NOT_USER_INPUT) return null;
  return { source: 'fallback', reason: outcome.reason };
}

function judgeSpanOutcome(outcome: JudgeOutcome, policy: JudgePolicy, probe: boolean): Pick<SpanFacts, 'status' | 'fields'> {
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

// The in-process equivalent of `scripts/kernel.sh resolve-task --prompt <text>`:
// one deep kernel call answering route, decision_rules, hitl and task_contract
// together, with the same refusal the `resolve-task` projection makes when the
// kernel answers no contract (src/kernel/cli.ts).
//
// A judge fact the kernel refuses (a vocabulary drift between the judge's
// answer and the registries) must not cost the user their routing: the call is
// repeated with the fallback that names the failure. Null on any other failure,
// which is bash's `|| exit 0`. The failure path writes NO span: withSpan records
// an outcome, and a kernel that did not answer has none.
function resolveTask(prompt: string, judgeFact: JudgeFact | null, kernel: KernelContext, sink: Sink | null): ResolvedTask | null {
  const attempt = (fact: JudgeFact | null): ResolvedTask =>
    withSpan(sink, ROUTER_SPAN, () => {
      const facts = fact === null ? { prompt, taskContract: true } : { prompt, taskContract: true, judge: fact };
      const task = narrow(resolve(facts, kernel));
      return { result: { task, fact }, status: 'OK', fields: spanFields(task) };
    });
  try {
    return attempt(judgeFact);
  } catch {
    if (judgeFact === null || judgeFact.source === 'fallback') return null;
  }
  try {
    return attempt({ source: 'fallback', reason: 'invalid-response' });
  } catch {
    return null;
  }
}

function narrow(answer: Answer): TaskAnswer {
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (contract === undefined || decisions === undefined || route === undefined || !('escalate' in route)) {
    throw new KernelError('resolve-task: the kernel answered no task contract');
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null };
}

// Null when a registry cannot answer the values the notes quote: silent, like
// every other broken-registry path.
function notesFor(task: TaskAnswer, consultation: Consultation, regs: Registries): string[] | null {
  try {
    const notes = guidanceNotes(task, guidanceLookups(regs));
    const { policy } = consultation;
    if (policy === null) return notes;
    const ruleOf: Record<string, string> = {};
    for (const rule of regs.decisionRules.rules) if (rule.judge_fact !== null) ruleOf[rule.judge_fact] = rule.id;
    notes.push(
      ...judgeNote({
        mode: policy.mode,
        fact: consultation.fact,
        intentThreshold: policy.thresholds.intent_default,
        ruleThreshold: policy.thresholds.rule_default,
        ruleOf,
        riskProposal: task.contract.risk_proposal,
      }),
    );
    return notes;
  } catch {
    return null;
  }
}

// Ids only, exactly like the events below: the first routed intent and the risk
// FLOOR, never the prompt.
function spanFields(task: TaskAnswer): SpanFields {
  const first = task.route.intents[0] ?? task.contract.intents[0] ?? NO_ROUTE;
  const route = hookSlug(first);
  const floor: RiskTier | null = task.contract.risk_floor;
  return {
    route: route === '' ? NO_ROUTE : route,
    // Allowlisted rather than trusted: `risk` is an enum field of the journal,
    // and a value outside the three tiers would be rejected on append — losing
    // the whole span rather than one field.
    risk: floor !== null && isRiskTier(floor) ? floor : 'low',
  };
}

// Telemetry stores registry ids only, never prompt text. Every adopted repo gets
// one route event per prompt — the denominator the other two are read against —
// a decision event only when a rule matched, and a hitl event only when a human
// is actually required.
function writeEvents(sink: Sink | null, task: TaskAnswer): void {
  const routeData: EventData = {
    escalate: task.route.escalate,
    reasons: task.route.reasons,
    intents: task.route.intents,
    suppressed: task.route.suppressed.map((entry) => entry.id),
    agents: task.route.agents,
  };
  event(sink, 'route', routeData);
  if (task.decisions.matches.length > 0) {
    event(sink, 'decision-rules', {
      rules: task.decisions.matches.map((match) => match.id),
      any_high: task.decisions.any_high,
    });
  }
  const { hitl } = task;
  if (hitl !== null && hitl.required) {
    event(sink, 'hitl', { required: hitl.required, reasons: hitl.reasons });
  }
}

// One judge event per user prompt (contracts §6.4), ids and a latency bucket
// only. A key with no value is left out: the append boundary refuses empties.
function writeJudgeEvent(sink: Sink | null, consultation: Consultation): void {
  const { fact, policy, latencyMs } = consultation;
  if (policy === null) return;
  const data: EventData = { source: fact === null ? 'fallback' : fact.source, mode: policy.mode };
  data.model = fact !== null && fact.source === 'jev' ? fact.model : policy.model;
  if (fact === null) data.skipped_reason = 'no-judge-fact';
  else if (fact.source === 'fallback') data.skipped_reason = fact.reason;
  if (latencyMs !== null) data.latency_bucket = latencyBucket(latencyMs);
  event(sink, 'judge', data);
}

function latencyBucket(ms: number): string {
  return LATENCY_BUCKETS.find(([bound]) => ms < bound)?.[1] ?? 'over';
}
