// The human-readable guidance half of the UserPromptSubmit adapter: the jq
// program of hooks/prompt-advisor.sh (:64-115), string for string.
//
// It lives beside ./prompt-advisor rather than inside it because the strings ARE
// the contract — src/hooks/prompt-advisor.e2e.test.ts asserts substrings of them, and the
// Wave 6 e2e keeps doing so — while the hook itself is a kernel call, three
// telemetry writes and one decision. Mixing the two would hide both.
import type { DecisionMatch, DecisionsSection, EscalateRouteSection, HitlSection, TaskContractSection } from '../kernel';
import type { EscalateReason } from '../kernel/decision-layer';
import type { Rebound } from '../kernel/route';
import type { RouterMode, RouterSetting } from '../registry/policy-router-decision';

// What the routing decision layer contributes to the guidance: which mode
// decided, any downgrade to say out loud, and any residue to hand the router
// agent. Null when the layer did not run (a pure question, or a kernel answer
// with nothing substantive to route).
export interface RouterView {
  mode: RouterMode;
  confidence: number | null;
  // Rendered as `<requested> unavailable: <reason>`; `reason` is the decision's
  // own fallback reason, or `repo-cap` / `error`, which only the advisor sees.
  fallback: { requested: RouterSetting; reason: string } | null;
  escalation: { reason: EscalateReason; candidates: string[] } | null;
}

// One prompt's kernel answer, narrowed to the four sections the guidance reads.
// `hitl` is null rather than absent for the same reason the resolve-task
// projection emits null: `classifyNote` asks whether a gate fired AT ALL, and an
// optional key would make "no gate" and "not asked" the same value.
export interface TaskAnswer {
  route: EscalateRouteSection;
  decisions: DecisionsSection;
  contract: TaskContractSection;
  hitl: HitlSection | null;
  router: RouterView | null;
}

// jq's `(scale_notes + decision_note + route_note + hitl_note + classify_note)`.
// The order is asserted by the suite (a big-task prompt reads "big-task
// signal ... route escalation"), so it is the contract, not a preference.
export function guidanceNotes(task: TaskAnswer): string[] {
  const planning = task.contract.execution?.planning;
  if (planning?.simple === true && planning.rulesMode === 'stack') {
    return [
      planning.decision === 'direct'
        ? '[engineos] simple direct task — use returned stack guidance and security/Git safeguards. No mandatory prototype, spec or ticket workflow. Ask fresh final check consent only after implementation is integrated.'
        : '[engineos] simple task planning pending — ask permitted clickable Implement directly / Create a lightweight spec choices before creating documents. Record the actual scope-bound answer; load only stack guidance and security/Git safeguards. No checks during implementation.',
      ...classifyNote(task),
    ];
  }
  return [
    ...scaleNotes(task.contract),
    ...decisionNote(task.decisions),
    ...routeNote(task),
    ...routerNotes(task),
    ...hitlNote(task.hitl),
    ...classifyNote(task),
  ];
}

function scaleNotes(contract: TaskContractSection): string[] {
  const notes: string[] = [];
  if (contract.scale.big_task) {
    notes.push(
      "[engineos] big-task signal — apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself.",
    );
  }
  if (contract.scale.spec_authoring) {
    notes.push(
      '[engineos] spec/PRD authoring — rules/models.md: use the most-capable tier (model: fable). If the session model is lower, delegate the authoring to a subagent with that model.',
    );
  }
  if (contract.scale.design_work) {
    notes.push(
      '[engineos] design/architecture work — rules/models.md: design tier (model: opus) for the design pass, build tier (model: opus) for the code that follows.',
    );
  }
  return notes;
}

function decisionNote(decisions: DecisionsSection): string[] {
  if (decisions.matches.length === 0) return [];
  const lines = decisions.matches.map(matchLine).join('\n');
  const high = decisions.any_high
    ? '\n[engineos] a matched rule sets risk=high — autonomy ceiling A3 per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release.'
    : '';
  return [
    `[engineos] decision rules matched this prompt (registries/decision-rules.json).\n${lines}\nConfirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — resolve complete execution facts before artifacts; eligible simple tasks ask a scope-bound clickable direct/spec choice rather than automatically creating a spec. Independent security/design obligations remain. Apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md.${high}`,
  ];
}

// Every optional field keeps its own label. A collapsed field would still name
// the right rule while printing its gate as a preference, which is the shifted-
// slot failure the suite's `absent "prefer:"` assertions exist to catch.
function matchLine(match: DecisionMatch): string {
  return (
    `  - ${match.id}` +
    (match.require.length > 0 ? ` — require: ${match.require.join(', ')}` : '') +
    (declared(match.prefer) ? ` — prefer: ${match.prefer}` : '') +
    (declared(match.gate) ? ` [gate: ${match.gate}]` : '') +
    (declared(match.risk) ? ` [risk: ${match.risk}]` : '')
  );
}

