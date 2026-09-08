import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { parseModels } from './models.js';

function tree(modelsJson: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'engineos-models-'));
  mkdirSync(path.join(root, 'registries'), { recursive: true });
  writeFileSync(path.join(root, 'registries', 'models.json'), modelsJson);
  writeFileSync(
    path.join(root, 'registries', 'agents.json'),
    JSON.stringify({
      agents: [
        { name: 'router', model_tier: 'cheap' },
        { name: 'backend-coordinator', model_tier: 'build' },
        { name: 'critic', model_tier: 'build' },
      ],
    }),
  );
  return root;
}

const MODELS = JSON.stringify({
  tiers: [
    { id: 'most-capable', model: 'fable', escalates_to: null },
    { id: 'build', model: 'opus', escalates_to: 'design' },
    { id: 'cheap', model: 'haiku', escalates_to: 'build' },
  ],
  work_types: [
    { id: 'spec', tier: 'most-capable' },
    { id: 'code', tier: 'build' },
    { id: 'lookup', tier: 'cheap' },
  ],
});

test('each tier carries its model, escalation target and work types', () => {
  const root = tree(MODELS);
  try {
    const tiers = parseModels(root);
    const build = tiers.find((tier) => tier.id === 'build');
    assert.ok(build);
    assert.equal(build.model, 'opus');
    assert.equal(build.escalatesTo, 'design');
    assert.deepEqual(build.workTypes, ['code']);

    const top = tiers.find((tier) => tier.id === 'most-capable');
    assert.equal(top?.escalatesTo, null, 'the top tier escalates to nothing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agents are back-referenced to the tier they declare', () => {
  const root = tree(MODELS);
  try {
    const tiers = parseModels(root);
    assert.deepEqual(tiers.find((tier) => tier.id === 'build')?.usedByAgents, ['backend-coordinator', 'critic']);
    assert.deepEqual(tiers.find((tier) => tier.id === 'cheap')?.usedByAgents, ['router']);
    assert.deepEqual(tiers.find((tier) => tier.id === 'most-capable')?.usedByAgents, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a malformed registry yields no tiers rather than an exception', () => {
  const root = tree('{ not json');
  try {
    assert.deepEqual(parseModels(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
