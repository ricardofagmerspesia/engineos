// The in-process adapter's host: ONE long-lived Node process per session that
// imports the hook run functions directly and serves them over a private unix
// socket. The mod (hooks/register.ts) runs in Claude Code's function-hook
// environment, which has no Node and cannot import src/ (node:fs, git spawns);
// it reaches this process through `$.http.fetch(..., { socketPath })`, so a
// tool call costs one local request instead of one `node` spawn.
//
// Bundled as its own entry (T09 wiring request: scripts/build.mjs), never into
// dist/engineos.cjs. Started by the mod with `serve --session <id>`; does
// nothing unless ENGINEOS_INPROCESS=1.
import { chmodSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { HOOKS } from '../../../src/hooks/cli';
import { hookContext, readEnvelope } from '../../../src/hooks/envelope';
import type { HookDecision } from '../../../src/hooks/output';
import type { Io } from '../../../src/io';
import { resolveRoot } from '../../../src/registry/paths';
import {
  claimPaths,
  currentUid,
  ensurePrivateDir,
  hostPaths,
  presenceRecord,
  privateDir,
  releasePaths,
  writePresence,
  type HostPaths,
} from './presence';
import {
  HOOK_PATH_PREFIX,
  HOST_PROTOCOL_VERSION,
  MAX_ENVELOPE_BYTES,
  READY_PREFIX,
  ROUTES_PATH,
  type HookResponse,
  type RoutesResponse,
  type WireDecision,
} from './protocol';
import { readRouteTable, type RouteTable } from './routes';

const ENABLE_ENV = 'ENGINEOS_INPROCESS';
const ENABLE_VALUE = '1';
const SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;
const SOCKET_MODE = 0o600;
// A request is one local hook; anything slower is a stuck client.
const REQUEST_TIMEOUT_MS = 30_000;
// The mod's module unloading kills this child; the poll covers the host itself
// dying, which would otherwise leave an orphan holding the socket.
const ORPHAN_POLL_MS = 5_000;
const SERVICE = 'engineos-inprocess';

type Started = { kind: 'exit'; code: number } | { kind: 'serving' };

interface HostState {
  table: RouteTable;
  served: ReadonlySet<string>;
  hookEnv: NodeJS.ProcessEnv;
}

function main(argv: readonly string[]): Started {
  if (process.env[ENABLE_ENV] !== ENABLE_VALUE) return { kind: 'exit', code: 0 };
  const sessionId = argv[0] === 'serve' && argv[1] === '--session' ? argv[2] ?? '' : '';
  if (!SESSION_ID.test(sessionId)) {
    log('error', 'bad-arguments', {});
    return { kind: 'exit', code: 2 };
  }
  const root = resolveRoot(process.env);
  const table = readRouteTable(root, new Set(Object.keys(HOOKS)));
  const served = new Set(table.routes.flatMap((route) => route.hooks));
  const uid = currentUid();
  const dir = privateDir(process.env, uid);
  ensurePrivateDir(dir, uid);
  const paths = hostPaths(dir, sessionId);
  claimPaths(paths);
  const state: HostState = { table, served, hookEnv: hookEnvironment(process.env) };
  const server = createServer((req, res) => {
    void handle(req, res, state);
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.on('error', (e) => {
    log('error', 'listen-failed', { reason: e.message });
    releasePaths(paths, process.pid);
    process.exit(1);
  });
  server.listen(paths.socket, () => {
    chmodSync(paths.socket, SOCKET_MODE);
    writePresence(paths.presence, presenceRecord(process.pid, paths.socket, sessionId, Date.now()));
    process.stdout.write(`${READY_PREFIX}${paths.socket}\n`);
    log('info', 'ready', { routes: table.routes.length, unserved: table.unserved.length });
  });
  watchLifetime(server, paths);
  return { kind: 'serving' };
}

// The hooks read their switches from ctx.io.env. The enable flag is removed
// so that a guard placed anywhere in the hook path can never mistake this host
// for a shell hook that should stay silent.
function hookEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  delete copy[ENABLE_ENV];
  return copy;
}

async function handle(req: IncomingMessage, res: ServerResponse, state: HostState): Promise<void> {
  const url = req.url ?? '';
  if (req.method === 'GET' && url === ROUTES_PATH) {
    const body: RoutesResponse = { v: HOST_PROTOCOL_VERSION, routes: state.table.routes, unserved: state.table.unserved };
    return reply(res, 200, body);
  }
  if (!url.startsWith(HOOK_PATH_PREFIX)) return reply(res, 404, { error: 'not-found' });
  if (req.method !== 'POST') return reply(res, 405, { error: 'method' });
  const name = url.slice(HOOK_PATH_PREFIX.length);
  const hook = state.served.has(name) ? HOOKS[name] : undefined;
  if (hook === undefined) return reply(res, 404, { error: 'unknown-hook' });
  const body = await readBody(req);
  if (body === null) return reply(res, 413, { error: 'too-large' });
  const started = Date.now();
  const answer = await runHook(name, body, state);
  log('info', 'hook', { hook: name, kind: answer.decision.kind, durationMs: Date.now() - started });
  return reply(res, 200, answer);
}

// The contract of src/hooks/cli.ts runHook, minus stdout: an unreadable
// payload and a throwing hook both answer silent, and say why on stderr.
async function runHook(name: string, body: string, state: HostState): Promise<HookResponse> {
  const stderr: string[] = [];
  const io = requestIo(body, state.hookEnv, stderr);
  const envelope = readEnvelope(io);
  if (envelope === null) return response({ kind: 'silent' }, stderr);
  const hook = HOOKS[name];
  if (hook === undefined) return response({ kind: 'silent' }, stderr);
  try {
    // A hook may answer a decision or a promise of one (prompt-advisor awaits
    // its judge); awaiting a plain value is a no-op.
    const decision: HookDecision = await hook(envelope, hookContext(envelope, io));
    return response(decision, stderr);
  } catch (e) {
    stderr.push(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return response({ kind: 'silent' }, stderr);
  }
}

function response(decision: WireDecision, stderr: readonly string[]): HookResponse {
  return { v: HOST_PROTOCOL_VERSION, decision, stderr: stderr.join('') };
}

function requestIo(body: string, env: NodeJS.ProcessEnv, stderr: string[]): Io {
  let consumed = false;
  return {
    readStdin(): string {
      if (consumed) return '';
      consumed = true;
      return body;
    },
    // A hook never writes stdout (output.ts renders decisions); anything that
    // does is kept off the socket's JSON and reported as stderr.
    out: (text) => {
      stderr.push(text);
    },
    err: (text) => {
      stderr.push(text);
    },
    env,
    cwd: () => process.cwd(),
  };
}

function readBody(req: IncomingMessage): Promise<string | null> {
  const declared = Number.parseInt(req.headers['content-length'] ?? '0', 10);
  if (Number.isFinite(declared) && declared > MAX_ENVELOPE_BYTES) return Promise.resolve(null);
  return new Promise((settle) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_ENVELOPE_BYTES) {
        req.destroy();
        settle(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => settle(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => settle(null));
  });
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function watchLifetime(server: Server, paths: HostPaths): void {
  const parent = process.ppid;
  const stop = (reason: string): void => {
    log('info', 'stopping', { reason });
    server.close();
    releasePaths(paths, process.pid);
    process.exit(0);
  };
  const poll = setInterval(() => {
    if (process.ppid !== parent) stop('orphaned');
  }, ORPHAN_POLL_MS);
  poll.unref();
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => stop(signal));
  process.on('exit', () => releasePaths(paths, process.pid));
}

// Structured lines on stderr (rules/observability.md); the mod forwards them to
// the debug log. Never prompt text, tool input or paths from the envelope.
function log(level: 'info' | 'error', event: string, fields: Record<string, string | number>): void {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, service: SERVICE, ...fields })}\n`);
}

try {
  const started = main(process.argv.slice(2));
  if (started.kind === 'exit') process.exit(started.code);
} catch (e) {
  log('error', 'setup-failed', { reason: e instanceof Error ? e.message : String(e) });
  process.exit(1);
}
