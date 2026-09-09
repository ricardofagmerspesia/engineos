import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { loadIntents } from './intents';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads every shipped intent with its signals', () => {
  const r = loadIntents(root);
  assert.notEqual(r.version, '');
  assert.ok(r.intents.length > 0);
  for (const intent of r.intents) {
    assert.notEqual(intent.id, '', 'every row carries an id');
    assert.ok(intent.signals.length > 0, `intent ${intent.id} carries no signal`);
  }
});

test('parses the fields the kernel reads, including the routing foreign key', () => {
  const backend = loadIntents(root).intents.find((i) => i.id === 'backend');
  if (backend === undefined) throw new Error('the backend intent is missing from the registry');
  assert.equal(backend.domain, 'backend');
  assert.equal(backend.risk_floor, 'medium');
  assert.equal(backend.model_tier, 'build');
  assert.ok(backend.signals.includes('NestJS'));
  assert.equal(typeof backend.note, 'string');
});

test('a row without a domain or a floor answers null, never a guess', () => {
  const retro = loadIntents(root).intents.find((i) => i.id === 'retro');
  if (retro === undefined) throw new Error('the retro intent is missing from the registry');
  assert.equal(retro.domain, null);
  assert.equal(retro.risk_floor, null);
});

test('the suppression fields the escalate composite reads are parsed', () => {
  const rows = loadIntents(root).intents;
  const mobile = rows.find((i) => i.id === 'mobile');
  if (mobile === undefined) throw new Error('the mobile intent is missing from the registry');
  assert.deepEqual(mobile.suppressed_by, ['ios-release', 'android-release']);
  assert.equal(mobile.suppressible, false);
  assert.equal(mobile.requires_dispatch_plan, false);

  const newFeature = rows.find((i) => i.id === 'new-feature');
  if (newFeature === undefined) throw new Error('the new-feature intent is missing from the registry');
  assert.equal(newFeature.suppressible, true);

  const bigSweep = rows.find((i) => i.id === 'big-sweep');
  if (bigSweep === undefined) throw new Error('the big-sweep intent is missing from the registry');
  assert.equal(bigSweep.requires_dispatch_plan, true);
});

// The registry writes these three as `true` or omits them, so the loader owns
// the defaulting the bash arm spelled as `== true` / `// []` at its one reader.
// A row that answered null would push that coercion back to every call site.
test('an absent suppression field defaults, and a non-true value never reads as set', () => {
  const rows = loadIntents(root).intents;
  const plain = rows.find((i) => i.id === 'backend');
  if (plain === undefined) throw new Error('the backend intent is missing from the registry');
  assert.equal(plain.suppressible, false);
  assert.deepEqual(plain.suppressed_by, []);
  assert.equal(plain.requires_dispatch_plan, false);

  for (const row of rows) {
    assert.equal(typeof row.suppressible, 'boolean', `intent ${row.id}`);
    assert.equal(typeof row.requires_dispatch_plan, 'boolean', `intent ${row.id}`);
    assert.ok(Array.isArray(row.suppressed_by), `intent ${row.id}`);
  }
});

// The audit's finding: an empty or malformed intents.json used to load as zero
// intents, so every intent-driven answer — matched intents, rules to load, risk
// floor, agents — came back empty with exit 0 and nothing said why.
test('an empty intents registry is refused, never answered with no intents', () => {
  assert.match(refusal(rootWith({})), /^registries\/intents\.json: /);
});

test('an intents registry that is not an object is refused', () => {
  assert.match(refusal(rootWith([])), /registries\/intents\.json: the document must be an object/);
});

test('an empty intent list is refused: it matches nothing', () => {
  assert.match(refusal(rootWith({ version: '1.0.0', intents: [] })), /\.intents must not be empty/);
});

test('a row without an id is refused, never given the empty id', () => {
  const dir = rootWith({ version: '1.0.0', intents: [{ title: 'Backend', signals: ['NestJS'] }] });
  assert.match(refusal(dir), /\.intents\[0\]\.id must be a string/);
});

test('a row with no signal is refused: it can never match', () => {
  const dir = rootWith({ version: '1.0.0', intents: [{ id: 'backend', title: 'Backend', signals: [] }] });
  assert.match(refusal(dir), /\.intents\[0\]\.signals must not be empty/);
});

// A floor outside the vocabulary used to read as "no floor", which is the one
// answer a risk floor must never silently become.
test('a risk floor outside the vocabulary is refused, not read as absent', () => {
  const dir = rootWith({ version: '1.0.0', intents: [row({ risk_floor: 'urgent' })] });
  assert.match(refusal(dir), /\.intents\[0\]\.risk_floor must be low, medium or high/);
});

test('a non-boolean suppression flag is refused, not coerced to false', () => {
  assert.match(
    refusal(rootWith({ version: '1.0.0', intents: [row({ suppressible: 'yes' })] })),
    /\.intents\[0\]\.suppressible must be a boolean/,
  );
  assert.match(
    refusal(rootWith({ version: '1.0.0', intents: [row({ requires_dispatch_plan: 1 })] })),
    /\.intents\[0\]\.requires_dispatch_plan must be a boolean/,
  );
});

test('a missing version and a non-array intents key are refused', () => {
  assert.match(refusal(rootWith({ intents: [row()] })), /\.version must be a string/);
  assert.match(refusal(rootWith({ version: '1.0.0', intents: {} })), /\.intents must be an array of objects/);
});

// Absent and null stay the same answer, so a minimal row still loads.
test('a minimal row loads with every optional field defaulted', () => {
  const loaded = loadIntents(rootWith({ version: '1.0.0', intents: [row()] })).intents[0];
  assert.equal(loaded?.risk_floor, null);
  assert.equal(loaded?.domain, null);
  assert.equal(loaded?.model_tier, null);
  assert.equal(loaded?.note, null);
  assert.equal(loaded?.suppressible, false);
  assert.equal(loaded?.requires_dispatch_plan, false);
  assert.deepEqual(loaded?.suppressed_by, []);
  assert.deepEqual(loaded?.rules, []);
});

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'backend', title: 'Backend work', signals: ['NestJS'], ...over };
}

function rootWith(intents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'eos-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'intents.json'), JSON.stringify(intents));
  return dir;
}

function refusal(dir: string): string {
  try {
    loadIntents(dir);
  } catch (e) {
    if (e instanceof KernelError) return e.message;
    throw e;
  }
  throw new Error('expected a KernelError, the loader accepted the registry');
}
