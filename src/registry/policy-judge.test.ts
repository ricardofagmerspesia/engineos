import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { parseJudge } from './policy-judge';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);
const SCOPES: readonly string[] = ['provider', 'mcp', 'tool', 'agent'];

// A fresh, mutable copy of a registry's judge block per case.
function judgeBlockOf(policyPath: string): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (!isRecord(raw) || !isRecord(raw['judge'])) throw new Error(`${policyPath} carries no judge block`);
  return raw['judge'];
}

function shippedBlock(): Record<string, unknown> {
  return judgeBlockOf(join(root, 'registries', 'policy.json'));
}

function child(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`judge block ${key} is not an object`);
  return value;
}

function patternRows(block: Record<string, unknown>): Record<string, unknown>[] {
  const rows = child(block, 'redaction')['patterns'];
  if (!Array.isArray(rows)) throw new Error('judge.redaction.patterns is not an array');
  return rows.filter(isRecord);
}

function firstPattern(block: Record<string, unknown>): Record<string, unknown> {
  const row = patternRows(block)[0];
  if (row === undefined) throw new Error('judge.redaction.patterns is empty');
  return row;
}

function refusal(block: Record<string, unknown>): string {
  try {
    parseJudge(block, SCOPES);
  } catch (error: unknown) {
    if (!(error instanceof KernelError)) throw error;
    return error.message;
  }
  throw new Error('parseJudge accepted a block it should refuse');
}

function refusedWith(breakIt: (block: Record<string, unknown>) => void, detail: string): void {
  const block = shippedBlock();
  breakIt(block);
  assert.equal(refusal(block), `registries/policy.json: ${detail}`);
}

