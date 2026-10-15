import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { loadDecisionRules } from './decision-rules';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);

test('the shipped decision registry loads with every field the kernel reads', () => {
  const registry = loadDecisionRules(root);
  assert.equal(typeof registry.version, 'string');
  assert.ok(registry.precedence.length > 0);
  assert.ok(registry.conflict_policy.length > 0);
  assert.ok(registry.rules.length > 0);
  for (const rule of registry.rules) {
    assert.notEqual(rule.id, '', 'every rule carries an id');
    assert.equal(typeof rule.priority, 'number');
    assert.notEqual(rule.source, '', `rule ${rule.id} carries no source`);
  }
});

test('a rule projects its outcome exactly as the keyword tier reports it', () => {
  const rule = ruleNamed('rule-destructive-ddl');
  assert.equal(rule.priority, 100);
  assert.equal(rule.risk, 'high');
  assert.equal(rule.gate, null);
  assert.equal(rule.prefer, null);
  assert.ok(rule.require.includes('two-phase-deploy'));
  assert.ok(rule.signals.includes('\\btruncate\\b'));
});

test('prefer is a single value, not a list — resolve-task collects one per rule', () => {
  assert.equal(ruleNamed('rule-volatile-knowledge').prefer, 'retrieval-over-fine-tuning');
});

test('a model-only rule loads with no signals rather than being refused', () => {
  const rule = ruleNamed('rule-change-record');
  assert.deepEqual(rule.signals, []);
  assert.deepEqual(rule.when, { code_changed: true });
});

// A registry whose answers are gates cannot be read leniently: a defaulted
// field would answer for a file that says nothing.
const malformed: [string, (registry: Record<string, unknown>) => void, string][] = [
  ['a missing version', (d) => { delete d['version']; }, '.version must be a string'],
  ['a precedence that is not a list', (d) => { d['precedence'] = 'security first'; }, '.precedence must be an array of strings'],
  ['a missing conflict policy', (d) => { delete d['conflict_policy']; }, '.conflict_policy must be a string'],
  ['a missing rules array', (d) => { delete d['rules']; }, '.rules must be an array of objects'],
  ['a rule that is not an object', (d) => { d['rules'] = ['rule-x']; }, '.rules[0] must be an object'],
  ['a rule without an id', (d) => { delete firstRule(d)['id']; }, '.rules[0].id must be a string'],
  ['a non-numeric priority', (d) => { firstRule(d)['priority'] = '80'; }, '.rules[0].priority must be a number'],
  ['a rule without a source', (d) => { delete firstRule(d)['source']; }, '.rules[0].source must be a string'],
  ['a rule without a when block', (d) => { delete firstRule(d)['when']; }, '.rules[0].when must be an object'],
  ['a rule without a then block', (d) => { delete firstRule(d)['then']; }, '.rules[0].then must be an object'],
  ['a require that is not a list', (d) => { record(firstRule(d), 'then')['require'] = 'spec'; }, '.rules[0].then.require must be an array of strings'],
  ['a require entry that is not a string', (d) => { record(firstRule(d), 'then')['require'] = [7]; }, '.rules[0].then.require[0] must be a string'],
  ['a gate that is not a string', (d) => { record(firstRule(d), 'then')['gate'] = ['design']; }, '.rules[0].then.gate must be a string'],
  ['a risk that is not a string', (d) => { record(firstRule(d), 'then')['risk'] = true; }, '.rules[0].then.risk must be a string'],
  ['a prefer that is not a string', (d) => { record(firstRule(d), 'then')['prefer'] = ['rag']; }, '.rules[0].then.prefer must be a string'],
  ['a signals field that is not a list', (d) => { firstRule(d)['signals'] = '\\bx\\b'; }, '.rules[0].signals must be an array of strings'],
  ['a signal that is not a string', (d) => { firstRule(d)['signals'] = [7]; }, '.rules[0].signals[0] must be a string'],
];

