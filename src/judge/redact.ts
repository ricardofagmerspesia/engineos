// Secret and personal-data redaction applied to the prompt before it leaves the
// hook: into the judge `state` (contracts.md@rev3 §6.2, §10.2) and into the
// tie-break daemon request (§10.6). The patterns are registry data
// (policy.judge.redaction.patterns); this module only applies them, in list
// order, so an earlier, more specific kind (sk-ant-) wins over a later, broader
// one (sk-).
//
// Cost is bounded twice: every registry pattern is linear-time by construction
// (bounded quantifiers, no nested unbounded repetition), and callers redact
// only a pre-capped prefix (redactBounded), never the whole prompt, so a long
// paste cannot turn the hook's budget into a regular-expression pass.
import type { RedactionPattern } from './types';

export class RedactionPatternError extends Error {
  readonly kind = 'judge-redaction-pattern';
}

export interface BoundedRedaction {
  text: string;
  // true when the prompt was longer than the pre-cap and lost its tail.
  capped: boolean;
}

export function redactText(text: string, patterns: readonly RedactionPattern[]): string {
  let redacted = text;
  for (const { kind, pattern } of patterns) {
    redacted = redacted.replace(compile(kind, pattern), `<redacted:${kind}>`);
  }
  return redacted;
}

// Pre-cap, then redact. The caller cuts the result to its own final limit,
// which must be at most half of `preCapChars` (contracts §6.2 rev 3, D3): a
// secret long enough to straddle the pre-cap starts beyond that final limit.
//
// When the prompt is capped, the trailing run of non-whitespace is dropped as
// well: it may be the first half of a token whose pattern needs the rest (a
// minimum length, a JWT's second dot), and sending half a secret is still
// sending it. A cut PEM body keeps matching, because `private-key` accepts a
// header with no END line.
export function redactBounded(text: string, patterns: readonly RedactionPattern[], preCapChars: number): BoundedRedaction {
  if (text.length <= preCapChars) return { text: redactText(text, patterns), capped: false };
  const prefix = dropTrailingFragment(cutAtCodeUnit(text, preCapChars));
  return { text: redactText(prefix, patterns), capped: true };
}

// The longest prefix of at most `maxChars` UTF-16 units that does not end in
// half of a surrogate pair.
export function cutAtCodeUnit(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const end = isHighSurrogate(text.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars;
  return text.slice(0, Math.max(0, end));
}

// A backwards scan, not a regular expression: the fragment can be as long as
// the whole prefix, and this keeps the cost one pass.
function dropTrailingFragment(text: string): string {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (isWhitespace(text.charCodeAt(index))) return text.slice(0, index + 1);
  }
  return '';
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x2028 || code === 0x2029;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

// Compiled per call: a shared /g RegExp carries lastIndex between uses, and the
// strict loader already proved each source compiles, so the cost is a couple of
// dozen small compilations once per user prompt.
function compile(kind: string, pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'g');
  } catch {
    // The message names the kind only; the pattern source is policy data, but a
    // malformed one is reported by the loader with its JSON path already.
    throw new RedactionPatternError(`redaction pattern '${kind}' does not compile`);
  }
}
