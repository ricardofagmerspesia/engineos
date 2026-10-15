import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { foldRegistries, jev, NO_RISK } from './fold-fixture.test';
import { judgeFact, judgeSummary } from './judge-facts';

// The judge fact as the kernel validates it (contracts.md §3): every field read
// one by one, the intent and rule vocabulary checked against the registries,
// and a closed set of refusal messages. The registries are the fold fixture,
// whose judge facts are handles_sensitive_data, large_change and
// multi_agent_system, and whose `retired` intent is inactive.

const FALLBACK_REASONS =
  'disabled|no-key|no-fetch|breaker-open|timeout|http-429|http-4xx|http-5xx|network|invalid-response|oversize-state';

// --- judgeSummary ---------------------------------------------------------------

test('no judge fact summarises as a no-judge-fact fallback', () => {
  assert.deepEqual(judgeSummary(null), { source: 'fallback', reason: 'no-judge-fact', model: null });
});

test('a fallback fact summarises with its reason and no model', () => {
  assert.deepEqual(judgeSummary({ source: 'fallback', reason: 'breaker-open' }), {
    source: 'fallback',
    reason: 'breaker-open',
    model: null,
  });
});

test('a jev fact summarises with its model and no reason', () => {
  assert.deepEqual(judgeSummary(jev()), { source: 'jev', reason: null, model: 'fixture-model' });
});

// --- judgeFact: shape -------------------------------------------------------------

test('a well-formed jev fact is returned field for field', () => {
  const fact = jev({
    primary: { id: 'web', confidence: 0.8, margin: 0.4 },
    intents: { web: 0.8, api: 0 },
    rules: { large_change: 1 },
    scale: 2,
    risk: { ...NO_RISK, spend: 1 },
  });
  assert.deepEqual(judgeFact(fact, foldRegistries()), fact);
});

test('a well-formed fallback fact is returned as given', () => {
  assert.deepEqual(judgeFact({ source: 'fallback', reason: 'timeout' }, foldRegistries()), {
    source: 'fallback',
    reason: 'timeout',
  });
});

test('a judge fact that is not an object is refused', () => {
  for (const value of ['jev', null, [], 1]) {
    assert.throws(() => judgeFact(value, foldRegistries()), refusal('resolve --facts: judge must be an object'));
  }
});

test('an unknown source is refused', () => {
  assert.throws(() => judgeFact({ source: 'model' }, foldRegistries()), refusal('resolve --facts: judge.source must be jev|fallback'));
  assert.throws(() => judgeFact({}, foldRegistries()), refusal('resolve --facts: judge.source must be jev|fallback'));
});

test('a fallback reason outside the fallback vocabulary is refused', () => {
  // not-user-input and no-judge-fact are summary reasons, never fact reasons.
  for (const reason of ['not-user-input', 'no-judge-fact', 'slow', null]) {
    assert.throws(
      () => judgeFact({ source: 'fallback', reason }, foldRegistries()),
      refusal(`resolve --facts: judge.reason must be one of ${FALLBACK_REASONS}`),
    );
  }
});

test('an extra key is refused at every level', () => {
  const regs = foldRegistries();
  assert.throws(
    () => judgeFact({ source: 'fallback', reason: 'timeout', model: 'x' }, regs),
    refusal('resolve --facts: unknown fact judge.model'),
  );
  assert.throws(() => judgeFact({ ...jev(), note: 'x' }, regs), refusal('resolve --facts: unknown fact judge.note'));
  assert.throws(
    () => judgeFact({ ...jev(), primary: { id: 'web', confidence: 1, margin: 1, why: 'x' } }, regs),
    refusal('resolve --facts: unknown fact judge.primary.why'),
  );
  assert.throws(
    () => judgeFact({ ...jev(), risk: { ...NO_RISK, privacy: 1 } }, regs),
    refusal('resolve --facts: unknown fact judge.risk.privacy'),
  );
});

test('a missing nested object is refused as not an object', () => {
  const regs = foldRegistries();
  const { primary: _primary, ...withoutPrimary } = jev();
  assert.throws(() => judgeFact(withoutPrimary, regs), refusal('resolve --facts: judge.primary must be an object'));
  assert.throws(() => judgeFact({ ...jev(), intents: [] }, regs), refusal('resolve --facts: judge.intents must be an object'));
  assert.throws(() => judgeFact({ ...jev(), risk: null }, regs), refusal('resolve --facts: judge.risk must be an object'));
});

