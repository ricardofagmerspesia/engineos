import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globMatch } from './glob';

test('star crosses slashes like a bash case pattern', () => {
  assert.equal(globMatch('*/auth/*', '/src/modules/auth/guard.ts'), true);
  assert.equal(globMatch('*/.engineos/*', '/repo/.engineos/changes/x.md'), true);
  assert.equal(globMatch('*/auth/*', '/src/author/x.ts'), false);
});

test('basename globs', () => {
  assert.equal(globMatch('*.md', 'README.md'), true);
  assert.equal(globMatch('*.lock', 'yarn.lock'), true);
  assert.equal(globMatch('package-lock.json', 'package-lock.json'), true);
  assert.equal(globMatch('*.md', 'x.mdx'), false);
});

test('question mark and character classes', () => {
  assert.equal(globMatch('?.ts', 'a.ts'), true);
  assert.equal(globMatch('[ab].ts', 'b.ts'), true);
  assert.equal(globMatch('[!a].ts', 'a.ts'), false);
});

test('regex metacharacters in globs are literal', () => {
  assert.equal(globMatch('a+b.ts', 'a+b.ts'), true);
  assert.equal(globMatch('a+b.ts', 'aab.ts'), false);
});
