import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import { carriesV2Field, registryIntentIds, v2Problems, type IntentIds } from './case-schema-v2';
import { runDeterministicTier } from './deterministic';

// Case schema v2 (contracts.md §8): the optional expect_primary,
// expect_not_intents, exemplar, source and judge fields of an intent case, their
// shape and reference checks, and the one extra deterministic-tier line they
// add. Intent ids are fixtures: web and api are active, legacy is known but
// disabled.

const IDS: IntentIds = { active: new Set(['web', 'api']), known: new Set(['web', 'api', 'legacy']) };

// --- carriesV2Field ---------------------------------------------------------------

test('a case carries v2 when any v2 field is present and not null', () => {
  assert.equal(carriesV2Field({ id: 'c', expect_intents: ['web'] }), false);
  assert.equal(carriesV2Field({ expect_primary: null, source: null }), false);
  assert.equal(carriesV2Field('not a case'), false);
  for (const key of ['expect_primary', 'expect_not_intents', 'exemplar', 'source', 'judge']) {
    assert.equal(carriesV2Field({ [key]: false }), true, key);
  }
});

// --- v2Problems: clean cases ------------------------------------------------------------

test('a well-formed v2 case has no problems', () => {
  const parsed = {
    expect_intents: ['web'],
    expect_primary: 'web',
    expect_not_intents: ['api', 'legacy'],
    exemplar: true,
    source: 'user',
    judge: { primary: 'other', intent_above: ['web'], intent_below: ['api'], fact_above: ['f'], design_work_above: 0.5 },
  };
  assert.deepEqual(v2Problems(parsed, 'c', IDS), []);
});

test('null v2 fields read as absent', () => {
  assert.deepEqual(v2Problems({ expect_primary: null, exemplar: null, judge: null }, 'c', IDS), []);
});

// --- expect_primary -----------------------------------------------------------------------

test('expect_primary must name an active intent or other', () => {
  assert.deepEqual(v2Problems({ expect_primary: 'other' }, 'c', IDS), []);
  assert.deepEqual(v2Problems({ expect_primary: 'legacy' }, 'c', IDS), ["c(expect_primary='legacy' is not an active intent or 'other')"]);
  assert.deepEqual(v2Problems({ expect_primary: 'nope' }, 'c', IDS), ["c(expect_primary='nope' is not an active intent or 'other')"]);
  assert.deepEqual(v2Problems({ expect_primary: 3 }, 'c', IDS), ["c(expect_primary='3' is not an active intent or 'other')"]);
});

test('a notification case may not set expect_primary', () => {
  assert.deepEqual(v2Problems({ source: 'notification', expect_primary: 'web' }, 'c', IDS), [
    'c(notification case expects no route but sets expect_primary)',
  ]);
});

// --- expect_not_intents -----------------------------------------------------------------------

test('expect_not_intents must be an array of strings', () => {
  for (const value of ['web', ['web', 3], { web: true }]) {
    assert.deepEqual(v2Problems({ expect_not_intents: value }, 'c', IDS), ['c(expect_not_intents must be an array of strings)']);
  }
});

test('expect_not_intents must name known intents, disabled ones included', () => {
  assert.deepEqual(v2Problems({ expect_not_intents: ['legacy'] }, 'c', IDS), []);
  assert.deepEqual(v2Problems({ expect_not_intents: ['nope'] }, 'c', IDS), ["c(expect_not_intents names unknown intent 'nope')"]);
});

test('an intent cannot be both the expected primary or an expected intent and forbidden', () => {
  assert.deepEqual(v2Problems({ expect_primary: 'web', expect_not_intents: ['web'] }, 'c', IDS), [
    "c(expect_primary 'web' is also in expect_not_intents)",
  ]);
  assert.deepEqual(v2Problems({ expect_intents: ['web'], expect_not_intents: ['web'] }, 'c', IDS), [
    "c('web' is both expected and forbidden)",
  ]);
});

// --- exemplar -------------------------------------------------------------------------------

test('exemplar must be true when present', () => {
  assert.deepEqual(v2Problems({ exemplar: 'yes', expect_intents: ['web'] }, 'c', IDS), ['c(exemplar must be true when present)']);
});

