import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { block, silent, type HookContext } from './output';
import { run as markUnrecorded } from './mark-unrecorded';
import { recordGateReason, run } from './record-verify';

const checkout = resolveRoot({}, __dirname);

const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function context(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: checkout, now: () => 1000, spawn: spawnSync };
}

function decode(stdin: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin }));
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

function stopOf(cwd: string, sid: string, stopHookActive = false): HookEnvelope {
  return decode(envelope({ event: 'Stop', cwd, sid, stopHookActive }));
}

function editOf(cwd: string, sid: string, file: string): HookEnvelope {
  return decode(envelope({ event: 'PostToolUse', cwd, sid, tool: { name: 'Edit', input: { file_path: file } } }));
}

// Takes the SLUGGED id, spelled out rather than recomputed with the hook's own
// helper: the file name is the contract the writer and the reader share, and a
// helper that derived it here would agree with itself. Every plain `S…` id below
// is already in the path class, so it slugs to itself.
function markerFor(repo: string, sluggedSid: string): string {
  return join(repo, '.git', `ENGINEOS_UNRECORDED.${sluggedSid}`);
}

// The two halves are exercised together: the gate's contract is that it blocks on
// exactly the marker ./mark-unrecorded writes, so a drift in either name fails here.
function flag(repo: string, sid: string): void {
  markUnrecorded(editOf(repo, sid, join(repo, 'src', `${sid}.ts`)), context());
  assert.equal(existsSync(markerFor(repo, sid)), true);
}

test('an unrecorded change in this session blocks with the record-change instruction', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  assert.deepEqual(run(stopOf(repo, 'S1'), context()), block(recordGateReason(`${markerFor(repo, 'S1')}.deferred`)));
});

test('the block reason names the defer marker inside a touch command', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  const decision = run(stopOf(repo, 'S1'), context());
  assert.equal(decision.kind, 'block');
  if (decision.kind !== 'block') return;
  assert.equal(
    decision.reason,
    `EngineOS gate: code changed but the change was not recorded. Run the record-change skill — mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag. To defer recording for this session instead, create the marker: touch "${markerFor(repo, 'S1')}.deferred"`,
  );
});

// Writer and reader must narrow the harness-supplied id identically, or the flag
// is written under one name and looked for under another and the gate stops
// firing. An id carrying '/' and '.' is where the two could drift.
test('a session id that needs narrowing is written and found under the same name', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  markUnrecorded(editOf(repo, 'a/b..c', join(repo, 'src', 'foo.ts')), context());
  assert.equal(existsSync(markerFor(repo, 'a-b--c')), true);
  assert.equal(run(stopOf(repo, 'a/b..c'), context()).kind, 'block');
});

test('the defer marker of a narrowed session id silences the gate', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  markUnrecorded(editOf(repo, 'a/b..c', join(repo, 'src', 'foo.ts')), context());
  writeFileSync(`${markerFor(repo, 'a-b--c')}.deferred`, '');
  assert.deepEqual(run(stopOf(repo, 'a/b..c'), context()), silent);
});

test('another session is not blocked by this session flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  assert.deepEqual(run(stopOf(repo, 'S2'), context()), silent);
});

test('the loop guard lets a second stop through', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  assert.deepEqual(run(stopOf(repo, 'S1', true), context()), silent);
});

test('a defer marker silences the gate without clearing the debt flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S2');
  writeFileSync(`${markerFor(repo, 'S2')}.deferred`, '');
  assert.deepEqual(run(stopOf(repo, 'S2'), context()), silent);
  assert.equal(existsSync(markerFor(repo, 'S2')), true);
});

test('a defer marker is session-scoped and is not inherited', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S2');
  writeFileSync(`${markerFor(repo, 'S2')}.deferred`, '');
  flag(repo, 'S3');
  assert.equal(run(stopOf(repo, 'S3'), context()).kind, 'block');
});

test('no flag means no gate', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(stopOf(repo, 'S1'), context()), silent);
});

test('an active bypass never blocks, even with the flag set', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  assert.deepEqual(run(stopOf(repo, 'S1'), context({ ...ISOLATED, ENGINEOS_BYPASS: '1' })), silent);
});

test('the bypass is checked before the loop guard and the flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  flag(repo, 'S1');
  // stop_hook_active=false and the flag present: only the bypass rung can answer.
  assert.deepEqual(run(stopOf(repo, 'S1', false), context({ ...ISOLATED, ENGINEOS_BYPASS: '1' })), silent);
});

test('a cwd outside any repository is a silent no-op', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  assert.deepEqual(run(stopOf(tempRoot(t), 'S1'), context()), silent);
});

test('an empty cwd is a silent no-op', () => {
  assert.deepEqual(run(stopOf('', 'S1'), context()), silent);
});
