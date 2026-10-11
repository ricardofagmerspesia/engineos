// The mod's half of the boundary: start the one host process for this session
// and talk to it over its unix socket. Everything here goes through `$`; the
// mod environment has no Node, no timers and no way to import src/.
import type { EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult } from 'claude-code';
import {
  HOOK_PATH_PREFIX,
  HOST_EVENTS,
  HOST_PROTOCOL_VERSION,
  READY_PREFIX,
  ROUTES_PATH,
  type HookResponse,
  type HostRoute,
  type RoutesResponse,
  type WireDecision,
} from '../host/protocol';

type HostChild = HookStream<ProcessSpawnChunk, ProcessSpawnResult>;

// `failed` is final for the session: the mod never starts a second host, so
// every event after it passes through and the shell hooks serve.
export type HostState =
  | { kind: 'off' }
  | { kind: 'starting'; ready: Promise<HostState> }
  | { kind: 'ready'; socket: string; routes: HostRoute[]; child: HostChild }
  | { kind: 'failed'; reason: string };

// One hook request: answered in time, past its deadline, or anything else
// (refused, not ok, not a HookResponse). Only a timeout abandons the host.
export type HookCall = { kind: 'answered'; response: HookResponse } | { kind: 'timed-out' } | { kind: 'unusable' };

const ENABLED_VALUE = '1';
// The host bundle, relative to the EngineOS checkout (T09 wiring: build entry).
const HOST_BUNDLE = 'dist/engineos-inprocess.cjs';
// The mod folder is adapters/claude-code-mod inside the checkout; an installed
// copy elsewhere names the checkout with ENGINEOS_ROOT.
const ROOT_FROM_PLUGIN = '/../..';
const DEFAULT_NODE = 'node';
// Node's first start with a cold compile cache, plus the route read.
const READY_DEADLINE_MS = 5_000;
const ROUTES_DEADLINE_MS = 1_000;
// The URL's host is a label only: the request goes over the socket.
const SOCKET_ORIGIN = 'http://engineos';

const TIMED_OUT = Symbol('timed-out');

// Module state on purpose: a hot reload re-runs register in a fresh module and
// kills the previous host child with it, so state and child die together.
let state: HostState | null = null;

export async function ensureHost($: EngineInterface): Promise<HostState> {
  if (state === null) {
    const enabled = (await $.env.get('ENGINEOS_INPROCESS')) === ENABLED_VALUE;
    if (state === null) state = enabled ? starting($) : { kind: 'off' };
  }
  return state.kind === 'starting' ? state.ready : state;
}

function starting($: EngineInterface): HostState {
  const failed = (e: unknown): HostState => ({ kind: 'failed', reason: e instanceof Error ? e.message : 'start-error' });
  const ready = startHost($).catch(failed).then((settled) => {
    state = settled;
    if (settled.kind === 'failed') $.ui.log(`EngineOS in-process host unavailable (${settled.reason}); shell hooks stay in charge.`, { to: 'debug' });
    return settled;
  });
  return { kind: 'starting', ready };
}

async function startHost($: EngineInterface): Promise<HostState> {
  const root = absoluteOverride($, 'ENGINEOS_ROOT', await $.env.get('ENGINEOS_ROOT')) ?? `${$.plugin.root}${ROOT_FROM_PLUGIN}`;
  const node = absoluteOverride($, 'ENGINEOS_NODE', await $.env.get('ENGINEOS_NODE')) ?? DEFAULT_NODE;
  const sessionId = await $.session.id();
  let announce: (socket: string | null) => void = () => undefined;
  const announced = new Promise<string | null>((settle) => {
    announce = settle;
  });
  const child = $.process.spawn({ argv: [node, `${root}/${HOST_BUNDLE}`, 'serve', '--session', sessionId], env: { ENGINEOS_ROOT: root, ENGINEOS_INPROCESS: ENABLED_VALUE } });
  // The loop is the child's life: it outlives this dispatch and ends with the
  // child or with the module (the engine kills the child on unload).
  void (async () => {
    let stdout = '';
    try {
      for await (const { stream, text } of child) {
        if (stream === 'stderr') $.ui.log(text, { to: 'debug' });
        else stdout += text;
        const line = stdout.split('\n').find((candidate) => candidate.startsWith(READY_PREFIX));
        if (line !== undefined) announce(line.slice(READY_PREFIX.length).trim());
      }
    } catch (e) {
      $.ui.log(`EngineOS in-process host did not start: ${e instanceof Error ? e.message : String(e)}`, { to: 'debug' });
    }
    announce(null);
    if (state !== null && state.kind === 'ready') state = { kind: 'failed', reason: 'host-exited' };
  })();
  const socket = await withDeadline($, announced, READY_DEADLINE_MS);
  if (socket === null || socket === '') return { kind: 'failed', reason: 'host-exited' };
  // A host that comes up after the mod gave up is ended rather than left
  // holding the socket with nobody talking to it.
  if (socket === TIMED_OUT) return abandon(child, 'ready-timeout');
  // This GET is the handshake: the host publishes its presence record (which
  // lets the shell hooks it serves stand down) only while answering it. A host
  // whose answer the mod cannot use is ended, and its exit removes the record.
  const routes = await readRoutes($, socket);
  if (routes === null) return abandon(child, 'routes-unreadable');
  if (routes.unserved.length > 0) $.ui.log(`EngineOS hooks not served in-process: ${routes.unserved.join(', ')}`, { to: 'debug' });
  return { kind: 'ready', socket, routes: routes.routes, child };
}

