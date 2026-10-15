import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDecisionRules } from '../registry/decision-rules';
import { loadIntents } from '../registry/intents';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { buildQuestionSet, QuestionSetError, type QuestionSources } from './questions';
import { renderShadowRequest, SHADOW_SAMPLE_STATE } from './shadow-request';

const root = resolveRoot({}, __dirname);

function shippedSources(): QuestionSources {
  return {
    intents: loadIntents(root).intents.map((row) => ({ id: row.id, active: row.active })),
    rules: loadDecisionRules(root).rules.map((rule) => ({ id: rule.id, judge_fact: rule.judge_fact })),
  };
}

test('the shipped registries yield the question keys in registry order, inactive intents left out', () => {
  const sources = shippedSources();
  const active = sources.intents.filter((row) => row.active).map((row) => row.id);
  const facts = sources.rules.flatMap((rule) => (rule.judge_fact === null ? [] : [rule.judge_fact]));

  const keys = Object.keys(buildQuestionSet(sources));

  assert.deepEqual(keys, [
    'primary_intent',
    ...active.map((id) => `intent.${id}`),
    'is_project_change',
    'design_work',
    ...facts.map((fact) => `fact.${fact}`),
    'scale',
    'risk.reversibility',
    'risk.blast_radius',
    'risk.data_sensitivity',
    'risk.contract_surface',
    'risk.spend',
  ]);
  assert.ok(!keys.includes('intent.backend-python'));
});

test('the primary-intent choice offers every active intent and the fallback option last', () => {
  const sources = shippedSources();
  const primary = buildQuestionSet(sources)['primary_intent'];

  assert.equal(primary?.type, 'choice');
  if (primary?.type !== 'choice') return;
  assert.deepEqual(Object.keys(primary.criteria), [...sources.intents.filter((row) => row.active).map((row) => row.id), 'other']);
});

test('the same registries always serialize to the same bytes', () => {
  assert.equal(JSON.stringify(buildQuestionSet(shippedSources())), JSON.stringify(buildQuestionSet(shippedSources())));
});

test('an active intent named like the fallback option is refused', () => {
  assert.throws(
    () => buildQuestionSet({ intents: [{ id: 'other', active: true }], rules: [] }),
    (error: unknown) => error instanceof QuestionSetError && error.message.includes("'other'"),
  );
});

test('an inactive intent is skipped before any check, even under a reserved id', () => {
  const questions = buildQuestionSet({ intents: [{ id: 'other', active: false }, { id: 'frontend', active: true }], rules: [] });

  assert.ok('intent.frontend' in questions);
  assert.ok(!('intent.other' in questions));
});

test('a duplicated active intent is refused', () => {
  assert.throws(
    () => buildQuestionSet({ intents: [{ id: 'frontend', active: true }, { id: 'frontend', active: true }], rules: [] }),
    QuestionSetError,
  );
});

test('a judge fact declared by two rules is refused', () => {
  assert.throws(
    () =>
      buildQuestionSet({
        intents: [],
        rules: [
          { id: 'rule-a', judge_fact: 'large_change' },
          { id: 'rule-b', judge_fact: 'large_change' },
        ],
      }),
    (error: unknown) => error instanceof QuestionSetError && error.message.includes('large_change'),
  );
});

test('an active intent without question wording is refused, naming the wording file', () => {
  assert.throws(
    () => buildQuestionSet({ intents: [{ id: 'unworded-intent', active: true }], rules: [] }),
    (error: unknown) => error instanceof QuestionSetError && error.message.includes('src/judge/question-text.ts'),
  );
});

test('a judge fact without question wording is refused', () => {
  assert.throws(
    () => buildQuestionSet({ intents: [], rules: [{ id: 'rule-x', judge_fact: 'unworded_fact' }] }),
    (error: unknown) => error instanceof QuestionSetError && error.message.includes('unworded_fact'),
  );
});

test('the shadow request renders model, the sample state and the generated questions', () => {
  const sources = shippedSources();
  const rendered = renderShadowRequest(sources, 'jev-test');

  assert.ok(rendered.endsWith('}\n'));
  const parsed: unknown = JSON.parse(rendered);
  assert.deepEqual(parsed, { model: 'jev-test', state: SHADOW_SAMPLE_STATE, questions: buildQuestionSet(sources) });
});

// questions.ts promises the committed draft request IS this output; a registry
// edit that reorders or adds an intent must regenerate the file with it.
test('the committed shadow request equals the rendering over the shipped registries', () => {
  const committed = readFileSync(join(root, 'docs', 'specs', '2026-10-10-jev-shadow-request.json'), 'utf8');

  assert.equal(committed, renderShadowRequest(shippedSources(), loadPolicy(root).judge.model));
});
