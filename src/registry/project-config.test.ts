import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { tempRoot } from '../testing/harness';
import { loadProjectConfig, normalizeDir, parseProjectConfig, type ProjectConfig } from './project-config';

const ROOT = '/repo';
const PATH = '/repo/.engineos/config.json';

const VALID = {
  version: 1,
  stack: {
    packages: [
      { dir: 'backend', language: 'python', framework: 'fastapi', compose_service: 'backend', python_env: 'auto' },
      { dir: 'frontend', language: 'node', framework: 'react', compose_service: null },
    ],
  },
};

function absent(): never {
  throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
}

function reading(text: string): (path: string) => string {
  return (path) => {
    assert.equal(path, PATH);
    return text;
  };
}

function rejects(document: unknown, message: string): void {
  assert.throws(
    () => parseProjectConfig(document, PATH),
    (e: unknown) => e instanceof KernelError && e.message === `${PATH}: ${message}`,
    `expected "${PATH}: ${message}"`,
  );
}

test('an absent config answers null, never an error', () => {
  assert.equal(loadProjectConfig(ROOT, absent), null);
});

test('a config that cannot be read for any other reason is an error naming the path', () => {
  assert.throws(
    () => loadProjectConfig(ROOT, () => { throw new Error('EACCES'); }),
    (e: unknown) => e instanceof KernelError && e.message === `cannot read ${PATH}`,
  );
});

test('invalid JSON is an error naming the path', () => {
  assert.throws(
    () => loadProjectConfig(ROOT, reading('{')),
    (e: unknown) => e instanceof KernelError && e.message === `invalid JSON in ${PATH}`,
  );
});

test('the contract example loads with python_env defaulted and the node package carrying none', () => {
  const expected: ProjectConfig = {
    version: 1,
    stack: {
      packages: [
        { dir: 'backend', language: 'python', framework: 'fastapi', compose_service: 'backend', python_env: 'auto' },
        { dir: 'frontend', language: 'node', framework: 'react', compose_service: null },
      ],
    },
  };
  assert.deepEqual(loadProjectConfig(ROOT, reading(JSON.stringify(VALID))), expected);
  const loaded = loadProjectConfig(ROOT, reading(JSON.stringify(VALID)));
  assert.equal(loaded !== null && 'python_env' in (loaded.stack.packages[1] ?? {}), false);
});

test('python_env defaults to auto when absent and is dropped for node', () => {
  const doc = {
    version: 1,
    stack: {
      packages: [
        { dir: 'api', language: 'python', framework: null, compose_service: null },
        { dir: 'web', language: 'node', framework: null, compose_service: null, python_env: 'uv' },
      ],
    },
  };
  const config = parseProjectConfig(doc, PATH);
  assert.equal(config.stack.packages[0]?.python_env, 'auto');
  assert.equal('python_env' in (config.stack.packages[1] ?? {}), false);
});

test('dir is normalised: no leading ./, no trailing /, the root as .', () => {
  assert.equal(normalizeDir('./backend/'), 'backend');
  assert.equal(normalizeDir('././a/b//'), 'a/b');
  assert.equal(normalizeDir('.'), '.');
  assert.equal(normalizeDir('./'), '.');
  assert.equal(normalizeDir(''), '.');
  const config = parseProjectConfig({
    version: 1,
    stack: { packages: [{ dir: './backend/', language: 'python', framework: 'fastapi', compose_service: null }] },
  }, PATH);
  assert.equal(config.stack.packages[0]?.dir, 'backend');
});

test('a duplicate dir is an error, also when the spellings differ', () => {
  rejects({
    version: 1,
    stack: {
      packages: [
        { dir: 'backend', language: 'python', framework: null, compose_service: null },
        { dir: './backend/', language: 'node', framework: null, compose_service: null },
      ],
    },
  }, '.stack.packages[1].dir "backend" is declared twice');
});

test('unknown keys are errors at every level', () => {
  rejects({ version: 1, stack: { packages: [] }, extra: 1 }, 'the document has an unknown key "extra"');
  rejects({ version: 1, stack: { packages: [], python: {} } }, '.stack has an unknown key "python"');
  rejects({
    version: 1,
    stack: { packages: [{ dir: '.', language: 'node', framework: null, compose_service: null, runner: 'nx' }] },
  }, '.stack.packages[0] has an unknown key "runner"');
});

test('wrong shapes are errors naming the JSON path', () => {
  rejects([], 'the document must be an object');
  rejects({ version: 2, stack: { packages: [] } }, '.version must be 1');
  rejects({ version: 1 }, '.stack must be an object');
  rejects({ version: 1, stack: { packages: {} } }, '.stack.packages must be an array of objects');
  rejects({ version: 1, stack: { packages: ['x'] } }, '.stack.packages[0] must be an object');
  rejects({ version: 1, stack: { packages: [{ language: 'node', framework: null, compose_service: null }] } },
    '.stack.packages[0].dir must be a string');
  rejects({ version: 1, stack: { packages: [{ dir: '/abs', language: 'node', framework: null, compose_service: null }] } },
    '.stack.packages[0].dir must be relative to the repo root');
  rejects({ version: 1, stack: { packages: [{ dir: '../up', language: 'node', framework: null, compose_service: null }] } },
    '.stack.packages[0].dir must not leave the repo root');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'ruby', framework: null, compose_service: null }] } },
    '.stack.packages[0].language must be one of python|node');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'node', framework: 'angular', compose_service: null }] } },
    '.stack.packages[0].framework must be null or one of fastapi|django|flask|nestjs|react|next|react-native');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'node', framework: 'fastapi', compose_service: null }] } },
    '.stack.packages[0].framework "fastapi" is a python framework, not node');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'node', framework: null }] } },
    '.stack.packages[0].compose_service must be a string or null');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'node', framework: null, compose_service: 1 }] } },
    '.stack.packages[0].compose_service must be a string or null');
  rejects({ version: 1, stack: { packages: [{ dir: '.', language: 'python', framework: null, compose_service: null, python_env: 'conda' }] } },
    '.stack.packages[0].python_env must be one of venv|uv|compose|auto');
});

test('the default reader reads .engineos/config.json under the root from disk', (t) => {
  const root = tempRoot(t);
  assert.equal(loadProjectConfig(root), null);
  mkdirSync(join(root, '.engineos'));
  writeFileSync(join(root, '.engineos', 'config.json'), `${JSON.stringify(VALID)}\n`);
  assert.equal(loadProjectConfig(root)?.stack.packages.length, 2);
  writeFileSync(join(root, '.engineos', 'config.json'), 'nope');
  assert.throws(() => loadProjectConfig(root), KernelError);
});
