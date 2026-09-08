// End-to-end port of hooks/test-governance.sh: the change-record governance flow
// driven through the real CLI — `engineos hook mark-unrecorded` (PostToolUse)
// raises a session-scoped debt flag on a code edit, and `engineos hook
// record-verify` (Stop) blocks on exactly that flag for exactly that session.
//
// src/hooks/mark-unrecorded.test.ts and src/hooks/record-verify.test.ts cover the
// same rungs in process against injected contexts; this file is the other half —
// a spawned process, a real `git rev-parse --absolute-git-dir`, real marker files
// on disk — so it asserts only what a caller outside the process can see: the
// decision field of stdout and the marker paths under .git.
//
// The bash suite ran one long stateful flow over a single temp repo. Each case
// here rebuilds the state it needs on its own fixture instead, so a failure names
// one behaviour rather than every case downstream of it. The order and the
// assertions are the bash suite's, case for case.
//
// No transcript is involved anywhere in this flow, so no case has a legacy twin.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, runCli, tempRoot } from '../testing/harness';

const checkout = resolveRoot({}, __dirname);

// hooks/test-governance.sh:10 — isolate from the operator's bypass switches: a
// machine-wide pause must never make this suite go quiet and report green.
// ENGINEOS_BYPASS itself is already kept out by the harness env allowlist.
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// ------------------------------------------------------------------ helpers

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// The bash suite refused to run at all without git; a node:test suite says so per
// case instead of aborting the whole run.
function skipWithoutGit(t: TestContext): boolean {
  if (!hasGit()) {
    t.skip('git is not installed');
    return true;
  }
  return false;
}

// bash `mark`: one PostToolUse Edit payload naming the file, on the hook's stdin.
function mark(repo: string, sid: string, file: string): void {
  runCli(['hook', 'mark-unrecorded'], {
    stdin: envelope({ event: 'PostToolUse', cwd: repo, sid, tool: { name: 'Edit', input: { file_path: file } } }),
    env: ISOLATED,
    cwd: repo,
  });
}

// bash `dec`: the Stop hook's `.decision`, with "none" standing for a silent
// decision — which writes no stdout at all, exactly what the bash `jq -r
// '.decision // empty'` fallback reported.
function decisionOf(repo: string, sid: string, stopHookActive = false): string {
  const result = runCli(['hook', 'record-verify'], {
    stdin: envelope({ event: 'Stop', cwd: repo, sid, stopHookActive }),
    env: ISOLATED,
    cwd: repo,
  });
  const trimmed = result.stdout.trim();
  if (trimmed === '') return 'none';
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return 'none';
  }
  const decision = isRecord(parsed) ? parsed['decision'] : undefined;
  return typeof decision === 'string' && decision !== '' ? decision : 'none';
}

function markerFor(repo: string, sid: string): string {
  return join(repo, '.git', `ENGINEOS_UNRECORDED.${sid}`);
}

// ------------------------------------------------------------------ the cases

test('a code edit sets a session-scoped flag', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  assert.equal(existsSync(markerFor(repo, 'S1')), true, 'code edit did not set flag');
});

// .engineos/ is excluded everywhere (generic — not EngineOS-repo-specific).
test('an .engineos/ edit sets no flag', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'Smeta', join(repo, '.engineos', 'changes', 'note.ts'));
  assert.equal(existsSync(markerFor(repo, 'Smeta')), false, '.engineos/ edit set a flag');
});

// A consumer project's own docs/ or hooks/ dir is NOT excluded (regression: the
// exclusion used to be unscoped and swallowed React src/hooks/ and product docs/
// in every project, not just EngineOS's own tree).
test("a consumer project's docs/ edit sets a flag", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'Sproj1', join(repo, 'docs', 'gen.ts'));
  assert.equal(existsSync(markerFor(repo, 'Sproj1')), true, 'consumer project docs/ edit did not set a flag');
});

test("a consumer project's src/hooks/ edit sets a flag", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'Sproj2', join(repo, 'src', 'hooks', 'useAuth.ts'));
  assert.equal(existsSync(markerFor(repo, 'Sproj2')), true, 'consumer project src/hooks/ edit did not set a flag');
});

// EngineOS's own hooks/ and docs/ trees ARE excluded (avoid noisy self-routing).
// The hook only inspects the file-path string (no filesystem read), so a synthetic
// path under the real hooks/ and docs/ dirs exercises the exclusion without
// needing the file to exist — nothing is written inside the checkout.
test("EngineOS's own hooks/ file sets no flag", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'Seos1', join(checkout, 'hooks', 'fake-for-test.ts'));
  assert.equal(existsSync(markerFor(repo, 'Seos1')), false, "EngineOS's own hooks/ file set a flag");
});

test("EngineOS's own docs/ file sets no flag", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'Seos2', join(checkout, 'docs', 'fake-for-test.ts'));
  assert.equal(existsSync(markerFor(repo, 'Seos2')), false, "EngineOS's own docs/ file set a flag");
});

test('the same session blocks', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  assert.equal(decisionOf(repo, 'S1'), 'block', 'same-session did not block');
});

test('a different session is not blocked (stale isolation)', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  assert.equal(decisionOf(repo, 'S2'), 'none', 'other session blocked (stale isolation broken)');
});

test('the loop guard: stop_hook_active=true never blocks', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  assert.equal(decisionOf(repo, 'S1', true), 'none', 'loop guard failed');
});

test('a second session sets its own flag', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  assert.equal(existsSync(markerFor(repo, 'S2')), true, 'second session did not set flag');
});

// Session-scoped clearing: clear ONLY S1 the way the record-change skill does
// (`rm -f ".../ENGINEOS_UNRECORDED.$CLAUDE_SESSION_ID"`, not a blanket glob).
test('the session-scoped rm clears that session flag', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  rmSync(markerFor(repo, 'S1'), { force: true });
  assert.equal(decisionOf(repo, 'S1'), 'none', 'flag not cleared by session-scoped rm');
});

test("a sibling session's flag survives another session's clear", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S1', join(repo, 'src', 'foo.ts'));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  rmSync(markerFor(repo, 'S1'), { force: true });
  assert.equal(decisionOf(repo, 'S2'), 'block', "sibling session's flag was wiped by another session's clear");
});

// Defer escape hatch: the marker silences the gate for that session only, without
// deleting the debt flag itself.
test('a defer marker silences the gate', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  writeFileSync(`${markerFor(repo, 'S2')}.deferred`, '');
  assert.equal(decisionOf(repo, 'S2'), 'none', 'defer marker did not silence the gate');
});

test('a defer marker leaves the debt flag in place', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  writeFileSync(`${markerFor(repo, 'S2')}.deferred`, '');
  decisionOf(repo, 'S2');
  assert.equal(existsSync(markerFor(repo, 'S2')), true, 'defer removed the debt flag (it must only silence)');
});

test("another session does not inherit a sibling's defer", (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  mark(repo, 'S2', join(repo, 'src', 'bar.ts'));
  writeFileSync(`${markerFor(repo, 'S2')}.deferred`, '');
  mark(repo, 'S3', join(repo, 'src', 'baz.ts'));
  assert.equal(decisionOf(repo, 'S3'), 'block', "another session inherited S2's defer");
});
