// C25*: the per-resource circuit breaker — the policy block, the transition
// canary and the prose mirror. Ported from scripts/checks/70-runtime.sh's C25
// block. The breaker is the THIRD failure-policy block, not a variant of retry
// (agent units) or repair (checks) — C25a therefore pins the state machine's
// shape so a later reader cannot quietly collapse the three into one.
// Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 3
// ADR: docs/adr/2026-09-03-circuit-breaker-separate-from-retry.md
import { isRecord } from '../lib/json';
import { BREAKER_GUARDS, BREAKER_PLACEHOLDERS } from '../kernel/breaker';
import { parseWhen } from '../kernel/table';
import { reachableFrom, type Transition } from '../kernel/transitions';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';
import { rowProblems } from './runtime-governance-tables';
import {
  arrayOf,
  child,
  fileHas,
  fileMatches,
  jqText,
  kernelAnswer,
  policyDocument,
  requirePolicy,
  stringsOf,
  usableBound,
  wholeNumber,
} from './runtime-governance-shared';

export const C25_FINDINGS = [
  'not-a-whole-number',
  'below-1',
  'states-mismatch',
  'scopes-missing-or-empty',
  // .transitions, the table src/kernel/breaker.ts steps through: each edge
  // well-formed against its from-state's guard facts, both ends declared, and
  // every declared state reachable from every other — no dead end, no island.
  'transitions-malformed',
  'transition-state-undeclared',
  'state-unreachable',
] as const;

export const C25B_FINDINGS = ['failure-threshold-unusable', 'transition-mismatch'] as const;

export const C25C_FINDINGS = [
  'no-circuit-breaker-section',
  'does-not-name-kernel-sh-breaker',
  // Mirror row ids (src/checks/mirrors.ts): one table row per declared state,
  // the quoted failure threshold, and the scope-vocabulary sentence.
  'state-row-missing',
  'failure-threshold-drift',
  'scope-vocabulary-missing',
] as const;

declare module './codes' {
  interface CheckCodes {
    C25: (typeof C25_FINDINGS)[number];
    C25b: (typeof C25B_FINDINGS)[number];
    C25c: (typeof C25C_FINDINGS)[number];
  }
}

const TOKEN = 'breaker';

// The three numeric fields are read as digit strings, so a JSON string "3"
// passes here exactly as 3 does — the assertion is "reads as a whole number
// >= 1", not "is a JSON number", and the title says so rather than overclaiming
// a type check nobody performs.
const C25_TITLE =
  'policy.json.breaker is well-formed: failure_threshold, cooldown_waves and half_open_probes each read as a whole number >= 1, states are exactly closed/half-open/open, scopes is a non-empty array';
const C25B_TITLE =
  'kernel.sh breaker answers the expected state and allow for all six transitions across the three state arms';
const C25C_TITLE =
  "rules/parallelism.md mirrors the breaker: a Circuit breaker section naming kernel.sh breaker, the registry's failure threshold, a row per declared state, and a scope-vocabulary sentence naming every declared scope";

const PARALLELISM_MD = 'rules/parallelism.md';
const BREAKER_CALL = 'kernel.sh breaker';
const BREAKER_SECTION = /^## Circuit breaker$/m;

// The three states the kernel implements as a case arm each; a fourth state, or
// a missing one, is a kernel the registry no longer describes. Compared as a
// sorted join, so the stored order is free.
const STATES = 'closed,half-open,open';

// The numeric fields, in the order C25a reports them. cmd_breaker interpolates
// half_open_probes straight into the half-open reason, so an absent or zero
// value would ship "allow null probe call(s)" to a caller rather than failing.
const NUMERIC_FIELDS = ['failure_threshold', 'cooldown_waves', 'half_open_probes'] as const;

export function checkC25(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C25', C25_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const breaker = breakerBlock(ctx);
  const findings: Finding[] = [];

  for (const field of NUMERIC_FIELDS) {
    const value = wholeNumber(breaker?.[field]);
    // A threshold of 0 opens the breaker before anything has failed, so the
    // closed state would be unreachable and the whole machine dead data.
    if (value === undefined) findings.push(finding('C25', 'not-a-whole-number', field));
    else if (value < 1) findings.push(finding('C25', 'below-1', field));
  }

  const states = (arrayOf(breaker, 'states') ?? []).map(jqText).sort().join(',');
  if (states !== STATES) findings.push(finding('C25', 'states-mismatch', states === '' ? 'none' : states));

  const scopes = arrayOf(breaker, 'scopes');
  if (scopes === undefined || scopes.length === 0) findings.push(finding('C25', 'scopes-missing-or-empty'));
  findings.push(...transitionFindings(breaker));
  return [result('C25', C25_TITLE, findings)];
}

