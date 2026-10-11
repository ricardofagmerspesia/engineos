// Client of the opt-in embedding tie-break daemon (tools/embedding-daemon,
// enabled by ENGINEOS_EMBED_DAEMON=1). Consulted only when the deterministic
// route came back ambiguous AND a private daemon socket already exists; it
// never starts the daemon, never loads a model and never imports the daemon
// package, so the root bundle carries no embedding dependency.
//
// Every "not now" answer is `skipped`, decided by synchronous checks whose only
// I/O is two lstat calls, so the absent-socket path returns well inside the
// 50 ms budget. Only a present, private socket costs a round trip, and that is
// bounded by DEFAULT_DEADLINE_MS.
//
// The returned `scores` has the shape kernel/combine.ts reserves as
// `tiebreak?: Record<string, number>`; reading it is the kernel owner's change.
import { lstatSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redactText } from './redact';
import type { RedactionPattern } from './types';

const ENABLE_ENV = 'ENGINEOS_EMBED_DAEMON';
const ENABLE_VALUE = '1';
const SOCKET_NAME = 'embed.sock';
const PROTOCOL_VERSION = 1;
// A warm MiniLM pass over a prompt is single-digit milliseconds; the deadline
// leaves room for exemplar vectors the daemon has not cached yet.
const DEFAULT_DEADLINE_MS = 150;
const GROUP_OTHER_BITS = 0o077;
// Mirrors tools/embedding-daemon/src/protocol.ts LIMITS: the daemon refuses
// oversize input, so the client trims to these before sending.
const LIMITS = { maxLineBytes: 65_536, maxTextChars: 2_000, maxCandidates: 10, maxExemplars: 10, maxExemplarChars: 300 } as const;
const MAX_RESPONSE_BYTES = 16_384;
const INTENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface TiebreakCandidate {
  id: string;
  exemplars: readonly string[];
}

export interface TiebreakInput {
  text: string;
  // The deterministic combine's verdict; anything but ambiguous is final.
  ambiguous: boolean;
  // Ranked candidates, best first; only these may receive a score.
  candidates: readonly TiebreakCandidate[];
}

export type FileKind = 'socket' | 'directory' | 'symlink' | 'other';

export interface FileFacts {
  kind: FileKind;
  uid: number;
  mode: number;
}

export interface TiebreakDeps {
  env: Record<string, string | undefined>;
  now: () => number;
  // null where the platform has no POSIX uid (the daemon is unix-only).
  uid: number | null;
  tmpdir: () => string;
  // null when the path does not exist.
  lstat: (path: string) => FileFacts | null;
  connect: (path: string) => Socket;
  redaction: readonly RedactionPattern[];
  deadlineMs?: number;
}

export type TiebreakSkippedReason = 'disabled' | 'not-ambiguous' | 'no-candidates' | 'no-socket' | 'unsafe-socket' | 'oversize';
export type TiebreakFailedReason = 'timeout' | 'network' | 'busy' | 'invalid-response';

export type TiebreakOutcome =
  | { kind: 'scores'; scores: Record<string, number>; model: string; latency_ms: number }
  | { kind: 'skipped'; reason: TiebreakSkippedReason }
  | { kind: 'failed'; reason: TiebreakFailedReason };

type Skipped = { kind: 'skipped'; reason: TiebreakSkippedReason };

export function nodeTiebreakDeps(env: Record<string, string | undefined>, redaction: readonly RedactionPattern[]): TiebreakDeps {
  return {
    env,
    now: Date.now,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    tmpdir,
    lstat: fileFacts,
    connect: (path) => connect(path),
    redaction,
  };
}

export async function tiebreak(input: TiebreakInput, deps: TiebreakDeps): Promise<TiebreakOutcome> {
  if (deps.env[ENABLE_ENV] !== ENABLE_VALUE) return skipped('disabled');
  if (!input.ambiguous) return skipped('not-ambiguous');
  const candidates = boundedCandidates(input.candidates);
  if (candidates.length === 0) return skipped('no-candidates');
  const socket = privateSocket(deps);
  if (socket.kind === 'skipped') return socket;
  // Redact before trimming so a secret cut in half by the trim cannot escape
  // its pattern; the daemon never logs text, but it does hold it in memory.
  const text = redactText(input.text, deps.redaction).slice(0, LIMITS.maxTextChars);
  if (text.trim() === '') return skipped('no-candidates');
  const line = `${JSON.stringify({ v: PROTOCOL_VERSION, op: 'rank', text, candidates })}\n`;
  if (Buffer.byteLength(line) > LIMITS.maxLineBytes) return skipped('oversize');
  const started = deps.now();
  const reply = await exchange(deps, socket.path, line);
  if (reply.kind === 'failed') return reply;
  return parseReply(reply.body, new Set(candidates.map((candidate) => candidate.id)), deps.now() - started);
}

