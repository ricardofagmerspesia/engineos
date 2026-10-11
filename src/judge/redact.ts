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
  return splice(text, matches, placeholder(kind), end);
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

function splice(text: string, matches: readonly Span[], marker: string, end: number): string {
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

interface PatternReach {
  // Upper bound on how far past its start position one attempt can read.
  window: number;
  // Could an attempt starting at `start` read text[text.length] or beyond?
  mayReadPastEnd: (text: string, start: number) => boolean;
}

const reachCache = new Map<string, PatternReach | null>();

// null when the source uses syntax this analysis does not model; the caller
// then keeps nothing of a capped pass, which fails closed.
function patternReach(pattern: string): PatternReach | null {
  const cached = reachCache.get(pattern);
  if (cached !== undefined) return cached;
  const reach = analyse(pattern);
  reachCache.set(pattern, reach);
  return reach;
}

function analyse(pattern: string): PatternReach | null {
  let root: Node;
  try {
    root = new PatternParser(pattern).parse();
  } catch {
    return null;
  }
  const prefixes = prefixSource(root);
  // The +1 covers a trailing assertion or greedy step reading the next unit.
  const window = maxLength(root) + 1;
  if (prefixes === null) return { window, mayReadPastEnd: () => false };
  // Matches the strings an attempt can consume up to the end of input: proper
  // or whole prefixes of the pattern's language, lookahead bodies counted as
  // reads. Lookbehinds and anchors are kept exactly: each is followed by at
  // least one consumed unit here, so it only ever reads text the prefix holds.
  let regex: RegExp;
  try {
    regex = new RegExp(`(?:${prefixes})$`, 'y');
  } catch {
    return null;
  }
  return {
    window,
    mayReadPastEnd: (text, start) => {
      regex.lastIndex = start;
      return regex.test(text);
    },
  };
}

type Node =
  | { type: 'unit'; source: string }
  | { type: 'sequence'; items: Node[] }
  | { type: 'choice'; options: Node[] }
  | { type: 'lookahead'; body: Node }
  | { type: 'zero-width'; source: string }
  | { type: 'repeat'; body: Node; min: number; max: number };

function maxLength(node: Node): number {
  switch (node.type) {
    case 'unit':
      return 1;
    case 'sequence':
      return node.items.reduce((total, item) => total + maxLength(item), 0);
    case 'choice':
      return node.options.reduce((longest, option) => Math.max(longest, maxLength(option)), 0);
    case 'lookahead':
      return maxLength(node.body);
    case 'zero-width':
      return 0;
    case 'repeat': {
      const body = maxLength(node.body);
      return body === 0 ? 0 : node.max * body;
    }
  }
}

// The consumed language. Lookaheads are relaxed to empty, because they may read
// past the end; every other zero-width construct reads only what precedes it.
function render(node: Node): string {
  switch (node.type) {
    case 'unit':
      return node.source;
    case 'sequence':
      return node.items.map(render).join('');
    case 'choice':
      return `(?:${node.options.map(render).join('|')})`;
    case 'lookahead':
      return '';
    case 'zero-width':
      return node.source;
    case 'repeat': {
      const body = render(node.body);
      return body === '' ? '' : `(?:${body})${bounds(node.min, node.max)}`;
    }
  }
}

// Non-empty strings an attempt can consume before reaching the end of input,
// or null when there are none.
function prefixSource(node: Node): string | null {
  switch (node.type) {
    case 'unit':
      return node.source;
    case 'sequence': {
      const options: string[] = [];
      node.items.forEach((item, index) => {
        const tail = prefixSource(item);
        if (tail !== null) options.push(node.items.slice(0, index).map(render).join('') + tail);
      });
      return either(options);
    }
    case 'choice':
      return either(node.options.map(prefixSource).filter((option): option is string => option !== null));
    case 'lookahead':
      return prefixSource(node.body);
    case 'zero-width':
      return null;
    case 'repeat': {
      const tail = prefixSource(node.body);
      if (tail === null || node.max === 0) return null;
      if (node.body.type === 'unit') return `${node.body.source}${bounds(1, node.max)}`;
      return `(?:${render(node.body)})${bounds(0, node.max - 1)}(?:${tail})`;
    }
  }
}

function either(options: readonly string[]): string | null {
  return options.length === 0 ? null : `(?:${options.join('|')})`;
}

function bounds(min: number, max: number): string {
  return max === Number.POSITIVE_INFINITY ? `{${min},}` : `{${min},${max}}`;
}

class UnsupportedPatternError extends Error {}

const RANGE_QUANTIFIER = /^\{(\d+)(?:(,)(\d*))?\}/;

// A parser for the regular-expression subset the loader admits. Anything else
// (backreferences, an unrecognised escape) throws and the analysis fails closed.
class PatternParser {
  private readonly source: string;
  private index = 0;

  constructor(source: string) {
    this.source = source;
  }

  parse(): Node {
    const root = this.choice();
    if (this.index !== this.source.length) throw new UnsupportedPatternError('unbalanced group');
    return root;
  }

  private choice(): Node {
    const options = [this.sequence()];
    while (this.source[this.index] === '|') {
      this.index += 1;
      options.push(this.sequence());
    }
    return options.length === 1 && options[0] !== undefined ? options[0] : { type: 'choice', options };
  }

  private sequence(): Node {
    const items: Node[] = [];
    while (this.index < this.source.length && this.source[this.index] !== '|' && this.source[this.index] !== ')') {
      items.push(this.quantified(this.term()));
    }
    return { type: 'sequence', items };
  }

  private term(): Node {
    const char = this.source[this.index];
    if (char === '(') return this.group();
    if (char === '[') return this.characterClass();
    if (char === '\\') return this.escape();
    if (char === '^' || char === '$') {
      this.index += 1;
      return { type: 'zero-width', source: char };
    }
    if (char === undefined || '*+?'.includes(char)) throw new UnsupportedPatternError('dangling quantifier');
    this.index += 1;
    // Without the u flag a brace that opens no quantifier is a literal; escaped
    // here so it stays one wherever the analysis re-emits it.
    if (char === '{') {
      if (RANGE_QUANTIFIER.test(this.source.slice(this.index - 1))) throw new UnsupportedPatternError('dangling quantifier');
      return { type: 'unit', source: '\\{' };
    }
    return { type: 'unit', source: char };
  }

  private group(): Node {
    const start = this.index;
    const rest = this.source.slice(this.index);
    const opener = /^\((?:\?:|\?=|\?!|\?<=|\?<!|\?<[A-Za-z_$][\w$]*>)?/.exec(rest)?.[0] ?? '(';
    this.index += opener.length;
    const body = this.choice();
    if (this.source[this.index] !== ')') throw new UnsupportedPatternError('unclosed group');
    this.index += 1;
    if (opener === '(?=' || opener === '(?!') return { type: 'lookahead', body };
    if (opener === '(?<=' || opener === '(?<!') return { type: 'zero-width', source: this.source.slice(start, this.index) };
    return body;
  }

  private characterClass(): Node {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length && this.source[this.index] !== ']') {
      this.index += this.source[this.index] === '\\' ? 2 : 1;
    }
    if (this.index >= this.source.length) throw new UnsupportedPatternError('unclosed class');
    this.index += 1;
    return { type: 'unit', source: this.source.slice(start, this.index) };
  }

  private escape(): Node {
    const next = this.source[this.index + 1];
    if (next === undefined || /[1-9k]/.test(next)) throw new UnsupportedPatternError('backreference');
    if (next === 'b' || next === 'B') {
      const source = this.source.slice(this.index, this.index + 2);
      this.index += 2;
      return { type: 'zero-width', source };
    }
    if (next === 'c') throw new UnsupportedPatternError('control escape');
    const rest = this.source.slice(this.index);
    const width = /^\\x[0-9A-Fa-f]{2}/.test(rest) ? 4 : /^\\u[0-9A-Fa-f]{4}/.test(rest) ? 6 : 2;
    const source = rest.slice(0, width);
    this.index += width;
    return { type: 'unit', source };
  }

  private quantified(body: Node): Node {
    const char = this.source[this.index];
    let min: number;
    let max: number;
    if (char === '?' || char === '*' || char === '+') {
      this.index += 1;
      min = char === '+' ? 1 : 0;
      max = char === '?' ? 1 : Number.POSITIVE_INFINITY;
    } else {
      const braces = RANGE_QUANTIFIER.exec(this.source.slice(this.index));
      if (braces === null) return body;
      const [whole, minText = '0', comma, maxText = ''] = braces;
      this.index += whole.length;
      min = Number.parseInt(minText, 10);
      max = comma === undefined ? min : maxText === '' ? Number.POSITIVE_INFINITY : Number.parseInt(maxText, 10);
    }
    // Laziness changes which match wins, not what an attempt can read.
    if (this.source[this.index] === '?') this.index += 1;
    return { type: 'repeat', body, min, max };
  }
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
