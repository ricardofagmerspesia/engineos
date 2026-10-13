import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import type { ProjectConfig } from '../registry/project-config';
import {
  dependencyName,
  detectPackages,
  hasStackSignal,
  languagesOf,
  packageJsonDependencies,
  packageLabel,
  pyprojectDependencies,
  requirementsDependencies,
  resolveStack,
  type StackDeps,
} from './stack';

const ROOT = '/repo';

// An in-memory tree: a path maps to file contents, and every directory is the
// set of paths that have it as a parent. Nothing touches the disk.
function tree(files: Record<string, string>): StackDeps {
  const abs = (rel: string): string => (rel === '' ? ROOT : `${ROOT}/${rel}`);
  const paths = new Map<string, string>();
  const dirs = new Set<string>([ROOT]);
  for (const [rel, text] of Object.entries(files)) {
    paths.set(abs(rel), text);
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(abs(parts.slice(0, i).join('/')));
  }
  return {
    exists: (path) => paths.has(path) || dirs.has(path),
    readFile: (path) => {
      const text = paths.get(path);
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    listDir: (path) => {
      if (!dirs.has(path)) throw new Error(`ENOTDIR ${path}`);
      const names = new Set<string>();
      const entries: { name: string; isDirectory(): boolean }[] = [];
      for (const candidate of [...paths.keys(), ...dirs]) {
        if (candidate === path || !candidate.startsWith(`${path}/`)) continue;
        const name = candidate.slice(path.length + 1).split('/')[0] ?? '';
        if (name === '' || names.has(name)) continue;
        names.add(name);
        const directory = dirs.has(`${path}/${name}`);
        entries.push({ name, isDirectory: () => directory });
      }
      return entries;
    },
  };
}

test('hidden directories are never entered, whatever they hold', () => {
  const deps = tree({
    'package.json': '{"dependencies":{"react":"18"}}',
    '.agents/skills/x/package.json': '{"name":"x"}',
    '.claude/package.json': '{"name":"c"}',
    '.hidden/pyproject.toml': '[project]\nname = "h"\n',
  });
  assert.deepEqual(
    resolveStack(ROOT, null, deps).packages.map((p) => p.dir),
    ['.'],
  );
});

test('config wins entirely over detection when present', () => {
  const config: ProjectConfig = {
    version: 1,
    stack: { packages: [{ dir: 'api', language: 'python', framework: 'django', compose_service: null, python_env: 'venv' }] },
  };
  const deps = tree({ 'package.json': '{"dependencies":{"react":"18"}}' });
  assert.deepEqual(resolveStack(ROOT, config, deps), { packages: config.stack.packages, source: 'config' });
});

test('an absent config detects: pyproject -> python, package.json -> node, one dir may be both', () => {
  const deps = tree({
    'pyproject.toml': '[project]\nname = "demo"\ndependencies = [\n  "fastapi>=0.110",\n  "uvicorn",\n]\n',
    'package.json': '{"devDependencies":{"typescript":"5"}}',
  });
  assert.deepEqual(resolveStack(ROOT, null, deps), {
    packages: [
      { dir: '.', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' },
      { dir: '.', language: 'node', framework: null, compose_service: null },
    ],
    source: 'detected',
  });
});

test('nested packages are found in a stable order, parents first then siblings by name', () => {
  const deps = tree({
    'frontend/package.json': '{"dependencies":{"react":"18","next":"14"}}',
    'backend/requirements.txt': 'fastapi==0.110.0\nsqlalchemy>=2\n',
    'mobile/package.json': '{"dependencies":{"react":"18","react-native":"0.74"}}',
    'services/api/pyproject.toml': '[tool.poetry.dependencies]\npython = "^3.12"\nDjango = "^5.0"\n',
    'README.md': '',
  });
  assert.deepEqual(detectPackages(ROOT, deps).map((pkg) => `${pkg.dir}:${pkg.language}:${String(pkg.framework)}`), [
    'backend:python:fastapi',
    'frontend:node:next',
    'mobile:node:react-native',
    'services/api:python:django',
  ]);
});

test('the walk never enters dependency trees, virtualenvs, build output or the git dir', () => {
  const deps = tree({
    'package.json': '{}',
    'node_modules/react/package.json': '{"dependencies":{"react":"18"}}',
    '.venv/lib/site-packages/x/pyproject.toml': '',
    '.git/package.json': '{}',
    'dist/package.json': '{}',
    'build/pyproject.toml': '',
    '__pycache__/requirements.txt': '',
    '.next/package.json': '{}',
    'test/fixtures/py-fastapi/pyproject.toml': '[project]\nname = "fixture"\ndependencies = ["fastapi"]\n',
    'lib/site-packages/y/requirements.txt': 'flask',
  });
  assert.deepEqual(detectPackages(ROOT, deps).map((pkg) => pkg.dir), ['.']);
});

test('a symlinked directory is not descended', () => {
  const deps = tree({ 'package.json': '{}' });
  const listDir = deps.listDir;
  deps.listDir = (path) => [...listDir(path), { name: 'linked', isDirectory: () => false }];
  assert.deepEqual(detectPackages(ROOT, deps).map((pkg) => pkg.dir), ['.']);
});

test('node framework precedence: nestjs, then next before react, then react-native before react', () => {
  const framework = (deps: Record<string, string>): string | null =>
    detectPackages(ROOT, tree({ 'package.json': JSON.stringify({ dependencies: deps }) }))[0]?.framework ?? null;
  assert.equal(framework({ '@nestjs/core': '10', react: '18' }), 'nestjs');
  assert.equal(framework({ react: '18', next: '14' }), 'next');
  assert.equal(framework({ react: '18', 'react-native': '0.74' }), 'react-native');
  assert.equal(framework({ react: '18' }), 'react');
  assert.equal(framework({ express: '4' }), null);
  // devDependencies count too; an unparsable package.json is still a node package.
  assert.deepEqual(
    detectPackages(ROOT, tree({ 'package.json': '{"devDependencies":{"@nestjs/core":"10"}}' }))[0]?.framework,
    'nestjs',
  );
  assert.deepEqual(detectPackages(ROOT, tree({ 'package.json': 'not json' })), [
    { dir: '.', language: 'node', framework: null, compose_service: null },
  ]);
});

test('pyproject parsing reads PEP 621, optional groups, PEP 735 groups and poetry tables', () => {
  const pep621 = `[build-system]
requires = ["hatchling"]

[project]
name = "svc"
dependencies = [
  "FastAPI[all]>=0.110 ; python_version >= '3.10'",  # web
  'pydantic-settings~=2.0',
]

[project.optional-dependencies]
dev = ["ruff==0.4.0", "pyright==1.1.360"]

[tool.ruff]
select = ["E", "F", "flask"]
`;
  assert.deepEqual(pyprojectDependencies(pep621), ['fastapi', 'pydantic-settings', 'ruff', 'pyright']);
  assert.deepEqual(pyprojectDependencies('[dependency-groups]\ntest = ["pytest>=8", {include-group = "lint"}]\n'), ['pytest']);
  const poetry = `[tool.poetry]
name = "x"

[tool.poetry.dependencies]
python = "^3.12"
Django = "^5.0"
"django-extensions" = { version = "^3", optional = true }

[tool.poetry.group.dev.dependencies]
pytest = "^8"
`;
  assert.deepEqual(pyprojectDependencies(poetry), ['django', 'django-extensions', 'pytest']);
});

test('requirements parsing takes the first token and skips comments and option lines', () => {
  const text = `# pinned
Flask==3.0.0  # web
sqlalchemy >= 2.0, < 3
-r base.txt
--index-url https://example.invalid/simple
-e .
uvicorn[standard]~=0.29; sys_platform != "win32"
`;
  assert.deepEqual(requirementsDependencies(text), ['flask', 'sqlalchemy', 'uvicorn']);
});

test('dependency names are PEP 503-normalised', () => {
  assert.equal(dependencyName('FastAPI[all]>=0.110'), 'fastapi');
  assert.equal(dependencyName('Pydantic_Settings'), 'pydantic-settings');
  assert.equal(dependencyName('zope.interface==6'), 'zope-interface');
  assert.equal(dependencyName('git+https://x/y.git#egg=z'), 'git');
  assert.equal(dependencyName(''), '');
});

test('python framework precedence: fastapi, then django, then flask; none is null', () => {
  const framework = (requirements: string): string | null =>
    detectPackages(ROOT, tree({ 'requirements.txt': requirements }))[0]?.framework ?? null;
  assert.equal(framework('flask\nfastapi\n'), 'fastapi');
  assert.equal(framework('flask\ndjango\n'), 'django');
  assert.equal(framework('flask\n'), 'flask');
  assert.equal(framework('requests\n'), null);
  // requirements.txt alone marks a python package even when nothing parses.
  assert.equal(detectPackages(ROOT, tree({ 'requirements.txt': '' }))[0]?.language, 'python');
});

test('packageJsonDependencies tolerates every non-object shape', () => {
  assert.deepEqual(packageJsonDependencies('[]'), []);
  assert.deepEqual(packageJsonDependencies('{"dependencies":[]}'), []);
  assert.deepEqual(packageJsonDependencies('{"dependencies":{"a":"1"},"devDependencies":{"b":"2"}}'), ['a', 'b']);
});

test('labels and languages render for the SessionStart line', () => {
  const packages = detectPackages(ROOT, tree({
    'backend/requirements.txt': 'fastapi',
    'tools/pyproject.toml': '',
    'web/package.json': '{"dependencies":{"react":"18"}}',
  }));
  assert.deepEqual(packages.map(packageLabel), ['fastapi@backend', 'python@tools', 'react@web']);
  assert.deepEqual(languagesOf(packages), ['python', 'node']);
});

test('the default deps read a real tree', (t) => {
  const root = tempRoot(t);
  mkdirSync(join(root, 'api'));
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'api', 'pyproject.toml'), '[project]\ndependencies = ["flask"]\n');
  writeFileSync(join(root, 'package.json'), '{"dependencies":{"@nestjs/core":"10"}}\n');
  writeFileSync(join(root, 'node_modules', 'x', 'package.json'), '{}\n');
  assert.deepEqual(resolveStack(root, null), {
    packages: [
      { dir: '.', language: 'node', framework: 'nestjs', compose_service: null },
      { dir: 'api', language: 'python', framework: 'flask', compose_service: null, python_env: 'auto' },
    ],
    source: 'detected',
  });
});

