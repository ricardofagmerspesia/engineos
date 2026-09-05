// Family 50-kernel, check C18d: the integrity of intents.json's suppression
// data. It sits apart from the rest of the router half because it is the one
// check in the family that reads the registry document RAW.
//
// The typed loader coerces a non-boolean `suppressible` to false and an absent
// `suppressed_by` to [], which is right for a reader that has to answer anyway
// and wrong for a check whose whole subject is whether those fields are
// well-formed. So this file addresses the document, and everything else in the
// family addresses the loader.
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import {
  missingInputs,
  rawJson,
  ROUTER_INPUTS,
  ROUTER_TOKEN,
  rows,
  stringsOf,
  uniqueSorted,
} from './kernel-lib';
import { skipOnce, type CheckContext } from './lib';

export const C18D_FINDINGS = [
  'suppressed-by-unknown-intent',
  'suppressed-by-self',
  'suppression-cycle',
  'all-intents-suppressible',
  'no-dispatch-plan-intent',
  'non-boolean-flag',
] as const;

declare module './codes' {
  interface CheckCodes {
    C18d: (typeof C18D_FINDINGS)[number];
  }
}

const INTENTS_JSON = 'registries/intents.json';
const C18D_TITLE = 'intents.json suppression data is internally consistent';

interface RawIntent {
  readonly id: string;
  readonly suppressedBy: string[];
  readonly suppressible: unknown;
  readonly requiresDispatchPlan: unknown;
}

function checkC18d(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18d', C18D_TITLE, ROUTER_TOKEN);
  const intents = intentRows(ctx);
  const ids = new Set(intents.map((intent) => intent.id));
  const unknownTargets: string[] = [];
  const selfReferences: string[] = [];
  const nonBoolean: string[] = [];
  for (const intent of intents) {
    for (const target of intent.suppressedBy) {
      if (!ids.has(target)) unknownTargets.push(target);
      if (target === intent.id) selfReferences.push(intent.id);
    }
    if (isDeclaredNonBoolean(intent.suppressible) || isDeclaredNonBoolean(intent.requiresDispatchPlan)) {
      nonBoolean.push(intent.id);
    }
  }
  const findings: Finding[] = [
    ...uniqueSorted(unknownTargets).map((id) => finding('C18d', 'suppressed-by-unknown-intent', id)),
    ...uniqueSorted(selfReferences).map((id) => finding('C18d', 'suppressed-by-self', id)),
    ...uniqueSorted(twoCycles(intents)).map((id) => finding('C18d', 'suppression-cycle', id)),
  ];
  // Every intent suppressible means nothing survives suppression, and no intent
  // requiring a dispatch plan means the escalation path is unreachable. Both are
  // registry-wide properties, so neither carries a subject. An unreadable
  // registry yields no rows and therefore trips both, which is the fail-closed
  // half the bash pipeline did not have.
  if (!intents.some((intent) => intent.suppressible !== true)) {
    findings.push(finding('C18d', 'all-intents-suppressible'));
  }
  if (!intents.some((intent) => intent.requiresDispatchPlan === true)) {
    findings.push(finding('C18d', 'no-dispatch-plan-intent'));
  }
  findings.push(...uniqueSorted(nonBoolean).map((id) => finding('C18d', 'non-boolean-flag', id)));
  return [result('C18d', C18D_TITLE, findings)];
}

function intentRows(ctx: CheckContext): RawIntent[] {
  return rows(rawJson(ctx, INTENTS_JSON), 'intents').map((row) => ({
    id: typeof row['id'] === 'string' ? row['id'] : '',
    suppressedBy: stringsOf(row['suppressed_by']),
    suppressible: row['suppressible'],
    requiresDispatchPlan: row['requires_dispatch_plan'],
  }));
}

// jq read an absent key and an explicit null as the same value, so only a
// DECLARED non-boolean is a defect.
function isDeclaredNonBoolean(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== 'boolean';
}

// A suppresses B and B suppresses A: neither can ever win, so both are reported.
// Self-reference is the degenerate case, caught above, so it is excluded here
// rather than double-reported.
function twoCycles(intents: readonly RawIntent[]): string[] {
  const found: string[] = [];
  for (const one of intents) {
    for (const other of intents) {
      if (one.id === other.id) continue;
      if (other.suppressedBy.includes(one.id) && one.suppressedBy.includes(other.id)) found.push(one.id);
    }
  }
  return found;
}

export const SUPPRESSION_CHECK: Check = { id: 'C18d', codes: C18D_FINDINGS, run: checkC18d };
