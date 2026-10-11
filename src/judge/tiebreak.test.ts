import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { tiebreak, tiebreakEnabled, type FileFacts, type TiebreakCandidate, type TiebreakDeps, type TiebreakInput } from './tiebreak';
import type { RedactionPattern } from './types';

const patterns: readonly RedactionPattern[] = loadPolicy(resolveRoot({}, __dirname)).judge.redaction.patterns;
const UID = 4242;
const BASE = '/runtime-base';
const DIR = join(BASE, `engineos-${UID}`);
const SOCKET = join(DIR, 'embed.sock');
const PRIVATE_DIR: FileFacts = { kind: 'directory', uid: UID, mode: 0o40700 };
const OWN_SOCKET: FileFacts = { kind: 'socket', uid: UID, mode: 0o140600 };
const githubToken = (): string => 'gh' + 'p_' + 'x'.repeat(36);

// The daemon side of the protocol: one unix-domain server per test in a fresh
// temporary directory (local IPC only, no network). `reply` decides what the
// peer writes back for the request line it received.
interface FakeDaemon {
  path: string;
  requests: string[];
  close: () => Promise<void>;
}

type Reply = (request: string, socket: Socket) => void;

async function startDaemon(reply: Reply): Promise<FakeDaemon> {
  const dir = mkdtempSync(join(tmpdir(), 'eos-tb-'));
  const path = join(dir, 's.sock');
  const requests: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      requests.push(line);
      reply(line, socket);
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  return {
    path,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function answering(body: unknown): Reply {
  return (_request, socket) => {
    socket.write(`${JSON.stringify(body)}\n`);
  };
}

interface DepsOptions {
  env?: Record<string, string | undefined>;
  uid?: number | null;
  files?: Record<string, FileFacts>;
  connectTo?: string;
  deadlineMs?: number;
}

interface Recorded {
  deps: TiebreakDeps;
  lstatCalls: string[];
  connectCalls: string[];
}

function depsFor(options: DepsOptions = {}): Recorded {
  const files = options.files ?? { [DIR]: PRIVATE_DIR, [SOCKET]: OWN_SOCKET };
  const lstatCalls: string[] = [];
  const connectCalls: string[] = [];
  let clock = 50_000;
  const deps: TiebreakDeps = {
    env: options.env ?? { ENGINEOS_EMBED_DAEMON: '1', TMPDIR: BASE },
    now: () => {
      clock += 5;
      return clock;
    },
    uid: options.uid === undefined ? UID : options.uid,
    tmpdir: () => '/fallback-tmp',
    lstat: (path) => {
      lstatCalls.push(path);
      return files[path] ?? null;
    },
    connect: (path) => {
      connectCalls.push(path);
      return connect(options.connectTo ?? join(tmpdir(), 'eos-tb-absent', 'none.sock'));
    },
    redaction: patterns,
  };
  if (options.deadlineMs !== undefined) deps.deadlineMs = options.deadlineMs;
  return { deps, lstatCalls, connectCalls };
}

function candidate(id: string, exemplars: readonly string[] = [`${id} example`]): TiebreakCandidate {
  return { id, exemplars };
}

function request(overrides: Partial<TiebreakInput> = {}): TiebreakInput {
  return { text: 'build the settings screen', ambiguous: true, candidates: [candidate('frontend'), candidate('mobile')], ...overrides };
}

interface SentRequest {
  v: unknown;
  op: unknown;
  text: string;
  candidates: TiebreakCandidate[];
}

function sent(daemon: FakeDaemon): SentRequest {
  const line = daemon.requests[0];
  if (line === undefined) throw new Error('the daemon received no request');
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('request is not an object');
  const record: Record<string, unknown> = { ...parsed };
  const text = record['text'];
  const candidates = record['candidates'];
  if (typeof text !== 'string' || !Array.isArray(candidates)) throw new Error('request lacks text or candidates');
  return {
    v: record['v'],
    op: record['op'],
    text,
    candidates: candidates.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) throw new Error('candidate is not an object');
      const row: Record<string, unknown> = { ...item };
      const id = row['id'];
      const exemplars = row['exemplars'];
      if (typeof id !== 'string' || !Array.isArray(exemplars)) throw new Error('candidate shape');
      return { id, exemplars: exemplars.map((exemplar: unknown) => String(exemplar)) };
    }),
  };
}

async function withDaemon(reply: Reply, run: (daemon: FakeDaemon) => Promise<void>): Promise<void> {
  const daemon = await startDaemon(reply);
  try {
    await run(daemon);
  } finally {
    await daemon.close();
  }
}

