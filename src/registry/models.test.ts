import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { loadModels } from './models';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads the shipped tiers, their escalation and the work types', () => {
  const r = loadModels(root);
  assert.notEqual(r.version, '');
  assert.deepEqual(r.escalation_order, ['cheap', 'build', 'design', 'most-capable']);
  const top = r.tiers.find((t) => t.id === 'most-capable');
  const build = r.tiers.find((t) => t.id === 'build');
  if (top === undefined || build === undefined) throw new Error('a shipped tier is missing from the registry');
  assert.equal(top.escalates_to, null, 'the top of the ladder escalates nowhere');
  assert.equal(build.escalates_to, 'design');
  const adr = r.work_types.find((w) => w.id === 'adr');
  if (adr === undefined) throw new Error('the adr work type is missing from the registry');
  assert.equal(adr.tier, 'most-capable');
  assert.notEqual(adr.title, '');
});

test('every shipped work type resolves to a defined tier', () => {
  const r = loadModels(root);
  const ids = new Set(r.tiers.map((t) => t.id));
  for (const work of r.work_types) assert.ok(ids.has(work.tier), `work type ${work.id}`);
  for (const tier of r.tiers) {
    if (tier.escalates_to !== null) assert.ok(ids.has(tier.escalates_to), `tier ${tier.id}`);
  }
});

test('a tier row without its model is refused, never defaulted', () => {
  const dir = rootWith({ version: '1.0.0', tiers: [{ id: 'build' }], escalation_order: [], work_types: [] });
  assert.match(refusal(dir), /tiers\[0\]\.model/);
});

test('a work type without its tier is refused', () => {
  const dir = rootWith({
    version: '1.0.0',
    tiers: [{ id: 'build', model: 'opus', escalates_to: null }],
    escalation_order: ['build'],
    work_types: [{ id: 'build', title: 'Writing code' }],
  });
  assert.match(refusal(dir), /work_types\[0\]\.tier/);
});

test('a non-string escalation target is refused', () => {
  const dir = rootWith({
    version: '1.0.0',
    tiers: [{ id: 'build', model: 'opus', escalates_to: 7 }],
    escalation_order: ['build'],
    work_types: [],
  });
  assert.match(refusal(dir), /tiers\[0\]\.escalates_to/);
});

test('a non-object row and a non-array section are refused', () => {
  assert.match(
    refusal(rootWith({ version: '1.0.0', tiers: ['build'], escalation_order: [], work_types: [] })),
    /tiers\[0\] must be an object/,
  );
  assert.match(
    refusal(rootWith({ version: '1.0.0', tiers: {}, escalation_order: [], work_types: [] })),
    /tiers must be an array/,
  );
});

test('an absent escalates_to reads as null, like the key holding null', () => {
  const dir = rootWith({
    version: '1.0.0',
    tiers: [{ id: 'top', model: 'fable' }],
    escalation_order: ['top'],
    work_types: [{ id: 'spec', title: 'Spec', tier: 'top' }],
  });
  assert.equal(loadModels(dir).tiers[0]?.escalates_to, null);
});

function rootWith(models: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'eos-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'models.json'), JSON.stringify(models));
  return dir;
}

function refusal(dir: string): string {
  try {
    loadModels(dir);
  } catch (e) {
    if (e instanceof KernelError) return e.message;
    throw e;
  }
  throw new Error('expected a KernelError, the loader accepted the row');
}