function routeNote(task: TaskAnswer): string[] {
  const { route, contract } = task;
  if (route.escalate) {
    const scale = Object.entries(route.scale)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    return [
      `[engineos] route escalation — the kernel could not fully resolve this request: ${route.reasons.join(', ')}. Dispatch the \`router\` agent (agents/router.md, model opus) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=${csv(route.intents)} agents=${csv(route.agents)} scale=(${scale}). A hook cannot dispatch an agent — you must invoke it.`,
    ];
  }
  if (contract.substantive) {
    return [
      `[engineos] task contract (kernel, deterministic): intents=${csv(contract.intents)} agents=${csv(contract.agents)} rules=${csv(contract.rules)} policy_rules=${csv(contract.policy_rules)} skills=${csv(contract.skills)} commands=${csv(contract.commands)} mcp=${csv(contract.mcp)} model_tier=${orDash(contract.model_tier)} risk_floor=${orDash(contract.risk_floor)} autonomy_ceiling_at_floor=${orDash(contract.autonomy_ceiling_at_floor)}${routerField(task.router)}${reboundField(route.rebound)} — load these before acting; the risk floor is a floor, not the final tier. ${dispatchClause(task.router)}`,
    ];
  }
  return [];
}

// The contract line used to end "No router dispatch needed." unconditionally;
// when the decision layer hands the request on (the line after this one), that
// sentence would contradict the instruction that follows it.
function dispatchClause(router: RouterView | null): string {
  return router === null || router.escalation === null ? 'No router dispatch needed.' : 'Router dispatch needed — see the router line below.';
}

// ` router=<mode>` plus `/<confidence>` when the mode measured one.
function routerField(router: RouterView | null): string {
  if (router === null) return '';
  return ` router=${router.mode}${router.confidence === null ? '' : `/${router.confidence.toFixed(2)}`}`;
}

function reboundField(rebound: readonly Rebound[]): string {
  if (rebound.length === 0) return '';
  return ` rebound=${rebound.map((swap) => `${swap.from}->${swap.to}(${swap.reason}/${swap.scope})`).join(',')}`;
}

// The two lines the decision layer adds. A downgrade is always said out loud —
// a silent one is the failure this layer must never have. The residue line is
// left out when the kernel already escalated: its own notice names the same
// agent, and two dispatch instructions for one request read as two dispatches.
function routerNotes(task: TaskAnswer): string[] {
  const { router } = task;
  if (router === null) return [];
  const notes: string[] = [];
  if (router.fallback !== null) {
    notes.push(`[engineos] router: ${router.mode} (${router.fallback.requested} unavailable: ${router.fallback.reason})`);
  }
  if (router.escalation !== null && !task.route.escalate) {
    notes.push(
      `[engineos] router: ${router.mode} could not decide (${router.escalation.reason}) — dispatch the router agent (agents/router.md, model opus) via the Task tool with the request text, the repository languages/frameworks and these candidates before any write: ${csv(router.escalation.candidates)}. A hook cannot dispatch an agent — you must invoke it.`,
    );
  }
  return notes;
}

function hitlNote(hitl: HitlSection | null): string[] {
  if (hitl === null || !hitl.required) return [];
  return [
    `[engineos] human-in-the-loop required — reasons: ${hitl.reasons.join(', ')}. A human decides before any external effect; the autonomy ceiling does not cover this. Record who, when, which reason ids, and what was approved or refused under "## Human decisions" in the change record (rules/risk-autonomy.md "Human-in-the-loop"; rules/gates.md release checklist).`,
  ];
}

// A high risk FLOOR with no classified tier. The compensating signal is an
// instruction to CLASSIFY, never a human-approval gate: no "human decides", no
// "approval", no reason ids, and deliberately not the phrase "human-in-the-loop"
// — a suite assertion that no gate was announced has to stay meaningful.
function classifyNote(task: TaskAnswer): string[] {
  if (task.contract.risk_floor !== 'high' || task.hitl !== null) return [];
  return [
    '[engineos] risk floor is high and no tier has been classified — classify this task per rules/risk-autonomy.md (reversibility, blast radius, data sensitivity, contract surface, spend; the shortcut floors are high outright) BEFORE claiming that no human decision is owed. None of the gate reasons in registries/policy.json hitl.reasons has fired: a floor is an input to classification, not a verdict, so this is an instruction to classify and not an approval gate.',
  ];
}

function csv(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(',');
}

// jq's `// "-"`, which falls back on null and false only: an empty string is
// truthy in jq and prints as itself, so it must not become a dash here.
function orDash(value: string | null): string {
  return value === null ? '-' : value;
}

// jq's `(.x // "") != ""`: null and the empty string are both "not declared".
// A type predicate rather than a boolean, so the caller's template literal sees
// a string and no `?? ''` has to stand in for a narrowing the helper already did.
function declared(value: string | null): value is string {
  return value !== null && value !== '';
}
