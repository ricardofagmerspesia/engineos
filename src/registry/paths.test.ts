import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRoot } from './paths';
import { KernelError } from '../lib/json';

test('ENGINEOS_ROOT wins', () => {
  assert.equal(resolveRoot({ ENGINEOS_ROOT: '/r' }, '/anywhere'), '/r');
});

test('walks up to the directory holding registries/routing.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'eos-'));
  mkdirSync(join(root, 'registries'));
  writeFileSync(join(root, 'registries', 'routing.json'), '{}');
  mkdirSync(join(root, 'build', 'registry'), { recursive: true });
  assert.equal(resolveRoot({}, join(root, 'build', 'registry')), root);
});

test('throws when no root is found', () => {
  assert.throws(() => resolveRoot({}, tmpdir()), KernelError);
});
