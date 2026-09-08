import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIntents } from './intents';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads every shipped intent with its signals', () => {
  const r = loadIntents(root);
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