// ------------------------------------------------------------------ stack signal

test('an empty tree carries no stack signal', () => {
  assert.equal(hasStackSignal(ROOT, tree({})), false);
  assert.equal(hasStackSignal(ROOT, tree({ 'README.md': '# x\n', 'docs/notes.md': 'x' })), false);
});

test('a manifest at depth 0 through 3 is a stack signal, one at depth 4 is not', () => {
  assert.equal(hasStackSignal(ROOT, tree({ 'go.mod': 'module x\n' })), true);
  assert.equal(hasStackSignal(ROOT, tree({ 'a/Cargo.toml': '' })), true);
  assert.equal(hasStackSignal(ROOT, tree({ 'a/b/Gemfile': '' })), true);
  assert.equal(hasStackSignal(ROOT, tree({ 'a/b/c/package.json': '{}' })), true);
  assert.equal(hasStackSignal(ROOT, tree({ 'a/b/c/d/package.json': '{}' })), false);
});

test('dot-directories and skipped directories never answer the stack signal', () => {
  assert.equal(hasStackSignal(ROOT, tree({
    '.agents/skills/x/package.json': '{}',
    '.claude/pyproject.toml': '',
    'node_modules/left-pad/package.json': '{}',
    '.venv/lib/requirements.txt': '',
    'dist/package.json': '{}',
    'build/pom.xml': '',
  })), false);
});

test('a declared .engineos/config.json is a stack signal on its own', () => {
  assert.equal(hasStackSignal(ROOT, tree({ '.engineos/config.json': '{}' })), true);
});

test('a .csproj or .sln suffix is a stack signal', () => {
  assert.equal(hasStackSignal(ROOT, tree({ 'src/Api/Api.csproj': '<Project/>' })), true);
  assert.equal(hasStackSignal(ROOT, tree({ 'App.sln': '' })), true);
});

test('an unreadable directory is treated as empty, never thrown', () => {
  const deps: StackDeps = {
    exists: () => false,
    readFile: () => {
      throw new Error('EACCES');
    },
    listDir: () => {
      throw new Error('EACCES');
    },
  };
  assert.equal(hasStackSignal(ROOT, deps), false);
});

test('the default deps read the stack signal off a real tree', (t) => {
  const root = tempRoot(t);
  assert.equal(hasStackSignal(root), false);
  mkdirSync(join(root, 'services', 'api'), { recursive: true });
  writeFileSync(join(root, 'services', 'api', 'pom.xml'), '<project/>');
  assert.equal(hasStackSignal(root), true);
});
