// The human-readable guidance half of the UserPromptSubmit adapter: the jq
// program of hooks/prompt-advisor.sh (:64-115), string for string.
//
// It lives beside ./prompt-advisor rather than inside it because the strings ARE
// the contract — hooks/test-prompt-advisor.sh asserts substrings of them, and the
// Wave 6 e2e keeps doing so — while the hook itself is a kernel call, three
// telemetry writes and one decision. Mixing the two would hide both.
import type { DecisionMatch, DecisionsSection, EscalateRouteSection, HitlSection, TaskContractSection } from '../kernel';

// One prompt's kernel answer, narrowed to the four sections the guidance reads.
// `hitl` is null rather than absent for the same reason the resolve-task
// projection emits null: `classifyNote` asks whether a gate fired AT ALL, and an
// optional key would make "no gate" and "not asked" the same value.
export interface TaskAnswer {
  route: EscalateRouteSection;
  decisions: DecisionsSection;
  contract: TaskContractSection;
  hitl: HitlSection | null;
}

// jq's `(scale_notes + decision_note + route_note + hitl_note + classify_note)`.
// The order is asserted by the suite (a big-task prompt reads "big-task
// signal ... route escalation"), so it is the contract, not a preference.
export function guidanceNotes(task: TaskAnswer): string[] {
  return [
    ...scaleNotes(task.contract),
    ...decisionNote(task.decisions),
    ...routeNote(task),
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
    `[engineos] decision rules matched this prompt (registries/decision-rules.json).\n${lines}\nConfirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md.${high}`,
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
      `[engineos] task contract (kernel, deterministic): intents=${csv(contract.intents)} agents=${csv(contract.agents)} rules=${csv(contract.rules)} policy_rules=${csv(contract.policy_rules)} skills=${csv(contract.skills)} commands=${csv(contract.commands)} mcp=${csv(contract.mcp)} model_tier=${orDash(contract.model_tier)} risk_floor=${orDash(contract.risk_floor)} autonomy_ceiling_at_floor=${orDash(contract.autonomy_ceiling_at_floor)} — load these before acting; the risk floor is a floor, not the final tier. No router dispatch needed.`,
    ];
  }
  return [];
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
