import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJevResponse, reportedInputTokens } from './response';
import { buildQuestionSet } from './questions';
import type { QuestionSet } from './types';

// A small, fixed question set: two intents, one fact, plus the fixed keys.
const questions: QuestionSet = buildQuestionSet({
  intents: [
    { id: 'frontend', active: true },
    { id: 'backend', active: true },
    { id: 'bug', active: false },
  ],
  rules: [
    { id: 'rule-large-change', judge_fact: 'large_change' },
    { id: 'rule-code-changed', judge_fact: null },
  ],
});

type Answers = Record<string, unknown>;

function scoreAnswer(probabilities: Record<string, number>): Record<string, unknown> {
  return { type: 'score', score: 0, legend: { '0': 'low' }, probabilities };
}

function answers(): Answers {
  return {
    primary_intent: { type: 'choice', choice: 'frontend', confidence: 0.75, probabilities: { frontend: 0.75, backend: 0.25 } },
    'intent.frontend': { type: 'noul', noul: 0.75 },
    'intent.backend': { type: 'noul', noul: 0.125 },
    is_project_change: { type: 'noul', noul: 1 },
    design_work: { type: 'noul', noul: 0 },
    'fact.large_change': { type: 'noul', noul: 0.5 },
    scale: { type: 'score', score: 1.3, legend: {}, probabilities: { '0': 0.2, '1': 0.3, '2': 0.5 } },
    'risk.reversibility': scoreAnswer({ '0': 1, '1': 0, '2': 0 }),
    'risk.blast_radius': scoreAnswer({ '0': 0, '1': 1, '2': 0 }),
    'risk.data_sensitivity': scoreAnswer({ '0': 0, '1': 0, '2': 1 }),
    'risk.contract_surface': scoreAnswer({ '0': 0.5, '1': 0.5, '2': 0 }),
    'risk.spend': scoreAnswer({ '0': 1, '1': 0, '2': 0 }),
  };
}

function response(overrides: Answers = {}, top: Record<string, unknown> = {}): Record<string, unknown> {
  return { model: 'jev-1.13.0', answers: { ...answers(), ...overrides }, usage: { input_tokens: 42 }, ...top };
}

test('the question set asks about active intents and declared facts only', () => {
  assert.deepEqual(Object.keys(questions), [
    'primary_intent',
    'intent.frontend',
    'intent.backend',
    'is_project_change',
    'design_work',
    'fact.large_change',
    'scale',
    'risk.reversibility',
    'risk.blast_radius',
    'risk.data_sensitivity',
    'risk.contract_surface',
    'risk.spend',
  ]);
});

test('a complete, in-range answer becomes a JevFact', () => {
  const fact = parseJevResponse(response(), questions, 12.6);

  assert.deepEqual(fact, {
    source: 'jev',
    model: 'jev-1.13.0',
    latency_ms: 13,
    is_project_change: 1,
    primary: { id: 'frontend', confidence: 0.75, margin: 0.5 },
    intents: { frontend: 0.75, backend: 0.125 },
    rules: { large_change: 0.5 },
    scale: 1,
    design_work: 0,
    risk: { reversibility: 0, blast_radius: 1, data_sensitivity: 2, contract_surface: 1, spend: 0 },
  });
});

test('a negative latency is reported as zero', () => {
  assert.equal(parseJevResponse(response(), questions, -5)?.latency_ms, 0);
});

test('an option the API leaves out of the choice probabilities reads as zero in the margin', () => {
  const fact = parseJevResponse(
    response({ primary_intent: { type: 'choice', choice: 'frontend', confidence: 0.75, probabilities: { frontend: 0.75 } } }),
    questions,
    1,
  );

  assert.deepEqual(fact?.primary, { id: 'frontend', confidence: 0.75, margin: 0.75 });
});

test('an inconsistent choice whose option is not the most probable gets margin zero, never negative', () => {
  const fact = parseJevResponse(
    response({ primary_intent: { type: 'choice', choice: 'frontend', confidence: 0.25, probabilities: { frontend: 0.25, backend: 0.75 } } }),
    questions,
    1,
  );

  assert.equal(fact?.primary.margin, 0);
});

const rejected: [string, () => unknown][] = [
  ['a non-object response', () => 'answers'],
  ['a missing answers object', () => ({ model: 'jev-1.13.0' })],
  ['a model id that is not a slug', () => response({}, { model: 'jev 1.13' })],
  ['a missing intent answer', () => {
    const value = response();
    const body = value['answers'];
    if (typeof body === 'object' && body !== null) Reflect.deleteProperty(body, 'intent.backend');
    return value;
  }],
  ['a noul probability above 1', () => response({ 'intent.frontend': { type: 'noul', noul: 1.5 } })],
  ['a noul answer of the wrong type', () => response({ design_work: { type: 'score', noul: 0.2 } })],
  ['a choice outside the offered options', () => response({ primary_intent: { type: 'choice', choice: 'bug', confidence: 0.9, probabilities: { bug: 0.9 } } })],
  ['a choice probability for an option never offered', () => response({ primary_intent: { type: 'choice', choice: 'frontend', confidence: 0.75, probabilities: { frontend: 0.75, devops: 0.2 } } })],
  ['a choice whose own probability is not reported', () => response({ primary_intent: { type: 'choice', choice: 'frontend', confidence: 0.75, probabilities: { backend: 0.2 } } })],
  ['a choice confidence outside [0,1]', () => response({ primary_intent: { type: 'choice', choice: 'frontend', confidence: 2, probabilities: { frontend: 0.75 } } })],
  ['a score level probability outside the level keys', () => response({ scale: { type: 'score', score: 1, legend: {}, probabilities: { '0': 0.2, '1': 0.3, '2': 0.4, '3': 0.1 } } })],
  ['a score missing a level probability', () => response({ scale: { type: 'score', score: 1, legend: {}, probabilities: { '0': 0.5, '1': 0.5 } } })],
  ['a score without a legend', () => response({ scale: { type: 'score', score: 1, probabilities: { '0': 0, '1': 1, '2': 0 } } })],
  ['a score value past the last level', () => response({ 'risk.spend': { type: 'score', score: 3, legend: {}, probabilities: { '0': 1, '1': 0, '2': 0 } } })],
];

for (const [name, build] of rejected) {
  test(`rejects the whole response for ${name}`, () => {
    assert.equal(parseJevResponse(build(), questions, 1), null);
  });
}

test('reportedInputTokens reads a non-negative integer and answers null for anything else', () => {
  assert.equal(reportedInputTokens({ usage: { input_tokens: 42 } }), 42);
  assert.equal(reportedInputTokens({ usage: { input_tokens: 0 } }), 0);
  assert.equal(reportedInputTokens({ usage: { input_tokens: -1 } }), null);
  assert.equal(reportedInputTokens({ usage: { input_tokens: 1.5 } }), null);
  assert.equal(reportedInputTokens({ usage: { input_tokens: '42' } }), null);
  assert.equal(reportedInputTokens({ usage: null }), null);
  assert.equal(reportedInputTokens({}), null);
  assert.equal(reportedInputTokens('usage'), null);
});

test('a malformed usage block never fails an otherwise valid response', () => {
  assert.notEqual(parseJevResponse(response({}, { usage: 'garbage' }), questions, 1), null);
});