// Same placement and privacy rule as the daemon (tools/embedding-daemon/src/
// socket.ts): a directory that is a symlink, foreign-owned or open to group or
// other could hold a socket someone else planted to read prompts.
function privateSocket(deps: TiebreakDeps): { kind: 'present'; path: string } | Skipped {
  if (deps.uid === null) return skipped('no-socket');
  const base = nonEmpty(deps.env['XDG_RUNTIME_DIR']) ?? nonEmpty(deps.env['TMPDIR']) ?? deps.tmpdir();
  const dir = join(base, `engineos-${deps.uid}`);
  const path = join(dir, SOCKET_NAME);
  const dirFacts = deps.lstat(dir);
  if (dirFacts === null) return skipped('no-socket');
  if (dirFacts.kind !== 'directory' || dirFacts.uid !== deps.uid || (dirFacts.mode & GROUP_OTHER_BITS) !== 0) return skipped('unsafe-socket');
  const socketFacts = deps.lstat(path);
  if (socketFacts === null) return skipped('no-socket');
  if (socketFacts.kind !== 'socket' || socketFacts.uid !== deps.uid) return skipped('unsafe-socket');
  return { kind: 'present', path };
}

function boundedCandidates(candidates: readonly TiebreakCandidate[]): TiebreakCandidate[] {
  const seen = new Set<string>();
  const bounded: TiebreakCandidate[] = [];
  for (const candidate of candidates) {
    if (bounded.length === LIMITS.maxCandidates) break;
    if (!INTENT_ID.test(candidate.id) || seen.has(candidate.id)) continue;
    const exemplars = candidate.exemplars
      .map((exemplar) => exemplar.slice(0, LIMITS.maxExemplarChars))
      .filter((exemplar) => exemplar.trim() !== '')
      .slice(0, LIMITS.maxExemplars);
    if (exemplars.length === 0) continue;
    seen.add(candidate.id);
    bounded.push({ id: candidate.id, exemplars });
  }
  return bounded;
}

type Exchange = { kind: 'reply'; body: string } | { kind: 'failed'; reason: TiebreakFailedReason };

function exchange(deps: TiebreakDeps, path: string, line: string): Promise<Exchange> {
  return new Promise((settle) => {
    let body = '';
    let done = false;
    const socket = deps.connect(path);
    const timer = setTimeout(() => finish({ kind: 'failed', reason: 'timeout' }), deps.deadlineMs ?? DEFAULT_DEADLINE_MS);
    function finish(result: Exchange): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      settle(result);
    }
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(line));
    socket.on('data', (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) return finish({ kind: 'failed', reason: 'invalid-response' });
      const end = body.indexOf('\n');
      if (end >= 0) finish({ kind: 'reply', body: body.slice(0, end) });
    });
    socket.once('end', () => finish({ kind: 'reply', body }));
    socket.once('error', () => finish({ kind: 'failed', reason: 'network' }));
  });
}

function parseReply(body: string, offered: ReadonlySet<string>, latency: number): TiebreakOutcome {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return failed('invalid-response');
  }
  if (!isRecord(value) || value['v'] !== PROTOCOL_VERSION) return failed('invalid-response');
  if (value['ok'] === false) return failed(value['error'] === 'busy' ? 'busy' : 'invalid-response');
  const model = value['model'];
  const scores = value['scores'];
  if (value['ok'] !== true || typeof model !== 'string' || !isRecord(scores)) return failed('invalid-response');
  const accepted: Record<string, number> = {};
  for (const [id, score] of Object.entries(scores)) {
    // A score for an intent the client did not offer, or outside [0,1], means
    // the peer is not the daemon this client speaks to: refuse it whole.
    if (!offered.has(id) || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return failed('invalid-response');
    accepted[id] = score;
  }
  return { kind: 'scores', scores: accepted, model, latency_ms: latency };
}

function fileFacts(path: string): FileFacts | null {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return null;
  const kind: FileKind = stat.isSymbolicLink() ? 'symlink' : stat.isSocket() ? 'socket' : stat.isDirectory() ? 'directory' : 'other';
  return { kind, uid: stat.uid, mode: stat.mode };
}

function skipped(reason: TiebreakSkippedReason): Skipped {
  return { kind: 'skipped', reason };
}

function failed(reason: TiebreakFailedReason): TiebreakOutcome {
  return { kind: 'failed', reason };
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
