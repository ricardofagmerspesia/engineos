// Smoke test of the committed per-call bundle, driven exactly as hooks/hooks.json
// drives it: `node dist/engineos-hot.cjs hook <name>` with the event on stdin.
// The point is the developer's git-write safety net (rules/git.md): the hot
// bundle must ask on a `git push`, and must keep asking while a live, valid
// in-process host claims to serve the same hook — while a hook the guard IS
// allowed to stand down (the control case) goes silent under the same record.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { isRecord } from './lib/json';
import { sessionPaths } from './lib/runtime-dir';
import { resolveRoot } from './registry/paths';

const checkout = resolveRoot({}, __dirname);
const HOT_BUNDLE = join(checkout, 'dist', 'engineos-hot.cjs');
const SESSION = 'hot-smoke-1';
const GUARD = 'git-write-guard';
const CONTROL = 'announce-agent-dispatch';

interface HotRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

// A short private base: a unix socket path must fit in 104 bytes on macOS, which
// the realpath of the per-user temp dir alone nearly fills.
function runtimeBase(t: TestContext): string {
  const base = mkdtempSync(join('/tmp', 'eos-'));
  t.after(() => {
    rmSync(base, { recursive: true, force: true });
  });
  return base;
}

// Everything the child sees is stated here: no operator HOME, bypass flag,
// XDG_RUNTIME_DIR or ENGINEOS_* switch can decide a case.
function hotEnv(base: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    TMPDIR: base,
    ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass',
    ENGINEOS_TELEMETRY: '0',
    ...extra,
  };
}

function runHot(args: string[], opts: { stdin: string; env: NodeJS.ProcessEnv; cwd: string }): HotRun {
  const result = spawnSync(process.execPath, [HOT_BUNDLE, ...args], { input: opts.stdin, env: opts.env, cwd: opts.cwd, encoding: 'utf8' });
  if (result.error !== undefined) throw new Error(`could not spawn ${HOT_BUNDLE}: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function bashEvent(command: string, cwd: string): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    cwd,
    session_id: SESSION,
  });
}

function agentEvent(cwd: string): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    tool_input: { subagent_type: 'backend-coordinator', description: 'smoke' },
    cwd,
    session_id: SESSION,
  });
}

function permissionDecision(stdout: string): unknown {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) return null;
  const specific = parsed['hookSpecificOutput'];
  if (!isRecord(specific)) return null;
  return [specific['hookEventName'], specific['permissionDecision']];
}

function bundleVersion(base: string): string {
  const result = runHot(['--version'], { stdin: '', env: hotEnv(base), cwd: base });
  const match = /^engineos (\S+)\n$/.exec(result.stdout);
  if (match === null || match[1] === undefined) throw new Error(`unexpected --version output: ${JSON.stringify(result.stdout)}`);
  return match[1];
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((settle, reject) => {
    server.once('error', reject);
    server.listen(path, () => settle());
  });
}

// A serving host as the shell guard sees one: a private runtime directory, a
// bound socket, and a fresh v2 record listing both hooks, for this checkout and
// this build, naming a live pid that is not the child's own (the test runner's).
async function servingHost(t: TestContext, base: string, uid: number): Promise<void> {
  const dir = join(base, `engineos-${uid}`);
  mkdirSync(dir, { mode: 0o700 });
  chmodSync(dir, 0o700);
  const paths = sessionPaths(dir, SESSION);
  const server = createServer();
  await listen(server, paths.socket);
  t.after(() => {
    server.close();
  });
  const record = {
    v: 2,
    pid: process.pid,
    socket: paths.socket,
    session: SESSION,
    started_at: Date.now(),
    served: [GUARD, CONTROL],
    root: realpathSync(checkout),
    version: bundleVersion(base),
  };
  writeFileSync(paths.presence, JSON.stringify(record), { mode: 0o600 });
  chmodSync(paths.presence, 0o600);
}

function skipReason(): string | null {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') return 'the in-process host is unix-only';
  if (!existsSync(HOT_BUNDLE)) return 'dist/engineos-hot.cjs is not built';
  return null;
}

test('the committed hot bundle asks before a git push', (t) => {
  const reason = skipReason();
  if (reason !== null) {
    t.skip(reason);
    return;
  }
  const base = runtimeBase(t);
  const result = runHot(['hook', GUARD], { stdin: bashEvent('git push', base), env: hotEnv(base), cwd: base });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(permissionDecision(result.stdout), ['PreToolUse', 'ask']);
});

test('the committed hot bundle stays silent on a command that names no git tool', (t) => {
  const reason = skipReason();
  if (reason !== null) {
    t.skip(reason);
    return;
  }
  const base = runtimeBase(t);
  const result = runHot(['hook', GUARD], { stdin: bashEvent('ls -la', base), env: hotEnv(base), cwd: base });
  assert.deepEqual({ status: result.status, stdout: result.stdout }, { status: 0, stdout: '' });
});

test('a live in-process host serving git-write-guard does not silence the hot bundle', async (t) => {
  const reason = skipReason();
  if (reason !== null || typeof process.getuid !== 'function') {
    t.skip(reason ?? 'no POSIX uid');
    return;
  }
  const base = runtimeBase(t);
  await servingHost(t, base, process.getuid());
  const env = hotEnv(base, { ENGINEOS_INPROCESS: '1' });

  // Control: the same record does stand a servable hook down, so the record is
  // one the guard accepts and the ask below is the never-silenced rule at work.
  const control = runHot(['hook', CONTROL], { stdin: agentEvent(base), env, cwd: base });
  assert.deepEqual({ status: control.status, stdout: control.stdout }, { status: 0, stdout: '' }, control.stderr);

  const guarded = runHot(['hook', GUARD], { stdin: bashEvent('git push', base), env, cwd: base });
  assert.equal(guarded.status, 0, guarded.stderr);
  assert.deepEqual(permissionDecision(guarded.stdout), ['PreToolUse', 'ask']);
});

test('the control hook announces when no host serves it', (t) => {
  const reason = skipReason();
  if (reason !== null) {
    t.skip(reason);
    return;
  }
  const base = runtimeBase(t);
  const result = runHot(['hook', CONTROL], { stdin: agentEvent(base), env: hotEnv(base, { ENGINEOS_INPROCESS: '1' }), cwd: base });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /backend-coordinator/);
});

test('a hook outside the per-call table is refused with a pointer to the full bundle', (t) => {
  const reason = skipReason();
  if (reason !== null) {
    t.skip(reason);
    return;
  }
  const base = runtimeBase(t);
  const result = runHot(['hook', 'stop-verify'], { stdin: '{}', env: hotEnv(base), cwd: base });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown hook: stop-verify \(not in the per-call bundle; run it through dist\/engineos\.cjs\)/);
});
