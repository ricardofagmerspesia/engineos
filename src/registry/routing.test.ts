import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { loadRouting } from './routing';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads the shipped routing registry with precedence and domains', () => {
  const r = loadRouting(root);
  assert.notEqual(r.version, '');
  assert.equal(r.precedence[0], 'security');
  assert.ok(r.domains.some((d) => d.id === 'backend'));
  assert.ok(r.excluded.basenames.includes('*.md'));
});

// The audit's finding, as a case. `{}` used to load: precedence [], domains [],
// excluded all empty — so `route-path src/auth/jwt.guard.ts` answered
// `{"domain": null, "excluded": false}` with exit 0 and the security routing was
// gone with no diagnostic anywhere.
test('an empty routing registry is refused, never answered with defaults', () => {
  assert.match(refusal(rootWith({})), /^registries\/routing\.json: /);
});

test('a routing registry that is not an object is refused', () => {
  assert.match(refusal(rootWith([])), /registries\/routing\.json: the document must be an object/);
});

test('an empty domain map is refused: it routes nothing at all', () => {
  const dir = rootWith({ version: '1.0.0', precedence: ['backend'], excluded: {}, domains: [] });
  assert.match(refusal(dir), /\.domains must not be empty/);
});

test('an empty precedence list is refused for the same reason', () => {
  const dir = rootWith({
    version: '1.0.0',
    precedence: [],
    excluded: {},
    domains: [{ id: 'backend', match: {} }],
  });
  assert.match(refusal(dir), /\.precedence must not be empty/);
});

test('a domain row without an id is refused, never given the empty id', () => {
  const dir = rootWith({
    version: '1.0.0',
    precedence: ['backend'],
    excluded: {},
    domains: [{ match: { paths: ['src/**'] } }],
  });
  assert.match(refusal(dir), /\.domains\[0\]\.id must be a string/);
});

test('an empty domain id is refused: nothing can reference it', () => {
  const dir = rootWith({
    version: '1.0.0',
    precedence: ['backend'],
    excluded: {},
    domains: [{ id: '', match: {} }],
  });
  assert.match(refusal(dir), /\.domains\[0\]\.id must not be empty/);
});

test('a non-string match glob and a missing match record are refused', () => {
  assert.match(
    refusal(rootWith({
      version: '1.0.0',
      precedence: ['backend'],
      excluded: {},
      domains: [{ id: 'backend', match: { paths: ['src/**', 7] } }],
    })),
    /\.domains\[0\]\.match\.paths\[1\] must be a string/,
  );
  assert.match(
    refusal(rootWith({ version: '1.0.0', precedence: ['backend'], excluded: {}, domains: [{ id: 'backend' }] })),
    /\.domains\[0\]\.match must be an object/,
  );
});

test('a missing version and a missing excluded record are refused', () => {
  assert.match(
    refusal(rootWith({ precedence: ['backend'], excluded: {}, domains: [{ id: 'backend', match: {} }] })),
    /\.version must be a string/,
  );
  assert.match(
    refusal(rootWith({ version: '1.0.0', precedence: ['backend'], domains: [{ id: 'backend', match: {} }] })),
    /\.excluded must be an object/,
  );
});

// The optional fields keep jq's `// null` / `// []` reading: absent and null are
// the same answer, so a row that declares no agent still loads.
test('an absent agent, hint, sample_path and rule list still load', () => {
  const dir = rootWith({
    version: '1.0.0',
    precedence: ['backend'],
    excluded: {},
    domains: [{ id: 'backend', match: { paths: ['src/**'] }, agent: null }],
  });
  const domain = loadRouting(dir).domains[0];
  assert.equal(domain?.agent, null);
  assert.equal(domain?.hint, null);
  assert.equal(domain?.sample_path, null);
  assert.deepEqual(domain?.rules, []);
  assert.deepEqual(domain?.match.basenames, []);
});

function rootWith(routing: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'eos-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'routing.json'), JSON.stringify(routing));
  return dir;
}

function refusal(dir: string): string {
  try {
    loadRouting(dir);
  } catch (e) {
    if (e instanceof KernelError) return e.message;
    throw e;
  }
  throw new Error('expected a KernelError, the loader accepted the registry');
}
