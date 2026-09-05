// A check reports values, not a sentence. `finding()` builds one value,
// `result()` grades the check from the values it produced, and `render()` is
// the only producer of a validator line. Splitting reporting from rendering is
// what lets a test assert on a code instead of a substring of prose, so
// rewording a line is no longer a behaviour change (design deviation 8).
import type { CheckId } from './ids';
import type { CheckCodes } from './codes';
import { KernelError } from '../lib/json';

export type CheckStatus = 'ok' | 'fail' | 'skip';

export interface Finding {
  readonly code: string;
  readonly subject?: string;
}

export interface CheckResult {
  readonly check: CheckId;
  readonly title: string;
  readonly status: CheckStatus;
  readonly findings: readonly Finding[];
}

// The two codes every check may report whatever its own list says: a
// precondition the harness could not satisfy, and an artifact not there yet.
export const HARNESS_FINDINGS = ['precondition-missing', 'artifact-pending'] as const;

export type HarnessCode = (typeof HARNESS_FINDINGS)[number];

// A check's own codes arrive through the module augmentation its family
// declares on CheckCodes; a check that declared none can still report the
// harness codes.
export type CodeOf<C extends CheckId> = (C extends keyof CheckCodes ? CheckCodes[C] : never) | HarnessCode;

export const CODE_PATTERN = /^[a-z][a-z0-9-]*$/;

const HARNESS_CODES: ReadonlySet<string> = new Set(HARNESS_FINDINGS);

export function isHarnessCode(code: string): code is HarnessCode {
  return HARNESS_CODES.has(code);
}

// `check` is here for inference only: it selects the code union its family
// augmented onto CheckCodes. The pattern test guards the one case the types
// cannot see, a typo inside a declared list.
export function finding<C extends CheckId>(check: C, code: CodeOf<C>, subject?: string): Finding;
// The implementation erases the generic on purpose: every code CodeOf<C> can
// name is a string literal, and the body needs nothing but the string.
export function finding(check: CheckId, code: string, subject?: string): Finding {
  if (!CODE_PATTERN.test(code)) {
    throw new KernelError(`check ${check} declares an invalid finding code: ${code}`);
  }
  return subject === undefined ? { code } : { code, subject };
}

export function result(
  check: CheckId,
  title: string,
  findings: readonly Finding[],
  opts?: { pending?: true },
): CheckResult {
  // Copied so a caller that keeps accumulating into its array cannot rewrite a
  // result it already reported.
  const collected: readonly Finding[] = [...findings];
  return { check, title, status: statusOf(collected.length, opts?.pending === true), findings: collected };
}

// A pending check with nothing to report is still a pass: `skip` means the
// evidence is unavailable, and there is no evidence to wait for.
function statusOf(count: number, pending: boolean): CheckStatus {
  if (count === 0) return 'ok';
  return pending ? 'skip' : 'fail';
}

// The three prefixes are versioned surface (design deviation 8); the tail is
// rendered from the findings and its prose is not.
export function render(outcome: CheckResult): string {
  if (outcome.status === 'ok') return `ok   ${outcome.title}`;
  const prefix = outcome.status === 'fail' ? 'FAIL' : 'skip';
  return `${prefix} ${outcome.title}: ${outcome.findings.map(renderFinding).join(' ')}`;
}

function renderFinding(entry: Finding): string {
  return entry.subject === undefined ? `[${entry.code}]` : `[${entry.code}:${entry.subject}]`;
}
