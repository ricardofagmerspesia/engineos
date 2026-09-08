import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRouting } from './routing';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

test('loads the shipped routing registry with precedence and domains', () => {
  const r = loadRouting(root);
  assert.equal(r.precedence[0], 'security');
  assert.ok(r.domains.some((d) => d.id === 'backend'));
  assert.ok(r.excluded.basenames.includes('*.md'));
});
