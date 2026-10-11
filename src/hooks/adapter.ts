// The adapter contract between the harness and a hook body: decode the envelope,
// run the hook, render its decision. A hook body never sees stdin, never writes
// stdout and never picks an exit code — those three live here and in ./output.
//
// Parameterised over the hook table so both entry points share it: ./cli builds
// the full table, src/hot-cli.ts the per-call one, and importing ./cli there
// would pull every hook into the hot bundle through its HOOKS map. This module
// imports only ./envelope, ./output and src/lib for the same reason.
import { tmpdir } from 'node:os';
import type { MaybeAsyncCommand } from '../dispatch';
import type { Io } from '../io';
import {
  HOST_SESSION_ID,
  isPrivateDir,
  isPrivateFile,
  lstatFacts,
  parsePresence,
  readPrivateFile,
  runtimeDir,
  sessionPaths,
  type FileFacts,
  type PrivateFile,
} from '../lib/runtime-dir';
import { hookContext, readEnvelope, type HookEnvelope } from './envelope';
import { fail, render, silent, type HookContext, type HookDecision } from './output';

// A hook answers synchronously, or — the prompt advisor, which awaits the
// judge — with a promise. Synchronous hooks keep rendering in the same tick.
export type HookRun = (env: HookEnvelope, ctx: HookContext) => HookDecision | Promise<HookDecision>;
export type HookTable = Readonly<Record<string, HookRun>>;

// The shell side of the in-process adapter's presence contract
// (docs/OPT-IN-TIERS.md "No double-fire"). Injected so the guard is testable
// without a live host; production callers take nodeInProcessGuardDeps().
export interface InProcessGuardDeps {
  // null where the platform has no POSIX uid: the host is unix-only.
  uid: number | null;
  pid: number;
  tmpdir: () => string;
  lstat: (path: string) => FileFacts | null;
  readPrivateFile: (path: string, maxBytes: number) => PrivateFile | null;
  // Throws when no process this user may signal has that pid.
  probe: (pid: number) => void;
}

const INPROCESS_ENV = 'ENGINEOS_INPROCESS';
const INPROCESS_VALUE = '1';
// A host record is about 200 bytes; anything far larger is not one.
const MAX_PRESENCE_BYTES = 4_096;

export function nodeInProcessGuardDeps(): InProcessGuardDeps {
  return {
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    pid: process.pid,
    tmpdir,
    lstat: lstatFacts,
    readPrivateFile,
    probe: (pid) => {
      process.kill(pid, 0);
    },
  };
}

// `unknownHint` is appended to the unknown-hook message, before its newline.
export function runHookWith(
  hooks: HookTable,
  unknownHint: string = '',
  guard: InProcessGuardDeps = nodeInProcessGuardDeps(),
): MaybeAsyncCommand {
  return (argv: string[], io: Io): number | Promise<number> => {
    const name = argv[0];
    const hook = name === undefined ? undefined : hooks[name];
    if (name === undefined || hook === undefined) {
      return render(fail(`engineos hook: unknown hook: ${name ?? ''}${unknownHint}\n`), io);
    }
    const env = readEnvelope(io);
    // A payload the hook cannot read is not the hook's problem to report: the
    // bash hooks carried on with empty defaults and exited 0, and a harness that
    // sees a non-zero exit on a malformed event would surface it as OUR failure.
    if (env === null) return render(silent, io);
    // A live in-process host already answered this event for this session;
    // answering again from the shell would fire every hook twice.
    if (servedInProcess(env, io.env, guard)) return render(silent, io);
    try {
      const decision = hook(env, hookContext(env, io));
      if (decision instanceof Promise) {
        return decision.then(
          (settled) => render(settled, io),
          (e: unknown) => failed(name, e, io),
        );
      }
      return render(decision, io);
    } catch (e) {
      return failed(name, e, io);
    }
  };
}

// Fails closed: true only when every condition holds, and any doubt — a missing
// session id, an unsafe directory, an unreadable or foreign record, a dead or
// foreign pid, an exception — runs the hook. A hook may then fire twice, but
// git-write-guard never fires zero times.
export function servedInProcess(env: HookEnvelope, ioEnv: Readonly<Record<string, string | undefined>>, deps: InProcessGuardDeps): boolean {
  try {
    if (ioEnv[INPROCESS_ENV] !== INPROCESS_VALUE) return false;
    // The raw field, not env.sessionId: that one defaults to `nosession`.
    const sessionId = rawSessionId(env.raw);
    if (sessionId === null || deps.uid === null) return false;
    const dir = runtimeDir(ioEnv, deps.uid, deps.tmpdir);
    if (!isPrivateDir(deps.lstat(dir), deps.uid)) return false;
    const paths = sessionPaths(dir, sessionId);
    const file = deps.readPrivateFile(paths.presence, MAX_PRESENCE_BYTES);
    if (file === null || !isPrivateFile(file.facts, deps.uid)) return false;
    const record = parsePresence(file.text);
    if (record === null || record.session !== sessionId || record.socket !== paths.socket) return false;
    // The host binds the socket before it writes the record and removes it on
    // exit; a record without our socket beside it is not a serving host.
    const socket = deps.lstat(paths.socket);
    if (socket === null || socket.kind !== 'socket' || socket.uid !== deps.uid) return false;
    // A record naming this very process was never written by a host.
    if (record.pid === deps.pid) return false;
    deps.probe(record.pid);
    return true;
  } catch {
    return false;
  }
}

function rawSessionId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('session_id' in raw)) return null;
  const value = raw.session_id;
  return typeof value === 'string' && HOST_SESSION_ID.test(value) ? value : null;
}

// A hook body that throws (or rejects) must not become a blocked tool call or a
// broken Stop: the harness treats exit 2 as a refusal. Say what happened on
// stderr (visible in the harness log) and stay out of the way.
function failed(name: string, e: unknown, io: Io): number {
  io.err(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
  return render(silent, io);
}
