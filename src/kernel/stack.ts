// Stack resolution (design §A2, contracts §2): which packages a repo holds, in
// which language, on which framework. Explicit first, detected second — a
// `.engineos/config.json` wins ENTIRELY when present (no merge), so a developer
// who declared the stack is never second-guessed by a heuristic; without one,
// the tree is walked for package markers.
//
// Detection is deliberately shallow: one marker file per language, a framework
// read off the dependency NAMES with line-based parsing, nothing installed and
// nothing executed. It exists so the runner, the SessionStart line and `init
// --stack auto` read one answer; a project where the heuristic is wrong writes
// the config and moves on.
//
// All I/O arrives through `deps` so a test can hand this module a tree without
// a disk, the same way src/lib/git.ts takes its spawner.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Framework, Language, PackageStack, ProjectConfig } from '../registry/project-config';

export type StackSource = 'config' | 'detected';

export interface ResolvedStack {
  packages: PackageStack[];
  source: StackSource;
}

export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

export interface StackDeps {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  listDir: (path: string) => readonly DirEntry[];
}

const defaultDeps: StackDeps = {
  exists: existsSync,
  readFile: (path) => readFileSync(path, 'utf8'),
  listDir: (path) => readdirSync(path, { withFileTypes: true }),
};

// Directories the walk never enters: dependency trees, virtualenvs, build
// output and the git dir all hold package.json / pyproject.toml files that are
// somebody else's packages.
export const SKIPPED_DIRS: readonly string[] = [
  'node_modules', '.venv', '.git', 'dist', 'build', '__pycache__', 'site-packages', '.next',
];

export const PYTHON_MARKERS: readonly string[] = ['pyproject.toml', 'requirements.txt'];
export const NODE_MARKER = 'package.json';

// Checked in this order so a Next app (which also depends on react) answers
// next, and a React Native app (which also depends on react) answers
// react-native. Nest first: a monorepo root that lists both @nestjs/core and
// react is a backend before it is a frontend.
const NODE_FRAMEWORKS: readonly (readonly [string, NonNullable<Framework>])[] = [
  ['@nestjs/core', 'nestjs'],
  ['next', 'next'],
  ['react-native', 'react-native'],
  ['react', 'react'],
];

export function resolveStack(
  root: string,
  config: ProjectConfig | null,
  deps: StackDeps = defaultDeps,
): ResolvedStack {
  if (config !== null) return { packages: config.stack.packages, source: 'config' };
  return { packages: detectPackages(root, deps), source: 'detected' };
}

// Every directory under root (root included, bounded by SKIPPED_DIRS) that
// holds a Node marker, in a stable order: parents before children, siblings by
// name. Non-JavaScript manifests remain stack signals, never active packages.
export function detectPackages(root: string, deps: StackDeps = defaultDeps): PackageStack[] {
  const found: PackageStack[] = [];
  walk(root, '.', deps, found);
  return found;
}

function walk(root: string, rel: string, deps: StackDeps, found: PackageStack[]): void {
  const abs = rel === '.' ? root : join(root, rel);
  found.push(...packagesIn(abs, rel, deps));
  let entries: readonly DirEntry[];
  try {
    entries = deps.listDir(abs);
  } catch {
    return;
  }
  // Dot-directories are skipped wholesale, not only the named ones: `.agents/`,
  // `.trae/` and `.claude/` carry skills with their own package.json, and a
  // hidden tree is never the project's own package (the wave-1 barrier found
  // this checkout answering twelve "node packages" that were all adapter skills).
  const children = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRS.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const name of children) walk(root, rel === '.' ? name : `${rel}/${name}`, deps, found);
}

function packagesIn(abs: string, dir: string, deps: StackDeps): PackageStack[] {
  const out: PackageStack[] = [];
  const packageJson = join(abs, NODE_MARKER);
  if (deps.exists(packageJson)) {
    out.push({ dir, language: 'node', framework: nodeFramework(packageJson, deps), compose_service: null });
  }
  return out;
}

// ------------------------------------------------------------------ python

