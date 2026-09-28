// C26*: human-in-the-loop — the policy block, the kernel canary, the prose
// mirror and the backpressure coupling. Ported from scripts/checks/70-runtime.sh's
// C26 block. HITL is data (policy.json.hitl), answered by the kernel's hitl arm,
// folded into resolve-task, and stated in rules/risk-autonomy.md
// "Human-in-the-loop".
//
// reasons is a CLOSED vocabulary — a gate may cite nothing else — which is what
// C26a's minimum and C26c's both-directions mirror row hold in place. The
// behavioural half (C26b) lives in ./runtime-governance-hitl-canary.ts.
// Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 4
// ADR: docs/adr/2026-09-03-hitl-as-kernel-entity.md
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { runMirrors, sliceSection } from './mirror';
import { rowsOf } from './mirrors';
import {
  answerStrings,
  arrayOf,
  child,
  kernelAnswer,
  policyDocument,
  requirePolicy,
  stringOrEmpty,
  stringsOf,
} from './runtime-governance-shared';

export const C26_FINDINGS = [
  'reasons-below-minimum',
  'reasons-have-duplicates',
  'situations-missing-or-empty',
  'record-home-missing-or-empty',
  'situations-overlap-never-retry',
] as const;

export const C26C_FINDINGS = [
  'no-hitl-section',
  'does-not-name-kernel-sh-hitl',
  'record-home-unusable',
  'does-not-name-the-record-home',
  'release-checklist-does-not-name',
  'change-template-has-no-section',
  // Mirror row id (src/checks/mirrors.ts): one table row per declared reason,
  // both directions, because the vocabulary is closed.
  'reason-row-missing',
] as const;

export const C26D_FINDINGS = [
  'not-declared-in-both-reasons-and-situations',
  'admit-reject-message-does-not-cite',
  'situation-reject-answered',
] as const;

declare module './codes' {
  interface CheckCodes {
    C26: (typeof C26_FINDINGS)[number];
    C26c: (typeof C26C_FINDINGS)[number];
    C26d: (typeof C26D_FINDINGS)[number];
  }
}

const TOKEN = 'hitl';

// The frozen floor on the reason vocabulary. Named once so C26a's condition and
// its title cannot disagree.
const HITL_REASONS_MIN = 9;

const C26_TITLE = `policy.json.hitl is well-formed: reasons is ${HITL_REASONS_MIN}+ unique non-empty strings, situations is a non-empty array disjoint from retry.never_retry, record_home is set`;
const C26C_TITLE =
  'rules/risk-autonomy.md mirrors hitl: a Human-in-the-loop section naming kernel.sh hitl, a row per declared reason and the record home, which the rules/gates.md release checklist and the change-record template also carry';
const C26D_TITLE =
  "the backpressure/hitl coupling holds: policy.json.hitl declares budget-exhausted in both reasons and situations, kernel.sh admit's reject message cites 'hitl: budget-exhausted', and kernel.sh hitl --situation reject answers with exactly that id";

const RISK_AUTONOMY_MD = 'rules/risk-autonomy.md';
const GATES_MD = 'rules/gates.md';
const CHANGE_TEMPLATE = '.engineos/changes/_template.md';
const ADMIT_TS = 'src/kernel/admit.ts';
const HITL_ANCHOR = '## Human-in-the-loop';
const RELEASE_ANCHOR = '## Release gate — exit criteria';
const HITL_CALL = 'kernel.sh hitl';
// The one reason id this file spells: something has to say WHICH reason
// backpressure exhaustion maps to. A rename in the registry fails C26d's first
// assertion by name.
const BUDGET_EXHAUSTED = 'budget-exhausted';

export function checkC26(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C26', C26_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const document = policyDocument(ctx);
  const hitl = child(document, 'hitl');
  const findings: Finding[] = [];

  const reasons = stringsOf(hitl, 'reasons').filter((reason) => reason !== '');
  if (reasons.length < HITL_REASONS_MIN) {
    findings.push(finding('C26', 'reasons-below-minimum', String(reasons.length)));
  }
  if (new Set(reasons).size !== reasons.length) findings.push(finding('C26', 'reasons-have-duplicates'));

  const situations = arrayOf(hitl, 'situations');
  if (situations === undefined || situations.length === 0) {
    findings.push(finding('C26', 'situations-missing-or-empty'));
  }

  // cmd_hitl returns record_home verbatim, so an absent value would ship a null
  // home to the one caller that was just told to write the decision down.
  if (recordHome(hitl) === '') findings.push(finding('C26', 'record-home-missing-or-empty'));

  // The two situation vocabularies must stay disjoint: the kernel looks a
  // situation up in `retry.never_retry + hitl.situations`, so an id in both would
  // emit two reasons for one input.
  const neverRetry = new Set(stringsOf(child(document, 'retry'), 'never_retry'));
  const overlap = stringsOf(hitl, 'situations').filter((id) => neverRetry.has(id));
  if (overlap.length > 0) findings.push(finding('C26', 'situations-overlap-never-retry', overlap.join(',')));
  return [result('C26', C26_TITLE, findings)];
}

