// How the host ends, and the heartbeat that keeps its presence record fresh
// while it is worth trusting.
//
// Three ways out besides a crash: the mod's module unloading or the mod
// abandoning the host kills this child (a signal below); the host's own parent
// going away leaves an orphan, caught by the poll; and a hook request held past
// HOST_STALL_MS, which the mod gave up on long ago, makes the host leave on its
// own. The last one is what keeps an async stall from silencing the shell hooks:
// the event loop stays free then, so without it the heartbeat would keep the
// record fresh while every request times out, even if the mod's kill never
// lands. Every way out removes the record and the socket first.
import type { Server } from 'node:http';
import { PRESENCE_HEARTBEAT_MS } from '../../../src/lib/runtime-dir';
import { releasePaths, touchPresence, type HostPaths } from './presence';
import { HOST_STALL_MS } from './protocol';

export type HostLog = (level: 'info' | 'error', event: string, fields: Record<string, string | number>) => void;

// The hook requests the host is still answering, by when they arrived.
export interface RequestClock {
  // Marks one request as begun; the function it returns marks it done.
  begin: () => () => void;
  // Whether a request has been held longer than HOST_STALL_MS.
  stalled: (now: number) => boolean;
}

// What the heartbeat reads of the presence: live fields, as the server flips
// `published` on the mod's first route handshake.
export interface PresenceState {
  readonly paths: HostPaths;
  readonly published: boolean;
}

export interface LifetimeOptions {
  server: Server;
  presence: PresenceState;
  requests: RequestClock;
  log: HostLog;
}

export function requestClock(): RequestClock {
  const started = new Map<number, number>();
  let nextId = 0;
  return {
    begin: (): (() => void) => {
      const id = nextId;
      nextId += 1;
      started.set(id, Date.now());
      return (): void => {
        started.delete(id);
      };
    },
    stalled: (now: number): boolean => {
      for (const at of started.values()) if (now - at > HOST_STALL_MS) return true;
      return false;
    },
  };
}

export function watchLifetime(options: LifetimeOptions): void {
  const { server, presence, requests, log } = options;
  const { paths } = presence;
  const parent = process.ppid;
  const stop = (reason: string): void => {
    log('info', 'stopping', { reason });
    server.close();
    releasePaths(paths, process.pid);
    process.exit(0);
  };
  const poll = setInterval(() => {
    if (process.ppid !== parent) {
      stop('orphaned');
      return;
    }
    // Checked before the stamp, so an abandoned host never re-stamps its record.
    if (requests.stalled(Date.now())) {
      stop('stalled-hook');
      return;
    }
    if (presence.published) heartbeat(paths, log);
  }, PRESENCE_HEARTBEAT_MS);
  poll.unref();
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => stop(signal));
  process.on('exit', () => releasePaths(paths, process.pid));
}

// A missed stamp only makes the record go stale, which runs the shell hooks
// again: the failure direction is a double fire, so it is logged, not fatal.
function heartbeat(paths: HostPaths, log: HostLog): void {
  try {
    touchPresence(paths.presence, new Date());
  } catch (e) {
    log('error', 'heartbeat-failed', { reason: e instanceof Error ? e.message : String(e) });
  }
}
