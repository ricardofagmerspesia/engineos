// C24*: backpressure — the policy block, the admission canary and the prose
// mirror. Ported from scripts/checks/70-runtime.sh's C24 block. Admission
// control for the orchestrator's dispatch loop is data
// (policy.json.parallelism.backpressure), answered by the kernel's admit arm,
// and stated in rules/parallelism.md "Backpressure".
//
// Capacity is wave_concurrency_cap itself, never a second copy of the number: a
// duplicate under backpressure would be a mirror nobody checks, so C24a fails on
// any max_inflight* key instead of reading one.
// Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 2
// ADR: docs/adr/2026-09-03-backpressure-reuses-wave-cap.md
import { isRecord } from '../lib/json';
import { ADMIT_FACTS, ADMIT_PLACEHOLDERS } from '../kernel/admit';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';
import { endsInCatchAll, rowProblems, type RowShape } from './runtime-governance-tables';
import {
  answerText,
  arrayOf,
  child,
  fileHas,
  jqText,
  kernelAnswer,
  policyDocument,
  requirePolicy,
  stringsOf,
  usableBound,
  wholeNumber,
} from './runtime-governance-shared';

export const C24_FINDINGS = [
  'not-a-whole-number',
  'below-1',
  'overload-action-not-in-actions',
  'max-inflight-copy-of-wave-cap',
  // .rows, the FIRST table src/kernel/admit.ts evaluates: each row well-formed
  // against the arm's vocabulary, each rendered action declared, and a final
  // empty-when row so every load gets an answer.
  'rows-malformed',
  'row-action-undeclared',
  'rows-no-catch-all',
] as const;

export const C24B_FINDINGS = ['expected-reject-at-cap-with-full-queue', 'expected-dispatch-when-idle'] as const;

export const C24C_FINDINGS = [
  'does-not-name-kernel-sh-admit',
  // Mirror row ids (src/checks/mirrors.ts): one table row per declared action,
  // the quoted queue bound, and the overload row that explains that bound.
  'action-row-missing',
  'queue-bound-drift',
  'overload-row-missing',
] as const;

declare module './codes' {
  interface CheckCodes {
    C24: (typeof C24_FINDINGS)[number];
    C24b: (typeof C24B_FINDINGS)[number];
    C24c: (typeof C24C_FINDINGS)[number];
  }
}

const TOKEN = 'backpressure';

const C24_TITLE = 'policy.json.parallelism.backpressure is well-formed';
const C24B_TITLE = 'kernel.sh admit dispatches when idle and rejects at cap with a full queue';
const C24C_TITLE =
  'rules/parallelism.md mirrors backpressure: names kernel.sh admit, quotes the queue bound, one row per declared action';

const PARALLELISM_MD = 'rules/parallelism.md';
const ADMIT_CALL = 'kernel.sh admit';
const MAX_QUEUED_UNITS = 'max_queued_units';

export function checkC24(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C24', C24_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const backpressure = backpressureBlock(ctx);
  const findings: Finding[] = [];

  const maxQueued = wholeNumber(backpressure?.[MAX_QUEUED_UNITS]);
  if (maxQueued === undefined) findings.push(finding('C24', 'not-a-whole-number', MAX_QUEUED_UNITS));
  // A bound of 0 makes the overload action unreachable — the kernel would go
  // straight from dispatch to reject and `defer` would be dead data.
  else if (maxQueued < 1) findings.push(finding('C24', 'below-1', MAX_QUEUED_UNITS));

  const overload = overloadAction(backpressure);
  if (!stringsOf(backpressure, 'actions').includes(overload)) {
    findings.push(finding('C24', 'overload-action-not-in-actions', overload === '' ? 'none' : overload));
  }

  for (const key of Object.keys(backpressure ?? {})) {
    if (key.includes('max_inflight')) findings.push(finding('C24', 'max-inflight-copy-of-wave-cap', key));
  }
  findings.push(...rowFindings(backpressure, overload));
  return [result('C24', C24_TITLE, findings)];
}

export function checkC24b(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C24b', C24B_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const parallelism = child(policyDocument(ctx), 'parallelism');
  const findings: Finding[] = [];

  // Both ends are asserted so a kernel that answered one action unconditionally
  // cannot pass. Cap and bound come from the registry, never from a literal here.
  const cap = jqText(parallelism?.['wave_concurrency_cap']);
  const maxQueued = usableBound(child(parallelism, 'backpressure')?.[MAX_QUEUED_UNITS], 1);
  const full = answerText(kernelAnswer(ctx, ['admit', '--inflight', cap, '--queued', String(maxQueued ?? 0)]), 'action');
  if (full !== 'reject') {
    findings.push(finding('C24b', 'expected-reject-at-cap-with-full-queue', full === '' ? 'none' : full));
  }
  const idle = answerText(kernelAnswer(ctx, ['admit', '--inflight', '0', '--queued', '0']), 'action');
  if (idle !== 'dispatch') {
    findings.push(finding('C24b', 'expected-dispatch-when-idle', idle === '' ? 'none' : idle));
  }
  return [result('C24b', C24B_TITLE, findings)];
}

export function checkC24c(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C24c', C24C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // The subcommand an orchestrator is supposed to call: a literal with no
  // registry side, so it stays code where the three value mirrors are rows.
  if (!fileHas(ctx, PARALLELISM_MD, ADMIT_CALL)) {
    findings.push(finding('C24c', 'does-not-name-kernel-sh-admit', PARALLELISM_MD));
  }
  findings.push(...runMirrors(rowsOf('C24c'), ctx));
  return [result('C24c', C24C_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function backpressureBlock(ctx: CheckContext): Record<string, unknown> | undefined {
  return child(child(policyDocument(ctx), 'parallelism'), 'backpressure');
}

const ROW_SHAPE: RowShape = {
  conditionKey: 'when',
  vocabulary: { facts: ADMIT_FACTS },
  strings: ['action', 'reason'],
  placeholders: ADMIT_PLACEHOLDERS,
};
const ROW_CAPACITIES: readonly unknown[] = ['remaining', 'none'];

function rowFindings(backpressure: Record<string, unknown> | undefined, overload: string): Finding[] {
  const rows = arrayOf(backpressure, 'rows');
  if (rows === undefined || rows.length === 0) return [finding('C24', 'rows-malformed', 'rows')];
  const findings: Finding[] = [];
  const actions = stringsOf(backpressure, 'actions');
  rows.forEach((row, index) => {
    const problems = rowProblems(row, ROW_SHAPE);
    if (isRecord(row) && !ROW_CAPACITIES.includes(row['capacity'])) problems.push('capacity');
    for (const problem of problems) findings.push(finding('C24', 'rows-malformed', `rows[${index}].${problem}`));
    if (problems.length > 0 || !isRecord(row)) return;
    // The overload action is the only slot an action may name, so the rendered
    // action is exactly the one the kernel would emit for this row.
    const rendered = String(row['action']).split('{overload_action}').join(overload);
    if (!actions.includes(rendered)) findings.push(finding('C24', 'row-action-undeclared', `rows[${index}]:${rendered}`));
  });
  if (!endsInCatchAll(rows)) findings.push(finding('C24', 'rows-no-catch-all', `rows[${rows.length - 1}]`));
  return findings;
}

function overloadAction(backpressure: Record<string, unknown> | undefined): string {
  const value = backpressure?.['overload_action'];
  return typeof value === 'string' ? value : '';
}
