// The tri-state execute-bit reader. Both platforms are exercised on whatever
// host runs the suite, because the platform is a parameter rather than an
// ambient fact: the Windows answers are asserted on Linux and macOS too.
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { tempRoot } from '../testing/harness';
import { executableBit } from './runtime-surface-fs';

function rootWithModes(t: TestContext): string {
  const root = tempRoot(t);
  for (const [name, mode] of [['executable.sh', 0o755], ['plain.md', 0o644]] as const) {
    const target = join(root, name);
    writeFileSync(target, '');
    chmodSync(target, mode);
  }
  return root;
}

test('reads a 0o755 file as executable on a POSIX platform', (t) => {
  const root = rootWithModes(t);
  assert.equal(executableBit(root, 'executable.sh', 'linux'), true);
});

test('reads a 0o644 file as not executable on a POSIX platform', (t) => {
  const root = rootWithModes(t);
  assert.equal(executableBit(root, 'plain.md', 'linux'), false);
});

test('answers null for both modes on win32, where the filesystem carries none', (t) => {
  const root = rootWithModes(t);
  assert.equal(executableBit(root, 'executable.sh', 'win32'), null);
  assert.equal(executableBit(root, 'plain.md', 'win32'), null);
});

test('reads a missing file as not executable on a POSIX platform', (t) => {
  const root = rootWithModes(t);
  assert.equal(executableBit(root, 'absent.sh', 'linux'), false);
});

test('answers null for a missing file on win32', (t) => {
  const root = rootWithModes(t);
  assert.equal(executableBit(root, 'absent.sh', 'win32'), null);
});