const OK_SCORES = { v: 1, ok: true, model: 'minilm-test', scores: { frontend: 0.9, mobile: 0.2 } };

test('tiebreakEnabled answers true only for the exact opt-in value', () => {
  assert.equal(tiebreakEnabled({ ENGINEOS_EMBED_DAEMON: '1' }), true);
  assert.equal(tiebreakEnabled({ ENGINEOS_EMBED_DAEMON: 'true' }), false);
  assert.equal(tiebreakEnabled({}), false);
});

test('a disabled client is skipped without touching the filesystem or a socket', async () => {
  const recorded = depsFor({ env: { TMPDIR: BASE } });

  const outcome = await tiebreak(request(), recorded.deps);

  assert.deepEqual(outcome, { kind: 'skipped', reason: 'disabled' });
  assert.deepEqual(recorded.lstatCalls, []);
  assert.deepEqual(recorded.connectCalls, []);
});

test('a route that is not ambiguous is final and skipped', async () => {
  const recorded = depsFor();

  const outcome = await tiebreak(request({ ambiguous: false }), recorded.deps);

  assert.deepEqual(outcome, { kind: 'skipped', reason: 'not-ambiguous' });
  assert.deepEqual(recorded.lstatCalls, []);
});

test('no usable candidate is skipped as no-candidates', async () => {
  const unusable: TiebreakCandidate[][] = [
    [],
    [candidate('Not An Id'), candidate('-leading-dash')],
    [candidate('frontend', []), candidate('mobile', ['   ', ''])],
  ];
  for (const candidates of unusable) {
    const recorded = depsFor();

    const outcome = await tiebreak(request({ candidates }), recorded.deps);

    assert.deepEqual(outcome, { kind: 'skipped', reason: 'no-candidates' });
    assert.deepEqual(recorded.connectCalls, []);
  }
});

test('a platform without a uid, a missing directory or a missing socket is skipped as no-socket', async () => {
  const cases: DepsOptions[] = [
    { uid: null },
    { files: {} },
    { files: { [DIR]: PRIVATE_DIR } },
  ];
  for (const options of cases) {
    const recorded = depsFor(options);

    const outcome = await tiebreak(request(), recorded.deps);

    assert.deepEqual(outcome, { kind: 'skipped', reason: 'no-socket' });
    assert.deepEqual(recorded.connectCalls, []);
  }
});

test('the socket is looked for under XDG_RUNTIME_DIR first, then TMPDIR, then the OS temp dir', async () => {
  const lookups: [Record<string, string | undefined>, string][] = [
    [{ ENGINEOS_EMBED_DAEMON: '1', XDG_RUNTIME_DIR: '/xdg', TMPDIR: BASE }, join('/xdg', `engineos-${UID}`)],
    [{ ENGINEOS_EMBED_DAEMON: '1', TMPDIR: BASE }, DIR],
    [{ ENGINEOS_EMBED_DAEMON: '1' }, join('/fallback-tmp', `engineos-${UID}`)],
  ];
  for (const [env, expectedDir] of lookups) {
    const recorded = depsFor({ env, files: {} });

    await tiebreak(request(), recorded.deps);

    assert.deepEqual(recorded.lstatCalls, [expectedDir]);
  }
});

test('a directory or socket someone else could control is skipped as unsafe-socket', async () => {
  const unsafe: Record<string, FileFacts>[] = [
    { [DIR]: { kind: 'symlink', uid: UID, mode: 0o120777 }, [SOCKET]: OWN_SOCKET },
    { [DIR]: { kind: 'directory', uid: UID + 1, mode: 0o40700 }, [SOCKET]: OWN_SOCKET },
    { [DIR]: { kind: 'directory', uid: UID, mode: 0o40750 }, [SOCKET]: OWN_SOCKET },
    { [DIR]: { kind: 'directory', uid: UID, mode: 0o40702 }, [SOCKET]: OWN_SOCKET },
    { [DIR]: PRIVATE_DIR, [SOCKET]: { kind: 'file', uid: UID, mode: 0o100600 } },
    { [DIR]: PRIVATE_DIR, [SOCKET]: { kind: 'socket', uid: UID + 1, mode: 0o140600 } },
  ];
  for (const files of unsafe) {
    const recorded = depsFor({ files });

    const outcome = await tiebreak(request(), recorded.deps);

    assert.deepEqual(outcome, { kind: 'skipped', reason: 'unsafe-socket' });
    assert.deepEqual(recorded.connectCalls, []);
  }
});

