import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { CAPABILITY_IDS, loadCapabilities } from './capabilities';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

// The pin. CapabilityId is derived from CAPABILITY_IDS, so this case is what
// stands between the compile-time vocabulary and the registry — and it is the
// reason check C27f could be deleted: a capability added to or removed from the
// JSON fails here rather than reaching a span writer.
test('the CapabilityId literals are exactly the registry ids, in registry order', () => {
  assert.deepEqual([...CAPABILITY_IDS], loadCapabilities(root).capabilities.map((c) => c.id));
});

test('every shipped capability names an agent, a tier and a risk floor', () => {
  const registry = loadCapabilities(root);
  assert.notEqual(registry.version, '');
  for (const capability of registry.capabilities) {
    assert.notEqual(capability.agent, '', capability.id);
    assert.ok(registry.model_tiers.includes(capability.model_tier), `${capability.id} tier`);
    assert.notEqual(capability.risk_floor, '', capability.id);
  }
});

test('a capability row without its agent is refused, never defaulted', () => {
  const dir = rootWith({ version: '1.0.0', model_tiers: ['build'], capabilities: [{ id: 'implement', title: 'x', model_tier: 'build', risk_floor: 'low' }] });
  assert.match(refusal(dir), /capabilities\[0\]\.agent/);
});

test('a capabilities list that is not an array is refused', () => {
  const dir = rootWith({ version: '1.0.0', model_tiers: [], capabilities: {} });
  assert.match(refusal(dir), /\.capabilities must be an array/);
});

function rootWith(document: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-capabilities-'));
  mkdirSync(join(dir, 'registries'), { recursive: true });
  writeFileSync(join(dir, 'registries', 'capabilities.json'), JSON.stringify(document));
  return dir;
}

function refusal(dir: string): string {
  try {
    loadCapabilities(dir);
  } catch (error: unknown) {
    if (error instanceof KernelError) return error.message;
    throw error;
  }
  throw new Error('the loader accepted a malformed registry');
}
