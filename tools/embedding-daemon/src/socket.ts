// Where the daemon listens: `<base>/engineos-<uid>/embed.sock`, base being
// XDG_RUNTIME_DIR, else TMPDIR, else the OS temp dir. One daemon per user
// serves every repository (the model is the expensive part, not the repo).
//
// The socket receives prompt text, so the directory must be private: created
// 0700, and refused when it exists as a symlink, under another owner, or with
// group/other bits (a pre-created directory in a shared /tmp). No TCP port is
// ever opened. The same rule is read by the client (src/judge/tiebreak.ts) and
// by the in-process mod host (adapters/claude-code-mod/host/presence.ts); this
// package cannot import the root's src/, so the rule is restated here.
import { chmodSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SOCKET_NAME = 'embed.sock';
const MAX_SOCKET_PATH_BYTES = 100;
const PRIVATE_DIR_MODE = 0o700;
const SOCKET_MODE = 0o600;
const GROUP_OTHER_BITS = 0o077;
const PROBE_TIMEOUT_MS = 200;

export class SocketSetupError extends Error {
  override readonly name = 'SocketSetupError';
}

export interface SocketPlace {
  dir: string;
  path: string;
}

export function socketPlace(env: NodeJS.ProcessEnv): SocketPlace {
  if (typeof process.getuid !== 'function') throw new SocketSetupError('the embedding daemon needs a POSIX user id (unix sockets only)');
  const base = nonEmpty(env['XDG_RUNTIME_DIR']) ?? nonEmpty(env['TMPDIR']) ?? tmpdir();
  const dir = join(base, `engineos-${process.getuid()}`);
  const path = join(dir, SOCKET_NAME);
  if (Buffer.byteLength(path) > MAX_SOCKET_PATH_BYTES) {
    throw new SocketSetupError(`socket path is over ${MAX_SOCKET_PATH_BYTES} bytes; set XDG_RUNTIME_DIR to a shorter private directory`);
  }
  return { dir, path };
}

export function ensurePrivateDir(dir: string): void {
  try {
    mkdirSync(dir, { mode: PRIVATE_DIR_MODE });
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw new SocketSetupError(`cannot create ${dir}`);
  }
  const stat = lstatSync(dir);
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SocketSetupError(`${dir} is not a directory`);
  if (stat.uid !== uid) throw new SocketSetupError(`${dir} is owned by another user`);
  if ((stat.mode & GROUP_OTHER_BITS) !== 0) throw new SocketSetupError(`${dir} is reachable by other users`);
}

// A socket that answers belongs to a running daemon: this start is a duplicate
// and steps aside. A socket that does not answer is a leftover and is removed.
export async function claimSocket(path: string): Promise<'claimed' | 'in-use'> {
  if (await answers(path)) return 'in-use';
  rmSync(path, { force: true });
  return 'claimed';
}

export function restrictSocket(path: string): void {
  chmodSync(path, SOCKET_MODE);
}

function answers(path: string): Promise<boolean> {
  return new Promise((settle) => {
    const probe = connect(path);
    probe.setTimeout(PROBE_TIMEOUT_MS);
    probe.once('connect', () => {
      probe.destroy();
      settle(true);
    });
    probe.once('timeout', () => {
      probe.destroy();
      settle(false);
    });
    probe.once('error', () => settle(false));
  });
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