test('the shipped judge block loads with the pinned switch, key name and cap', () => {
  const judge = parseJudge(shippedBlock(), SCOPES);

  assert.equal(judge.enabled_env, 'ENGINEOS_JUDGE');
  assert.equal(judge.enabled_value, 'jev');
  assert.equal(judge.key_env, 'TYPESAFE_API_KEY');
  assert.equal(judge.endpoint, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(judge.retries, 0);
  assert.ok(judge.max_state_bytes <= 16_384);
  assert.equal(judge.redaction.patterns.length, 27);
  assert.equal(judge.redaction.patterns[0]?.kind, 'private-key-block');
});

test('the legacy-kernel fixture judge block loads too', () => {
  const block = judgeBlockOf(join(root, 'test', 'fixtures', 'legacy-kernel', 'registries', 'policy.json'));

  assert.equal(parseJudge(block, SCOPES).key_env, 'TYPESAFE_API_KEY');
});

// E2 pins: the registry cannot choose which secret is sent, what turns the
// judge on, or how much of the prompt leaves the machine.
test('a different key variable name is refused', () => {
  refusedWith((block) => { block['key_env'] = 'OPENAI_API_KEY'; }, '.judge.key_env must be TYPESAFE_API_KEY');
});

test('a different opt-in variable is refused', () => {
  refusedWith((block) => { block['enabled_env'] = 'CI'; }, '.judge.enabled_env must be ENGINEOS_JUDGE');
});

test('a different opt-in value is refused', () => {
  refusedWith((block) => { block['enabled_value'] = 'true'; }, '.judge.enabled_value must be jev');
});

test('a state cap one byte over 16384 is refused, and the cap itself is accepted', () => {
  refusedWith((block) => { block['max_state_bytes'] = 16_385; }, '.judge.max_state_bytes must be at most 16384');

  const block = shippedBlock();
  block['max_state_bytes'] = 16_384;
  assert.equal(parseJudge(block, SCOPES).max_state_bytes, 16_384);
});

test('a lowered state cap is accepted', () => {
  const block = shippedBlock();
  block['max_state_bytes'] = 1_024;

  assert.equal(parseJudge(block, SCOPES).max_state_bytes, 1_024);
});

test('a retry is refused: the judge sits inside the hook budget', () => {
  refusedWith((block) => { block['retries'] = 1; }, '.judge.retries must be 0');
});

test('an unknown mode is refused', () => {
  refusedWith((block) => { block['mode'] = 'live'; }, '.judge.mode must be shadow, advisory or authoritative');
});

test('a timeout that is not a positive integer is refused', () => {
  refusedWith((block) => { block['timeout_ms'] = 0; }, '.judge.timeout_ms must be a positive integer');
  refusedWith((block) => { block['timeout_ms'] = 12.5; }, '.judge.timeout_ms must be a positive integer');
});

test('a blank provider or model is refused', () => {
  refusedWith((block) => { block['provider'] = '  '; }, '.judge.provider must not be empty');
  refusedWith((block) => { block['model'] = ''; }, '.judge.model must not be empty');
});

test('an endpoint on another host is refused', () => {
  refusedWith((block) => { block['endpoint'] = 'https://judge.example.com/v1/systemone'; }, '.judge.endpoint must be on https://api.typesafe.ai');
});

test('an endpoint on the allowed host but another port is refused', () => {
  refusedWith((block) => { block['endpoint'] = 'https://api.typesafe.ai:8443/v1/systemone'; }, '.judge.endpoint must be on https://api.typesafe.ai');
});

test('a plain-http endpoint is refused', () => {
  refusedWith((block) => { block['endpoint'] = 'http://api.typesafe.ai/v1/systemone'; }, '.judge.endpoint must use https');
});

test('an endpoint carrying credentials is refused', () => {
  const endpoint = 'https://' + 'user' + ':' + 'pw' + '@' + 'api.typesafe.ai/v1/systemone';
  refusedWith((block) => { block['endpoint'] = endpoint; }, '.judge.endpoint must not carry credentials');
});

test('an endpoint that is not an absolute URL is refused', () => {
  refusedWith((block) => { block['endpoint'] = '/v1/systemone'; }, '.judge.endpoint must be an absolute URL');
});

test('another path on the allowed origin is accepted verbatim', () => {
  const block = shippedBlock();
  block['endpoint'] = 'https://api.typesafe.ai/v2/other/path';

  assert.equal(parseJudge(block, SCOPES).endpoint, 'https://api.typesafe.ai/v2/other/path');
});

// A zero cut would qualify every intent or rule the judge never scored.
test('a zero intent_default or rule_default threshold is refused', () => {
  refusedWith((block) => { child(block, 'thresholds')['intent_default'] = 0; }, '.judge.thresholds.intent_default must be greater than 0 and at most 1');
  refusedWith((block) => { child(block, 'thresholds')['rule_default'] = 0; }, '.judge.thresholds.rule_default must be greater than 0 and at most 1');
});

test('a threshold above 1 is refused', () => {
  refusedWith((block) => { child(block, 'thresholds')['intent_default'] = 1.01; }, '.judge.thresholds.intent_default must be greater than 0 and at most 1');
  refusedWith((block) => { child(block, 'thresholds')['primary_confidence'] = 1.1; }, '.judge.thresholds.primary_confidence must be between 0 and 1');
  refusedWith((block) => { child(block, 'thresholds')['margin'] = -0.1; }, '.judge.thresholds.margin must be between 0 and 1');
});

test('zero is legal for primary_confidence and margin, which compare scores that exist', () => {
  const block = shippedBlock();
  child(block, 'thresholds')['primary_confidence'] = 0;
  child(block, 'thresholds')['margin'] = 0;

  const thresholds = parseJudge(block, SCOPES).thresholds;

  assert.equal(thresholds.primary_confidence, 0);
  assert.equal(thresholds.margin, 0);
});

test('a breaker scope outside the declared scopes is refused', () => {
  refusedWith((block) => { child(block, 'breaker')['scope'] = 'cluster'; }, '.judge.breaker.scope must be one of .breaker.scopes');
});

test('a breaker state file that is not a bare file name is refused', () => {
  refusedWith((block) => { child(block, 'breaker')['state_file'] = '../escape.json'; }, '.judge.breaker.state_file must be a bare file name');
  refusedWith((block) => { child(block, 'breaker')['state_file'] = 'dir/file.json'; }, '.judge.breaker.state_file must be a bare file name');
});

test('an empty redaction list is refused', () => {
  refusedWith((block) => { child(block, 'redaction')['patterns'] = []; }, '.judge.redaction.patterns must not be empty');
});

test('a redaction kind that is not a lower-case slug is refused', () => {
  refusedWith((block) => { firstPattern(block)['kind'] = 'Private Key'; }, '.judge.redaction.patterns[0].kind must be a lower-case slug');
});

test('a redaction pattern that does not compile is refused', () => {
  refusedWith((block) => { firstPattern(block)['pattern'] = '(unclosed'; }, '.judge.redaction.patterns[0].pattern does not compile as a regular expression');
});

const nonLinear: [string, string][] = [
  ['a*', 'unbounded-quantifier'],
  ['a+', 'unbounded-quantifier'],
  ['a{1,}', 'unbounded-quantifier'],
  ['a{12,}', 'unbounded-quantifier'],
  ['a{1234567,}', 'unbounded-quantifier'],
  ['(?:a|a){1,28}b', 'quantified-ambiguous-group'],
  ['(a{1,2}){1,2}', 'quantified-ambiguous-group'],
  ['(?<n>a|b)?', 'quantified-ambiguous-group'],
  ['(?:a{2})?', 'quantified-ambiguous-group'],
];

for (const [pattern, shape] of nonLinear) {
  test(`a redaction pattern ${pattern} is refused as ${shape}`, () => {
    refusedWith((block) => { firstPattern(block)['pattern'] = pattern; }, `.judge.redaction.patterns[0].pattern is not linear-time (${shape})`);
  });
}

// These pass the shape test and then meet the hash pin: the refusal is the
// pin, not linearity, which shows the shape test accepted them.
const linearButUnpinned: string[] = ['[|+*]{1,4}', 'ab|cd', '(?:ab|cd)x', '[a-z]{2,8}'];

for (const pattern of linearButUnpinned) {
  test(`a linear pattern ${pattern} passes the shape test and is refused only by the pin`, () => {
    refusedWith((block) => { firstPattern(block)['pattern'] = pattern; }, '.judge.redaction.patterns differ from the list pinned in code');
  });
}

test('a one-character edit to a shipped pattern is refused by the pin', () => {
  refusedWith((block) => {
    const row = firstPattern(block);
    const pattern = row['pattern'];
    if (typeof pattern !== 'string') throw new Error('pattern is not a string');
    row['pattern'] = pattern.replace('{0,51}', '{0,50}');
  }, '.judge.redaction.patterns differ from the list pinned in code');
});

test('a reordered redaction list is refused by the pin', () => {
  refusedWith((block) => {
    const rows = patternRows(block);
    const [first, second, ...rest] = rows;
    if (first === undefined || second === undefined) throw new Error('fewer than two patterns');
    child(block, 'redaction')['patterns'] = [second, first, ...rest];
  }, '.judge.redaction.patterns differ from the list pinned in code');
});

test('a removed redaction row is refused by the pin', () => {
  refusedWith((block) => {
    child(block, 'redaction')['patterns'] = patternRows(block).slice(1);
  }, '.judge.redaction.patterns differ from the list pinned in code');
});

test('an extra key on a redaction row is refused by the pin', () => {
  refusedWith((block) => { firstPattern(block)['note'] = 'harmless?'; }, '.judge.redaction.patterns differ from the list pinned in code');
});

test('a non-object judge block is refused', () => {
  assert.throws(() => parseJudge('judge', SCOPES), (error: unknown) => error instanceof KernelError && error.message === 'registries/policy.json: .judge must be an object');
});
