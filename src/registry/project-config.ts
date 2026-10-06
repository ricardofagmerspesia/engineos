// `.engineos/config.json` — the project's declared stack (contracts §2).
//
// Read the way registries/*.json are read (src/registry/strict.ts): every key
// is checked, an unknown key is an error, a wrong type is an error, and the
// message names the file and the JSON path so a malformed config is reported
// where it was read. The one difference from a registry: an ABSENT file is
// `null`, never an error, because a project that never ran `engineos init
// --stack` is a project to detect, not a broken one.
//
// The file is a project file, not a registry, so this module carries its own
// small reader rather than strictReader — that one prefixes every message with
// `registries/`, which would name a directory this file does not live in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';

// Python values remain readable for existing configs during the compatibility
// window; new declarations and automatic execution use the active Node stack.
export type Language = 'python' | 'node';
export type Framework = 'fastapi' | 'django' | 'flask' | 'nestjs' | 'react' | 'next' | 'react-native' | null;
export type PythonEnv = 'venv' | 'uv' | 'compose' | 'auto';

export interface PackageStack {
  dir: string;                       // relative to repo root; "." allowed; no leading "./"
  language: Language;
  framework: Framework;
  compose_service: string | null;
  python_env?: PythonEnv;            // default 'auto'; ignored for node
}

export interface ProjectConfig {
  version: 1;
  stack: { packages: PackageStack[] };
}

export const PROJECT_CONFIG_PATH = '.engineos/config.json';

export const LANGUAGES: readonly Language[] = ['python', 'node'];
export const ACTIVE_LANGUAGES: readonly Language[] = ['node'];
export const ACTIVE_FRAMEWORKS: readonly NonNullable<Framework>[] = ['nestjs', 'react', 'next', 'react-native'];
export const FRAMEWORKS: readonly NonNullable<Framework>[] = [
  'fastapi', 'django', 'flask', 'nestjs', 'react', 'next', 'react-native',
];
export const PYTHON_ENVS: readonly PythonEnv[] = ['venv', 'uv', 'compose', 'auto'];

// Which language a framework belongs to: the one place `init --stack` derives a
// package's language from the framework the developer named.
export const FRAMEWORK_LANGUAGE: Readonly<Record<NonNullable<Framework>, Language>> = {
  fastapi: 'python',
  django: 'python',
  flask: 'python',
  nestjs: 'node',
  react: 'node',
  next: 'node',
  'react-native': 'node',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function isFramework(value: unknown): value is NonNullable<Framework> {
  return typeof value === 'string' && (FRAMEWORKS as readonly string[]).includes(value);
}

export function isPythonEnv(value: unknown): value is PythonEnv {
  return typeof value === 'string' && (PYTHON_ENVS as readonly string[]).includes(value);
}

// "./backend/" and "backend" name the same package, and the runner compares
// package dirs by string (contracts §1 `config.packages[dir==pkgDir]`), so the
// loader settles on one spelling: no leading "./", no trailing "/", and the
// root as ".". Callers that write the file (init) go through this too.
export function normalizeDir(dir: string): string {
  let out = dir.trim();
  while (out.startsWith('./')) out = out.slice(2);
  while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out === '' || out === '.' ? '.' : out;
}

type ReadFile = (path: string) => string;

const readUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

// `readFile` is injected so a test can hand the loader a document without a
// disk. An absent file is the ONE failure that answers null; any other read
// error, and any parse or shape error, is a KernelError naming the path.
export function loadProjectConfig(root: string, readFile: ReadFile = readUtf8): ProjectConfig | null {
  const path = join(root, PROJECT_CONFIG_PATH);
  let text: string;
  try {
    text = readFile(path);
  } catch (e) {
    if (isAbsent(e)) return null;
    throw new KernelError(`cannot read ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new KernelError(`invalid JSON in ${path}`);
  }
  return parseProjectConfig(parsed, path);
}

// The shape check on an already-parsed document, so init can validate what it
// is about to write with the same code that will read it back.
export function parseProjectConfig(parsed: unknown, path: string = PROJECT_CONFIG_PATH): ProjectConfig {
  const document = requireRecord(path, parsed, '');
  rejectUnknownKeys(path, document, '', ['version', 'stack']);
  if (document['version'] !== 1) malformed(path, '.version must be 1');
  const stack = requireRecord(path, document['stack'], '.stack');
  rejectUnknownKeys(path, stack, '.stack', ['packages']);
  const rows = stack['packages'];
  if (!Array.isArray(rows)) malformed(path, '.stack.packages must be an array of objects');

  const seen = new Set<string>();
  const packages = rows.map((item: unknown, i: number): PackageStack => {
    const at = `.stack.packages[${i}]`;
    const row = requireRecord(path, item, at);
    rejectUnknownKeys(path, row, at, ['dir', 'language', 'framework', 'compose_service', 'python_env']);

    const rawDir = requireString(path, row['dir'], `${at}.dir`);
    if (rawDir.startsWith('/')) malformed(path, `${at}.dir must be relative to the repo root`);
    const dir = normalizeDir(rawDir);
    if (dir.split('/').includes('..')) malformed(path, `${at}.dir must not leave the repo root`);
    if (seen.has(dir)) malformed(path, `${at}.dir "${dir}" is declared twice`);
    seen.add(dir);

    const language = row['language'];
    if (!isLanguage(language)) malformed(path, `${at}.language must be one of ${LANGUAGES.join('|')}`);

    const framework = row['framework'];
    if (framework !== null && !isFramework(framework)) {
      malformed(path, `${at}.framework must be null or one of ${FRAMEWORKS.join('|')}`);
    }
    if (framework !== null && FRAMEWORK_LANGUAGE[framework] !== language) {
      malformed(path, `${at}.framework "${framework}" is a ${FRAMEWORK_LANGUAGE[framework]} framework, not ${language}`);
    }

    const composeService = row['compose_service'];
    if (composeService !== null && typeof composeService !== 'string') {
      malformed(path, `${at}.compose_service must be a string or null`);
    }

    const env = row['python_env'];
    if (env !== undefined && !isPythonEnv(env)) {
      malformed(path, `${at}.python_env must be one of ${PYTHON_ENVS.join('|')}`);
    }
    const pkg: PackageStack = { dir, language, framework, compose_service: composeService };
    // Filled in for python so every consumer reads one effective value; a node
    // package carries none — the contract defines the field as ignored there,
    // so a present one is type-checked and then dropped, not refused.
    if (language === 'python') pkg.python_env = env ?? 'auto';
    return pkg;
  });

  return { version: 1, stack: { packages } };
}

// Function declarations rather than closures: a `never`-returning call only
// narrows the caller's control flow when the callee is a declared function.
function malformed(path: string, what: string): never {
  throw new KernelError(`${path}: ${what}`);
}

function requireRecord(path: string, value: unknown, at: string): Record<string, unknown> {
  if (!isRecord(value)) malformed(path, `${at || 'the document'} must be an object`);
  return value;
}

function requireString(path: string, value: unknown, at: string): string {
  if (typeof value !== 'string') malformed(path, `${at} must be a string`);
  return value;
}

function rejectUnknownKeys(path: string, row: Record<string, unknown>, at: string, known: readonly string[]): void {
  for (const key of Object.keys(row)) {
    if (!known.includes(key)) malformed(path, `${at || 'the document'} has an unknown key "${key}"`);
  }
}

function isAbsent(e: unknown): boolean {
  return isRecord(e) && e['code'] === 'ENOENT';
}
