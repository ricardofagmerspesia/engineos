// The containment check between a stored relative path and the repository root.
// Every case here is a path shape that `path.join` alone would have accepted.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { PathEscapesRootError, resolveInside } from './contained-path.js';

const ROOT = path.resolve(path.sep, 'repo');

test('a plain child resolves to the joined path', () => {
  assert.equal(resolveInside(ROOT, 'skills'), path.join(ROOT, 'skills'));
});

test('a nested child resolves to the joined path', () => {
  assert.equal(
    resolveInside(ROOT, 'skills/code-review/SKILL.md'),
    path.join(ROOT, 'skills', 'code-review', 'SKILL.md'),
  );
});

test('the root itself is inside the root', () => {
  assert.equal(resolveInside(ROOT, ''), ROOT);
  assert.equal(resolveInside(ROOT, '.'), ROOT);
});

test('a traversal out of the root is refused', () => {
  assert.throws(() => resolveInside(ROOT, '../outside/SKILL.md'), PathEscapesRootError);
  assert.throws(() => resolveInside(ROOT, 'skills/../../outside/SKILL.md'), PathEscapesRootError);
});

test('an absolute path outside the root is refused, not silently substituted', () => {
  const outside = path.resolve(path.sep, 'etc', 'passwd');
  assert.throws(() => resolveInside(ROOT, outside), PathEscapesRootError);
});

test('an absolute path already inside the root is accepted unchanged', () => {
  const inside = path.join(ROOT, 'skills', 'demo', 'SKILL.md');
  assert.equal(resolveInside(ROOT, inside), inside);
});

test('a sibling directory sharing the root name prefix is outside it', () => {
  const sibling = path.resolve(path.sep, 'repo-backup', 'SKILL.md');
  assert.throws(() => resolveInside(ROOT, sibling), PathEscapesRootError);
});

test('the error names the root and the offending relative path', () => {
  try {
    resolveInside(ROOT, '../outside');
    assert.fail('expected a PathEscapesRootError');
  } catch (error) {
    assert.ok(error instanceof PathEscapesRootError);
    assert.equal(error.root, ROOT);
    assert.equal(error.relative, '../outside');
  }
});