// --- judgeFact: vocabulary ----------------------------------------------------------

test('the primary id must be an active intent or other', () => {
  const regs = foldRegistries();
  const message = 'resolve --facts: judge.primary.id must be an active intent id or other';
  for (const id of ['nope', 'retired', 3]) {
    assert.throws(() => judgeFact({ ...jev(), primary: { id, confidence: 1, margin: 1 } }, regs), refusal(message));
  }
  const other = jev({ primary: { id: 'other', confidence: 1, margin: 1 } });
  assert.deepEqual(judgeFact(other, regs), other);
});

test('an intent probability for an unknown or inactive intent is refused', () => {
  const regs = foldRegistries();
  assert.throws(() => judgeFact(jev({ intents: { nope: 0.5 } }), regs), refusal('resolve --facts: unknown fact judge.intents.nope'));
  assert.throws(() => judgeFact(jev({ intents: { retired: 0.5 } }), regs), refusal('resolve --facts: unknown fact judge.intents.retired'));
});

test('a rule probability for a fact no rule declares is refused', () => {
  const regs = foldRegistries();
  assert.throws(() => judgeFact(jev({ rules: { nope: 0.5 } }), regs), refusal('resolve --facts: unknown fact judge.rules.nope'));
});

// --- judgeFact: values ------------------------------------------------------------------

test('a probability outside [0,1] or not a number is refused with its path', () => {
  const regs = foldRegistries();
  const cases: { value: Record<string, unknown>; at: string }[] = [
    { value: { ...jev(), intents: { web: 1.5 } }, at: 'judge.intents.web' },
    { value: { ...jev(), rules: { large_change: -0.1 } }, at: 'judge.rules.large_change' },
    { value: { ...jev(), primary: { id: 'web', confidence: '1', margin: 1 } }, at: 'judge.primary.confidence' },
    { value: { ...jev(), primary: { id: 'web', confidence: 1, margin: 2 } }, at: 'judge.primary.margin' },
    { value: { ...jev(), is_project_change: true }, at: 'judge.is_project_change' },
    { value: { ...jev(), design_work: null }, at: 'judge.design_work' },
  ];
  for (const { value, at } of cases) {
    assert.throws(() => judgeFact(value, regs), refusal(`resolve --facts: ${at} must be a number in [0,1]`));
  }
});

test('latency must be a non-negative integer', () => {
  const regs = foldRegistries();
  for (const latency of [-1, 1.5, '12']) {
    assert.throws(
      () => judgeFact({ ...jev(), latency_ms: latency }, regs),
      refusal('resolve --facts: judge.latency_ms must be an integer >= 0'),
    );
  }
  assert.equal(judgeFact(jev({ latency_ms: 0 }), regs).source, 'jev');
});

test('scale and each risk input must be a level 0, 1 or 2', () => {
  const regs = foldRegistries();
  for (const scale of [3, 0.5, '1']) {
    assert.throws(() => judgeFact({ ...jev(), scale }, regs), refusal('resolve --facts: judge.scale must be 0|1|2'));
  }
  assert.throws(
    () => judgeFact({ ...jev(), risk: { ...NO_RISK, spend: 3 } }, regs),
    refusal('resolve --facts: judge.risk.spend must be 0|1|2'),
  );
  const { reversibility: _reversibility, ...partialRisk } = NO_RISK;
  assert.throws(
    () => judgeFact({ ...jev(), risk: partialRisk }, regs),
    refusal('resolve --facts: judge.risk.reversibility must be 0|1|2'),
  );
});

test('the model must be a journal slug of at most 256 characters', () => {
  const regs = foldRegistries();
  const message = 'resolve --facts: judge.model must be a slug of at most 256 characters';
  for (const model of ['', 'has space', 'line\nbreak', 'x'.repeat(257), 7]) {
    assert.throws(() => judgeFact({ ...jev(), model }, regs), refusal(message));
  }
  const longest = 'm'.repeat(256);
  assert.equal(judgeSummary(judgeFact(jev({ model: longest }), regs)).model, longest);
});

// --- helpers ------------------------------------------------------------------------------

function refusal(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof KernelError, `expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
