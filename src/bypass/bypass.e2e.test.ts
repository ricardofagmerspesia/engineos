// Spawned black-box contract for the EngineOS bypass switch — the port of
// hooks/test-bypass.sh, one test per bash case, in the bash suite's order.
//
// src/bypass/cli.test.ts already drives `runBypass` in process; this file exists
// for the half that one cannot reach: what the SWITCH does to the hooks. Every
// case here goes through `node dist/engineos.cjs`, so the three switches are read
// by the same binary the harness runs, from an env the harness allowlists.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envelope, fixtureRepo, runCli, tempRoot, type HookEvent, type RunResult } from '../testing/harness';
import { isRecord } from '../lib/json';

// The session id every payload in the bash suite carried, and the one the
// unrecorded flag is keyed on.
const SESSION = 'S1';

// The word the prompt hook must say when EngineOS is off. A silent bypass is the
// failure mode this suite is mostly here to catch.
const BYPASS_ANNOUNCEMENT = 'BYPASS ACTIVE';

interface Fixture {
  root: string;
  repo: string;
  marker: string;
  env: Record<string, string>;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// A fresh repo plus the env every case needs. ENGINEOS_BYPASS_FLAG points at a
// path that does not exist, so the operator's own ~/.claude/engineos.bypass can
// never decide a case (bash exported the same thing at the top of the suite).
// The harness strips ENGINEOS_* from the spawned env, so it has to be passed
// explicitly on every call — an unset flag would fall back to the real HOME.
function fixture(t: TestContext): Fixture {
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  return {
    root,
    repo,
    marker: join(repo, '.git', 'ENGINEOS_BYPASS'),
    env: { ENGINEOS_BYPASS_FLAG: join(root, 'absent-machine-flag') },
  };
}

// bash `on()`: the per-repo marker is an empty file in the git dir.
function bypassOn(f: Fixture): void {
  writeFileSync(f.marker, '');
}

function runHook(name: string, stdin: string, env: Record<string, string>): RunResult {
  return runCli(['hook', name], { stdin, env });
}

function editEnvelope(repo: string): string {
  return envelope({
    event: 'PreToolUse',
    cwd: repo,
    sid: SESSION,
    tool: { name: 'Edit', input: { file_path: join(repo, 'src', 'api', 'orders.controller.ts') } },
  });
}

function agentEnvelope(repo: string, event: HookEvent): string {
  return envelope({
    event,
    cwd: repo,
    sid: SESSION,
    tool: { name: 'Task', input: { subagent_type: 'backend-coordinator', description: 'scoped change' } },
  });
}

// The harness envelope has no prompt key — UserPromptSubmit is the only event
// that carries one — so the suite builds that payload itself rather than growing
// the shared helper another optional field.
function promptEnvelope(repo: string, prompt: string): string {
  return JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    cwd: repo,
    session_id: SESSION,
    prompt,
    stop_hook_active: false,
  });
}

function parsedStdout(stdout: string): Record<string, unknown> {
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value)) throw new Error(`hook stdout is not a JSON object: ${stdout}`);
  return value;
}

// bash `ctx()`: the additionalContext a hook injected, or '' when it said nothing.
function contextOf(result: RunResult): string {
  if (result.stdout === '') return '';
  const specific = parsedStdout(result.stdout)['hookSpecificOutput'];
  if (!isRecord(specific)) return '';
  const text = specific['additionalContext'];
  return typeof text === 'string' ? text : '';
}

// bash `dec()`: the .decision a hook emitted, or "none" when it stayed silent.
function decisionOf(result: RunResult): string {
  if (result.stdout === '') return 'none';
  const decision = parsedStdout(result.stdout)['decision'];
  return typeof decision === 'string' ? decision : 'none';
}

// Silence is asserted on the exit code as well as on stdout: a hook that crashed
// would also print nothing, and bash's `[ -z ... ]` could not tell the two apart.
function assertSilent(result: RunResult): void {
  assert.deepEqual({ status: result.status, stdout: result.stdout }, { status: 0, stdout: '' });
}

function unrecordedFlag(repo: string): string {
  return join(repo, '.git', `ENGINEOS_UNRECORDED.${SESSION}`);
}

// ---------- gates ON (no marker) : hooks behave normally ----------

// hooks/test-bypass.sh:38 — "routing silent without bypass".
test('routing fires on a code edit when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assert.notEqual(contextOf(runHook('route-before-change', editEnvelope(f.repo), f.env)), '');
});

// hooks/test-bypass.sh:39 — "dispatch banner silent without bypass".
test('the dispatch banner fires when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assert.notEqual(contextOf(runHook('announce-agent-dispatch', agentEnvelope(f.repo, 'PreToolUse'), f.env)), '');
});

