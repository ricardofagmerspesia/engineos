import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLUG_RE } from '../journal/schema';
import { hookPathSlug, hookSlug } from './slug';

test('the slug class keeps letters, digits and @ _ . / : - and nothing else', () => {
  assert.equal(hookSlug('abcXYZ0189@_./:-'), 'abcXYZ0189@_./:-');
  assert.equal(hookSlug('a b'), 'a-b');
  assert.equal(hookSlug('a,b;c!'), 'a-b-c-');
});

test('a newline is replaced, so a value can never span two journal lines', () => {
  assert.equal(hookSlug('agent\nSECRET=hunter2 x'), 'agent-SECRET-hunter2-x');
  assert.equal(hookSlug('tab\there'), 'tab-here');
});

test('every slugged value satisfies the class the journal guards with', () => {
  for (const raw of ['a b', 'agent\nx', '"quoted"', 'ok']) {
    assert.match(hookSlug(raw), SLUG_RE);
  }
});

test('a multi-byte character becomes one dash per UTF-8 byte, as tr -c did', () => {
  // Byte fidelity, not code-point fidelity: during the migration window a marker
  // opened by the bash hook is closed by this one, and the name is the slug.
  assert.equal(hookSlug('café'), 'caf--');
  assert.equal(hookSlug('你'), '---');
});

test('an empty value slugs to an empty string rather than a placeholder', () => {
  assert.equal(hookSlug(''), '');
});

test('the path class additionally drops . and /, so a value cannot name a parent', () => {
  assert.equal(hookPathSlug('../../etc/passwd'), '------etc-passwd');
  assert.equal(hookPathSlug('a.b/c'), 'a-b-c');
  assert.equal(hookPathSlug('sess-01:9@x_y'), 'sess-01:9@x_y');
});

test('a path slug with nothing left is null, not an empty file name', () => {
  assert.equal(hookPathSlug(''), null);
  assert.equal(hookPathSlug('..'), '--');
});

test('a value already in the path class is unchanged by either function', () => {
  assert.equal(hookSlug('libt1'), 'libt1');
  assert.equal(hookPathSlug('libt1'), 'libt1');
});
