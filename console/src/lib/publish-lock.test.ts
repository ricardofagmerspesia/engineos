// The repository write lock: publish and rollback must not interleave, and a
// failed publish must not wedge every later one.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PublishLockedError, withPublishLock } from './publish-lock.js';

function scratch(): string {
  return mkdtempSync(path.join(tmpdir(), 'engineos-lock-'));
}

test('a second holder is refused while the first is inside', () => {
  const root = scratch();
  try {
    withPublishLock(root, 'publish', () => {
      assert.throws(() => withPublishLock(root, 'rollback', () => 'never runs'), PublishLockedError);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the lock is released after the body throws — a failed publish does not wedge the next one', () => {
  const root = scratch();
  try {
    assert.throws(() => withPublishLock(root, 'publish', () => {
      throw new Error('publish blew up');
    }), /publish blew up/);

    assert.equal(withPublishLock(root, 'publish', () => 'second attempt ran'), 'second attempt ran');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the lock directory does not survive a normal run', () => {
  const root = scratch();
  try {
    withPublishLock(root, 'publish', () => undefined);
    assert.equal(existsSync(path.join(root, '.publish.lock')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an abandoned lock is reclaimed once it is old enough', () => {
  const root = scratch();
  const lock = path.join(root, '.publish.lock');
  try {
    mkdirSync(lock); // a holder that died before releasing
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lock, old, old);

    assert.equal(withPublishLock(root, 'publish', () => 'reclaimed'), 'reclaimed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a fresh abandoned lock is still honoured — staleness is a timeout, not a free pass', () => {
  const root = scratch();
  try {
    mkdirSync(path.join(root, '.publish.lock'));
    assert.throws(() => withPublishLock(root, 'publish', () => 'must not run'), PublishLockedError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a lock with no owner file is still reclaimable — the killed-between-mkdir-and-write case', () => {
  const root = scratch();
  const lock = path.join(root, '.publish.lock');
  try {
    mkdirSync(lock);
    assert.equal(existsSync(path.join(lock, 'owner')), false);
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lock, old, old);

    assert.equal(withPublishLock(root, 'publish', () => 'reclaimed without an owner file'), 'reclaimed without an owner file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
