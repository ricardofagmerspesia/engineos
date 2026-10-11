import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import {
  isPrivateDir,
  isPrivateFile,
  lstatFacts,
  parsePresence,
  PRESENCE_VERSION,
  readPrivateFile,
  runtimeDir,
  sessionPaths,
  type FileFacts,
} from './runtime-dir';

const UID = 501;

// ------------------------------------------------------------------ runtimeDir

test('the runtime directory prefers XDG_RUNTIME_DIR, then TMPDIR, then the fallback', () => {
  const fallback = (): string => '/os-tmp';
  assert.equal(runtimeDir({ XDG_RUNTIME_DIR: '/run/user/501', TMPDIR: '/var/t' }, UID, fallback), '/run/user/501/engineos-501');
  assert.equal(runtimeDir({ TMPDIR: '/var/t' }, UID, fallback), '/var/t/engineos-501');
  assert.equal(runtimeDir({}, UID, fallback), '/os-tmp/engineos-501');
});

test('an empty XDG_RUNTIME_DIR or TMPDIR counts as unset', () => {
  const fallback = (): string => '/os-tmp';
  assert.equal(runtimeDir({ XDG_RUNTIME_DIR: '', TMPDIR: '/var/t' }, UID, fallback), '/var/t/engineos-501');
  assert.equal(runtimeDir({ XDG_RUNTIME_DIR: '', TMPDIR: '' }, UID, fallback), '/os-tmp/engineos-501');
});

// ------------------------------------------------------------------ sessionPaths

test('session paths are keyed by the first 16 hex characters of the session id hash', () => {
  // Pinned: the in-process host computes the same names on its side.
  assert.deepEqual(sessionPaths('/d', 'session-1'), { socket: '/d/h-84097828fc31a8c8.sock', presence: '/d/h-84097828fc31a8c8.json' });
});

test('session paths keep the session id itself out of the file names', () => {
  const paths = sessionPaths('/d', 'my-private-session');
  assert.ok(!paths.socket.includes('my-private-session'));
  assert.ok(!paths.presence.includes('my-private-session'));
});

test('two sessions never share a socket', () => {
  assert.notEqual(sessionPaths('/d', 'a').socket, sessionPaths('/d', 'b').socket);
});

// ------------------------------------------------------------------ isPrivateDir / isPrivateFile

const DIR: FileFacts = { kind: 'directory', uid: UID, mode: 0o40700 };
const FILE: FileFacts = { kind: 'file', uid: UID, mode: 0o100600 };

test('a directory is private only when it is a real directory of this uid with no group or other bits', () => {
  assert.equal(isPrivateDir(DIR, UID), true);
  assert.equal(isPrivateDir(null, UID), false);
  assert.equal(isPrivateDir({ ...DIR, uid: UID + 1 }, UID), false);
  assert.equal(isPrivateDir({ ...DIR, kind: 'symlink' }, UID), false);
  for (const mode of [0o40710, 0o40701, 0o40770, 0o40777]) {
    assert.equal(isPrivateDir({ ...DIR, mode }, UID), false, mode.toString(8));
  }
});

test('a file is private only when it is a regular file of this uid with no group or other bits', () => {
  assert.equal(isPrivateFile(FILE, UID), true);
  assert.equal(isPrivateFile({ ...FILE, mode: 0o100400 }, UID), true);
  assert.equal(isPrivateFile(null, UID), false);
  assert.equal(isPrivateFile({ ...FILE, uid: 0 }, UID), false);
  assert.equal(isPrivateFile({ ...FILE, kind: 'socket' }, UID), false);
  assert.equal(isPrivateFile({ ...FILE, mode: 0o100640 }, UID), false);
  assert.equal(isPrivateFile({ ...FILE, mode: 0o100604 }, UID), false);
});

// ------------------------------------------------------------------ lstatFacts / readPrivateFile (real files)

function privateFileIn(t: TestContext, text: string): string {
  const path = join(tempRoot(t), 'record.json');
  writeFileSync(path, text);
  chmodSync(path, 0o600);
  return path;
}

test('lstat facts classify a directory, a file, a symlink and a missing path', (t) => {
  const root = tempRoot(t);
  const dir = join(root, 'dir');
  mkdirSync(dir);
  const file = join(root, 'file');
  writeFileSync(file, 'x');
  const link = join(root, 'link');
  symlinkSync(dir, link);
  assert.equal(lstatFacts(dir)?.kind, 'directory');
  assert.equal(lstatFacts(file)?.kind, 'file');
  assert.equal(lstatFacts(link)?.kind, 'symlink', 'a symlink to a directory is still a symlink');
  assert.equal(lstatFacts(join(root, 'missing')), null);
});

test('lstat facts report the owner and mode of the path', (t) => {
  if (typeof process.getuid !== 'function') {
    t.skip('no POSIX uid on this platform');
    return;
  }
  const uid = process.getuid();
  const dir = join(tempRoot(t), 'private');
  mkdirSync(dir);
  chmodSync(dir, 0o700);
  const facts = lstatFacts(dir);
  assert.equal(facts?.uid, uid);
  assert.equal(isPrivateDir(facts, uid), true);
  chmodSync(dir, 0o750);
  assert.equal(isPrivateDir(lstatFacts(dir), uid), false);
});

