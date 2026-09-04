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
