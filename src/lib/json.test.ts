import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, readJsonFile, stringArray } from './json';

test('readJsonFile throws KernelError for a missing file', () => {
  assert.throws(() => readJsonFile('/nonexistent/x.json'), KernelError);
});

test('readJsonFile parses a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eos-'));
  writeFileSync(join(dir, 'a.json'), '{"a":1}');
  assert.deepEqual(readJsonFile(join(dir, 'a.json')), { a: 1 });
});

test('stringArray keeps only strings', () => {
  assert.deepEqual(stringArray(['a', 1, 'b']), ['a', 'b']);
  assert.deepEqual(stringArray(undefined), []);
});