test('a prompt that redacts to nothing but whitespace is never sent', async () => {
  const recorded = depsFor();

  const outcome = await tiebreak(request({ text: '   \n  ' }), recorded.deps);

  assert.deepEqual(outcome, { kind: 'skipped', reason: 'no-candidates' });
  assert.deepEqual(recorded.connectCalls, []);
});

test('a request line over the daemon limit is skipped as oversize before connecting', async () => {
  // 10 candidates x 10 exemplars x 300 three-byte characters is about 90 KB.
  const wide = Array.from({ length: 10 }, (_, i) => candidate(`intent-${i}`, Array.from({ length: 10 }, () => '€'.repeat(300))));
  const recorded = depsFor();

  const outcome = await tiebreak(request({ candidates: wide }), recorded.deps);

  assert.deepEqual(outcome, { kind: 'skipped', reason: 'oversize' });
  assert.deepEqual(recorded.connectCalls, []);
});

test('a well-formed reply becomes scores for the offered candidates, with the client-measured latency', async () => {
  await withDaemon(answering(OK_SCORES), async (daemon) => {
    const recorded = depsFor({ connectTo: daemon.path });

    const outcome = await tiebreak(request(), recorded.deps);

    assert.deepEqual(outcome, { kind: 'scores', scores: { frontend: 0.9, mobile: 0.2 }, model: 'minilm-test', latency_ms: 5 });
    assert.deepEqual(recorded.connectCalls, [SOCKET]);
    const line = sent(daemon);
    assert.equal(line.v, 1);
    assert.equal(line.op, 'rank');
    assert.equal(line.text, 'build the settings screen');
  });
});

test('the request is bounded: ten candidates, ten exemplars each, 300 characters per exemplar, duplicates and bad ids dropped', async () => {
  const many = [
    candidate('frontend', Array.from({ length: 12 }, (_, i) => `exemplar ${i} ${'y'.repeat(400)}`)),
    candidate('frontend', ['duplicate id']),
    candidate('Bad Id', ['bad id']),
    ...Array.from({ length: 12 }, (_, i) => candidate(`intent-${i}`)),
  ];
  await withDaemon(answering({ v: 1, ok: true, model: 'm', scores: {} }), async (daemon) => {
    await tiebreak(request({ candidates: many }), depsFor({ connectTo: daemon.path }).deps);

    const line = sent(daemon);
    assert.equal(line.candidates.length, 10);
    assert.deepEqual(line.candidates.map((item) => item.id), ['frontend', ...Array.from({ length: 9 }, (_, i) => `intent-${i}`)]);
    const first = line.candidates[0];
    assert.equal(first?.exemplars.length, 10);
    assert.ok(first?.exemplars.every((exemplar) => exemplar.length <= 300));
  });
});

test('the prompt is redacted before it is sent and trimmed to 2,000 characters', async () => {
  const text = `deploy with ${githubToken()} ` + 'filler '.repeat(600);
  await withDaemon(answering(OK_SCORES), async (daemon) => {
    await tiebreak(request({ text }), depsFor({ connectTo: daemon.path }).deps);

    const line = sent(daemon);
    assert.ok(line.text.startsWith('deploy with <redacted:github-token> '), line.text.slice(0, 60));
    assert.ok(line.text.length <= 2_000);
  });
});

test('the trim runs after redaction, so a secret straddling the 2,000-character limit is never sent in part', async () => {
  // The token starts 10 characters before the limit: trimming first would
  // send a 10-character fragment too short for its pattern to recognise.
  const text = 'w '.repeat(995) + githubToken() + ' tail';
  await withDaemon(answering(OK_SCORES), async (daemon) => {
    await tiebreak(request({ text }), depsFor({ connectTo: daemon.path }).deps);

    const line = sent(daemon);
    assert.ok(line.text.length <= 2_000);
    assert.ok(!line.text.includes('gh' + 'p_'), line.text.slice(-40));
  });
});

// The critic's construction (W2) scaled to the tie-break: PEM blocks upstream
// shrink the redacted prefix well under the 2,000-character trim, so only the
// pre-cap (2 x 2,000, mirroring tiebreak.ts) cuts the quoted secret.
const TIEBREAK_PRE_CAP = 4_000;
const DASHES = '-'.repeat(5);
const pemBlock = (): string =>
  `${DASHES}BEGIN RSA PRIVATE` + ` KEY${DASHES}\n` + ('A'.repeat(64) + '\n').repeat(20) + `${DASHES}END RSA PRIVATE` + ` KEY${DASHES}\n`;
const PHRASE_WORDS = ['correct', 'horse', 'battery', 'staple', 'zebra'];

