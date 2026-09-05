// C26b: the human-in-the-loop behavioural canary. Split out of
// runtime-governance-hitl.ts because it is the largest single check in the
// family — every tier, ceiling, situation and thin-evidence drop the kernel
// answers, each pinned on both answer fields.
//
// Every tier, ceiling and situation comes from the registry, never a literal
// here; the expectations are derived from rules/risk-autonomy.md ("drop one
// level, never raise"), not from the kernel, so this stays a canary rather than
// a second implementation.
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import {
  answerStrings,
  child,
  kernelAnswer,
  policyDocument,
  requirePolicy,
  stringOrEmpty,
  stringsOf,
} from './runtime-governance-shared';

export const C26B_FINDINGS = [
  'autonomy-ceilings-unusable',
  'answer-mismatch',
  'thin-target-unusable',
  'thin-target-is-a4',
  'situation-not-required',
  'situation-cites-undeclared-reason',
  'unknown-situation-not-rejected',
  'resolve-task-does-not-carry-hitl',
  'security-files-floor-not-high',
  'resolve-task-folds-hitl-off-a-bare-floor',
] as const;

declare module './codes' {
  interface CheckCodes {
    C26b: (typeof C26B_FINDINGS)[number];
  }
}

export const C26B_TITLE =
  'kernel.sh hitl answers the expected required and autonomy_after for the low/high tiers, drops autonomy exactly one level on thin evidence at low and medium and to autonomy.high_with_thin_evidence at high without ever raising it, cites both flag-driven reasons and every declared situation, rejects an unknown situation, and resolve-task carries the answer for a classified tier while claiming none off a bare risk floor';

const TOKEN = 'hitl';
const UNKNOWN_SITUATION = 'engineos-no-such-situation';

// The thin-evidence DROP, tier by tier: input tier, autonomy passed in, the
// autonomy expected back. Every case in this family used to pass --autonomy A2
// and only A2 — the one input where an unconditional "A1" was right — so a field
// that RAISED A0 to A1 and dropped medium/A3 two levels passed clean.
const THIN_DROPS: readonly (readonly [string, string, string])[] = [
  ['low', 'A2', 'A1'],
  ['medium', 'A2', 'A1'],
  ['medium', 'A3', 'A2'],
  ['low', 'A4', 'A3'],
  ['medium', 'A1', 'A1'],
  ['low', 'A0', 'A0'],
  ['high', 'A0', 'A0'],
];

interface Ceilings {
  readonly low: string;
  readonly medium: string;
  readonly high: string;
}

