// Where the in-process host keeps its socket and its presence record, and the
// checks that make that place private.
//
// The socket carries every prompt and tool input of the session, so it lives
// in a directory only this user can enter: `<base>/engineos-<uid>/`, base being
// XDG_RUNTIME_DIR (per-user, 0700 on systemd hosts), else TMPDIR (per-user on
// macOS), else the OS temp dir. Where base is a shared /tmp, another user could
// pre-create the directory; it is therefore verified (a real directory, owned
// by us, no group/other bits) before anything is bound in it, and refused
// otherwise. The presence record is what the shell hooks read to stay silent
// while this host serves the session (contract in docs/OPT-IN-TIERS.md).
//
// The path rule, the privacy rule and the record parser live once, in
// src/lib/runtime-dir.ts, shared with src/judge/tiebreak.ts and the shell-side
// guard in src/hooks/adapter.ts; this module adds what only the host does:
// creating the directory, writing the record and claiming the paths.
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import {
  GROUP_OTHER_BITS,
  parsePresence,
  PRESENCE_STALE_MS,
  PRESENCE_VERSION,
  runtimeDir,
  sessionPaths,
  type PresenceRecord,
} from '../../../src/lib/runtime-dir';

export type { PresenceRecord } from '../../../src/lib/runtime-dir';

// Unix socket paths are cut near 104 bytes on macOS and 108 on Linux; the
// mod's own transport documents "near 100 B at most".
export const MAX_SOCKET_PATH_BYTES = 100;

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export class HostSetupError extends Error {
  override readonly name = 'HostSetupError';
}

export interface HostPaths {
  dir: string;
  socket: string;
  presence: string;
}

export function currentUid(): number {
  if (typeof process.getuid !== 'function') throw new HostSetupError('the in-process host needs a POSIX user id (unix sockets only)');
  return process.getuid();
}

export function privateDir(env: NodeJS.ProcessEnv, uid: number): string {
  return runtimeDir(env, uid);
}

export function hostPaths(dir: string, sessionId: string): HostPaths {
  const paths: HostPaths = { dir, ...sessionPaths(dir, sessionId) };
  if (Buffer.byteLength(paths.socket) > MAX_SOCKET_PATH_BYTES) {
    throw new HostSetupError(`socket path is ${Buffer.byteLength(paths.socket)} bytes, over ${MAX_SOCKET_PATH_BYTES}; set XDG_RUNTIME_DIR to a shorter private directory`);
  }
  return paths;
}

export function ensurePrivateDir(dir: string, uid: number): void {
  try {
    mkdirSync(dir, { mode: PRIVATE_DIR_MODE });
  } catch (e) {
    if (!isCode(e, 'EEXIST')) throw new HostSetupError(`cannot create ${dir}: ${messageOf(e)}`);
  }
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new HostSetupError(`${dir} is not a directory`);
  if (stat.uid !== uid) throw new HostSetupError(`${dir} is owned by uid ${stat.uid}, not ${uid}`);
  if ((stat.mode & GROUP_OTHER_BITS) !== 0) throw new HostSetupError(`${dir} is reachable by other users (mode ${(stat.mode & 0o777).toString(8)})`);
}

// Written to a temp name and renamed, so a reader never sees half a record.
// Called once, after the mod's first route handshake, never at listen: a host
// nobody talks to must not silence the shell hooks.
export function writePresence(path: string, record: PresenceRecord): void {
  const temp = `${path}.${record.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(record)}\n`, { mode: PRIVATE_FILE_MODE, flag: 'w' });
  renameSync(temp, path);
}

// The heartbeat: a reader trusts a record only while its mtime is recent
// (PRESENCE_STALE_MS), so a host killed without cleanup stops counting soon
// even when its pid is reused.
export function touchPresence(path: string, now: Date): void {
  utimesSync(path, now, now);
}

export function presenceRecord(fields: Omit<PresenceRecord, 'v'>): PresenceRecord {
  return { v: PRESENCE_VERSION, ...fields };
}

export function readPresence(path: string): PresenceRecord | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  return parsePresence(text);
}

// Signal 0 probes without delivering anything. EPERM means a process of that
// id exists under another user, which in a private directory is a stale record
// whose pid was recycled: treated as not ours, so not alive for us.
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A leftover socket from a host that died without cleanup is removed; a live,
// still heartbeating host for the same session is a second spawn and is refused.
export function claimPaths(paths: HostPaths): void {
  const existing = readPresence(paths.presence);
  if (existing !== null && existing.pid !== process.pid && isAlive(existing.pid) && isFresh(paths.presence, Date.now())) {
    throw new HostSetupError(`a host (pid ${existing.pid}) already serves this session`);
  }
  rmSync(paths.socket, { force: true });
  rmSync(paths.presence, { force: true });
}

export function releasePaths(paths: HostPaths, pid: number): void {
  const existing = readPresence(paths.presence);
  if (existing !== null && existing.pid !== pid) return;
  rmSync(paths.presence, { force: true });
  rmSync(paths.socket, { force: true });
}

function isFresh(path: string, now: number): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return stat !== undefined && Math.abs(now - stat.mtimeMs) <= PRESENCE_STALE_MS;
}

function isCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === code;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
