import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { sessionPaths, type FileFacts, type PresenceRecord, type PrivateFile } from '../lib/runtime-dir';
import { runHookWith, servedInProcess, type HookTable, type InProcessGuardDeps, type InProcessQuery } from './adapter';
import { readEnvelope, type HookEnvelope } from './envelope';
import { ask, context, type HookDecision } from './output';

// ------------------------------------------------------------------ a host that serves

// One serving host, described as data: every guard condition holds, and each
// test breaks exactly one of them. Nothing here touches the filesystem, the
// process table or the real environment.
const UID = 501;
const OWN_PID = 4100;
const HOST_PID = 4200;
const VERSION = '9.9.9-test';
const ROOT = '/checkouts/engineos';
const RUNTIME_BASE = '/run/user/501';
const SESSION = 'session-1';
const NOW = 1_000_000;
const HOOK = 'route-before-change';
const NEVER_SILENCED_HOOK = 'git-write-guard';

const DIR = join(RUNTIME_BASE, `engineos-${UID}`);
const PATHS = sessionPaths(DIR, SESSION);

const PRIVATE_DIR: FileFacts = { kind: 'directory', uid: UID, mode: 0o40700 };
const PRIVATE_SOCKET: FileFacts = { kind: 'socket', uid: UID, mode: 0o140600 };
const PRIVATE_FILE: FileFacts = { kind: 'file', uid: UID, mode: 0o100600 };

function presence(overrides: Partial<PresenceRecord> = {}): PresenceRecord {
  return {
    v: 2,
    pid: HOST_PID,
    socket: PATHS.socket,
    session: SESSION,
    started_at: NOW - 60_000,
    served: [HOOK, NEVER_SILENCED_HOOK],
    root: ROOT,
    version: VERSION,
    ...overrides,
  };
}

interface World {
  uid: number | null;
  pid: number;
  version: string | null;
  root: string | null;
  tmpdir: string;
  dir: FileFacts | null;
  socket: FileFacts | null;
  presenceText: string | null;
  presenceFacts: FileFacts;
  mtimeMs: number;
  now: number;
  liveHosts: readonly number[];
  lstatThrows: boolean;
}

function servingWorld(overrides: Partial<World> = {}): World {
  return {
    uid: UID,
    pid: OWN_PID,
    version: VERSION,
    root: ROOT,
    tmpdir: '/os-tmp',
    dir: PRIVATE_DIR,
    socket: PRIVATE_SOCKET,
    presenceText: JSON.stringify(presence()),
    presenceFacts: PRIVATE_FILE,
    mtimeMs: NOW - 1_000,
    now: NOW,
    liveHosts: [HOST_PID],
    lstatThrows: false,
    ...overrides,
  };
}

// Paths are looked up by the runtime directory the world's uid derives, so a
// guard that computed a different directory finds nothing there.
function depsFor(world: World, dirPath: string = DIR, paths = PATHS): InProcessGuardDeps {
  return {
    uid: world.uid,
    pid: world.pid,
    tmpdir: () => world.tmpdir,
    lstat: (path: string): FileFacts | null => {
      if (world.lstatThrows) throw new Error('lstat failed');
      if (path === dirPath) return world.dir;
      if (path === paths.socket) return world.socket;
      return null;
    },
    readPrivateFile: (path: string, maxBytes: number): PrivateFile | null => {
      if (path !== paths.presence || world.presenceText === null) return null;
      if (Buffer.byteLength(world.presenceText) > maxBytes) return null;
      return { facts: world.presenceFacts, text: world.presenceText, mtimeMs: world.mtimeMs };
    },
    probe: (pid: number): void => {
      if (!world.liveHosts.includes(pid)) throw new Error('ESRCH');
    },
    now: () => world.now,
    version: world.version,
    root: () => world.root,
  };
}

function envelopeOf(payload: Record<string, unknown>): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: JSON.stringify(payload) }));
  if (decoded === null) throw new Error('the payload did not decode');
  return decoded;
}

const SERVING_ENV: Readonly<Record<string, string | undefined>> = { ENGINEOS_INPROCESS: '1', XDG_RUNTIME_DIR: RUNTIME_BASE };

