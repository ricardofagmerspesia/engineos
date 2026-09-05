import { copyFileSync, lstatSync, mkdirSync, realpathSync, statSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile } from '../lib/json';
import { strictReader } from '../registry/strict';

// Port of hooks/scaffold-layout.sh. Every path this module creates or writes
// resolves inside the project root, and every refusal is a silent skip: this
// runs on SessionStart and must never break a session start.
//
// The threat is concrete. A hostile repo commits `.engineos/` (which IS the
// opt-in signal the SessionStart hook gates on) plus a manifest destination —
// say `docs/specs/README.md` — as a DANGLING symlink pointing at any absolute
// path. An existence test alone is false for a dangling link, so the earlier
// bash proceeded and copied THROUGH the link on the first SessionStart after a
// clone. `lstat` is the call that sees the link itself, so every guard below is
// written on `lstat`, never on `existsSync`. The directory form of the same
// defect is `mkdir -p`, which follows a symlinked component without complaint;
// components are therefore created one level at a time.

export interface ManifestSeed {
  src: string;
  dest: string;
}

export interface ManifestEntry {
  dir: string;
  seeds: ManifestSeed[];
}

const { requireRecord, requireString, requireRows } = strictReader('layout-manifest.json');

export function loadLayoutManifest(engineosRoot: string): ManifestEntry[] {
  const raw = readJsonFile(join(engineosRoot, 'registries', 'layout-manifest.json'));
  const doc = requireRecord(raw, '');
  return requireRows(doc['entries'], '.entries').map((row, i) => ({
    dir: requireString(row['dir'], `.entries[${i}].dir`),
    seeds: requireRows(row['seeds'], `.entries[${i}].seeds`).map((seed, j) => ({
      src: requireString(seed['src'], `.entries[${i}].seeds[${j}].src`),
      dest: requireString(seed['dest'], `.entries[${i}].seeds[${j}].dest`),
    })),
  }));
}

// Creates every missing dir in the manifest and seeds missing files. Returns the
// dirs it created, relative and in manifest order. Never throws on a hostile or
// unwritable tree: one refused entry skips that entry and the rest continue.
export function scaffoldLayout(
  projectRoot: string,
  engineosRoot: string,
  manifest: ManifestEntry[],
): string[] {
  const created: string[] = [];
  for (const entry of manifest) {
    const existed = isDirectory(join(projectRoot, entry.dir));
    const parent = scaffoldDir(projectRoot, entry.dir);
    if (parent === null) continue;
    if (!existed) created.push(entry.dir);
    for (const seed of entry.seeds) {
      // "@path" is repo-relative, so in-repo files can be reused as seeds;
      // anything else is a basename under the shipped template dir.
      const abs = seed.src.startsWith('@')
        ? join(engineosRoot, seed.src.slice(1))
        : join(engineosRoot, 'templates', 'project-layout', seed.src);
      scaffoldSeed(parent, seed.dest, abs);
    }
  }
  return created;
}

// The fully symlink-resolved path of an EXISTING directory; null when it does
// not exist or is not a directory.
function physDir(dir: string): string | null {
  try {
    const real = realpathSync(dir);
    return statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

// True when path is root itself or lies below it. Both arguments must ALREADY be
// resolved physical paths; this does no resolution of its own.
function within(rootPhys: string, phys: string): boolean {
  return phys === rootPhys || phys.startsWith(`${rootPhys}/`);
}

// The resolved physical path of <root>/<rel>, creating any missing component.
// Null, having written nothing, when the root does not resolve to a directory,
// any component already exists as a symlink of ANY kind (live, dangling,
// directory) or as a non-directory, a component cannot be created, or the
// resolved result is not under the resolved root.
function scaffoldDir(root: string, rel: string): string | null {
  const rootPhys = physDir(root);
  if (rootPhys === null) return null;
  let cur = rootPhys;
  for (const comp of rel.split('/')) {
    if (comp === '' || comp === '.') continue;
    if (comp === '..') return null;
    const next = `${cur}/${comp}`;
    const entry = lstatOrNull(next);
    if (entry === null) {
      try {
        mkdirSync(next);
      } catch {
        return null;
      }
    } else if (entry.isSymbolicLink() || !entry.isDirectory()) {
      return null;
    }
    cur = next;
  }
  const phys = physDir(cur);
  if (phys === null || !within(rootPhys, phys)) return null;
  return phys;
}

// Copy src to parent/name ONLY when nothing whatever occupies that name.
// <parent> must be a path scaffoldDir already vouched for, and <name> must be a
// plain file name — a slashed or dotted name is refused rather than resolved.
// Every refusal is a silent skip.
function scaffoldSeed(parent: string, name: string, src: string): void {
  if (name === '' || name === '.' || name === '..' || name.includes('/')) return;
  if (!isFile(src)) return;
  // lstat succeeds for a dangling symlink, which is exactly the case that let
  // the earlier bash write outside the project.
  if (lstatOrNull(`${parent}/${name}`) !== null) return;
  try {
    copyFileSync(src, `${parent}/${name}`);
  } catch {
    // A seed that cannot be written is not worth breaking a session start over.
  }
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
