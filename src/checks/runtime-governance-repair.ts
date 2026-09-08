// C20*: the check-level repair policy — data, ladder canary, prose mirrors and
// the Stop-gate hook's wiring. Ported from scripts/checks/70-runtime.sh's C20
// block. The bound ("2 fix attempts, 1 escalation, then stop and report red") is
// data in registries/policy.json .repair, answered by the kernel's repair arm,
// and stated — never hardcoded — in the Stop-gate hook and the two prose homes
// that used to say only "until clean".
// Spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';
import {
  answerText,
  child,
  kernelAnswer,
  policyDocument,
  requirePolicy,
  stringsOf,
  usableBound,
  wholeNumber,
  arrayOf,
  fileMatches,
  fileHas,
  jqText,
} from './runtime-governance-shared';

export const C20_FINDINGS = [
  'checks-missing-or-empty',
  'checks-has-duplicates',
  'not-a-whole-number',
  'below-1',
  'by-situation-mismatch',
  'by-situation-empty-response',
  'never-repair-missing-or-empty',
] as const;

export const C20B_FINDINGS = [
  'breakpoint-uncomputable',
  'ladder-did-not-stop',
  'never-repair-did-not-win',
] as const;

export const C20C_FINDINGS = [
  'until-clean-present',
  'verify-done-note-lost-the-pointer',
  // Mirror row id (src/checks/mirrors.ts): CLAUDE.md's verify-done row quotes
  // .repair.max_fix_attempts_per_check.
  'fix-attempt-bound-drift',
] as const;

export const C20D_FINDINGS = [
  'missing',
  'does-not-import-kernel-repair',
  'does-not-call-repair-section',
  'hardcoded-number-literal',
] as const;

declare module './codes' {
  interface CheckCodes {
    C20: (typeof C20_FINDINGS)[number];
    C20b: (typeof C20B_FINDINGS)[number];
    C20c: (typeof C20C_FINDINGS)[number];
    C20d: (typeof C20D_FINDINGS)[number];
  }
}

// The skip_once token the three C20 checks share, unchanged from the bash.
const TOKEN = 'repair';

const C20_TITLE = 'policy.json.repair is well-formed';
const C20B_TITLE = "kernel.sh repair's ladder matches policy.json.repair's bound";
const C20C_TITLE = 'the until-clean prose mirrors agree with policy.json.repair';
const C20D_TITLE =
  "src/hooks/stop-verify.ts asks the kernel's repair section for the bound, keeping no private copy";

const STOP_VERIFY = 'src/hooks/stop-verify.ts';

// The exact situation set .repair.by_situation must declare, compared as a
// sorted join so the stored order is free.
const BY_SITUATION = 'flaky,infra,red';

export function checkC20(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C20', C20_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const repair = child(policyDocument(ctx), 'repair');
  const findings: Finding[] = [];

  const checks = stringsOf(repair, 'checks');
  if (checks.length < 1) findings.push(finding('C20', 'checks-missing-or-empty'));
  // Duplicates are counted over the declared array rather than over the strings,
  // matching the bash `length - (unique | length)`; a missing array reads as no
  // duplicates, exactly as jq's error path did.
  const declaredChecks = arrayOf(repair, 'checks');
  if (declaredChecks !== undefined && new Set(declaredChecks.map(jqText)).size !== declaredChecks.length) {
    findings.push(finding('C20', 'checks-has-duplicates'));
  }

  const maxFix = wholeNumber(repair?.['max_fix_attempts_per_check']);
  if (maxFix === undefined) findings.push(finding('C20', 'not-a-whole-number', 'max_fix_attempts_per_check'));
  else if (maxFix < 1) findings.push(finding('C20', 'below-1', 'max_fix_attempts_per_check'));

  if (wholeNumber(repair?.['escalations']) === undefined) {
    findings.push(finding('C20', 'not-a-whole-number', 'escalations'));
  }

  const situations = (arrayOf(repair, 'by_situation') ?? [])
    .map((row) => (typeof row === 'object' && row !== null && 'situation' in row ? jqText((row as Record<string, unknown>)['situation']) : ''))
    .filter((id) => id !== '');
  const sorted = [...situations].sort().join(',');
  if (sorted !== BY_SITUATION) findings.push(finding('C20', 'by-situation-mismatch', sorted === '' ? 'none' : sorted));

  const emptyResponses = (arrayOf(repair, 'by_situation') ?? []).filter((row) => {
    if (typeof row !== 'object' || row === null) return true;
    const response = (row as Record<string, unknown>)['response'];
    return response === undefined || response === null || response === '';
  });
  if (emptyResponses.length > 0) findings.push(finding('C20', 'by-situation-empty-response'));

  if (stringsOf(repair, 'never_repair').length < 1) {
    findings.push(finding('C20', 'never-repair-missing-or-empty'));
  }
  return [result('C20', C20_TITLE, findings)];
}

