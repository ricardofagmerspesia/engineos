// Secret and personal-data redaction applied to the prompt before it leaves the
// hook: into the judge `state` (contracts.md@rev3 §6.2, §10.2) and into the
// tie-break daemon request (§10.6). The patterns are registry data
// (policy.judge.redaction.patterns); this module only applies them, in list
// order, so an earlier, more specific kind (sk-ant-) wins over a later, broader
// one (sk-).
//
// Cost is bounded twice. The shipped set is linear; the loader
// (src/registry/policy-judge.ts) refuses unbounded quantifiers and quantified
// groups holding alternation or nested quantifiers, and pins the shipped list
// by hash, so a registry edit cannot bring a slower or weaker one. And callers
// redact only a pre-capped prefix (redactBounded), never the whole prompt, so a
// long paste cannot turn the hook's budget into a regular-expression pass.
import { patternReach, type PatternReach } from './redact-reach';
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
    // A replacer function, so the placeholder is inserted literally, exactly as
    // the bounded path below splices it.
    const marker = placeholder(kind);
    redacted = redacted.replace(compile(kind, pattern), () => marker);
  }
  return redacted;
}

// Pre-cap, then redact. Invariant: the returned text is always a prefix of
// redactText(text), the redaction of the whole uncapped prompt. So any further
// cut a caller makes is a prefix of it too, and no character a full redaction
// would hide is ever emitted.
//
// Cutting first and redacting the prefix is not enough on its own: a pattern
// near the cut can fail to match, or match differently, because the rest of its
// text is missing (a closing quote, a minimum length, a JWT's second dot), and
// earlier redactions shrink the text, so no fixed "final limit is half the
// pre-cap" margin holds in original coordinates. Each pass therefore keeps only
// the prefix in which it provably behaves as it would on the whole prompt, and
// the next pass runs on that prefix alone.
export function redactBounded(text: string, patterns: readonly RedactionPattern[], preCapChars: number): BoundedRedaction {
  if (text.length <= preCapChars) return { text: redactText(text, patterns), capped: false };
  let agreed = cutAtCodeUnit(text, preCapChars);
  for (const { kind, pattern } of patterns) agreed = redactAgreedPrefix(agreed, kind, pattern);
  return { text: withoutTrailingHighSurrogate(agreed), capped: true };
}

// The longest prefix of at most `maxChars` UTF-16 units that does not end in
// half of a surrogate pair.
export function cutAtCodeUnit(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const end = isHighSurrogate(text.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars;
  return text.slice(0, Math.max(0, end));
}

interface Span {
  start: number;
  end: number;
}

// `text` is a prefix of what this pass would see on the whole prompt. A global
// scan tries start positions left to right; an attempt whose reads stay inside
// `text` gives the same answer on the whole prompt, so the pass agrees up to the
// first attempt that could read past the end of `text`. Everything from there on
// is dropped, not emitted.
function redactAgreedPrefix(text: string, kind: string, pattern: string): string {
  const matches = findMatches(text, compile(kind, pattern));
  const reach = patternReach(pattern);
  const end = reach === null ? 0 : agreedEnd(text, matches, reach);
  return splice({ text, matches, marker: placeholder(kind), end });
}

function agreedEnd(text: string, matches: readonly Span[], reach: PatternReach): number {
  // An attempt starting this far from the end cannot read past it.
  const safeBelow = Math.max(0, text.length - reach.window + 1);
  let position = safeBelow;
  let index = 0;
  // Earlier matches are settled; one may still cover the first unsettled units.
  for (; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined || match.start >= safeBelow) break;
    position = Math.max(position, match.end);
  }
  while (position < text.length) {
    if (reach.mayReadPastEnd(text, position)) return position;
    const match = matches[index];
    if (match !== undefined && match.start === position) {
      position = match.end > position ? match.end : position + 1;
      index += 1;
    } else {
      position += 1;
    }
  }
  return text.length;
}

// Same scan as String.prototype.replace with a global regular expression,
// including its one-unit step past an empty match.
function findMatches(text: string, regex: RegExp): Span[] {
  const found: Span[] = [];
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return found;
}

interface SpliceInput {
  text: string;
  matches: readonly Span[];
  marker: string;
  end: number;
}

function splice({ text, matches, marker, end }: SpliceInput): string {
  let output = '';
  let copied = 0;
  for (const { start, end: matchEnd } of matches) {
    if (start >= end) break;
    output += text.slice(copied, start) + marker;
    // Unreachable when agreedEnd is right; if it is not, stopping at the
    // placeholder still emits nothing of the match.
    if (matchEnd > end) return output;
    copied = matchEnd;
  }
  return output + text.slice(copied, end);
}

function placeholder(kind: string): string {
  return `<redacted:${kind}>`;
}

function withoutTrailingHighSurrogate(text: string): string {
  return text.length > 0 && isHighSurrogate(text.charCodeAt(text.length - 1)) ? text.slice(0, -1) : text;
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