function query(overrides: Partial<InProcessQuery> = {}): InProcessQuery {
  return { hook: HOOK, envelope: envelopeOf({ session_id: SESSION, cwd: '/project' }), env: SERVING_ENV, ...overrides };
}

// ------------------------------------------------------------------ servedInProcess

test('a live, private, current host serving this hook for this session stands the shell hook down', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld())), true);
});

test('git-write-guard is never stood down, even for a host that serves it perfectly', () => {
  assert.equal(servedInProcess(query({ hook: NEVER_SILENCED_HOOK }), depsFor(servingWorld())), false);
});

test('without ENGINEOS_INPROCESS=1 the shell hook runs', () => {
  for (const value of [undefined, '', '0', 'true', ' 1']) {
    const env: Record<string, string | undefined> = { ...SERVING_ENV, ENGINEOS_INPROCESS: value };
    assert.equal(servedInProcess(query({ env }), depsFor(servingWorld())), false, `ENGINEOS_INPROCESS=${String(value)}`);
  }
});

test('a payload with no session id runs the hook, though the envelope defaults one', () => {
  assert.equal(servedInProcess(query({ envelope: envelopeOf({ cwd: '/project' }) }), depsFor(servingWorld())), false);
});

test('a session id the host could never have been started with runs the hook', () => {
  for (const sessionId of ['a/b', '', 'x'.repeat(129), 'with space']) {
    const paths = sessionPaths(DIR, sessionId);
    const world = servingWorld({ presenceText: JSON.stringify(presence({ session: sessionId, socket: paths.socket })) });
    const served = servedInProcess(query({ envelope: envelopeOf({ session_id: sessionId }) }), depsFor(world, DIR, paths));
    assert.equal(served, false, `session id ${JSON.stringify(sessionId)}`);
  }
});

test('a platform without a uid runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ uid: null }))), false);
});

test('an unbundled run, which has no build version, runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ version: null }))), false);
});

test('a runtime directory that is not private runs the hook', () => {
  const unsafe: readonly (FileFacts | null)[] = [
    null,
    { ...PRIVATE_DIR, mode: 0o40750 },
    { ...PRIVATE_DIR, mode: 0o40702 },
    { ...PRIVATE_DIR, uid: UID + 1 },
    { ...PRIVATE_DIR, kind: 'symlink' },
  ];
  for (const dir of unsafe) {
    assert.equal(servedInProcess(query(), depsFor(servingWorld({ dir }))), false, JSON.stringify(dir));
  }
});

test('the runtime directory falls back to TMPDIR, then to the OS temp dir', () => {
  const viaTmpdir = join('/var/tmp-user', `engineos-${UID}`);
  const tmpdirEnv: Record<string, string | undefined> = { ENGINEOS_INPROCESS: '1', TMPDIR: '/var/tmp-user' };
  const tmpdirPaths = sessionPaths(viaTmpdir, SESSION);
  const tmpdirWorld = servingWorld({ presenceText: JSON.stringify(presence({ socket: tmpdirPaths.socket })) });
  assert.equal(servedInProcess(query({ env: tmpdirEnv }), depsFor(tmpdirWorld, viaTmpdir, tmpdirPaths)), true);

  const viaOs = join('/os-tmp', `engineos-${UID}`);
  const osPaths = sessionPaths(viaOs, SESSION);
  const osWorld = servingWorld({ presenceText: JSON.stringify(presence({ socket: osPaths.socket })) });
  assert.equal(servedInProcess(query({ env: { ENGINEOS_INPROCESS: '1' } }), depsFor(osWorld, viaOs, osPaths)), true);
});

test('a missing or unreadable presence record runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ presenceText: null }))), false);
});

test('the guard reads the presence record under a bound well below 5 KB', () => {
  const padded = JSON.stringify({ ...presence(), padding: 'x'.repeat(5_000) });
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ presenceText: padded }))), false);
});

test('a presence record another user could have written runs the hook', () => {
  const unsafe: readonly FileFacts[] = [
    { ...PRIVATE_FILE, mode: 0o100644 },
    { ...PRIVATE_FILE, uid: UID + 1 },
    { ...PRIVATE_FILE, kind: 'other' },
  ];
  for (const presenceFacts of unsafe) {
    assert.equal(servedInProcess(query(), depsFor(servingWorld({ presenceFacts }))), false, JSON.stringify(presenceFacts));
  }
});