// docs/OPT-IN-TIERS.md, abandon on timeout: a host that let one request miss
// its deadline may be stalled while its heartbeat still runs, and its fresh
// presence record would keep the shell hooks standing down while every request
// here times out. So the mod stops routing to it for the rest of the session and
// kills it; the host's signal handler removes the record and the socket, and the
// shell hooks serve from the next event on. A host the kill does not reach ends
// itself once it has held the request for HOST_STALL_MS (host/lifetime.ts).
// Only the host it was handed is abandoned, once, so concurrent timeouts on the
// same host do not kill twice.
export function abandonHost($: EngineInterface, host: Extract<HostState, { kind: 'ready' }>, reason: string): void {
  if (state !== host) return;
  state = abandon(host.child, reason);
  $.ui.log(`EngineOS in-process host abandoned (${reason}); shell hooks serve for the rest of this session.`, { to: 'debug' });
}

// A relative override resolves against whatever directory the session started
// in, so a repository under review could plant the host bundle or a `node`
// that the mod then runs. Only an absolute path is honoured; anything else is
// ignored, said once in the debug log, and the default is used.
function absoluteOverride($: EngineInterface, name: string, value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (value.startsWith('/') && !value.includes('\0')) return value;
  $.ui.log(`EngineOS ${name} ignored: not an absolute path`, { to: 'debug' });
  return null;
}

function abandon(child: HostChild, reason: string): HostState {
  void child.return({ code: null, signal: null }).catch(() => undefined);
  return { kind: 'failed', reason };
}

async function readRoutes($: EngineInterface, socket: string): Promise<RoutesResponse | null> {
  const request = $.http.fetch(`${SOCKET_ORIGIN}${ROUTES_PATH}`, { socketPath: socket }).catch(() => null);
  const answer = await withDeadline($, request, ROUTES_DEADLINE_MS);
  if (answer === TIMED_OUT || answer === null || !answer.ok) return null;
  const parsed = parseJson(answer.text);
  if (!isObject(parsed) || parsed['v'] !== HOST_PROTOCOL_VERSION || !Array.isArray(parsed['routes'])) return null;
  const routes = parsed['routes'].filter(isRoute);
  const unserved = Array.isArray(parsed['unserved']) ? parsed['unserved'].filter((item): item is string => typeof item === 'string') : [];
  return { v: HOST_PROTOCOL_VERSION, routes, unserved };
}

// One hook, one request. The caller decides what an unanswered hook means for
// its event, and abandons the host on a timeout.
export async function callHook($: EngineInterface, socket: string, name: string, envelope: unknown, deadlineMs: number): Promise<HookCall> {
  const request = $.http.fetch(`${SOCKET_ORIGIN}${HOOK_PATH_PREFIX}${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
    socketPath: socket,
  });
  const answer = await withDeadline($, request.catch(() => null), deadlineMs);
  if (answer === TIMED_OUT) return { kind: 'timed-out' };
  if (answer === null || !answer.ok) return { kind: 'unusable' };
  const parsed = parseJson(answer.text);
  if (!isObject(parsed) || parsed['v'] !== HOST_PROTOCOL_VERSION) return { kind: 'unusable' };
  const decision = parsed['decision'];
  if (!isDecision(decision)) return { kind: 'unusable' };
  const stderr = typeof parsed['stderr'] === 'string' ? parsed['stderr'] : '';
  return { kind: 'answered', response: { v: HOST_PROTOCOL_VERSION, decision, stderr } };
}

// The mod has no setTimeout; the clock's sleep is cancelled once the race is
// settled so a finished request leaves no wait behind.
async function withDeadline<T>($: EngineInterface, work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  const cancel = new AbortController();
  const timer = $.clock.sleep(ms, { signal: cancel.signal }).then(
    (): typeof TIMED_OUT => TIMED_OUT,
    (): typeof TIMED_OUT => TIMED_OUT,
  );
  try {
    return await Promise.race([work, timer]);
  } finally {
    cancel.abort();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoute(value: unknown): value is HostRoute {
  if (!isObject(value)) return false;
  const { event, matcher, hooks } = value;
  return HOST_EVENTS.some((known) => known === event) && typeof matcher === 'string' && Array.isArray(hooks) && hooks.every((hook) => typeof hook === 'string');
}

function isDecision(value: unknown): value is WireDecision {
  if (!isObject(value)) return false;
  switch (value['kind']) {
    case 'silent':
      return true;
    case 'context':
      return typeof value['event'] === 'string' && typeof value['text'] === 'string';
    case 'block':
    case 'ask':
      return typeof value['reason'] === 'string';
    case 'message':
      return typeof value['text'] === 'string';
    case 'fail':
      return typeof value['stderr'] === 'string';
    default:
      return false;
  }
}