export function checkC26c(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C26c', C26C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // Every grep is scoped to its own section rather than run over the file:
  // "high", "evidence", "budget" and "human approval" all appear elsewhere in
  // risk-autonomy.md, and a file-wide grep would still pass with the mirror
  // section deleted — which is not a mirror.
  const section = sliceSection(ctx.readText(RISK_AUTONOMY_MD) ?? '', HITL_ANCHOR);
  if (section === undefined || section.trim() === '') {
    findings.push(finding('C26c', 'no-hitl-section', RISK_AUTONOMY_MD));
  } else {
    if (!section.includes(HITL_CALL)) findings.push(finding('C26c', 'does-not-name-kernel-sh-hitl', RISK_AUTONOMY_MD));
    findings.push(...recordHomeMirrors(ctx, section));
  }
  findings.push(...runMirrors(rowsOf('C26c'), ctx));
  return [result('C26c', C26C_TITLE, findings)];
}

export function checkC26d(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C26d', C26D_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const document = policyDocument(ctx);
  const hitl = child(document, 'hitl');
  const findings: Finding[] = [];

  // The literal moved out of scripts/kernel.sh when that became a shim over
  // dist/engineos.cjs; the source that owns the message is what gets read. The
  // greps below are skipped rather than left to match an empty string when the
  // registry no longer declares the id.
  if (
    !stringsOf(hitl, 'reasons').includes(BUDGET_EXHAUSTED) ||
    !stringsOf(hitl, 'situations').includes(BUDGET_EXHAUSTED)
  ) {
    findings.push(finding('C26d', 'not-declared-in-both-reasons-and-situations', BUDGET_EXHAUSTED));
    return [result('C26d', C26D_TITLE, findings)];
  }
  // Code lines only: a comment naming the literal must not satisfy the check.
  const code = (ctx.readText(ADMIT_TS) ?? '').split('\n').filter((line) => !/^[ \t]*\/\//.test(line));
  if (!code.some((line) => line.includes(`hitl: ${BUDGET_EXHAUSTED}`))) {
    findings.push(finding('C26d', 'admit-reject-message-does-not-cite', ADMIT_TS));
  }
  const low = stringOrEmpty(child(child(document, 'autonomy'), 'ceiling_by_risk')?.['low']);
  const cited = answerStrings(kernelAnswer(ctx, ['hitl', '--risk', 'low', '--autonomy', low, '--situation', 'reject']), 'reasons').join(',');
  if (cited !== BUDGET_EXHAUSTED) {
    findings.push(finding('C26d', 'situation-reject-answered', cited === '' ? 'none' : cited));
  }
  return [result('C26d', C26D_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// record_home is the field with no kernel branch and no canary of its own, so
// these three greps are the only thing holding it to the prose.
// ".engineos/changes/<record>.md#human-decisions" -> the "Human decisions"
// heading the other two homes carry.
function recordHomeMirrors(ctx: CheckContext, section: string): Finding[] {
  const anchor = recordHomeAnchor(ctx);
  if (anchor === '') return [finding('C26c', 'record-home-unusable')];
  const heading = anchor.replace(/-/g, ' ');
  const findings: Finding[] = [];
  if (!containsIgnoringCase(section, heading)) {
    findings.push(finding('C26c', 'does-not-name-the-record-home', anchor));
  }
  const release = sliceSection(ctx.readText(GATES_MD) ?? '', RELEASE_ANCHOR);
  if (release === undefined || !containsIgnoringCase(release, heading)) {
    findings.push(finding('C26c', 'release-checklist-does-not-name', anchor));
  }
  // `grep -qix "## <heading>"`: a whole line, case-insensitively. The subject is
  // the anchor rather than the heading because a subject is one token.
  const template = (ctx.readText(CHANGE_TEMPLATE) ?? '').split('\n');
  if (!template.some((line) => line.toLowerCase() === `## ${heading.toLowerCase()}`)) {
    findings.push(finding('C26c', 'change-template-has-no-section', anchor));
  }
  return findings;
}

function recordHomeAnchor(ctx: CheckContext): string {
  const home = recordHome(child(policyDocument(ctx), 'hitl'));
  const parts = home.split('#');
  return parts[parts.length - 1] ?? '';
}

function recordHome(hitl: Record<string, unknown> | undefined): string {
  return stringOrEmpty(hitl?.['record_home']);
}

function containsIgnoringCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

