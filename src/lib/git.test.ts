import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { findUp, findUpFile, gitDir, repoRoot } from './git';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

test('gitDir resolves the absolute git dir from a nested directory', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const nested = join(repo, 'src', 'deep');
  mkdirSync(nested, { recursive: true });
  assert.equal(gitDir(nested, spawnSync), join(repo, '.git'));
});

test('gitDir returns null outside a repository', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  assert.equal(gitDir(tempRoot(t), spawnSync), null);
});

test('repoRoot resolves the working-tree top level from a nested directory', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const nested = join(repo, 'packages', 'api');
  mkdirSync(nested, { recursive: true });
  assert.equal(repoRoot(nested, spawnSync), repo);
});

test('repoRoot returns null outside a repository', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  assert.equal(repoRoot(tempRoot(t), spawnSync), null);
});

test('findUp returns the start directory when it holds the name', (t) => {
  const root = tempRoot(t);
  writeFileSync(join(root, 'marker'), '');
  assert.equal(findUp(root, 'marker'), root);
});

test('findUp walks to the nearest ancestor holding the name', (t) => {
  const root = tempRoot(t);
  const nested = join(root, 'a', 'b', 'c');
  mkdirSync(nested, { recursive: true });
  mkdirSync(join(root, 'a', '.engineos'));
  assert.equal(findUp(nested, '.engineos'), join(root, 'a'));
});

test('findUp returns null when no ancestor holds the name', (t) => {
  assert.equal(findUp(tempRoot(t), 'engineos-no-such-marker-9f3a'), null);
});

test('findUp terminates on a relative path instead of spinning at "."', () => {
  assert.equal(findUp('a/b/c', 'engineos-no-such-marker-9f3a'), null);
});

test('findUpFile returns the matched path, not its directory', (t) => {
  const root = tempRoot(t);
  const nested = join(root, 'x', 'y');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}');
  assert.equal(findUpFile(nested, 'package.json'), join(root, 'package.json'));
});

test('findUpFile returns null when no ancestor holds the name', (t) => {
  assert.equal(findUpFile(tempRoot(t), 'engineos-no-such-marker-9f3a'), null);
});