test('a record that does not parse as a v2 presence record runs the hook', () => {
  const texts: readonly string[] = [
    'not json',
    JSON.stringify({ ...presence(), v: 1 }),
    JSON.stringify({ ...presence(), served: undefined }),
  ];
  for (const presenceText of texts) {
    assert.equal(servedInProcess(query(), depsFor(servingWorld({ presenceText }))), false, presenceText);
  }
});

test('a record for another session or another socket runs the hook', () => {
  const records: readonly PresenceRecord[] = [presence({ session: 'session-2' }), presence({ socket: join(DIR, 'h-other.sock') })];
  for (const record of records) {
    assert.equal(servedInProcess(query(), depsFor(servingWorld({ presenceText: JSON.stringify(record) }))), false);
  }
});

test('a host that does not list this hook as served leaves it to the shell', () => {
  const world = servingWorld({ presenceText: JSON.stringify(presence({ served: ['mark-unrecorded'] })) });
  assert.equal(servedInProcess(query(), depsFor(world)), false);
});

test('a host of another build version leaves the hook to the shell', () => {
  const world = servingWorld({ presenceText: JSON.stringify(presence({ version: '9.9.8-test' })) });
  assert.equal(servedInProcess(query(), depsFor(world)), false);
});

test('a record stamped within the stale window counts, one stamped outside it does not', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ mtimeMs: NOW - 30_000 }))), true);
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ mtimeMs: NOW - 30_001 }))), false);
  // A stamp from the future is as untrustworthy as an old one.
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ mtimeMs: NOW + 30_001 }))), false);
});

test('a record without our socket beside it runs the hook', () => {
  const sockets: readonly (FileFacts | null)[] = [null, { ...PRIVATE_SOCKET, kind: 'file' }, { ...PRIVATE_SOCKET, uid: UID + 1 }];
  for (const socket of sockets) {
    assert.equal(servedInProcess(query(), depsFor(servingWorld({ socket }))), false, JSON.stringify(socket));
  }
});

test('a record naming this very process runs the hook', () => {
  const world = servingWorld({ presenceText: JSON.stringify(presence({ pid: OWN_PID })), liveHosts: [OWN_PID] });
  assert.equal(servedInProcess(query(), depsFor(world)), false);
});

test('a host whose pid no longer answers runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ liveHosts: [] }))), false);
});

test('a host routing from another checkout, or from no known checkout, runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ root: '/checkouts/other' }))), false);
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ root: null }))), false);
});

test('any exception while checking runs the hook', () => {
  assert.equal(servedInProcess(query(), depsFor(servingWorld({ lstatThrows: true }))), false);
});

// ------------------------------------------------------------------ runHookWith