export function checkC26b(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C26b', C26B_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const document = policyDocument(ctx);
  const findings: Finding[] = [];
  const autonomy = child(document, 'autonomy');
  const byRisk = child(autonomy, 'ceiling_by_risk');
  const ceilings: Ceilings = {
    low: stringOrEmpty(byRisk?.['low']),
    medium: stringOrEmpty(byRisk?.['medium']),
    high: stringOrEmpty(byRisk?.['high']),
  };

  if (ceilings.low === '' || ceilings.medium === '' || ceilings.high === '') {
    findings.push(finding('C26b', 'autonomy-ceilings-unusable'));
  } else {
    tierCases(ctx, findings, ceilings);
    thinEvidence(ctx, findings, stringOrEmpty(autonomy?.['high_with_thin_evidence']));
    situationCases(ctx, findings, document, ceilings.low);
  }
  resolveTaskFold(ctx, findings);
  return [result('C26b', C26B_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// `[(.required | tostring), (.autonomy_after // "none")] | join("/")`. Those are
// the two fields an orchestrator actually gates on, so asserting either alone
// would let a kernel through — required alone misses a bogus autonomy drop, and
// autonomy_after alone misses a kernel that never demands a human.
function hitlAnswer(ctx: CheckContext, args: readonly string[]): string {
  const answer = kernelAnswer(ctx, ['hitl', ...args]);
  const required = typeof answer['required'] === 'boolean' ? String(answer['required']) : 'none';
  const after = stringOrEmpty(answer['autonomy_after']);
  return `${required}/${after === '' ? 'none' : after}`;
}

function expectAnswer(
  ctx: CheckContext,
  findings: Finding[],
  label: string,
  args: readonly string[],
  wanted: string,
): void {
  const got = hitlAnswer(ctx, args);
  if (got !== wanted) findings.push(finding('C26b', 'answer-mismatch', `${label}:${got}`));
}

function tierCases(ctx: CheckContext, findings: Finding[], ceilings: Ceilings): void {
  // A required:false case AND a required:true case, each pinned on both answer
  // fields, so neither a kernel that always demands a human nor one that always
  // drops to A1 can pass. Low risk with adequate evidence must also hand back
  // the ceiling it was given rather than inventing one.
  expectAnswer(ctx, findings, 'low-risk', ['--risk', 'low', '--autonomy', ceilings.low], `false/${ceilings.low}`);
  expectAnswer(ctx, findings, 'high-risk', ['--risk', 'high', '--autonomy', ceilings.high], `true/${ceilings.high}`);
  expectAnswer(
    ctx,
    findings,
    'external-effect-at-ceiling',
    ['--risk', 'medium', '--autonomy', ceilings.medium, '--external-effect', 'true'],
    `true/${ceilings.medium}`,
  );
  // An external effect is unreachable below A3, so it must NOT be a reason
  // there — without the negative half a kernel ignoring --autonomy passes. The
  // low tier's ceiling is the registry's own "below A3" value; if a future policy
  // raises it to A3+, an external effect IS reachable there and the case stops
  // being about that boundary, so it is skipped rather than asserted wrongly.
  if (ceilings.low !== 'A3' && ceilings.low !== 'A4') {
    expectAnswer(
      ctx,
      findings,
      'external-effect-below-a3',
      ['--risk', 'medium', '--autonomy', ceilings.low, '--external-effect', 'true'],
      `false/${ceilings.low}`,
    );
  }
  expectAnswer(
    ctx,
    findings,
    'policy-conflict',
    ['--risk', 'low', '--autonomy', ceilings.low, '--conflict', 'true'],
    `true/${ceilings.low}`,
  );
}

function thinEvidence(ctx: CheckContext, findings: Finding[], target: string): void {
  for (const [tier, given, wanted] of THIN_DROPS) {
    expectAnswer(
      ctx,
      findings,
      `thin-${tier}-${given}`,
      ['--risk', tier, '--autonomy', given, '--evidence', 'thin'],
      `true/${wanted}`,
    );
  }
  // Risk high is the one tier whose landing is a registry value, so it is read
  // rather than spelled. An empty target would make the comparison pass on
  // "true/" for any answer, and a target of A4 would not be a drop at all.
  if (target === '') findings.push(finding('C26b', 'thin-target-unusable'));
  else if (target === 'A4') findings.push(finding('C26b', 'thin-target-is-a4'));
  else expectAnswer(ctx, findings, 'thin-high-A4', ['--risk', 'high', '--autonomy', 'A4', '--evidence', 'thin'], `true/${target}`);
}

function situationCases(ctx: CheckContext, findings: Finding[], document: Record<string, unknown>, low: string): void {
  const hitl = child(document, 'hitl');
  const declaredReasons = new Set(stringsOf(hitl, 'reasons'));
  const declared = [...stringsOf(child(document, 'retry'), 'never_retry'), ...stringsOf(hitl, 'situations')];
  for (const situation of declared) {
    // Every declared situation must demand a human and cite only declared
    // reasons. A situation the kernel accepts and then drops would answer
    // required:false — "no human needed" for an input it did not act on.
    const answer = kernelAnswer(ctx, ['hitl', '--risk', 'low', '--autonomy', low, '--situation', situation]);
    if (answer['required'] !== true) {
      const got = answer['required'] === false ? 'false' : 'none';
      findings.push(finding('C26b', 'situation-not-required', `${situation}:${got}`));
    }
    const undeclared = answerStrings(answer, 'reasons').filter((reason) => !declaredReasons.has(reason));
    if (undeclared.length > 0) {
      findings.push(finding('C26b', 'situation-cites-undeclared-reason', `${situation}:${undeclared.join(',')}`));
    }
  }
  // An unknown situation is an error, not an ignored flag: a silently dropped
  // situation would read as "no human needed". An answer carrying `required` at
  // all is an answer, which is the failure.
  const unknown = kernelAnswer(ctx, ['hitl', '--risk', 'low', '--autonomy', low, '--situation', UNKNOWN_SITUATION]);
  if (unknown['required'] !== undefined) findings.push(finding('C26b', 'unknown-situation-not-rejected', UNKNOWN_SITUATION));
}

function resolveTaskFold(ctx: CheckContext, findings: Finding[]): void {
  // The fold, both halves. resolve-task must carry the answer when a tier was
  // actually CLASSIFIED, or src/hooks/prompt-advisor.ts has nothing to announce:
  // this prompt trips rule-destructive-ddl, whose risk=high is the classification.
  const classified = kernelAnswer(ctx, ['resolve-task', '--prompt', 'drop the users table in production']);
  const carried = child(classified, 'hitl')?.['required'];
  if (carried !== true) {
    findings.push(finding('C26b', 'resolve-task-does-not-carry-hitl', carried === false ? 'false' : 'none'));
  }

  // And it must NOT carry one off a bare risk floor: a floor is an input to
  // classification, not a classification, so announcing a human gate on every
  // auth-guard edit is the gate theatre rules/gates.md names. task_contract's own
  // risk_floor is read alongside, because a null hitl on a prompt that stopped
  // resolving a high floor would satisfy this for the wrong reason. The bash
  // interpolated the whole hitl object into its message; a subject is one token,
  // so a present section reads as `present`.
  const floor = securityFilesFloor(ctx);
  if (floor !== 'high') {
    findings.push(finding('C26b', 'security-files-floor-not-high', floor === '' ? 'none' : floor));
    return;
  }
  const bare = kernelAnswer(ctx, ['resolve-task', '--prompt', 'fix the auth guard bug']);
  const section = bare['hitl'] === null || bare['hitl'] === undefined ? 'null' : 'present';
  const stated = stringOrEmpty(child(bare, 'task_contract')?.['risk_floor']);
  const got = `${section}/${stated === '' ? 'none' : stated}`;
  if (got !== `null/${floor}`) findings.push(finding('C26b', 'resolve-task-folds-hitl-off-a-bare-floor', got));
}

// The expected floor comes from intents.json; an intent whose floor is not high
// would make the case assert nothing, so that is its own finding.
function securityFilesFloor(ctx: CheckContext): string {
  try {
    return ctx.registries.intents.intents.find((intent) => intent.id === 'security-files')?.risk_floor ?? '';
  } catch {
    return '';
  }
}
