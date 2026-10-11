// The private runtime directory every opt-in local transport lives in, and the
// one copy of its path and privacy rules: the in-process host's socket and
// presence record (adapters/claude-code-mod/host/presence.ts), the tie-break
// client's daemon socket (src/judge/tiebreak.ts) and the shell-side presence
// guard (src/hooks/adapter.ts). The daemon package (tools/embedding-daemon)
// cannot import src/ and keeps its own copy of the directory rule.
//
// `<base>/engineos-<uid>/`, base being XDG_RUNTIME_DIR (per-user, 0700 on
// systemd hosts), else TMPDIR (per-user on macOS), else the OS temp dir. On a
// shared /tmp another user could pre-create the directory, so a reader trusts
// it only when it is a real directory, owned by this uid, with no group or
// other bits.
//
// Node built-ins only: the per-call hook bundle imports this module.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GROUP_OTHER_BITS = 0o077;
export const PRESENCE_VERSION = 1;
// The session ids the in-process host accepts on `serve --session`; no other
// id can have a presence record.
export const HOST_SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;
const SESSION_KEY_HEX = 16;

export type FileKind = 'file' | 'socket' | 'directory' | 'symlink' | 'other';

export interface FileFacts {
  kind: FileKind;
  uid: number;
  mode: number;
}

export interface PrivateFile {
  facts: FileFacts;
  text: string;
}

export interface SessionPaths {
  socket: string;
  presence: string;
}

export interface PresenceRecord {
  v: typeof PRESENCE_VERSION;
  pid: number;
  socket: string;
  session: string;
  started_at: number;
}

export function runtimeDir(env: Readonly<Record<string, string | undefined>>, uid: number, fallback: () => string = tmpdir): string {
  const base = nonEmpty(env['XDG_RUNTIME_DIR']) ?? nonEmpty(env['TMPDIR']) ?? fallback();
  return join(base, `engineos-${uid}`);
}

// The session id is the transcript's name; hashing it keeps the path short and
// keeps the id itself out of a directory listing.
export function sessionPaths(dir: string, sessionId: string): SessionPaths {
  const key = createHash('sha256').update(sessionId).digest('hex').slice(0, SESSION_KEY_HEX);
  return { socket: join(dir, `h-${key}.sock`), presence: join(dir, `h-${key}.json`) };
}

// A symlink is refused even when it points at a private directory: whoever can
// replace the link decides where the socket is.
export function isPrivateDir(facts: FileFacts | null, uid: number): boolean {
  return facts !== null && facts.kind === 'directory' && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}

export function isPrivateFile(facts: FileFacts | null, uid: number): boolean {
  return facts !== null && facts.kind === 'file' && facts.uid === uid && (facts.mode & GROUP_OTHER_BITS) === 0;
}

export function lstatFacts(path: string): FileFacts | null {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return stat === undefined ? null : statFacts(stat);
}

// Opened without following a final symlink and without blocking on a FIFO, and
// classified from the open descriptor, so the bytes read are the bytes of the
// file whose owner and mode were checked. Null on any failure or when the file
// is larger than `maxBytes`.
export function readPrivateFile(path: string, maxBytes: number): PrivateFile | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(maxBytes + 1);
    const read = readSync(fd, buffer, 0, maxBytes + 1, 0);
    if (read > maxBytes) return null;
    return { facts: statFacts(stat), text: buffer.toString('utf8', 0, read) };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

// Every field is required and typed. The pid must be a positive integer:
// signal 0 to pid 0 or a negative pid probes a whole process group, which
// always answers, so such a record could never be stale.
export function parsePresence(text: string): PresenceRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record: Record<string, unknown> = { ...parsed };
  const { pid, socket, session, started_at: startedAt } = record;
  if (record['v'] !== PRESENCE_VERSION || typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return null;
  if (typeof socket !== 'string' || typeof session !== 'string' || session === '' || typeof startedAt !== 'number') return null;
  return { v: PRESENCE_VERSION, pid, socket, session, started_at: startedAt };
}

function statFacts(stat: Stats): FileFacts {
  const kind: FileKind = stat.isSymbolicLink()
    ? 'symlink'
    : stat.isSocket()
      ? 'socket'
      : stat.isDirectory()
        ? 'directory'
        : stat.isFile()
          ? 'file'
          : 'other';
  return { kind, uid: stat.uid, mode: stat.mode };
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
