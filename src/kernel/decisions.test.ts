import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries } from './context';
import { decisionsSection } from './decisions';

const regs = lazyRegistries(resolveRoot({}, __dirname));

// --- the scripts/test-kernel.sh "decision-rules" block ---------------------

test('a destructive production prompt matches both high-risk rules', () => {
  const section = decisionsSection({ prompt: 'drop the users table in production' }, regs);
  const ids = section.matches.map((match) => match.id);
  assert.ok(ids.includes('rule-destructive-ddl'));
  assert.ok(ids.includes('rule-production-write'));
  assert.equal(section.any_high, true);
});

test('an innocuous prompt matches nothing and claims no high risk', () => {
  const section = decisionsSection({ prompt: "let's write a friendly test" }, regs);
  assert.deepEqual(section.matches, []);
  assert.equal(section.any_high, false);
});

// --- matching ---------------------------------------------------------------

test('matches come back highest priority first', () => {
  const section = decisionsSection(
    { prompt: 'rewrite the whole billing module and deploy it to production' },
    regs,
  );
  assert.deepEqual(
    section.matches.map((match) => match.id),
    ['rule-production-write', 'rule-large-change'],
  );
});

test('rules of equal priority keep registry order', () => {
  // Both are priority 100; production-write is declared first.
  assert.deepEqual(
    decisionsSection({ prompt: 'drop the users table in production' }, regs).matches.map((m) => m.id),
    ['rule-production-write', 'rule-destructive-ddl'],
  );
});

test('the prompt is matched case-insensitively, as ascii_downcase made it', () => {
  const section = decisionsSection({ prompt: 'DROP TABLE users' }, regs);
  assert.deepEqual(section.matches.map((match) => match.id), ['rule-destructive-ddl']);
  assert.equal(section.any_high, true);
});

test('a model-only rule never matches in the keyword tier', () => {
  const section = decisionsSection({ prompt: 'the risk is high and code changed' }, regs);
  const ids = section.matches.map((match) => match.id);
  assert.ok(!ids.includes('rule-change-record'));
  assert.ok(!ids.includes('rule-high-risk-critic'));
});

test('a matched rule carries the require, prefer, gate and risk resolve-task reads', () => {
  const section = decisionsSection({ prompt: 'add a rag pipeline' }, regs);
  // Two rules claim "rag" since 2026-09-11 (rule-rag-corpus-safety, priority 95,
  // ahead of volatile-knowledge); the fixture pins both so the shape of every
  // field is still what resolve-task reads.
  assert.deepEqual(section.matches, [
    {
      id: 'rule-rag-corpus-safety',
      require: ['retrieval-acl', 'pre-index-redaction'],
      prefer: null,
      gate: 'design',
      risk: null,
    },
    {
      id: 'rule-volatile-knowledge',
      require: ['retrieval-evaluation', 'freshness-policy'],
      prefer: 'retrieval-over-fine-tuning',
      gate: null,
      risk: null,
    },
  ]);
  assert.equal(section.any_high, false);
});

test('a matched non-high rule leaves any_high false', () => {
  const section = decisionsSection({ prompt: 'add a payment feature' }, regs);
  assert.deepEqual(section.matches.map((match) => match.id), ['rule-spec-threshold']);
  assert.equal(section.any_high, false);
});

test('the returned require list is a copy of the registry row', () => {
  const first = decisionsSection({ prompt: 'add a payment feature' }, regs).matches[0];
  if (first === undefined) throw new Error('rule-spec-threshold no longer matches');
  const before = [...first.require];
  first.require.push('mutated');
  const again = decisionsSection({ prompt: 'add a payment feature' }, regs).matches[0];
  if (again === undefined) throw new Error('rule-spec-threshold no longer matches');
  assert.deepEqual(again.require, before);
});

// --- malformed signals ------------------------------------------------------

test('a signal that will not compile is an error naming the rule and the signal', () => {
  const dir = rootWith({
    version: '1.0.0',
    precedence: ['security and compliance'],
    conflict_policy: 'the higher-risk rule wins',
    rules: [
      {
        id: 'rule-broken',
        priority: 10,
        source: 'fixture',
        when: {},
        then: { require: ['spec'] },
        signals: ['\\b(unclosed'],
      },
    ],
  });
  try {
    assert.throws(
      () => decisionsSection({ prompt: 'anything at all' }, lazyRegistries(dir)),
      (error: unknown): boolean => {
        if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
        assert.equal(
          error.message,
          'registries/decision-rules.json: rule rule-broken signals[0] is not a valid regex: \\b(unclosed',
        );
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Only decision-rules.json is written: lazyRegistries loads a registry when it
// is read, and this section reads exactly one.
function rootWith(registry: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-decisions-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'decision-rules.json'), JSON.stringify(registry), 'utf8');
  return dir;
}