test('an exemplar case seeds exactly one active intent', () => {
  const needsOne = ['c(exemplar case needs exactly one expect_intents entry)'];
  assert.deepEqual(v2Problems({ exemplar: true }, 'c', IDS), needsOne);
  assert.deepEqual(v2Problems({ exemplar: true, expect_intents: [] }, 'c', IDS), needsOne);
  assert.deepEqual(v2Problems({ exemplar: true, expect_intents: ['web', 'api'] }, 'c', IDS), needsOne);
  assert.deepEqual(v2Problems({ exemplar: true, expect_intents: ['legacy'] }, 'c', IDS), [
    "c(exemplar seeds 'legacy', which is not an active intent)",
  ]);
});

test('an exemplar case cannot disagree with its expect_primary', () => {
  assert.deepEqual(v2Problems({ exemplar: true, expect_intents: ['web'], expect_primary: 'api' }, 'c', IDS), [
    "c(exemplar seeds 'web' but expect_primary is 'api')",
  ]);
});

test('a notification case cannot seed exemplars or list expected intents', () => {
  assert.deepEqual(v2Problems({ exemplar: true, expect_intents: ['web'], source: 'notification' }, 'c', IDS), [
    'c(a notification case cannot seed exemplars)',
    'c(notification case expects no route but lists expect_intents)',
  ]);
});

// --- source -----------------------------------------------------------------------------------

test('source must be user or notification', () => {
  assert.deepEqual(v2Problems({ source: 'notification', expect_intents: [] }, 'c', IDS), []);
  assert.deepEqual(v2Problems({ source: 'agent' }, 'c', IDS), ["c(source='agent' is not user or notification)"]);
});

// --- judge ------------------------------------------------------------------------------------

test('judge must be an object', () => {
  assert.deepEqual(v2Problems({ judge: ['web'] }, 'c', IDS), ['c(judge must be an object)']);
});

test('judge.primary must name an active intent or other', () => {
  assert.deepEqual(v2Problems({ judge: { primary: 'legacy' } }, 'c', IDS), [
    "c(judge.primary='legacy' is not an active intent or 'other')",
  ]);
});

test('judge lists must be arrays of non-empty strings', () => {
  for (const key of ['intent_above', 'intent_below', 'fact_above', 'fact_below']) {
    const message = [`c(judge.${key} must be an array of non-empty strings)`];
    assert.deepEqual(v2Problems({ judge: { [key]: 'web' } }, 'c', IDS), message, key);
    assert.deepEqual(v2Problems({ judge: { [key]: [''] } }, 'c', IDS), message, key);
  }
});

test('a judge entry cannot sit both above and below', () => {
  assert.deepEqual(v2Problems({ judge: { intent_above: ['web'], intent_below: ['web'] } }, 'c', IDS), [
    "c(judge lists 'web' in both intent_above and intent_below)",
  ]);
  assert.deepEqual(v2Problems({ judge: { fact_above: ['f'], fact_below: ['f'] } }, 'c', IDS), [
    "c(judge lists 'f' in both fact_above and fact_below)",
  ]);
});

test('judge.design_work_above must be a number in [0, 1]', () => {
  assert.deepEqual(v2Problems({ judge: { design_work_above: 0 } }, 'c', IDS), []);
  assert.deepEqual(v2Problems({ judge: { design_work_above: 1 } }, 'c', IDS), []);
  for (const cut of [1.5, -0.1, '0.5']) {
    assert.deepEqual(v2Problems({ judge: { design_work_above: cut } }, 'c', IDS), [
      'c(judge.design_work_above must be a number in [0, 1])',
    ]);
  }
});

test('a notification case cannot set judge expectations', () => {
  assert.deepEqual(v2Problems({ source: 'notification', judge: {} }, 'c', IDS), [
    'c(notification case sends no judge request but sets judge)',
  ]);
});

// --- registryIntentIds ---------------------------------------------------------------------------

test('registryIntentIds reads known ids raw and treats enabled false as inactive', (t) => {
  const root = tempRoot(t);
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(
    join(root, 'registries', 'intents.json'),
    JSON.stringify({
      intents: [{ id: 'web' }, { id: 'legacy', enabled: false }, { id: '' }, { title: 'no id' }, 'not a row', { id: 'api', enabled: true }],
    }),
  );
  const ids = registryIntentIds(root);
  assert.deepEqual([...ids.active], ['web', 'api']);
  assert.deepEqual([...ids.known], ['web', 'legacy', 'api']);
});

