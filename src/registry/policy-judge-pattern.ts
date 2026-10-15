// Shape test for the judge's redaction patterns (E1). Redaction runs on every
// judged prompt inside the hook budget, so the loader refuses the regular
// expression forms whose cost can grow faster than the text:
//
// - an unbounded quantifier outside a character class: `*`, `+`, or `{m,}`
//   with any digit count;
// - a quantified group (`(...)` followed by `?` or `{...}`) whose body holds an
//   alternation or another quantifier, at any nesting depth. Such a group can
//   match one stretch of text in many ways, and the number of ways multiplies
//   with every repetition: `(?:a|a){1,28}b` is bounded and still exponential.
//
// Character classes are exempt (`[|+*]` is three literals), as is an
// alternation or quantifier inside a group that is not itself quantified.
// This is a syntactic floor, not a proof: adjacent overlapping bounded runs are
// polynomial in their bounds, which is why the shipped list is also pinned by
// hash (src/registry/policy-judge.ts) and timed before a change is reviewed.

export type PatternShape = 'linear' | 'unbounded-quantifier' | 'quantified-ambiguous-group' | 'unbalanced-group';

interface GroupFrame {
  alternation: boolean;
  quantifier: boolean;
}

// Without the u flag (redact.ts compiles with g only) a `{` that does not open
// one of these is a literal.
const RANGE_QUANTIFIER = /^\{[0-9]+(?:,[0-9]*)?\}/;
const OPEN_RANGE = /^\{[0-9]+,\}/;
// What may follow `(` before the group body: non-capturing, lookahead,
// lookbehind or a named group. Its `?` is syntax, not a quantifier.
const GROUP_PREFIX = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][A-Za-z0-9_$]*>)/;

export function patternShape(source: string): PatternShape {
  const groups: GroupFrame[] = [newFrame()];
  let inClass = false;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const current = groups[groups.length - 1];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      index += 1;
      continue;
    }
    if (char === '[') {
      inClass = true;
      index += 1;
      continue;
    }
    if (char === '*' || char === '+') return 'unbounded-quantifier';
    if (char === '(') {
      groups.push(newFrame());
      index += 1 + (GROUP_PREFIX.exec(source.slice(index + 1))?.[0].length ?? 0);
      continue;
    }
    if (char === ')') {
      const closed = groups.length > 1 ? groups.pop() : undefined;
      const parent = groups[groups.length - 1];
      if (closed === undefined || parent === undefined) return 'unbalanced-group';
      const ambiguous = closed.alternation || closed.quantifier;
      if (ambiguous && quantifierFollows(source.slice(index + 1))) return 'quantified-ambiguous-group';
      parent.alternation = parent.alternation || closed.alternation;
      parent.quantifier = parent.quantifier || closed.quantifier;
      index += 1;
      continue;
    }
    if (current === undefined) return 'unbalanced-group';
    if (char === '|') current.alternation = true;
    else if (char === '?') current.quantifier = true;
    else if (char === '{') {
      const rest = source.slice(index);
      if (OPEN_RANGE.test(rest)) return 'unbounded-quantifier';
      const range = RANGE_QUANTIFIER.exec(rest);
      if (range !== null) {
        current.quantifier = true;
        index += range[0].length;
        continue;
      }
    }
    index += 1;
  }
  return groups.length === 1 ? 'linear' : 'unbalanced-group';
}

function newFrame(): GroupFrame {
  return { alternation: false, quantifier: false };
}

// `*` and `+` are refused on their own when the scan reaches them; they are
// listed so the group test never depends on that ordering.
function quantifierFollows(rest: string): boolean {
  return rest.startsWith('?') || rest.startsWith('*') || rest.startsWith('+') || RANGE_QUANTIFIER.test(rest) || OPEN_RANGE.test(rest);
}
