import { KernelError } from '../lib/json';
import type { HitlReasonRow } from '../registry/policy';
import { isRiskTier, type Registries, type RiskTier } from './context';
import { evaluateCollect, type Condition, type Fact } from './table';

// Human-in-the-loop as a queryable entity. autonomy.ceiling_by_risk answers "how
// far may this unit go alone"; this section answers "must a HUMAN decide, and
// for which named reasons" — so a gate produces an auditable record instead of
// an implication drawn from a tier. The reason vocabulary is the closed list in
// registries/policy.json .hitl.reasons and the emission order IS that list's
// order, never a literal restated here (rules/risk-autonomy.md
// "Human-in-the-loop" mirrors both).
export interface HitlFacts {
  riskTier: RiskTier;
  autonomy: string;
  // The legacy CLI hands these over as the raw flag strings the bash arm
  // validated itself (`--evidence thin|adequate`, `--external-effect
  // true|false`), while `resolve --facts '<json>'` declares the booleans JSON
  // has. Both forms are accepted so the arm's own validation — and its verbatim
  // messages — stay in this module rather than being duplicated per caller.
  evidence?: string;
  externalEffect?: boolean | string;
  conflict?: boolean | string;
  situation?: string;
  // A multi-agent topology awaits the developer's approval before any graph
  // code (decision rule rule-multi-agent-design). resolve-task declares it from
  // the matched rule; a direct caller may declare it the same way.
  topology?: boolean | string;
}

// cmd_hitl's key order: required, reasons, autonomy_after, record_home.
export interface HitlSection {
  required: boolean;
  reasons: string[];
  autonomy_after: string;
  record_home: string;
}

// The facts a policy.hitl.reason_table row may test, the named set its `in`
// conditions may cite, and the fact ordered by the autonomy levels (so
// `external-effect` fires at {"at_least": "A3"} and every level above it rather
// than at a hand-listed pair of ids — rules/risk-autonomy.md A3). The C26
// schema check holds the table to this vocabulary.
export const HITL_FACTS = ['risk', 'evidence', 'external_effect', 'autonomy', 'conflict', 'situation', 'topology'] as const;
export const HITL_SETS = ['retry.never_retry'] as const;
export const HITL_ORDERED_FACT = 'autonomy';

interface DropInputs {
  evidence: string;
  risk: RiskTier;
  autonomyIndex: number;
  levels: readonly string[];
  highWithThinEvidence: string;
}

export function hitlSection(facts: HitlFacts, regs: Registries): HitlSection {
  const policy = regs.policy;

  // Re-checked at runtime because a declared fact can arrive from parsed JSON,
  // where the static type says nothing about the value.
  const risk = facts.riskTier;
  if (!isRiskTier(risk)) throw new KernelError('hitl requires --risk low|medium|high');

  const levels = policy.autonomy.levels.map((level) => level.id);
  if (levels.length < 2) {
    throw new KernelError(
      'policy.json .autonomy.levels declares fewer than two levels — hitl cannot resolve a one-level drop',
    );
  }
  const autonomyIndex = levels.indexOf(facts.autonomy);
  if (autonomyIndex < 0) throw new KernelError('hitl requires --autonomy A0..A4');

  const evidence = facts.evidence ?? 'adequate';
  if (evidence !== 'thin' && evidence !== 'adequate') {
    throw new KernelError('hitl --evidence must be thin|adequate');
  }
  const external = asBoolean(facts.externalEffect, 'hitl --external-effect must be true|false');
  const conflict = asBoolean(facts.conflict, 'hitl --conflict must be true|false');
  const topology = asBoolean(facts.topology, 'hitl --topology must be true|false');

  // A tier that requires a human and names nowhere to record the decision has
  // not passed its gate (rules/risk-autonomy.md), so an empty record home is
  // fail-closed rather than a null shipped at exit 0.
  const recordHome = policy.hitl.record_home;
  if (recordHome === '') {
    throw new KernelError(
      'policy.json has no hitl.record_home — hitl will not require a human decision without naming where it is recorded',
    );
  }

  // An unknown situation is an error, never an ignored flag: a caller reporting
  // a situation the kernel silently drops would read required:false as "no human
  // needed", when the truth is "the kernel did not understand the input".
  const situation = facts.situation ?? '';
  const declaredSituations = [...policy.retry.never_retry, ...policy.hitl.situations];
  if (situation !== '' && !declaredSituations.includes(situation)) {
    throw new KernelError(
      `unknown situation: ${situation} (one of retry.never_retry or hitl.situations)`,
    );
  }

  const table = policy.hitl.reason_table;
  requireFloorsDeclared(table, levels);

  // The table says when each reason is true; the registry's reasons list
  // decides which may be cited and in which order. The four retry.never_retry
  // ids collapse to the one never-retry-situation row, which cites them as a
  // named set — they are the same decision (stop, escalate to a human, do not
  // retry) — while the hitl.situations ids each carry their own row. An absent
  // situation is null, so it equals and belongs to nothing; topology-approval
  // tests no tier or level because the approval a topology owes is a fact
  // about the request (a matched rule-multi-agent-design).
  const measured: Record<(typeof HITL_FACTS)[number], Fact> = {
    risk,
    evidence,
    external_effect: external,
    autonomy: facts.autonomy,
    conflict,
    situation: situation === '' ? null : situation,
    topology,
  };
  const matched = evaluateCollect(table, {
    facts: measured,
    sets: { 'retry.never_retry': policy.retry.never_retry },
    orders: { [HITL_ORDERED_FACT]: levels },
  }).map((row) => row.reason);
  // Several rows may share a reason (an OR); each is cited once.
  const triggered = [...new Set(matched)];
  const undeclared = triggered.filter((reason) => !policy.hitl.reasons.includes(reason));
  if (undeclared.length > 0) {
    throw new KernelError(
      `policy.json .hitl.reasons does not declare: ${undeclared.join(', ')} — a gate may cite nothing outside the closed vocabulary`,
    );
  }
  const reasons = policy.hitl.reasons.filter((reason) => triggered.includes(reason));

  return {
    required: reasons.length > 0,
    reasons,
    autonomy_after: autonomyAfter({
      evidence,
      risk,
      autonomyIndex,
      levels,
      highWithThinEvidence: policy.autonomy.high_with_thin_evidence,
    }),
    record_home: recordHome,
  };
}