test('a private regular file is read with its facts and mtime', (t) => {
  const path = privateFileIn(t, '{"v":2}');
  const read = readPrivateFile(path, 4_096);
  assert.notEqual(read, null);
  assert.equal(read?.text, '{"v":2}');
  assert.equal(read?.facts.kind, 'file');
  assert.equal(typeof read?.mtimeMs, 'number');
  if (typeof process.getuid === 'function') assert.equal(isPrivateFile(read?.facts ?? null, process.getuid()), true);
});

test('a file of exactly the bound is read, one byte more is refused', (t) => {
  const exact = privateFileIn(t, 'x'.repeat(16));
  assert.equal(readPrivateFile(exact, 16)?.text, 'x'.repeat(16));
  const over = privateFileIn(t, 'x'.repeat(17));
  assert.equal(readPrivateFile(over, 16), null);
});

test('a symlink is refused even when it points at a readable private file', (t) => {
  const target = privateFileIn(t, '{"v":2}');
  const link = join(tempRoot(t), 'link.json');
  symlinkSync(target, link);
  assert.equal(readPrivateFile(link, 4_096), null);
});

test('a missing file reads as null', (t) => {
  assert.equal(readPrivateFile(join(tempRoot(t), 'missing.json'), 4_096), null);
});

test('a directory is not a file', (t) => {
  assert.equal(readPrivateFile(tempRoot(t), 4_096), null);
});

test('a FIFO is refused without blocking on a writer', (t) => {
  const fifo = join(tempRoot(t), 'record.fifo');
  const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (made.error !== undefined || made.status !== 0) {
    t.skip('mkfifo is not available');
    return;
  }
  assert.equal(readPrivateFile(fifo, 4_096), null);
});

// ------------------------------------------------------------------ parsePresence

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: PRESENCE_VERSION,
    pid: 4200,
    socket: '/run/user/501/engineos-501/h-84097828fc31a8c8.sock',
    session: 'session-1',
    started_at: 1_000,
    served: ['route-before-change', 'mark-unrecorded'],
    root: '/checkouts/engineos',
    version: '9.9.9-test',
    ...overrides,
  };
}

function parses(overrides: Record<string, unknown>): boolean {
  return parsePresence(JSON.stringify(record(overrides))) !== null;
}

test('a complete v2 record parses into exactly its fields', () => {
  assert.deepEqual(parsePresence(JSON.stringify({ ...record(), extra: 'ignored' })), record());
});

test('text that is not a JSON object is not a record', () => {
  for (const text of ['', 'not json', '[]', 'null', '42', '"text"']) {
    assert.equal(parsePresence(text), null, text);
  }
});

test('only version 2 is a presence record', () => {
  assert.equal(parses({ v: 1 }), false);
  assert.equal(parses({ v: 3 }), false);
  assert.equal(parses({ v: '2' }), false);
});

test('the pid must be a positive safe integer', () => {
  for (const pid of [0, -1, 1.5, '4200', Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.equal(parses({ pid }), false, String(pid));
  }
  assert.equal(parses({ pid: 1 }), true);
});

test('socket, session and started_at are required and typed', () => {
  assert.equal(parses({ socket: 7 }), false);
  assert.equal(parses({ session: '' }), false);
  assert.equal(parses({ session: 1 }), false);
  assert.equal(parses({ started_at: '1000' }), false);
  assert.equal(parses({ started_at: undefined }), false);
});

test('the root must be a bounded absolute path', () => {
  assert.equal(parses({ root: 'relative/path' }), false);
  assert.equal(parses({ root: '' }), false);
  assert.equal(parses({ root: `/${'a'.repeat(4_095)}` }), true);
  assert.equal(parses({ root: `/${'a'.repeat(4_096)}` }), false);
});

test('the version must be a non-empty string of at most 64 characters', () => {
  assert.equal(parses({ version: '' }), false);
  assert.equal(parses({ version: 9 }), false);
  assert.equal(parses({ version: 'v'.repeat(64) }), true);
  assert.equal(parses({ version: 'v'.repeat(65) }), false);
});

test('served lists at most 64 hook names', () => {
  const names = (count: number): string[] => Array.from({ length: count }, (_, index) => `hook-${index}`);
  assert.equal(parses({ served: [] }), true);
  assert.equal(parses({ served: names(64) }), true);
  assert.equal(parses({ served: names(65) }), false);
  assert.equal(parses({ served: 'route-before-change' }), false);
});

test('every served entry must be a hook name', () => {
  for (const name of ['Route', '1hook', '-hook', 'hook name', 'hook/../x', '', `h${'a'.repeat(64)}`, 7]) {
    assert.equal(parses({ served: [name] }), false, JSON.stringify(name));
  }
  assert.equal(parses({ served: [`h${'a'.repeat(63)}`] }), true);
});