export function checkC20b(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C20b', C20B_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const repair = child(policyDocument(ctx), 'repair');
  const findings: Finding[] = [];

  // The breakpoint is computed from the registry, never hardcoded: one attempt
  // past the last one the ladder may spend.
  const maxFix = usableBound(repair?.['max_fix_attempts_per_check'], 0);
  const escalations = usableBound(repair?.['escalations'], 0);
  if (maxFix === undefined || escalations === undefined) {
    findings.push(finding('C20b', 'breakpoint-uncomputable'));
  } else {
    const stopAttempt = maxFix + escalations + 1;
    const action = answerText(
      kernelAnswer(ctx, ['repair', '--check', 'lint', '--attempt', String(stopAttempt)]),
      'action',
    );
    if (action !== 'stop-report-red') {
      findings.push(finding('C20b', 'ladder-did-not-stop', `attempt-${stopAttempt}:${action === '' ? 'none' : action}`));
    }
  }

  const never = answerText(
    kernelAnswer(ctx, ['repair', '--check', 'lint', '--attempt', '1', '--situation', 'weaken-the-check']),
    'action',
  );
  if (never !== 'never-repair') {
    findings.push(finding('C20b', 'never-repair-did-not-win', never === '' ? 'none' : never));
  }
  return [result('C20b', C20B_TITLE, findings)];
}

export function checkC20c(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C20c', C20C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // The two canaries that keep the retired "until clean" instruction dead. They
  // are literal strings with no registry side, so they are code rather than
  // mirror rows.
  for (const home of ['CLAUDE.md', 'registries/intents.json']) {
    if (fileMatches(ctx, home, /until clean/i)) findings.push(finding('C20c', 'until-clean-present', home));
  }

  // The verify-done intent must keep pointing readers at the kernel arm that
  // owns the bound; the NUMBER in CLAUDE.md's row is the mirror row below.
  if (!verifyDoneNoteNamesRepair(ctx)) findings.push(finding('C20c', 'verify-done-note-lost-the-pointer'));

  findings.push(...runMirrors(rowsOf('C20c'), ctx));
  return [result('C20c', C20C_TITLE, findings)];
}

export function checkC20d(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C20d', C20D_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // Deviation 7: a wiring check, not a value check. The bash hook read
  // .repair.max_fix_attempts_per_check itself and rendered the sentence; the
  // port asks the kernel for the whole repair section and renders what comes
  // back, so what is checkable is that the call is still there and that no count
  // has crept back in as a literal.
  if (ctx.readText(STOP_VERIFY) === undefined) {
    findings.push(finding('C20d', 'missing', STOP_VERIFY));
    return [result('C20d', C20D_TITLE, findings)];
  }
  if (!fileHas(ctx, STOP_VERIFY, "from '../kernel/repair'")) {
    findings.push(finding('C20d', 'does-not-import-kernel-repair', STOP_VERIFY));
  }
  if (!fileHas(ctx, STOP_VERIFY, 'repairSection(')) {
    findings.push(finding('C20d', 'does-not-call-repair-section', STOP_VERIFY));
  }
  if (fileMatches(ctx, STOP_VERIFY, /[0-9]+ fix attempts/)) {
    findings.push(finding('C20d', 'hardcoded-number-literal', STOP_VERIFY));
  }
  return [result('C20d', C20D_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function verifyDoneNoteNamesRepair(ctx: CheckContext): boolean {
  try {
    const row = ctx.registries.intents.intents.find((intent) => intent.id === 'verify-done');
    return (row?.note ?? '').includes('kernel.sh repair');
  } catch {
    // A registry this check cannot load is a registry that cannot carry the
    // pointer; the bash read the same absence out of a failed jq.
    return false;
  }
}
