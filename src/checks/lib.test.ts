import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import type { CheckId } from './ids';
import { deferralsOf, makeContext, skipOnce, skipPending, type CheckContext } from './lib';

// Any real id works: these cases are about the guards, not about a family.
const CHECK: CheckId = 'C1';

function contextOn(root: string): CheckContext {
  return makeContext(root, memoryIo());
}

function treeOn(t: TestContext, files: Record<string, string>): string {
  const root = tempRoot(t);
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

test('makeContext exposes the root it was built on', (t) => {
  const root = tempRoot(t);
  assert.equal(contextOn(root).root, root);
});

test('readText answers with the file contents under the root', (t) => {
  const ctx = contextOn(treeOn(t, { 'rules/base.md': '# Base\n' }));
  assert.equal(ctx.readText('rules/base.md'), '# Base\n');
});

test('readText answers undefined for a missing file', (t) => {
  assert.equal(contextOn(tempRoot(t)).readText('rules/nope.md'), undefined);
});

test('readText answers undefined for an unreadable path rather than throwing', (t) => {
  const ctx = contextOn(treeOn(t, { 'rules/base.md': 'x' }));
  // A directory is readable as an entry and unreadable as a file: the helper owns
  // neither error, so both answer the same way.
  assert.equal(ctx.readText('rules'), undefined);
});

test('exists distinguishes a present path from an absent one', (t) => {
  const ctx = contextOn(treeOn(t, { 'registries/policy.json': '{}' }));
  assert.equal(ctx.exists('registries/policy.json'), true);
  assert.equal(ctx.exists('registries/missing.json'), false);
});

test('list answers with sorted basenames', (t) => {
  const ctx = contextOn(treeOn(t, { 'rules/zeta.md': 'z', 'rules/alpha.md': 'a', 'rules/beta.md': 'b' }));
  assert.deepEqual(ctx.list('rules'), ['alpha.md', 'beta.md', 'zeta.md']);
});

test('list answers with nothing when the directory is missing', (t) => {
  assert.deepEqual(contextOn(tempRoot(t)).list('rules'), []);
});

test('skipOnce reports one counted failure and dedupes every later call', (t) => {
  const ctx = contextOn(tempRoot(t));
  const first = skipOnce(ctx, CHECK, 'registry checks skipped', 'registries');
  assert.equal(first.length, 1);
  assert.equal(first[0]?.check, CHECK);
  assert.equal(first[0]?.title, 'registry checks skipped');
  assert.equal(first[0]?.status, 'fail');
  assert.deepEqual(first[0]?.findings, [{ code: 'precondition-missing', subject: 'registries' }]);
  assert.deepEqual(skipOnce(ctx, CHECK, 'registry checks skipped', 'registries'), []);
});

test('skipPending reports a skip line and dedupes every later call', (t) => {
  const ctx = contextOn(tempRoot(t));
  const first = skipPending(ctx, CHECK, 'contract checks pending', 'docs/COMPATIBILITY.md');
  assert.equal(first.length, 1);
  assert.equal(first[0]?.status, 'skip');
  assert.deepEqual(first[0]?.findings, [{ code: 'artifact-pending', subject: 'docs/COMPATIBILITY.md' }]);
  assert.deepEqual(skipPending(ctx, CHECK, 'contract checks pending', 'docs/COMPATIBILITY.md'), []);
});

test('a skipOnce token and a skipPending path spelled the same do not collide', (t) => {
  const ctx = contextOn(tempRoot(t));
  assert.equal(skipOnce(ctx, CHECK, 'once', 'shared').length, 1);
  assert.equal(skipPending(ctx, CHECK, 'pending', 'shared').length, 1);
  // And each still dedupes against its own kind.
  assert.deepEqual(skipOnce(ctx, CHECK, 'once', 'shared'), []);
  assert.deepEqual(skipPending(ctx, CHECK, 'pending', 'shared'), []);
});

test('each context carries its own dedupe set', (t) => {
  const root = tempRoot(t);
  assert.equal(skipOnce(contextOn(root), CHECK, 'once', 'token').length, 1);
  assert.equal(skipOnce(contextOn(root), CHECK, 'once', 'token').length, 1);
});

test('deferralsOf prunes the always-on rules CLAUDE.md imports', (t) => {
  const root = treeOn(t, {
    'CLAUDE.md': '# EngineOS\n\n@rules/base.md\n',
    'rules/base.md': '',
    'rules/architecture.md': '',
    'rules/backend.md': 'defers logging to observability.md and naming to base.md',
    'rules/observability.md': '',
  });
  assert.deepEqual(deferralsOf(contextOn(root), 'backend'), ['observability']);
});

test('deferralsOf answers with nothing for a rule that defers to no one', (t) => {
  const root = treeOn(t, { 'CLAUDE.md': '@rules/base.md\n', 'rules/base.md': '', 'rules/data.md': 'no mentions here' });
  assert.deepEqual(deferralsOf(contextOn(root), 'data'), []);
});

test('deferralsOf treats a missing CLAUDE.md as no always-on rules', (t) => {
  const root = treeOn(t, { 'rules/backend.md': 'names base.md', 'rules/base.md': '' });
  assert.deepEqual(deferralsOf(contextOn(root), 'backend'), ['base']);
});