test('a missing or unreadable intents registry answers empty sets', (t) => {
  const missing = registryIntentIds(tempRoot(t));
  assert.equal(missing.active.size + missing.known.size, 0);
  const root = tempRoot(t);
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(join(root, 'registries', 'intents.json'), '{not json');
  const unreadable = registryIntentIds(root);
  assert.equal(unreadable.active.size + unreadable.known.size, 0);
});

// --- deterministic tier integration -----------------------------------------------------------------

test('a v1-only set prints no v2 line', (t) => {
  const out = gradeOut(t, conformingIntents(25, {}));
  assert.ok(!out.includes('v2 case fields'), out);
});

test('a well-formed v2 set adds one ok line after the must_load closure line', (t) => {
  const io = memoryIo();
  const result = runDeterministicTier(evalTree(t, conformingIntents(25, { expect_primary: 'backend', expect_not_intents: ['frontend'] })), io);
  const out = io.stdout.join('').split('\n');
  const closure = out.indexOf('ok   every must_load set is closed under rule deferrals');
  const v2 = out.indexOf('ok   v2 case fields are well-formed and name active intents');
  const firstAgent = out.indexOf('ok   every agent case names an existing agent');
  assert.ok(closure >= 0 && v2 === closure + 1 && firstAgent === v2 + 1, out.join('\n'));
  assert.deepEqual(result, { pass: 12, fail: 0, intentCount: 25 });
});

test('v2 problems print one FAIL line listing every problem', (t) => {
  const intents = conformingIntents(25, {});
  intents[0] = intentCase(0, { expect_primary: 'legacy' });
  intents[1] = intentCase(1, { source: 'agent' });
  const io = memoryIo();
  const result = runDeterministicTier(evalTree(t, intents), io);
  const out = io.stdout.join('');
  assert.ok(
    out.includes(
      "FAIL v2 field problems: intent-001(expect_primary='legacy' is not an active intent or 'other') intent-002(source='agent' is not user or notification)\n",
    ),
    out,
  );
  assert.equal(result.fail, 1);
});

// --- helpers ------------------------------------------------------------------------------------------

// The minimal conforming tree the deterministic tier grades clean, plus an
// intents registry for the v2 reference checks.
function evalTree(t: TestContext, intents: readonly string[]): string {
  const root = tempRoot(t);
  writeFileSync(join(root, 'CLAUDE.md'), '@rules/base.md\n@rules/security.md\n');
  mkdirSync(join(root, 'rules'), { recursive: true });
  for (const name of ['base', 'security', 'backend', 'frontend']) writeFileSync(join(root, 'rules', `${name}.md`), `${name} rules`);
  mkdirSync(join(root, 'agents'), { recursive: true });
  writeFileSync(join(root, 'agents', 'backend-coordinator.md'), 'agent');
  mkdirSync(join(root, 'evals'), { recursive: true });
  writeFileSync(join(root, 'evals', 'intent-routing-cases.jsonl'), `${intents.join('\n')}\n`);
  writeFileSync(
    join(root, 'evals', 'agent-cases.jsonl'),
    `${JSON.stringify({ id: 'agent-001', agent: 'backend-coordinator', must: ['a request DTO'], must_not: ['logic in the controller'] })}\n`,
  );
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(join(root, 'registries', 'routing.json'), JSON.stringify({ domains: [{ id: 'backend' }] }));
  writeFileSync(
    join(root, 'registries', 'intents.json'),
    JSON.stringify({ intents: [{ id: 'backend' }, { id: 'frontend' }, { id: 'legacy', enabled: false }] }),
  );
  return root;
}

function conformingIntents(count: number, v2: Readonly<Record<string, unknown>>): string[] {
  return Array.from({ length: count }, (_unused, index) => intentCase(index, v2));
}

// One conforming v1 intent case, plus whatever v2 fields a test adds to it.
function intentCase(index: number, v2: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    id: `intent-${String(index + 1).padStart(3, '0')}`,
    input: 'add a POST /orders endpoint',
    expect_intents: ['backend'],
    must_load: ['backend'],
    must_not_load: ['frontend'],
    notes: 'pins the backend row',
    ...v2,
  });
}

function gradeOut(t: TestContext, intents: readonly string[]): string {
  const io = memoryIo();
  runDeterministicTier(evalTree(t, intents), io);
  return io.stdout.join('');
}
