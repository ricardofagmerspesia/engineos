// EngineOS UserPromptSubmit adapter. One kernel call resolves routing, task
// scale, policy loads and decision gates; this hook only formats that contract
// and records best-effort telemetry. Non-blocking by design.
//
// Port of hooks/prompt-advisor.sh. The one structural change is the kernel call:
// bash spawned `scripts/kernel.sh resolve-task --prompt <text>` and parsed its
// JSON, this calls the same resolver in-process, which is the second node
// process per prompt that this migration exists to remove. The guidance strings
// live in ./prompt-advisor-guidance, verbatim from the jq program they replace.
//
// Since the routing decision layer (contracts §3, async amendment) the kernel
// call is followed by one awaited decision — ./prompt-advisor-router — so the
// hook answers a promise. resolve() itself stays synchronous.
import { resolve, type Answer } from '../kernel';
import { isRiskTier, lazyRegistries, type KernelContext, type Registries, type RiskTier } from '../kernel/context';
import { KernelError } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { bypassActive } from './bypass';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { guidanceNotes, type TaskAnswer } from './prompt-advisor-guidance';
import { advisorProject, routeDecision, type AdvisorProject, type RouterDeps } from './prompt-advisor-router';
import { promptNeedsStackQuestion, STACK_QUESTION_NOTE } from './stack-question';
import { event, telemetrySink, withSpanAsync, type EventData, type SpanFacts, type SpanFields, type Sink } from './telemetry';
import { humanPrompt } from '../lib/harness-prompt';

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

export function run(env: HookEnvelope, ctx: HookContext): Promise<HookDecision> {
  return runWith(env, ctx, {});
}

// `deps` is the test seam for the decision layer's network, CLI probe and
// clocks; production passes none and gets the real ones.
export async function runWith(env: HookEnvelope, ctx: HookContext, deps: RouterDeps): Promise<HookDecision> {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return context('UserPromptSubmit', BYPASS_NOTICE);
  // An empty prompt resolves nothing and is not evidence of anything, so it is
  // refused before the sink is built — building it would create the telemetry
  // directory for a prompt that never happened.
  // Hand-backs, notifications and command echoes arrive through the same event
  // as a typed request; only the human part is routed, and a prompt that is
  // harness text from end to end is no request at all (src/lib/harness-prompt.ts).
  const prompt = humanPrompt(env.prompt);
  if (prompt === '') return silent;
  // bypassed is false by construction: the bypass branch above already returned.
  const sink = telemetrySink(env, ctx, { bypassed: false });
  const task = await resolveTask(prompt, { env, ctx, sink, deps });
  if (task === null) return silent;
  writeEvents(sink, task);
  const notes = guidanceNotes(task);
  // The fallback for a session whose SessionStart note scrolled away: repeated
  // only on prompts that are about to make a stack choice, never on questions.
  if (promptNeedsStackQuestion(task.contract.intents, env.cwd, ctx.spawn)) notes.push(STACK_QUESTION_NOTE);
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
// block the user's prompt. The failure path writes NO span, because withSpanAsync
// records an outcome rather than a duration, and a kernel that did not answer
// has no outcome to record — the same reason bash wrote its span only after the
// call returned zero.
//
// The caller's project rides along (contracts §2 amendment): `project` is the
// repo root of the envelope's cwd and `projectCwd` the cwd itself, so the
// floor's stack rebind applies in a real session. The stack is resolved once
// here and handed to both resolve and the decision layer, so the two can never
// read it differently.
interface ResolveDeps {
  env: HookEnvelope;
  ctx: HookContext;
  sink: Sink | null;
  deps: RouterDeps;
}

async function resolveTask(prompt: string, run: ResolveDeps): Promise<TaskAnswer | null> {
  const { ctx } = run;
  const registries = lazyRegistries(ctx.root);
  try {
    return await withSpanAsync(run.sink, ROUTER_SPAN, async () => {
      const project = advisorProject(run.env, ctx);
      const task = narrow(resolve({ prompt, taskContract: true }, kernelContext(ctx.root, registries, project)));
      const routed = await routeDecision({ prompt, task, project, ctx, regs: registries, deps: run.deps });
      return { result: routed.task, status: 'OK', fields: { ...spanFields(routed.task), ...routed.fields } };
    });
  } catch {
    return null;
  }
}

function kernelContext(root: string, registries: Registries, project: AdvisorProject): KernelContext {
  const kernel: KernelContext = { root, registries };
  if (project.root !== null) {
    kernel.project = project.root;
    kernel.projectCwd = project.cwd;
  }
  if (project.stack !== undefined) kernel.stack = project.stack;
  return kernel;
}

function narrow(answer: Answer): TaskAnswer {
  const { route, decision_rules: decisions, task_contract: contract } = answer;
  if (contract === undefined || decisions === undefined || route === undefined || !('escalate' in route)) {
    throw new KernelError('resolve-task: the kernel answered no task contract');
  }
  return { route, decisions, contract, hitl: answer.hitl ?? null, router: null };
}

// Ids only, exactly like the events below: the first routed intent and the risk
// FLOOR, never the prompt. The contract's intents come first because they are
// the ones the session is told to load — the decision layer's choice when it
// made one, the floor's otherwise.
function spanFields(task: TaskAnswer): SpanFields {
  const first = task.contract.intents[0] ?? task.route.intents[0] ?? NO_ROUTE;
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
