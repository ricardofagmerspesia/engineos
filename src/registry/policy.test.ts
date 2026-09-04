import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { loadPolicy } from './policy';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);

test('the shipped policy registry loads with every field the kernel reads', () => {
  const policy = loadPolicy(root);
  assert.equal(typeof policy.version, 'string');
  assert.equal(policy.risk.aggregation, 'max');
  assert.deepEqual(
    policy.risk.inputs.map((input) => input.id),
    ['reversibility', 'blast-radius', 'data-sensitivity', 'contract-surface', 'spend'],
  );
  assert.ok(policy.risk.high_floors.includes('payments'));
  assert.deepEqual(policy.repair.checks, ['lint', 'typecheck', 'test', 'build', 'startup']);
  assert.equal(policy.repair.max_fix_attempts_per_check, 2);
  assert.equal(policy.repair.escalations, 1);
  assert.ok(policy.repair.never_repair.includes('weaken-the-check'));
  assert.deepEqual(
    policy.repair.by_situation.map((row) => row.situation),
    ['red', 'infra', 'flaky'],
  );
  assert.deepEqual(
    policy.autonomy.levels.map((level) => level.id),
    ['A0', 'A1', 'A2', 'A3', 'A4'],
  );
  assert.deepEqual(policy.autonomy.ceiling_by_risk, { low: 'A2', medium: 'A3', high: 'A3' });
  assert.equal(policy.autonomy.high_with_thin_evidence, 'A1');
  assert.ok(policy.retry.never_retry.includes('security-risk'));
  assert.equal(policy.gates.by_risk.high['validation'], 'required-plus-critic');
  assert.deepEqual(policy.gates.spec_threshold, { files_greater_than: 2, or_any_new_feature: true });
});

test('gate statuses keep the registry key order they are emitted in', () => {
  assert.deepEqual(Object.keys(loadPolicy(root).gates.by_risk.low), [
    'discovery',
    'design',
    'implementation',
    'validation',
    'release',
  ]);
});

// A registry whose answers are gates cannot be read leniently: a defaulted
// field would answer for a file that says nothing.
const malformed: [string, (policy: Record<string, unknown>) => void, string][] = [
  ['a missing risk block', (p) => { delete p['risk']; }, '.risk must be an object'],
  ['a non-string aggregation', (p) => { record(p, 'risk')['aggregation'] = 7; }, '.risk.aggregation must be a string'],
  ['an input row without an id', (p) => { record(p, 'risk')['inputs'] = [{}]; }, '.risk.inputs[0].id must be a string'],
  ['a non-array high_floors', (p) => { record(p, 'risk')['high_floors'] = 'payments'; }, '.risk.high_floors must be an array of strings'],
  ['a non-numeric fix bound', (p) => { record(p, 'repair')['max_fix_attempts_per_check'] = '2'; }, '.repair.max_fix_attempts_per_check must be a number'],
  ['a situation row without a response', (p) => { record(p, 'repair')['by_situation'] = [{ situation: 'infra' }]; }, '.repair.by_situation[0].response must be a string'],
  ['a ceiling map missing the high tier', (p) => { record(record(p, 'autonomy'), 'ceiling_by_risk')['high'] = null; }, '.autonomy.ceiling_by_risk.high must be a string'],
  ['a missing retry block', (p) => { delete p['retry']; }, '.retry must be an object'],
  ['a gate status that is not a string', (p) => { record(record(p, 'gates'), 'by_risk')['medium'] = { validation: 3 }; }, '.gates.by_risk.medium.validation must be a string'],
  ['a spec threshold that is not a count', (p) => { record(record(p, 'gates'), 'spec_threshold')['files_greater_than'] = 'two'; }, '.gates.spec_threshold.files_greater_than must be a number'],
];

for (const [name, breakIt, detail] of malformed) {
  test(`loadPolicy refuses ${name}`, () => {
    const policy = basePolicy();
    breakIt(policy);
    const dir = rootWith(policy);
    try {
      assert.throws(() => loadPolicy(dir), kernelError(`registries/policy.json: ${detail}`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the minimal valid fixture loads, so the refusals above are about the break', () => {
  const dir = rootWith(basePolicy());
  try {
    assert.equal(loadPolicy(dir).risk.aggregation, 'max');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function basePolicy(): Record<string, unknown> {
  return {
    version: '1.6.0',
    risk: {
      aggregation: 'max',
      inputs: [{ id: 'reversibility' }],
      high_floors: ['payments'],
    },
    repair: {
      checks: ['lint'],
      max_fix_attempts_per_check: 2,
      escalations: 1,
      by_situation: [{ situation: 'infra', response: 'report-tooling-gap-no-attempt-consumed' }],
      never_repair: ['weaken-the-check'],
    },
    autonomy: {
      levels: [{ id: 'A0' }],
      ceiling_by_risk: { low: 'A2', medium: 'A3', high: 'A3' },
      high_with_thin_evidence: 'A1',
    },
    retry: { never_retry: ['security-risk'] },
    gates: {
      by_risk: {
        low: { validation: 'required' },
        medium: { validation: 'required' },
        high: { validation: 'required-plus-critic' },
      },
      spec_threshold: { files_greater_than: 2, or_any_new_feature: true },
    },
  };
}

// The fixture is built fresh per case, so a nested block can be reached and
// mutated in place once it is known to be a record.
function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`fixture ${key} is not an object`);
  return value;
}

function rootWith(policy: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-policy-'));
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
