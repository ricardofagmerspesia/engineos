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
// never the network. The judge half lives in ./prompt-judge, the guidance
// strings in ./prompt-advisor-guidance.
import { resolve, type Answer, type Registries } from '../kernel';
import { isRiskTier, lazyRegistries, type KernelContext, type RiskTier } from '../kernel/context';
import type { JudgeFact } from '../judge';
import { KernelError } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { bypassActive } from './bypass';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { guidanceLookups, guidanceNotes, judgeNote, type TaskAnswer } from './prompt-advisor-guidance';
import { consultJudge, judgeEventData, NOT_USER_INPUT, type Consultation } from './prompt-judge';
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
  const consultation = await consultJudge(env, ctx, kernel.registries);
  // The judge's span, before the router span, exactly when a call was attempted.
  if (consultation.span !== null && consultation.latencyMs !== null) {
    recordSpan(sink, { ...JUDGE_SPAN, ...consultation.span }, consultation.latencyMs);
  }
  const resolved = resolveTask(env.prompt, consultation.fact, kernel, sink);
  if (resolved === null) return silent;
  const { task } = resolved;
  const judged: Consultation = { ...consultation, fact: resolved.fact };
  writeEvents(sink, task);
  const judgeData = judgeEventData(judged);
  if (judgeData !== null) event(sink, 'judge', judgeData);
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