for (const [name, breakIt, detail] of malformed) {
  test(`loadDecisionRules refuses ${name}`, () => {
    const registry = baseRegistry();
    breakIt(registry);
    const dir = rootWith(registry);
    try {
      assert.throws(
        () => loadDecisionRules(dir),
        kernelError(`registries/decision-rules.json: ${detail}`),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('an absent gate, risk, prefer or signals list is read the way jq read it', () => {
  const registry = baseRegistry();
  record(firstRule(registry), 'then')['gate'] = null;
  delete firstRule(registry)['signals'];
  const dir = rootWith(registry);
  try {
    const rule = loadDecisionRules(dir).rules[0];
    if (rule === undefined) throw new Error('the fixture rule is missing');
    assert.equal(rule.then.gate, null);
    assert.equal(rule.then.risk, null);
    assert.equal(rule.then.prefer, null);
    assert.deepEqual(rule.signals, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the minimal valid fixture loads, so the refusals above are about the break', () => {
  const dir = rootWith(baseRegistry());
  try {
    assert.equal(loadDecisionRules(dir).rules.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function ruleNamed(id: string): {
  priority: number;
  risk: string | null;
  gate: string | null;
  prefer: string | null;
  require: string[];
  signals: string[];
  when: Record<string, unknown>;
} {
  const rule = loadDecisionRules(root).rules.find((row) => row.id === id);
  if (rule === undefined) throw new Error(`${id} is missing from registries/decision-rules.json`);
  return { ...rule.then, priority: rule.priority, signals: rule.signals, when: rule.when };
}

function baseRegistry(): Record<string, unknown> {
  return {
    version: '1.0.0',
    precedence: ['security and compliance'],
    conflict_policy: 'the more specific and higher-risk rule wins',
    rules: [
      {
        id: 'rule-x',
        priority: 80,
        source: 'rules/base.md',
        when: { code_changed: true },
        then: { require: ['spec'], gate: 'design' },
        signals: ['\\bx\\b'],
      },
    ],
  };
}

// The fixture is built fresh per case, so a nested block can be reached and
// mutated in place once it is known to be a record.
function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`fixture ${key} is not an object`);
  return value;
}

function firstRule(registry: Record<string, unknown>): Record<string, unknown> {
  const rules = registry['rules'];
  if (!Array.isArray(rules)) throw new Error('fixture rules is not an array');
  const first = rules[0];
  if (!isRecord(first)) throw new Error('fixture rules[0] is not an object');
  return first;
}

function rootWith(registry: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-decision-rules-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'decision-rules.json'), JSON.stringify(registry), 'utf8');
  return dir;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}

// A judge fact adds a rule when its probability reaches the cut (contracts
// §6.3); a rule the judge never scored reads as 0, so a zero cut would add it
// on every prompt.
const judgeFieldRefusals: [string, Record<string, unknown>, string][] = [
  ['a zero judge threshold', { judge_fact: 'large_change', judge_threshold: 0 }, '.rules[0].judge_threshold must be greater than 0 and at most 1'],
  ['a judge threshold above one', { judge_fact: 'large_change', judge_threshold: 1.2 }, '.rules[0].judge_threshold must be greater than 0 and at most 1'],
  ['a judge threshold with no judge fact', { judge_threshold: 0.5 }, '.rules[0].judge_threshold requires a judge_fact'],
  ['a judge fact that is not a lower-case identifier', { judge_fact: 'Large-Change' }, '.rules[0].judge_fact must be a lower-case identifier'],
  ['a non-numeric judge threshold', { judge_fact: 'large_change', judge_threshold: '0.5' }, '.rules[0].judge_threshold must be a number'],
];

for (const [name, fields, detail] of judgeFieldRefusals) {
  test(`loadDecisionRules refuses ${name}`, () => {
    const registry = baseRegistry();
    Object.assign(firstRule(registry), fields);
    const dir = rootWith(registry);
    try {
      assert.throws(() => loadDecisionRules(dir), kernelError(`registries/decision-rules.json: ${detail}`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('a judge fact with or without its own threshold loads; an absent fact reads as null', () => {
  const registry = baseRegistry();
  Object.assign(firstRule(registry), { judge_fact: 'large_change', judge_threshold: 0.7 });
  const dir = rootWith(registry);
  try {
    const rule = loadDecisionRules(dir).rules[0];
    assert.equal(rule?.judge_fact, 'large_change');
    assert.equal(rule?.judge_threshold, 0.7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const plain = rootWith(baseRegistry());
  try {
    const rule = loadDecisionRules(plain).rules[0];
    assert.equal(rule?.judge_fact, null);
    assert.equal(rule?.judge_threshold, null);
  } finally {
    rmSync(plain, { recursive: true, force: true });
  }
});