// An autonomy floor a row names must be a declared level, checked on every call
// (whether or not the row's other conditions hold) so a registry that drops the
// level is refused with the message callers already parse rather than with the
// table's generic one.
function requireFloorsDeclared(table: readonly HitlReasonRow[], levels: readonly string[]): void {
  for (const row of table) {
    const condition = row.when[HITL_ORDERED_FACT];
    if (isFloor(condition) && !levels.includes(condition.at_least)) {
      throw new KernelError(
        `policy.json .autonomy.levels does not declare ${condition.at_least} — hitl cannot resolve the ${row.reason} floor`,
      );
    }
  }
}

function isFloor(condition: Condition | undefined): condition is { readonly at_least: string } {
  return typeof condition === 'object' && !Array.isArray(condition) && 'at_least' in condition;
}

// Thin evidence DROPS autonomy; it can never raise it. One level down, then two
// clamps: never above the level passed in (so A0 — "explain only, no writes" —
// stays A0, since A0 is a consequence of the task being a question, not of thin
// evidence), and never below the second declared level, the lowest at which
// "draft, do not apply" is still an answer. At risk high the registry value
// autonomy.high_with_thin_evidence caps the result, so that target lives in
// exactly one place.
function autonomyAfter(drop: DropInputs): string {
  const { autonomyIndex, levels } = drop;
  const given = levels[autonomyIndex];
  if (given === undefined) throw new KernelError('hitl requires --autonomy A0..A4');
  if (drop.evidence !== 'thin') return given;

  const floorIndex = 1;
  let index = Math.min(autonomyIndex, Math.max(floorIndex, autonomyIndex - 1));
  if (drop.risk === 'high') {
    const highWithThinEvidence = drop.highWithThinEvidence;
    // Read only on the path that uses it, and fail closed twice: a missing value
    // would index the level list with nothing, and a value that is not a level
    // id would do the same — both producing a confident wrong ceiling.
    if (highWithThinEvidence === '') {
      throw new KernelError(
        'policy.json has no autonomy.high_with_thin_evidence — hitl cannot resolve the thin-evidence ceiling at risk high',
      );
    }
    const capIndex = levels.indexOf(highWithThinEvidence);
    if (capIndex < 0) {
      throw new KernelError(
        `policy.json autonomy.high_with_thin_evidence is not an autonomy level: ${highWithThinEvidence}`,
      );
    }
    index = Math.min(index, capIndex);
  }
  const after = levels[index];
  if (after === undefined) throw new KernelError('hitl requires --autonomy A0..A4');
  return after;
}

function asBoolean(value: boolean | string | undefined, message: string): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new KernelError(message);
}
