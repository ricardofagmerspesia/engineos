import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from './policy';
import { patternShape, type PatternShape } from './policy-judge-pattern';
import { resolveRoot } from './paths';

const cases: [string, PatternShape][] = [
  // Unbounded quantifiers outside a character class.
  ['a*', 'unbounded-quantifier'],
  ['a+', 'unbounded-quantifier'],
  ['a{1,}', 'unbounded-quantifier'],
  ['a{0,}', 'unbounded-quantifier'],
  ['a{12,}', 'unbounded-quantifier'],
  ['a{1234567,}', 'unbounded-quantifier'],
  ['(?:ab)+', 'unbounded-quantifier'],
  // Quantified groups whose body can match one stretch in several ways.
  ['(?:a|a){1,28}b', 'quantified-ambiguous-group'],
  ['(a{1,2}){1,2}', 'quantified-ambiguous-group'],
  ['(?<n>a|b)?', 'quantified-ambiguous-group'],
  ['(?:a{2})?', 'quantified-ambiguous-group'],
  ['(?:x(?:a|b))?', 'quantified-ambiguous-group'],
  ['(?:a?){3}', 'quantified-ambiguous-group'],
  // Character classes are literals, whatever they hold.
  ['[|+*]', 'linear'],
  ['[a-z*+]{1,8}', 'linear'],
  ['[(]{1,3}', 'linear'],
  // Alternation or quantifiers inside a group that is itself not quantified.
  ['ab|cd', 'linear'],
  ['(?:ab|cd)x', 'linear'],
  ['(?:a{1,4}b)c', 'linear'],
  ['(?<![A-Za-z])x{2,4}', 'linear'],
  ['(?=ab)a', 'linear'],
  // A quantified group with neither alternation nor a quantifier inside.
  ['(?:ab){2,3}', 'linear'],
  // Escapes are literals: \* and \+ are not quantifiers, \( opens no group.
  ['\\*\\+\\(', 'linear'],
  // A brace that opens no range is a literal without the u flag.
  ['a{x}', 'linear'],
  // Bracket balance.
  ['(ab', 'unbalanced-group'],
  ['ab)', 'unbalanced-group'],
];

for (const [source, shape] of cases) {
  test(`patternShape(${JSON.stringify(source)}) is ${shape}`, () => {
    assert.equal(patternShape(source), shape);
  });
}

test('every shipped redaction pattern is linear', () => {
  const patterns = loadPolicy(resolveRoot({}, __dirname)).judge.redaction.patterns;

  for (const { kind, pattern } of patterns) {
    assert.equal(patternShape(pattern), 'linear', kind);
  }
});