// A guard that can never stand a hook down, for the cases about running one.
const NOT_SERVING: InProcessGuardDeps = depsFor(servingWorld({ uid: null }));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function runAdapter(
  hooks: HookTable,
  argv: string[],
  opts: { stdin?: string; env?: NodeJS.ProcessEnv; hint?: string; guard?: InProcessGuardDeps } = {},
): Promise<Run> {
  const io = memoryIo({ stdin: opts.stdin ?? JSON.stringify({ session_id: SESSION, cwd: '/project' }), env: opts.env ?? {} });
  const code = await runHookWith(hooks, opts.hint ?? '', opts.guard ?? NOT_SERVING)(argv, io);
  return { code, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

const ASK_REASON = 'a write was requested';
const ASK_OUTPUT = `${JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: ASK_REASON },
})}\n`;

test('an unknown hook exits 2 and names itself with the caller hint', async () => {
  const result = await runAdapter({}, ['no-such-hook'], { hint: ' (try the full bundle)' });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.ok(
    result.stderr.startsWith('engineos hook: unknown hook: no-such-hook (try the full bundle)\n'),
    `unexpected stderr: ${JSON.stringify(result.stderr)}`,
  );
});

test('a missing hook name is an unknown hook too', async () => {
  const result = await runAdapter({}, []);
  assert.equal(result.code, 2);
  assert.ok(result.stderr.startsWith('engineos hook: unknown hook: \n'), JSON.stringify(result.stderr));
});

test('a payload that does not decode exits 0 silently without running the hook', async () => {
  let calls = 0;
  const hooks: HookTable = {
    [HOOK]: (): HookDecision => {
      calls += 1;
      return ask(ASK_REASON);
    },
  };
  for (const stdin of ['not json', '[]', '']) {
    assert.deepEqual(await runAdapter(hooks, [HOOK], { stdin }), { code: 0, stdout: '', stderr: '' }, JSON.stringify(stdin));
  }
  assert.equal(calls, 0);
});

test('a synchronous decision renders in the same tick', () => {
  const io = memoryIo({ stdin: JSON.stringify({ session_id: SESSION }) });
  const hooks: HookTable = { [HOOK]: () => ask(ASK_REASON) };
  const code = runHookWith(hooks, '', NOT_SERVING)([HOOK], io);
  assert.equal(code, 0);
  assert.equal(io.stdout.join(''), ASK_OUTPUT);
});

test('an asynchronous decision renders once it resolves', async () => {
  const hooks: HookTable = { [HOOK]: () => Promise.resolve(context('UserPromptSubmit', 'later')) };
  const io = memoryIo({ stdin: JSON.stringify({ session_id: SESSION }) });
  const pending = runHookWith(hooks, '', NOT_SERVING)([HOOK], io);
  assert.ok(pending instanceof Promise);
  assert.equal(io.stdout.join(''), '', 'nothing renders before the decision settles');
  assert.equal(await pending, 0);
  assert.equal(io.stdout.join(''), `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'later' } })}\n`);
});

test('the hook receives the decoded envelope', async () => {
  const seen: HookEnvelope[] = [];
  const hooks: HookTable = {
    [HOOK]: (envelope): HookDecision => {
      seen.push(envelope);
      return ask(ASK_REASON);
    },
  };
  await runAdapter(hooks, [HOOK], { stdin: JSON.stringify({ session_id: SESSION, cwd: '/project', prompt: 'hello' }) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.cwd, '/project');
  assert.equal(seen[0]?.prompt, 'hello');
  assert.equal(seen[0]?.sessionId, SESSION);
});

test('a hook that throws reports on stderr and exits 0', async () => {
  const hooks: HookTable = {
    [HOOK]: (): HookDecision => {
      throw new Error('kaput');
    },
  };
  assert.deepEqual(await runAdapter(hooks, [HOOK]), { code: 0, stdout: '', stderr: `[engineos] ${HOOK} failed: kaput\n` });
});

test('a hook that rejects reports on stderr and exits 0', async () => {
  const hooks: HookTable = { [HOOK]: () => Promise.reject(new Error('kaput later')) };
  assert.deepEqual(await runAdapter(hooks, [HOOK]), { code: 0, stdout: '', stderr: `[engineos] ${HOOK} failed: kaput later\n` });
});

test('a rejection with a non-error value is reported as text', async () => {
  const reason: unknown = 'plain text';
  const hooks: HookTable = { [HOOK]: () => Promise.reject(reason) };
  const result = await runAdapter(hooks, [HOOK]);
  assert.deepEqual(result, { code: 0, stdout: '', stderr: `[engineos] ${HOOK} failed: plain text\n` });
});

test('a hook a live host serves exits 0 silently and is not run', async () => {
  let calls = 0;
  const hooks: HookTable = {
    [HOOK]: (): HookDecision => {
      calls += 1;
      return ask(ASK_REASON);
    },
  };
  const result = await runAdapter(hooks, [HOOK], { env: { ...SERVING_ENV }, guard: depsFor(servingWorld()) });
  assert.deepEqual(result, { code: 0, stdout: '', stderr: '' });
  assert.equal(calls, 0);
});

test('git-write-guard still answers from the shell while a live host serves it', async () => {
  const hooks: HookTable = { [NEVER_SILENCED_HOOK]: () => ask(ASK_REASON) };
  const result = await runAdapter(hooks, [NEVER_SILENCED_HOOK], { env: { ...SERVING_ENV }, guard: depsFor(servingWorld()) });
  assert.deepEqual(result, { code: 0, stdout: ASK_OUTPUT, stderr: '' });
});
