import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { bypassActive, bypassFlagPath, bypassMarkedAt, bypassMarker, bypassSwitchedOn } from './bypass';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// Every case points the machine-wide flag at a path that does not exist, so the
// operator's own ~/.claude/engineos.bypass can never decide a test.
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

test('a clean repo with every switch off is not bypassed', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(bypassActive(repo, ISOLATED, spawnSync), false);
});

test('ENGINEOS_BYPASS=1 bypasses even outside a repository', (t) => {
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  assert.equal(bypassActive(tempRoot(t), env, spawnSync), true);
});

test('ENGINEOS_BYPASS with any other value does not bypass', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(bypassActive(repo, { ...ISOLATED, ENGINEOS_BYPASS: '0' }, spawnSync), false);
});

test('the machine-wide flag file bypasses even outside a repository', (t) => {
  const root = tempRoot(t);
  const flag = join(root, 'engineos.bypass');
  writeFileSync(flag, '');
  assert.equal(bypassActive(root, { ENGINEOS_BYPASS_FLAG: flag }, spawnSync), true);
});

test('the per-repo marker bypasses that repo', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const marker = bypassMarker(repo, spawnSync);
  assert.notEqual(marker, null);
  if (marker === null) return;
  writeFileSync(marker, '');
  assert.equal(bypassActive(repo, ISOLATED, spawnSync), true);
});

test('the marker lives in the git dir, beside the other per-repo flags', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(bypassMarker(repo, spawnSync), join(repo, '.git', 'ENGINEOS_BYPASS'));
});

test('bypassMarker is null outside a repository', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  assert.equal(bypassMarker(tempRoot(t), spawnSync), null);
});

test('a directory outside any repository is not bypassed by the marker rung', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  assert.equal(bypassActive(tempRoot(t), ISOLATED, spawnSync), false);
});

test('the flag file is consulted before the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const flag = join(root, 'engineos.bypass');
  writeFileSync(flag, '');
  // No marker in this repo: only the flag can be answering.
  assert.equal(bypassActive(repo, { ENGINEOS_BYPASS_FLAG: flag }, spawnSync), true);
});

test('an empty ENGINEOS_BYPASS_FLAG falls back to the HOME default', (t) => {
  const home = tempRoot(t);
  const env: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '', HOME: home };
  // HOME has no .claude/engineos.bypass, so the fallback path resolves and misses.
  assert.equal(bypassActive(home, env, spawnSync), false);
});

// ------------------------------------------------------------------ the repository-free switches

test('the process variable alone switches the bypass on, with no repository consulted', () => {
  assert.equal(bypassSwitchedOn({ ...ISOLATED, ENGINEOS_BYPASS: '1' }), true);
});

test('only the exact value 1 switches the bypass on', () => {
  for (const value of ['', '0', 'true', 'yes', ' 1']) {
    assert.equal(bypassSwitchedOn({ ...ISOLATED, ENGINEOS_BYPASS: value }), false, JSON.stringify(value));
  }
});

test('an existing flag file switches the bypass on, a missing one does not', (t) => {
  const flag = join(tempRoot(t), 'engineos.bypass');
  assert.equal(bypassSwitchedOn({ ENGINEOS_BYPASS_FLAG: flag }), false);
  writeFileSync(flag, '');
  assert.equal(bypassSwitchedOn({ ENGINEOS_BYPASS_FLAG: flag }), true);
});

test('the flag path defaults under the injected HOME', () => {
  assert.equal(bypassFlagPath({ HOME: '/home/someone' }), '/home/someone/.claude/engineos.bypass');
  assert.equal(bypassFlagPath({ HOME: '/home/someone', ENGINEOS_BYPASS_FLAG: '/elsewhere/flag' }), '/elsewhere/flag');
  assert.equal(bypassFlagPath({ HOME: '/home/someone', ENGINEOS_BYPASS_FLAG: '' }), '/home/someone/.claude/engineos.bypass');
});

// ------------------------------------------------------------------ the per-repo marker, given its directory

test('a directory holding the marker is marked', (t) => {
  const dir = tempRoot(t);
  writeFileSync(join(dir, 'ENGINEOS_BYPASS'), '');
  assert.equal(bypassMarkedAt(dir), true);
});

test('a directory without the marker is not marked', (t) => {
  assert.equal(bypassMarkedAt(tempRoot(t)), false);
});

test('no directory at all is never marked', () => {
  assert.equal(bypassMarkedAt(null), false);
});