// hooks/test-bypass.sh:40 — "return banner silent without bypass".
test('the return banner fires when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assert.notEqual(contextOf(runHook('announce-agent-return', agentEnvelope(f.repo, 'PostToolUse'), f.env)), '');
});

// hooks/test-bypass.sh:41 — "prompt advisor silent without bypass".
test('the prompt advisor speaks when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const payload = promptEnvelope(f.repo, 'implement all the endpoints across every service');
  assert.notEqual(contextOf(runHook('prompt-advisor', payload, f.env)), '');
});

// hooks/test-bypass.sh:43-44 — "mark-unrecorded did not flag without bypass".
test('a code edit raises the unrecorded flag when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assertSilent(runHook('mark-unrecorded', editEnvelope(f.repo), f.env));
  assert.equal(existsSync(unrecordedFlag(f.repo)), true);
});

// hooks/test-bypass.sh:45 — "record gate did not block without bypass".
test('the record gate blocks on an unrecorded change when no switch is on', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  runHook('mark-unrecorded', editEnvelope(f.repo), f.env);
  const stop = envelope({ event: 'Stop', cwd: f.repo, sid: SESSION });
  assert.equal(decisionOf(runHook('record-verify', stop, f.env)), 'block');
});

// ---------- gates OFF (marker set) : hooks go quiet ----------

// hooks/test-bypass.sh:49 — "routing still fired under bypass".
test('routing stays silent under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  assertSilent(runHook('route-before-change', editEnvelope(f.repo), f.env));
});

// hooks/test-bypass.sh:50 — "dispatch banner still fired under bypass".
test('the dispatch banner stays silent under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  assertSilent(runHook('announce-agent-dispatch', agentEnvelope(f.repo, 'PreToolUse'), f.env));
});

// hooks/test-bypass.sh:51 — "return banner still fired under bypass".
test('the return banner stays silent under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  assertSilent(runHook('announce-agent-return', agentEnvelope(f.repo, 'PostToolUse'), f.env));
});

// hooks/test-bypass.sh:53-54 — "record gate still blocked under bypass". The
// unrecorded flag is deliberately left standing: the gate must go quiet because
// of the bypass, not because the debt was cleared.
test('the record gate stops blocking under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  runHook('mark-unrecorded', editEnvelope(f.repo), f.env);
  assert.equal(existsSync(unrecordedFlag(f.repo)), true);
  bypassOn(f);
  const stop = envelope({ event: 'Stop', cwd: f.repo, sid: SESSION });
  assert.equal(decisionOf(runHook('record-verify', stop, f.env)), 'none');
});

// hooks/test-bypass.sh:56-57 — "stop-verify still spoke under bypass".
test('stop-verify emits nothing at all under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  const stop = envelope({ event: 'Stop', cwd: f.repo, sid: SESSION });
  assertSilent(runHook('stop-verify', stop, f.env));
});

// hooks/test-bypass.sh:59-62 — "mark-unrecorded flagged under bypass".
test('a code edit raises no new unrecorded flag under the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  assertSilent(runHook('mark-unrecorded', editEnvelope(f.repo), f.env));
  assert.equal(existsSync(unrecordedFlag(f.repo)), false);
});

// hooks/test-bypass.sh:64-66 — "prompt advisor did not announce the active
// bypass". The one hook that must SPEAK when everything else goes quiet.
test('the prompt advisor announces the active bypass', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  const payload = promptEnvelope(f.repo, 'implement all the endpoints across every service');
  assert.equal(contextOf(runHook('prompt-advisor', payload, f.env)).includes(BYPASS_ANNOUNCEMENT), true);
});

// ---------- lifetime: SessionStart expires the marker ----------

// hooks/test-bypass.sh:68-71 — "bypass survived SessionStart". A forgotten
// bypass must expire into gates-ON, so the marker dies at the next session.
test('SessionStart expires the repo marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  bypassOn(f);
  const start = envelope({ event: 'SessionStart', cwd: f.repo, sid: 'S2' });
  assert.equal(runHook('ensure-project-layout', start, f.env).status, 0);
  assert.equal(existsSync(f.marker), false);
});

// ---------- CLI ----------

// hooks/test-bypass.sh:74-75 — "CLI status wrong when off".
test('the CLI answers active when every switch is off', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assert.equal(runCli(['bypass', 'status', f.repo], { env: f.env }).stdout, 'active\n');
});

// hooks/test-bypass.sh:76-77 — "CLI on did not set the marker".
test('the CLI on creates the repo marker and status names it', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  assert.equal(runCli(['bypass', 'on', f.repo], { env: f.env }).status, 0);
  assert.equal(existsSync(f.marker), true);
  assert.equal(runCli(['bypass', 'status', f.repo], { env: f.env }).stdout, 'bypassed (repo marker)\n');
});

