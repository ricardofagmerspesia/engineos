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
// The path rule is duplicated in src/judge/tiebreak.ts and in the shell-side
// guard (T09 wiring request); a drift fails safe there: the guard finds no
// record and the shell hooks run, so a hook may fire twice but never zero times.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Unix socket paths are cut near 104 bytes on macOS and 108 on Linux; the
// mod's own transport documents "near 100 B at most".
export const MAX_SOCKET_PATH_BYTES = 100;

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const GROUP_OTHER_BITS = 0o077;
const SESSION_KEY_HEX = 16;
const PRESENCE_VERSION = 1;

export class HostSetupError extends Error {
  override readonly name = 'HostSetupError';
}

export interface PresenceRecord {
  v: typeof PRESENCE_VERSION;
  pid: number;
  socket: string;
  session: string;
  started_at: number;
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
  const base = nonEmpty(env['XDG_RUNTIME_DIR']) ?? nonEmpty(env['TMPDIR']) ?? tmpdir();
  return join(base, `engineos-${uid}`);
}

// The session id is the transcript's name; hashing it keeps the path short and
// keeps the id itself out of a directory listing.
export function hostPaths(dir: string, sessionId: string): HostPaths {
  const key = createHash('sha256').update(sessionId).digest('hex').slice(0, SESSION_KEY_HEX);
  const paths = { dir, socket: join(dir, `h-${key}.sock`), presence: join(dir, `h-${key}.json`) };
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
export function writePresence(path: string, record: PresenceRecord): void {
  const temp = `${path}.${record.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(record)}\n`, { mode: PRIVATE_FILE_MODE, flag: 'w' });
  renameSync(temp, path);
}

export function presenceRecord(pid: number, socket: string, session: string, now: number): PresenceRecord {
  return { v: PRESENCE_VERSION, pid, socket, session, started_at: now };
}

export function readPresence(path: string): PresenceRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record: Record<string, unknown> = { ...parsed };
  const { pid, socket, session, started_at: startedAt } = record;
  if (record['v'] !== PRESENCE_VERSION || typeof pid !== 'number' || typeof socket !== 'string') return null;
  if (typeof session !== 'string' || typeof startedAt !== 'number') return null;
  return { v: PRESENCE_VERSION, pid, socket, session, started_at: startedAt };
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

// A leftover socket from a host that died without cleanup is removed; a live
// host for the same session is a second spawn and is refused.
export function claimPaths(paths: HostPaths): void {
  const existing = readPresence(paths.presence);
  if (existing !== null && existing.pid !== process.pid && isAlive(existing.pid)) {
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

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function isCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === code;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
