import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { loadPolicy } from './policy';
import { loadRouterDecisionPolicy } from './policy-router-decision';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);

test('the shipped router_decision block loads as the contracts freeze it', () => {
  const policy = loadRouterDecisionPolicy(root);
  assert.deepEqual(policy.modes, ['keyword', 'llm', 'jev']);
  assert.deepEqual(policy.restrictiveness, ['keyword', 'llm', 'jev', 'auto']);
  assert.equal(policy.default, null);
  assert.equal(policy.default_written_by, null);
  assert.equal(policy.min_confidence, 0.6);
  assert.equal(policy.tie_margin, 0.15);
  assert.deepEqual(policy.jev, {
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    budget_ms: 400,
    key_env: 'TYPESAFE_API_KEY',
  });
  assert.deepEqual(policy.state_fields, ['prompt', 'languages', 'frameworks', 'files_named']);
});

// The reason this loader is a sibling of loadPolicy: the kernel's own answers
// must keep loading from a policy file that predates, or breaks, this block.
test('loadPolicy does not read router_decision, so a broken block cannot refuse a kernel answer', () => {
  const policy = loadedPolicyJson();
  policy['router_decision'] = { modes: 'nope' };
  const dir = rootWith(policy);
  try {
    assert.equal(loadPolicy(dir).risk.aggregation, 'max');
    assert.throws(() => loadRouterDecisionPolicy(dir), KernelError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const malformed: [string, (policy: Record<string, unknown>) => void, string][] = [
  ['a missing router_decision block', (p) => { delete p['router_decision']; }, '.router_decision must be an object'],
  ['a mode outside the vocabulary', (p) => { record(p, 'router_decision')['modes'] = ['keyword', 'regex']; }, '.router_decision.modes[1] must be one of keyword|llm|jev'],
  ['an empty mode list', (p) => { const d = record(p, 'router_decision'); d['modes'] = []; d['restrictiveness'] = ['auto']; }, '.router_decision.modes must not be empty'],
  ['a repeated mode', (p) => { record(p, 'router_decision')['modes'] = ['keyword', 'keyword']; }, '.router_decision.modes must not repeat a mode'],
  ['a restrictiveness order that drops a mode', (p) => { record(p, 'router_decision')['restrictiveness'] = ['keyword', 'llm', 'auto']; }, '.router_decision.restrictiveness must order every mode plus auto exactly once'],
  ['a restrictiveness order without auto', (p) => { record(p, 'router_decision')['restrictiveness'] = ['keyword', 'llm', 'jev', 'jev']; }, '.router_decision.restrictiveness must order every mode plus auto exactly once'],
  ['a restrictiveness entry outside the vocabulary', (p) => { record(p, 'router_decision')['restrictiveness'] = ['keyword', 'llm', 'jev', 'always']; }, '.router_decision.restrictiveness[3] must be one of keyword|llm|jev|auto'],
  ['an absent default', (p) => { delete record(p, 'router_decision')['default']; }, '.router_decision.default must be null or one of keyword|llm|jev'],
  ['a default that is auto', (p) => { record(p, 'router_decision')['default'] = 'auto'; }, '.router_decision.default must be null or one of keyword|llm|jev'],
  ['a hand-set default with no provenance', (p) => { record(p, 'router_decision')['default'] = 'jev'; }, '.router_decision.default is set by a golden-set run, never by hand: default_written_by must record it'],
  ['an absent default_written_by', (p) => { delete record(p, 'router_decision')['default_written_by']; }, '.router_decision.default_written_by must be null or an object'],
  ['provenance for a run that set no default', (p) => { record(p, 'router_decision')['default_written_by'] = provenance({ keyword: scores() }); }, '.router_decision.default_written_by records a run that set no default'],
  ['provenance that never scored the default', (p) => { const d = record(p, 'router_decision'); d['default'] = 'jev'; d['default_written_by'] = provenance({ keyword: scores() }); }, '.router_decision.default_written_by.scores must score the default mode "jev"'],
  ['provenance scoring an unknown mode', (p) => { const d = record(p, 'router_decision'); d['default'] = 'jev'; d['default_written_by'] = provenance({ jev: scores(), auto: scores() }); }, '.router_decision.default_written_by.scores has a key "auto" that is not one of keyword|llm|jev'],
  ['a score above 1', (p) => { const d = record(p, 'router_decision'); d['default'] = 'jev'; d['default_written_by'] = provenance({ jev: { ...scores(), intent_accuracy: 1.2 } }); }, '.router_decision.default_written_by.scores.jev.intent_accuracy must be between 0 and 1'],
  ['a negative p95', (p) => { const d = record(p, 'router_decision'); d['default'] = 'jev'; d['default_written_by'] = provenance({ jev: { ...scores(), p95_ms: -1 } }); }, '.router_decision.default_written_by.scores.jev.p95_ms must not be negative'],
  ['provenance without a date', (p) => { const d = record(p, 'router_decision'); d['default'] = 'jev'; d['default_written_by'] = { golden_set: 'evals/router-golden/cases.jsonl', scores: { jev: scores() } }; }, '.router_decision.default_written_by.date must be a string'],
  ['a min_confidence above 1', (p) => { record(p, 'router_decision')['min_confidence'] = 1.5; }, '.router_decision.min_confidence must be between 0 and 1'],
  ['a negative tie_margin', (p) => { record(p, 'router_decision')['tie_margin'] = -0.1; }, '.router_decision.tie_margin must be between 0 and 1'],
  ['a missing jev block', (p) => { delete record(p, 'router_decision')['jev']; }, '.router_decision.jev must be an object'],
  ['a fractional jev budget', (p) => { record(record(p, 'router_decision'), 'jev')['budget_ms'] = 400.5; }, '.router_decision.jev.budget_ms must be a positive integer'],
  ['a zero jev budget', (p) => { record(record(p, 'router_decision'), 'jev')['budget_ms'] = 0; }, '.router_decision.jev.budget_ms must be a positive integer'],
  ['an empty key_env', (p) => { record(record(p, 'router_decision'), 'jev')['key_env'] = ''; }, '.router_decision.jev.key_env must not be empty'],
  ['an empty state_fields list', (p) => { record(p, 'router_decision')['state_fields'] = []; }, '.router_decision.state_fields must not be empty'],
];

for (const [name, breakIt, detail] of malformed) {
  test(`loadRouterDecisionPolicy refuses ${name}`, () => {
    const policy = basePolicy();
    breakIt(policy);
    const dir = rootWith(policy);
    try {
      assert.throws(() => loadRouterDecisionPolicy(dir), kernelError(`registries/policy.json: ${detail}`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the minimal valid block loads, so the refusals above are about the break', () => {
  const dir = rootWith(basePolicy());
  try {
    assert.equal(loadRouterDecisionPolicy(dir).default, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a default written by a golden-set run loads with its provenance', () => {
  const policy = basePolicy();
  const decision = record(policy, 'router_decision');
  decision['default'] = 'jev';
  decision['default_written_by'] = provenance({ keyword: scores(), jev: scores() });
  const dir = rootWith(policy);
  try {
    const loaded = loadRouterDecisionPolicy(dir);
    assert.equal(loaded.default, 'jev');
    assert.equal(loaded.default_written_by?.golden_set, 'evals/router-golden/cases.jsonl');
    assert.deepEqual(loaded.default_written_by?.scores.jev, scores());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the restrictiveness order is a permutation, not a fixed sequence', () => {
  const policy = basePolicy();
  record(policy, 'router_decision')['restrictiveness'] = ['auto', 'jev', 'llm', 'keyword'];
  const dir = rootWith(policy);
  try {
    assert.deepEqual(loadRouterDecisionPolicy(dir).restrictiveness, ['auto', 'jev', 'llm', 'keyword']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Only the block this loader reads: the rest of policy.json is loadPolicy's.
function basePolicy(): Record<string, unknown> {
  return {
    router_decision: {
      modes: ['keyword', 'llm', 'jev'],
      restrictiveness: ['keyword', 'llm', 'jev', 'auto'],
      default: null,
      default_written_by: null,
      min_confidence: 0.6,
      tie_margin: 0.15,
      jev: { endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', budget_ms: 400, key_env: 'TYPESAFE_API_KEY' },
      state_fields: ['prompt', 'languages', 'frameworks', 'files_named'],
    },
  };
}

function loadedPolicyJson(): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'));
  if (!isRecord(raw)) throw new Error('registries/policy.json is not an object');
  return raw;
}

function provenance(byMode: Record<string, unknown>): Record<string, unknown> {
  return { date: '2026-10-20', golden_set: 'evals/router-golden/cases.jsonl', scores: byMode };
}

function scores(): { intent_accuracy: number; stack_correctness: number; p95_ms: number; fallback_rate: number } {
  return { intent_accuracy: 0.9, stack_correctness: 1, p95_ms: 310, fallback_rate: 0.02 };
}

function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`fixture ${key} is not an object`);
  return value;
}

function rootWith(policy: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-router-decision-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'policy.json'), JSON.stringify(policy), 'utf8');
  return dir;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
