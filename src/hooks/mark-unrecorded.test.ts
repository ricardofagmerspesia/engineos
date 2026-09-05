import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { silent, type HookContext } from './output';
import { RECORDED_EXTENSIONS, run } from './mark-unrecorded';

const checkout = resolveRoot({}, __dirname);

// The operator's machine-wide bypass must never decide a case (src/hooks/governance.e2e.test.ts
// pins the same isolation on every run).
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function context(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: checkout, now: () => 1000, spawn: spawnSync };
}

function editOf(cwd: string, sid: string, file: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: envelope({ event: 'PostToolUse', cwd, sid, tool: { name: 'Edit', input: { file_path: file } } }) }));
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

function markerFor(repo: string, sid: string): string {
  return join(repo, '.git', `ENGINEOS_UNRECORDED.${sid}`);
}

test('the allowlist is the eight code extensions the router shares', () => {
  assert.deepEqual([...RECORDED_EXTENSIONS], ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'sql']);
});

test('a code edit raises the session-scoped flag and stays silent', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(editOf(repo, 'S1', join(repo, 'src', 'foo.ts')), context()), silent);
  assert.equal(existsSync(markerFor(repo, 'S1')), true);
});

test('every allowlisted extension raises the flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  for (const ext of RECORDED_EXTENSIONS) {
    run(editOf(repo, ext, join(repo, 'src', `foo.${ext}`)), context());
    assert.equal(existsSync(markerFor(repo, ext)), true, `.${ext} did not raise the flag`);
  }
});

test('a non-code file raises no flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(editOf(repo, 'Smd', join(repo, 'README.md')), context()), silent);
  assert.equal(existsSync(markerFor(repo, 'Smd')), false);
});

test('an edit with no file path raises no flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(editOf(repo, 'Snofile', ''), context()), silent);
  assert.equal(existsSync(markerFor(repo, 'Snofile')), false);
});

test('an .engineos/ edit is excluded in any project', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  run(editOf(repo, 'Smeta', join(repo, '.engineos', 'changes', 'note.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Smeta')), false);
});

test("a consumer project's own docs/ and src/hooks/ still raise the flag", (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  run(editOf(repo, 'Sproj1', join(repo, 'docs', 'gen.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Sproj1')), true);
  run(editOf(repo, 'Sproj2', join(repo, 'src', 'hooks', 'useAuth.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Sproj2')), true);
});

test("EngineOS's own self_dirs are excluded, resolved against the checkout", (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  // Path strings only: the hook never reads the filesystem for the exclusion, so
  // these files need not exist.
  run(editOf(repo, 'Seos1', join(checkout, 'hooks', 'fake-for-test.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Seos1')), false);
  run(editOf(repo, 'Seos2', join(checkout, 'docs', 'fake-for-test.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Seos2')), false);
});

test('a self_dir name matches as a directory, never as a prefix of a sibling', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  run(editOf(repo, 'Ssibling', join(checkout, 'hooks-extra', 'thing.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'Ssibling')), true);
});

test('an active bypass raises no flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const bypassed: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  assert.deepEqual(run(editOf(repo, 'Sbypass', join(repo, 'src', 'foo.ts')), context(bypassed)), silent);
  assert.equal(existsSync(markerFor(repo, 'Sbypass')), false);
});

test('a cwd outside any repository is a silent no-op', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const outside = tempRoot(t);
  assert.deepEqual(run(editOf(outside, 'Sfree', join(outside, 'foo.ts')), context()), silent);
});

test('an empty cwd is a silent no-op', () => {
  assert.deepEqual(run(editOf('', 'Sempty', '/somewhere/foo.ts'), context()), silent);
});

test('a second edit in the same session leaves one marker, truncated', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const marker = markerFor(repo, 'S1');
  run(editOf(repo, 'S1', join(repo, 'src', 'foo.ts')), context());
  writeFileSync(marker, 'stale');
  run(editOf(repo, 'S1', join(repo, 'src', 'bar.ts')), context());
  assert.equal(readFileSync(marker, 'utf8'), '');
});
