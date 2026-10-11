import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import type { TiebreakPolicy } from '../registry/policy-router';
import { foldRegistries } from './fold-fixture.test';
import type { RankedIntent } from './score';
import { refuseUnrankedTiebreak, tiebreakFact, tiebreakWinner } from './tiebreak-facts';

// The embedding tie-break fact (contracts.md §3.1) and its selection (§4.7
// steps 1-4). The policy cuts are fixtures; the shipped ones are calibration
// data.

const POLICY: TiebreakPolicy = { min_similarity: 0.6, margin: 0.1 };
const RANKED: RankedIntent[] = [candidate('web'), candidate('api'), candidate('docs')];

// --- tiebreakFact ---------------------------------------------------------------

test('a tiebreak fact that is not an object is refused', () => {
  const regs = foldRegistries();
  for (const value of ['web', 3, null, [], [0.5]]) {
    assert.throws(() => tiebreakFact(value, regs), refusal('resolve --facts: tiebreak must be an object'));
  }
});

test('a tiebreak score for an unknown or inactive intent is refused', () => {
  const regs = foldRegistries();
  assert.throws(() => tiebreakFact({ nope: 0.5 }, regs), refusal('resolve --facts: unknown fact tiebreak.nope'));
  assert.throws(() => tiebreakFact({ retired: 0.5 }, regs), refusal('resolve --facts: unknown fact tiebreak.retired'));
});

test('a tiebreak score outside [0,1] or not a number is refused', () => {
  const regs = foldRegistries();
  for (const score of [1.01, -0.01, '0.5', null, true]) {
    assert.throws(() => tiebreakFact({ web: score }, regs), refusal('resolve --facts: tiebreak.web must be a number in [0,1]'));
  }
});

test('an empty fact and boundary scores are accepted as given', () => {
  const regs = foldRegistries();
  assert.deepEqual(tiebreakFact({}, regs), {});
  assert.deepEqual(tiebreakFact({ web: 0, api: 1 }, regs), { web: 0, api: 1 });
});

// --- refuseUnrankedTiebreak ---------------------------------------------------------

test('a score for a candidate the ranking never produced is refused', () => {
  assert.throws(
    () => refuseUnrankedTiebreak({ web: 0.9, tuned: 0.5 }, RANKED),
    refusal('resolve --facts: tiebreak.tuned is not a ranked candidate'),
  );
  assert.doesNotThrow(() => refuseUnrankedTiebreak({ web: 0.9, docs: 0.1 }, RANKED));
  assert.doesNotThrow(() => refuseUnrankedTiebreak({}, []));
});

// --- tiebreakWinner -------------------------------------------------------------------

test('fewer than two survivors select nothing', () => {
  assert.equal(tiebreakWinner(['web'], RANKED, { web: 0.99 }, POLICY), null);
  assert.equal(tiebreakWinner([], RANKED, { web: 0.99 }, POLICY), null);
});

test('an unscored survivor blocks selection', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.99 }, POLICY), null);
});

test('a survivor missing from the ranking blocks selection', () => {
  const ranked = [candidate('web')];
  assert.equal(tiebreakWinner(['web', 'api'], ranked, { web: 0.99, api: 0.1 }, POLICY), null);
});

test('a best score under min_similarity selects nothing, a best score at it selects', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.59, api: 0.1 }, POLICY), null);
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.6, api: 0.1 }, POLICY), 'web');
});

test('a gap within the margin selects nothing', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.9, api: 0.85 }, POLICY), null);
});

test('an exact tie never selects', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.9, api: 0.9 }, POLICY), null);
});

test('a gap equal to the margin selects, at an exactly representable boundary', () => {
  const policy: TiebreakPolicy = { min_similarity: 0.5, margin: 0.25 };
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.75, api: 0.5 }, policy), 'web');
});

test('the winner is the best score, not the best-ranked survivor', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.3, api: 0.9 }, POLICY), 'api');
});

test('scores of non-survivors are not read', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { docs: 0.99, web: 0.9, api: 0.5 }, POLICY), 'web');
});

// Contract §4.7 step 4 reads `best.score - second.score >= margin`. 0.7 - 0.6
// is 0.09999999999999998 in binary floating point, so a literal subtraction
// refuses a gap the contract (and the registry author) states as exactly the
// margin. Expected red against src/kernel/tiebreak-facts.ts (the
// `best.score - second.score < policy.margin` comparison) until it compares
// with a tolerance or on rounded values.
test('a gap equal to the margin selects at a decimal boundary (0.7 - 0.6 vs 0.1)', () => {
  assert.equal(tiebreakWinner(['web', 'api'], RANKED, { web: 0.7, api: 0.6 }, POLICY), 'web');
});

// --- helpers ----------------------------------------------------------------------------

function candidate(id: string): RankedIntent {
  return { id, score: 1, confidence: 0, features: [] };
}

function refusal(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof KernelError, `expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
