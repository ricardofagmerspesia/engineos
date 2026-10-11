// Warm embedding tie-break daemon (opt-in: ENGINEOS_EMBED_DAEMON=1).
//
// Started by the developer (`npm --prefix tools/embedding-daemon start`), never
// by a hook. The model is loaded BEFORE the socket is bound, so a socket that
// exists is a warm daemon: the client's "socket present" test doubles as the
// readiness test and no prompt ever waits on a cold model load.
import { createServer, type Server, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createEmbedder, MODEL_ID, MODEL_REVISION, type Embedder } from './embedder.ts';
import { errorResponse, LIMITS, parseRequest, scoresResponse, type DaemonRequest, type DaemonResponse } from './protocol.ts';
import { claimSocket, ensurePrivateDir, restrictSocket, socketPlace } from './socket.ts';

const ENABLE_ENV = 'ENGINEOS_EMBED_DAEMON';
const ENABLE_VALUE = '1';
const SERVICE = 'engineos-embed';
// A client sends one line and waits; a connection open longer is stuck.
const CONNECTION_TIMEOUT_MS = 5_000;
// Inference is serialized; past this many waiting requests a client is told
// `busy` at once instead of queueing past its own deadline.
const MAX_PENDING = 8;
const DEFAULT_IDLE_MINUTES = 120;
const MS_PER_MINUTE = 60_000;

interface Settings {
  cacheDir: string;
  offline: boolean;
  idleMs: number;
}

function settingsFrom(env: NodeJS.ProcessEnv): Settings {
  const cacheHome = env['XDG_CACHE_HOME'] || join(homedir(), '.cache');
  const idle = Number.parseInt(env['ENGINEOS_EMBED_IDLE_MINUTES'] ?? '', 10);
  return {
    cacheDir: env['ENGINEOS_EMBED_CACHE'] || join(cacheHome, 'engineos', 'models'),
    offline: env['ENGINEOS_EMBED_OFFLINE'] === ENABLE_VALUE,
    idleMs: (Number.isFinite(idle) && idle > 0 ? idle : DEFAULT_IDLE_MINUTES) * MS_PER_MINUTE,
  };
}

// `serving` keeps the process alive on the listening socket; `exit` ends it.
type Started = { kind: 'exit'; code: number } | { kind: 'serving' };

async function main(): Promise<Started> {
  if (process.env[ENABLE_ENV] !== ENABLE_VALUE) {
    process.stderr.write(`[engineos] embedding daemon is opt-in: set ${ENABLE_ENV}=1 to start it\n`);
    return { kind: 'exit', code: 0 };
  }
  const settings = settingsFrom(process.env);
  const place = socketPlace(process.env);
  ensurePrivateDir(place.dir);
  if ((await claimSocket(place.path)) === 'in-use') {
    log('info', 'already-running', {});
    return { kind: 'exit', code: 0 };
  }
  const loading = Date.now();
  const embedder = await createEmbedder({ cacheDir: settings.cacheDir, offline: settings.offline });
  log('info', 'model-loaded', { model: MODEL_ID, revision: MODEL_REVISION, durationMs: Date.now() - loading });
  const queue = serialQueue();
  const idle = idleTimer(settings.idleMs, () => shutdown(server, 'idle'));
  const server = createServer((socket) => {
    idle.touch();
    serveConnection(socket, embedder, queue);
  });
  server.on('error', (e) => {
    log('error', 'server-error', { reason: e.message });
    shutdown(server, 'server-error');
  });
  server.listen(place.path, () => {
    restrictSocket(place.path);
    log('info', 'ready', {});
  });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => shutdown(server, signal));
  return { kind: 'serving' };
}

function serveConnection(socket: Socket, embedder: Embedder, queue: SerialQueue): void {
  socket.setTimeout(CONNECTION_TIMEOUT_MS, () => socket.destroy());
  let buffered = '';
  let answered = false;
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    if (answered) return;
    buffered += chunk;
    if (Buffer.byteLength(buffered) > LIMITS.maxLineBytes) {
      answered = true;
      return respond(socket, errorResponse('too-large'));
    }
    const end = buffered.indexOf('\n');
    if (end < 0) return;
    answered = true;
    const parsed = parseRequest(buffered.slice(0, end));
    if (parsed.kind === 'invalid') return respond(socket, errorResponse(parsed.error));
    void answer(parsed.request, embedder, queue).then((response) => respond(socket, response));
  });
  socket.on('error', () => socket.destroy());
}

async function answer(request: DaemonRequest, embedder: Embedder, queue: SerialQueue): Promise<DaemonResponse> {
  if (request.op === 'ping') return scoresResponse(embedder.model, {});
  if (queue.pending() >= MAX_PENDING) return errorResponse('busy');
  const started = Date.now();
  try {
    const scores = await queue.run(() => embedder.rank(request.text, request.candidates));
    // Counts and timing only: never the prompt, the exemplars or the scores'
    // intent ids beyond their number (rules/security.md, PII never in logs).
    log('info', 'rank', { candidates: request.candidates.length, durationMs: Date.now() - started });
    return scoresResponse(embedder.model, scores);
  } catch (e) {
    log('error', 'rank-failed', { reason: e instanceof Error ? e.name : 'unknown' });
    return errorResponse('internal');
  }
}

function respond(socket: Socket, response: DaemonResponse): void {
  if (socket.destroyed) return;
  socket.end(`${JSON.stringify(response)}\n`);
}

interface SerialQueue {
  run<T>(work: () => Promise<T>): Promise<T>;
  pending(): number;
}

// One forward pass at a time: the ONNX session is shared and a burst of
// parallel passes would only slow every one of them past its client deadline.
function serialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      waiting += 1;
      const next = tail.then(work, work).finally(() => {
        waiting -= 1;
      });
      tail = next.catch(() => undefined);
      return next;
    },
    pending: () => waiting,
  };
}

interface IdleTimer {
  touch(): void;
}

function idleTimer(ms: number, onIdle: () => void): IdleTimer {
  let timer = setTimeout(onIdle, ms);
  return {
    touch(): void {
      clearTimeout(timer);
      timer = setTimeout(onIdle, ms);
    },
  };
}

function shutdown(server: Server, reason: string): void {
  log('info', 'stopping', { reason });
  // close() unlinks the unix socket it bound; the timer bounds a connection
  // that is still mid-inference so a stop never hangs.
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), CONNECTION_TIMEOUT_MS).unref();
}

function log(level: 'info' | 'error', event: string, fields: Record<string, string | number>): void {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, service: SERVICE, ...fields })}\n`);
}

main().then(
  (started) => {
    if (started.kind === 'exit') process.exit(started.code);
  },
  (e: unknown) => {
    log('error', 'setup-failed', { reason: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  },
);
