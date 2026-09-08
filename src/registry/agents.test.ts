import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentModelTier, DEFAULT_AGENT_TIER, loadAgents } from './agents';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('every shipped agent loads with a name, and the tiers are the registry tiers', () => {
  const agents = loadAgents(root);
  assert.ok(agents.length > 0);
  for (const agent of agents) assert.notEqual(agent.name, '');
  assert.equal(agentModelTier(root, 'backend-coordinator'), 'build');
  assert.equal(agentModelTier(root, 'architecture-analyst'), 'design');
  assert.equal(agentModelTier(root, 'product-spec'), 'most-capable');
});

test('an agent the registry does not know falls back to the ordinary tier', () => {
  assert.equal(agentModelTier(root, 'general-purpose'), DEFAULT_AGENT_TIER);
  assert.equal(DEFAULT_AGENT_TIER, 'build');
});

// The leniency contract, one case per thing the bash `jq ... 2>/dev/null` and
// `.agents[]?` tolerated. Each one has to answer `build` rather than throw: a
// throw out of a hook body costs the announce pair's banner.
test('a missing registry yields no agents and the ordinary tier', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-agents-'));
  assert.deepEqual(loadAgents(dir), []);
  assert.equal(agentModelTier(dir, 'backend-coordinator'), 'build');
});

test('an unparseable registry yields no agents rather than throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-agents-'));
  mkdirSync(join(dir, 'registries'), { recursive: true });
  writeFileSync(join(dir, 'registries', 'agents.json'), '{ not json');
  assert.deepEqual(loadAgents(dir), []);
  assert.equal(agentModelTier(dir, 'backend-coordinator'), 'build');
});

test('an agents key that is not an array yields no agents', () => {
  assert.deepEqual(loadAgents(rootWith({ agents: {} })), []);
  assert.deepEqual(loadAgents(rootWith({})), []);
});

test('rows that are not objects, or carry no name, are skipped rather than refused', () => {
  const dir = rootWith({ agents: ['x', 7, null, {}, { name: '' }, { name: 'qa-tester', model_tier: 'build' }] });
  assert.deepEqual(loadAgents(dir), [{ name: 'qa-tester', model_tier: 'build' }]);
});

test('a tier the model registry does not know reads as absent, never as a span field', () => {
  const dir = rootWith({ agents: [{ name: 'qa-tester', model_tier: 'gold' }] });
  assert.deepEqual(loadAgents(dir), [{ name: 'qa-tester', model_tier: null }]);
  assert.equal(agentModelTier(dir, 'qa-tester'), 'build');
});

// bash emitted one line per matching row and took `head -1` of what was left
// after `// empty` dropped the tierless ones, so a duplicated name whose first
// row carries no tier falls through to the next.
test('the first row with a usable tier wins a duplicated name', () => {
  const dir = rootWith({ agents: [{ name: 'critic' }, { name: 'critic', model_tier: 'design' }] });
  assert.equal(agentModelTier(dir, 'critic'), 'design');
});

function rootWith(document: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-agents-'));
  mkdirSync(join(dir, 'registries'), { recursive: true });
  writeFileSync(join(dir, 'registries', 'agents.json'), JSON.stringify(document));
  return dir;
}