// hooks/test-bypass.sh:78-79 — "CLI off did not clear the marker".
test('the CLI off clears the repo marker and status answers active', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  runCli(['bypass', 'on', f.repo], { env: f.env });
  assert.equal(runCli(['bypass', 'off', f.repo], { env: f.env }).status, 0);
  assert.equal(existsSync(f.marker), false);
  assert.equal(runCli(['bypass', 'status', f.repo], { env: f.env }).stdout, 'active\n');
});

// ---------- sticky switch: ENGINEOS_BYPASS=1 ----------
// Process-scoped and not cleared at SessionStart: it must bypass with no marker.

// hooks/test-bypass.sh:83-84 — "routing fired under ENGINEOS_BYPASS=1".
test('routing stays silent under ENGINEOS_BYPASS=1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const env = { ...f.env, ENGINEOS_BYPASS: '1' };
  assertSilent(runHook('route-before-change', editEnvelope(f.repo), env));
  assert.equal(existsSync(f.marker), false);
});

// hooks/test-bypass.sh:85-86 — "prompt advisor did not announce ENGINEOS_BYPASS=1".
test('the prompt advisor announces ENGINEOS_BYPASS=1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const env = { ...f.env, ENGINEOS_BYPASS: '1' };
  const payload = promptEnvelope(f.repo, 'implement all the endpoints across every service');
  assert.equal(contextOf(runHook('prompt-advisor', payload, env)).includes(BYPASS_ANNOUNCEMENT), true);
});

// hooks/test-bypass.sh:87-88 — "CLI status did not name the env switch".
test('the CLI status names ENGINEOS_BYPASS=1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const env = { ...f.env, ENGINEOS_BYPASS: '1' };
  assert.equal(runCli(['bypass', 'status', f.repo], { env }).stdout, 'bypassed (ENGINEOS_BYPASS=1)\n');
});

// ---------- sticky switch: machine-wide ~/.claude/engineos.bypass ----------
// The flag path is redirected into the temp root, so the real machine-wide flag
// is never read and never touched.

// hooks/test-bypass.sh:92-94 — "routing fired under the machine-wide flag".
test('routing stays silent under the machine-wide flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  assertSilent(runHook('route-before-change', editEnvelope(f.repo), { ENGINEOS_BYPASS_FLAG: flag }));
  assert.equal(existsSync(f.marker), false);
});

// hooks/test-bypass.sh:95-96 — "prompt advisor did not announce the machine-wide flag".
test('the prompt advisor announces the machine-wide flag', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  const payload = promptEnvelope(f.repo, 'implement all the endpoints across every service');
  const result = runHook('prompt-advisor', payload, { ENGINEOS_BYPASS_FLAG: flag });
  assert.equal(contextOf(result).includes(BYPASS_ANNOUNCEMENT), true);
});

// hooks/test-bypass.sh:97-98 — "CLI status did not name the machine-wide flag".
test('the CLI status names the machine-wide flag by path', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  const result = runCli(['bypass', 'status', f.repo], { env: { ENGINEOS_BYPASS_FLAG: flag } });
  assert.equal(result.stdout, `bypassed (${flag})\n`);
});

// hooks/test-bypass.sh:100-103 — "CLI off did not warn that the machine-wide
// flag still holds". `off` is repo-scoped, so it clears the marker and reports
// the sticky switch instead of silently leaving the operator bypassed.
test('the CLI off warns that the machine-wide flag still holds', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  bypassOn(f);
  const result = runCli(['bypass', 'off', f.repo], { env: { ENGINEOS_BYPASS_FLAG: flag } });
  assert.equal(result.stderr.includes('still bypasses everything'), true);
});

// hooks/test-bypass.sh:104 — "CLI off deleted the machine-wide flag".
test('the CLI off leaves the machine-wide flag in place', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  bypassOn(f);
  runCli(['bypass', 'off', f.repo], { env: { ENGINEOS_BYPASS_FLAG: flag } });
  assert.equal(existsSync(flag), true);
});

// hooks/test-bypass.sh:105 — "CLI off did not clear the repo marker".
test('the CLI off clears the repo marker even when a sticky switch holds', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const f = fixture(t);
  const flag = join(f.root, 'machine-flag');
  writeFileSync(flag, '');
  bypassOn(f);
  runCli(['bypass', 'off', f.repo], { env: { ENGINEOS_BYPASS_FLAG: flag } });
  assert.equal(existsSync(f.marker), false);
});

// ---------- non-git dir: nothing to bypass ----------

// hooks/test-bypass.sh:109-111 — "CLI claimed success outside a git repo".
test('the CLI refuses a directory outside any git repo', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const outside = tempRoot(t);
  const result = runCli(['bypass', 'on', outside], { env: { ENGINEOS_BYPASS_FLAG: join(outside, 'absent-machine-flag') } });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, 'engineos: not a git repository — bypass has no effect here\n');
});