export function checkC25b(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C25b', C25B_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // Every state arm is exercised, and each is pinned on BOTH answer fields, so
  // neither a kernel that answers one transition unconditionally nor one with an
  // inverted boolean in an unvisited arm can pass. `allow` is what a caller
  // actually gates on, so asserting the state alone would let
  // {"state":"open","allow":true} through the integrity gate.
  const threshold = usableBound(breakerBlock(ctx)?.['failure_threshold'], 1);
  if (threshold === undefined) findings.push(finding('C25b', 'failure-threshold-unusable'));
  else {
    // Includes the outcome that must NOT trip: one failure below the threshold.
    expect(ctx, findings, 'at-threshold', ['--state', 'closed', '--failures', String(threshold)], 'open/false');
    expect(ctx, findings, 'one-below-threshold', ['--state', 'closed', '--failures', String(threshold - 1)], 'closed/true');
  }
  expect(ctx, findings, 'cooldown-elapsed', ['--state', 'open', '--cooldown-elapsed', 'true'], 'half-open/true');
  expect(ctx, findings, 'cooldown-pending', ['--state', 'open', '--cooldown-elapsed', 'false'], 'open/false');
  expect(ctx, findings, 'successful-probe', ['--state', 'half-open', '--probe-result', 'ok'], 'closed/true');
  expect(ctx, findings, 'failed-probe', ['--state', 'half-open', '--probe-result', 'failed'], 'open/false');
  return [result('C25b', C25B_TITLE, findings)];
}

export function checkC25c(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C25c', C25C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // Anchored, because every other assertion here is a claim about that section
  // and a passing grep elsewhere in the file would not be a mirror.
  if (!fileMatches(ctx, PARALLELISM_MD, BREAKER_SECTION)) {
    findings.push(finding('C25c', 'no-circuit-breaker-section', PARALLELISM_MD));
  }
  if (!fileHas(ctx, PARALLELISM_MD, BREAKER_CALL)) {
    findings.push(finding('C25c', 'does-not-name-kernel-sh-breaker', PARALLELISM_MD));
  }
  findings.push(...runMirrors(rowsOf('C25c'), ctx));
  return [result('C25c', C25C_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function breakerBlock(ctx: CheckContext): Record<string, unknown> | undefined {
  return child(policyDocument(ctx), 'breaker');
}

function transitionFindings(breaker: Record<string, unknown> | undefined): Finding[] {
  const rows = arrayOf(breaker, 'transitions');
  if (rows === undefined || rows.length === 0) return [finding('C25', 'transitions-malformed', 'transitions')];
  const states = stringsOf(breaker, 'states');
  const findings: Finding[] = [];
  const edges: Transition[] = [];
  rows.forEach((row, index) => {
    const from = isRecord(row) && typeof row['from'] === 'string' ? row['from'] : '';
    const reader = Object.prototype.hasOwnProperty.call(BREAKER_GUARDS, from) ? BREAKER_GUARDS[from] : undefined;
    const problems = rowProblems(row, {
      conditionKey: 'guard',
      vocabulary: { facts: reader?.facts ?? [] },
      strings: ['from', 'to', 'reason'],
      booleans: ['allow'],
      placeholders: BREAKER_PLACEHOLDERS,
    });
    for (const problem of problems) findings.push(finding('C25', 'transitions-malformed', `transitions[${index}].${problem}`));
    if (!isRecord(row) || problems.length > 0) return;
    const to = String(row['to']);
    for (const [end, state] of [['from', from], ['to', to]] as const) {
      if (!states.includes(state)) findings.push(finding('C25', 'transition-state-undeclared', `transitions[${index}].${end}:${state}`));
    }
    const guard = parseWhen(row['guard']);
    if (typeof guard !== 'string') edges.push({ from, guard, to, allow: row['allow'] === true, reason: String(row['reason']) });
  });
  // Reachability is judged only on a clean table: a malformed edge already
  // fails above, and dropping it here would report a misleading island.
  if (findings.length > 0) return findings;
  for (const start of states) {
    const reached = reachableFrom(edges, start);
    for (const state of states) {
      if (!reached.has(state)) findings.push(finding('C25', 'state-unreachable', `${start}->${state}`));
    }
  }
  return findings;
}

function expect(
  ctx: CheckContext,
  findings: Finding[],
  transition: string,
  args: readonly string[],
  wanted: string,
): void {
  const got = breakerAnswer(ctx, args);
  if (got !== wanted) findings.push(finding('C25b', 'transition-mismatch', `${transition}:${got}`));
}

// `[(.state // "none"), (.allow | tostring)] | join("/")`: one canary call
// reported on both fields the kernel answers.
function breakerAnswer(ctx: CheckContext, args: readonly string[]): string {
  const answer = kernelAnswer(ctx, ['breaker', ...args]);
  const state = typeof answer['state'] === 'string' ? answer['state'] : 'none';
  const allow = typeof answer['allow'] === 'boolean' ? String(answer['allow']) : 'null';
  return `${state}/${allow}`;
}
