// EngineOS UserPromptSubmit adapter. One kernel call resolves routing, task
// scale, policy loads and decision gates; this hook only formats that contract
// and records best-effort telemetry. Non-blocking by design.
//
// Port of hooks/prompt-advisor.sh. The one structural change is the kernel call:
// bash spawned `scripts/kernel.sh resolve-task --prompt <text>` and parsed its
// JSON, this calls the same resolver in-process, which is the second node
// process per prompt that this migration exists to remove. The guidance strings
// live in ./prompt-advisor-guidance, verbatim from the jq program they replace.
import { resolve, type Answer } from '../kernel';
import { isRiskTier, lazyRegistries, type KernelContext, type RiskTier } from '../kernel/context';
import { KernelError } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { bypassActive } from './bypass';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { guidanceNotes, type TaskAnswer } from './prompt-advisor-guidance';
import { event, telemetrySink, withSpan, type EventData, type SpanFacts, type SpanFields, type Sink } from './telemetry';

// The only thing a bypassed session is told, and the only reason this hook still
// speaks when EngineOS is off: a silent bypass is the failure mode
// (src/bypass/bypass.e2e.test.ts: the prompt advisor announces the active bypass).
const BYPASS_NOTICE =
  '[engineos] BYPASS ACTIVE — routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness\'s own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run `/engineos:bypass off` to restore EngineOS.';

// model_tier is `cheap` because resolving a task is a deterministic registry
// lookup with no model call at all — claiming `build` here would invent model
// spend in every consumer that sums by tier.
const ROUTER_SPAN: SpanFacts = { kind: 'router', capability: 'route', modelTier: 'cheap' };

// The span's own fallback when a prompt resolved no intent at all: a field the
// journal would reject empty, and `none` is what bash wrote.
const NO_ROUTE = 'none';

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return context('UserPromptSubmit', BYPASS_NOTICE);
  // An empty prompt resolves nothing and is not evidence of anything, so it is
  // refused before the sink is built — building it would create the telemetry
  // directory for a prompt that never happened.
  if (env.prompt === '') return silent;
  // bypassed is false by construction: the bypass branch above already returned.
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const task = resolveTask(env.prompt, ctx, sink);
  if (task === null) return silent;
  writeEvents(sink, task);
  const notes = guidanceNotes(task);
  // A prompt that resolved nothing worth announcing stays silent — the events
  // and the span above are still the honest record that the call happened.
  if (notes.length === 0) return silent;
  return context('UserPromptSubmit', notes.join('\n'));
}

// The in-process equivalent of `scripts/kernel.sh resolve-task --prompt <text>`:
// one deep kernel call answering route, decision_rules, hitl and task_contract
// together, with the same refusal the `resolve-task` projection makes when the
// kernel answers no contract (src/kernel/cli.ts).
//
// Null on any failure, which is bash's `|| exit 0`: a broken registry must not
// block the user's prompt. The failure path writes NO span, because withSpan
// records an outcome rather than a duration, and a kernel that did not answer
// has no outcome to record — the same reason bash wrote its span only after the
// call returned zero.
function resolveTask(prompt: string, ctx: HookContext, sink: Sink | null): TaskAnswer | null {
  const kernel: KernelContext = { root: ctx.root, registries: lazyRegistries(ctx.root) };
  try {
    return withSpan(sink, ROUTER_SPAN, () => {
      const task = narrow(resolve({ prompt, taskContract: true }, kernel));
      return { result: task, status: 'OK', fields: spanFields(task) };
    });
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