// Deprecated parsing helpers remain exported for historical consumers; stack
// detection no longer calls them or recommends Python frameworks.
// Line-based and tolerant, not a TOML parser. Reads the dependency NAMES out of:
//   [project]                     dependencies = ["fastapi>=0.110", ...]
//   [project.optional-dependencies] <group> = [...]
//   [dependency-groups]           <group> = [...]                (PEP 735)
//   [tool.poetry.dependencies] and [tool.poetry.group.<g>.dependencies]  name = "^1.0"
// Arrays may span lines; anything else in the file is ignored. A file this
// cannot read answers no names, and the package is still a python package.
export function pyprojectDependencies(text: string): string[] {
  const names: string[] = [];
  let section = '';
  let collecting = false;
  for (const raw of text.split('\n')) {
    const line = stripTomlComment(raw).trim();
    if (line === '') continue;
    if (collecting) {
      for (const item of quotedStrings(line)) names.push(dependencyName(item));
      if (closesArray(line)) collecting = false;
      continue;
    }
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header !== null) {
      section = header[1]?.trim() ?? '';
      continue;
    }
    const assignment = /^([A-Za-z0-9_.\-"']+)\s*=\s*(.*)$/.exec(line);
    if (assignment === null) continue;
    const key = (assignment[1] ?? '').replace(/["']/g, '');
    const value = assignment[2] ?? '';
    if (isPoetryDependencyTable(section)) {
      if (key !== 'python') names.push(dependencyName(key));
      continue;
    }
    const arrayKey =
      (section === 'project' && key === 'dependencies') ||
      section === 'project.optional-dependencies' ||
      section === 'dependency-groups';
    if (!arrayKey || !value.startsWith('[')) continue;
    for (const item of quotedStrings(value)) names.push(dependencyName(item));
    collecting = !closesArray(value);
  }
  return names;
}

function isPoetryDependencyTable(section: string): boolean {
  return section === 'tool.poetry.dependencies' || section === 'tool.poetry.dev-dependencies'
    || /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section);
}

// One requirement per line; comments, blank lines and option lines (-r, -e,
// --index-url, ...) are skipped. URL and path requirements answer no name.
export function requirementsDependencies(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (line === '' || line.startsWith('-')) continue;
    const name = dependencyName(line);
    if (name !== '') names.push(name);
  }
  return names;
}

// "FastAPI[all]>=0.110 ; python_version >= '3.10'" -> "fastapi". PEP 503
// normalisation: lower-case, runs of "-", "_" and "." collapse to one "-".
export function dependencyName(spec: string): string {
  const match = /^[A-Za-z0-9][A-Za-z0-9._-]*/.exec(spec.trim());
  if (match === null) return '';
  return match[0].toLowerCase().replace(/[-_.]+/g, '-');
}

function stripTomlComment(line: string): string {
  // Good enough for dependency lines: a "#" outside quotes starts a comment.
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

// A "]" inside a quoted extra ("fastapi[all]") is not the array's close.
function closesArray(line: string): boolean {
  return line.replace(/"[^"]*"|'[^']*'/g, '').includes(']');
}

// Inline tables (`{include-group = "lint"}`, PEP 735) are dropped first: their
// quoted values are group names, not requirements.
function quotedStrings(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'/g;
  const flat = text.replace(/\{[^}]*\}/g, '');
  for (let m = re.exec(flat); m !== null; m = re.exec(flat)) out.push(m[1] ?? m[2] ?? '');
  return out;
}

// ------------------------------------------------------------------ node

function nodeFramework(packageJson: string, deps: StackDeps): Framework {
  const text = readOrNull(packageJson, deps);
  if (text === null) return null;
  return firstFramework(new Set(packageJsonDependencies(text)), NODE_FRAMEWORKS);
}

// dependencies + devDependencies keys. A package.json that does not parse is
// still a node package; it just names no framework.
export function packageJsonDependencies(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const doc = parsed as Record<string, unknown>;
  const names: string[] = [];
  for (const field of ['dependencies', 'devDependencies']) {
    const block = doc[field];
    if (typeof block === 'object' && block !== null && !Array.isArray(block)) names.push(...Object.keys(block));
  }
  return names;
}

// ------------------------------------------------------------------ shared

function firstFramework(
  names: ReadonlySet<string>,
  table: readonly (readonly [string, NonNullable<Framework>])[],
): Framework {
  for (const [dependency, framework] of table) if (names.has(dependency)) return framework;
  return null;
}

function readOrNull(path: string, deps: StackDeps): string | null {
  if (!deps.exists(path)) return null;
  try {
    return deps.readFile(path);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ stack signal

// Any language EngineOS recognises a project by, not only the two it has
// runners for: the question "did anyone pick a stack yet?" is answered yes by a
// go.mod as much as by a pyproject.toml.
export const STACK_MANIFESTS: readonly string[] = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'pubspec.yaml', 'mix.exs', 'deno.json',
];
export const STACK_MANIFEST_SUFFIXES: readonly string[] = ['.csproj', '.sln'];
export const STACK_SIGNAL_MAX_DEPTH = 3; // root = depth 0

const PROJECT_CONFIG = join('.engineos', 'config.json');

/** True when `.engineos/config.json` exists at root, or any manifest exists within
 *  STACK_SIGNAL_MAX_DEPTH, skipping dot-directories and SKIPPED_DIRS (same walk rules
 *  as detectPackages). Short-circuits on the first hit. Never throws: an unreadable
 *  directory is treated as empty. */
export function hasStackSignal(root: string, deps: StackDeps = defaultDeps): boolean {
  if (existsOrFalse(join(root, PROJECT_CONFIG), deps)) return true;
  return signalWithin(root, 0, deps);
}

// Files of a level are checked before any child is entered, so a manifest at the
// root answers without walking the tree. The depth bound keeps this cheap on the
// hot path: it runs on every SessionStart and on stack-dependent prompts.
function signalWithin(dir: string, depth: number, deps: StackDeps): boolean {
  let entries: readonly DirEntry[];
  try {
    entries = deps.listDir(dir);
  } catch {
    return false;
  }
  const children: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      if (isStackManifest(entry.name)) return true;
      continue;
    }
    if (!entry.name.startsWith('.') && !SKIPPED_DIRS.includes(entry.name)) children.push(entry.name);
  }
  if (depth >= STACK_SIGNAL_MAX_DEPTH) return false;
  return children.some((name) => signalWithin(join(dir, name), depth + 1, deps));
}

function isStackManifest(name: string): boolean {
  return STACK_MANIFESTS.includes(name) || STACK_MANIFEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function existsOrFalse(path: string, deps: StackDeps): boolean {
  try {
    return deps.exists(path);
  } catch {
    return false;
  }
}

// One line per package for humans: "fastapi@backend", or the language when no
// framework was found ("python@tools").
export function packageLabel(pkg: PackageStack): string {
  const label = `${pkg.framework ?? pkg.language}@${pkg.dir}`;
  return pkg.language === 'python' ? `${label} (deprecated, unsupported)` : label;
}

export function languagesOf(packages: readonly PackageStack[]): Language[] {
  const out: Language[] = [];
  for (const pkg of packages) if (!out.includes(pkg.language)) out.push(pkg.language);
  return out;
}