function quotedSecrets(): string[] {
  const phrase = PHRASE_WORDS.join(' ');
  return ['pass' + 'word' + ': ' + `"${phrase}"`, 'sec' + 'ret' + ' = ' + `'${phrase}'`, JSON.stringify({ ['pass' + 'word']: phrase })];
}

test('a quoted secret straddling the redaction pre-cap after heavy upstream shrinkage is never sent in part', async () => {
  const head = pemBlock().repeat(2);
  for (const secret of quotedSecrets()) {
    for (const inside of [1, 12, Math.floor(secret.length / 2), secret.length - 3, secret.length - 1]) {
      const room = TIEBREAK_PRE_CAP - head.length - inside;
      const text = head + (room % 2 === 1 ? ' ' : '') + 'x '.repeat(Math.floor(room / 2)) + secret + ' and more after the cap';
      await withDaemon(answering(OK_SCORES), async (daemon) => {
        await tiebreak(request({ text }), depsFor({ connectTo: daemon.path }).deps);

        const line = sent(daemon);
        assert.ok(line.text.length < 2_000, 'the trim must not be what removes the secret');
        const leaked = PHRASE_WORDS.filter((word) => line.text.includes(word));
        assert.deepEqual(leaked, [], `cut ${inside} into ${secret.slice(0, 8)}: ${JSON.stringify(line.text.slice(-60))}`);
      });
    }
  }
});

const refusedReplies: [string, unknown, string][] = [
  ['a busy daemon', { v: 1, ok: false, error: 'busy' }, 'busy'],
  ['any other daemon error', { v: 1, ok: false, error: 'model-missing' }, 'invalid-response'],
  ['a different protocol version', { v: 2, ok: true, model: 'm', scores: {} }, 'invalid-response'],
  ['a score for an intent that was not offered', { v: 1, ok: true, model: 'm', scores: { devops: 0.5 } }, 'invalid-response'],
  ['a score above 1', { v: 1, ok: true, model: 'm', scores: { frontend: 1.5 } }, 'invalid-response'],
  ['a negative score', { v: 1, ok: true, model: 'm', scores: { frontend: -0.1 } }, 'invalid-response'],
  ['a missing model', { v: 1, ok: true, scores: { frontend: 0.5 } }, 'invalid-response'],
  ['scores that are not an object', { v: 1, ok: true, model: 'm', scores: [0.5] }, 'invalid-response'],
  ['a reply that is not an object', [1, 2, 3], 'invalid-response'],
];

for (const [name, body, reason] of refusedReplies) {
  test(`${name} fails as ${reason}`, async () => {
    await withDaemon(answering(body), async (daemon) => {
      const outcome = await tiebreak(request(), depsFor({ connectTo: daemon.path }).deps);

      assert.deepEqual(outcome, { kind: 'failed', reason });
    });
  });
}

test('a reply that is not JSON fails as invalid-response', async () => {
  await withDaemon((_request, socket) => socket.write('not json\n'), async (daemon) => {
    const outcome = await tiebreak(request(), depsFor({ connectTo: daemon.path }).deps);

    assert.deepEqual(outcome, { kind: 'failed', reason: 'invalid-response' });
  });
});

test('a reply that grows past the response cap without a newline fails as invalid-response', async () => {
  await withDaemon((_request, socket) => socket.write('x'.repeat(20_000)), async (daemon) => {
    const outcome = await tiebreak(request(), depsFor({ connectTo: daemon.path }).deps);

    assert.deepEqual(outcome, { kind: 'failed', reason: 'invalid-response' });
  });
});

test('a reply closed without a trailing newline is still parsed', async () => {
  await withDaemon((_request, socket) => socket.end(JSON.stringify(OK_SCORES)), async (daemon) => {
    const outcome = await tiebreak(request(), depsFor({ connectTo: daemon.path }).deps);

    assert.equal(outcome.kind, 'scores');
  });
});

test('a daemon that never answers fails as timeout at the deadline', async () => {
  await withDaemon(() => undefined, async (daemon) => {
    const started = Date.now();

    const outcome = await tiebreak(request(), depsFor({ connectTo: daemon.path, deadlineMs: 50 }).deps);

    assert.deepEqual(outcome, { kind: 'failed', reason: 'timeout' });
    assert.ok(Date.now() - started < 5_000);
  });
});

test('a socket path nobody listens on fails as network', async () => {
  const outcome = await tiebreak(request(), depsFor().deps);

  assert.deepEqual(outcome, { kind: 'failed', reason: 'network' });
});
