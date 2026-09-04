import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRecord } from '../lib/json';
import { loadRegistry } from '../registry/load';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries } from './context';
import { floorOf, renderGuidance } from './route';

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);

// The stored strings are read from the raw registry on purpose: the typed
// loader drops hook_guidance and risk_floor precisely because they are derived,
// so parity has to be asserted against the file, not against the loader.
const raw = loadRegistry(root, 'routing.json');
const rawDomains: unknown[] = isRecord(raw) && Array.isArray(raw['domains']) ? raw['domains'] : [];
const stored = new Map<string, Record<string, unknown>>();
for (const d of rawDomains) {
  if (isRecord(d) && typeof d['id'] === 'string') stored.set(d['id'], d);
}

test('the renderer reproduces every stored hook_guidance string', () => {
  for (const d of regs.routing.domains) {
    assert.equal(renderGuidance(d), stored.get(d.id)?.['hook_guidance'], `domain ${d.id}`);
  }
});

test('the intent floor equals every stored risk_floor', () => {
  for (const d of regs.routing.domains) {
    assert.equal(floorOf(d, regs), stored.get(d.id)?.['risk_floor'], `domain ${d.id}`);
  }
});

test('exactly one intent carries each routed domain', () => {
  for (const d of regs.routing.domains) {
    const rows = regs.intents.intents.filter((i) => i.domain === d.id);
    assert.equal(rows.length, 1, `domain ${d.id}`);
  }
});

test('the hint is rendered last, and omitted when the row has none', () => {
  const base = { id: 'x', match: { paths: [], basenames: [] }, rules: ['a', 'b'], skills: ['s'], sample_path: null };
  assert.equal(renderGuidance({ ...base, agent: 'ag', hint: 'why' }), 'rules/a.md+b.md | skill:s | agent:ag (why)');
  assert.equal(renderGuidance({ ...base, agent: null, hint: null }), 'rules/a.md+b.md | skill:s');
});

test('a domain with no intent has no floor', () => {
  const orphan = { id: 'nope', match: { paths: [], basenames: [] }, rules: [], skills: [], agent: null, hint: null, sample_path: null };
  assert.equal(floorOf(orphan, regs), null);
});
