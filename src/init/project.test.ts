import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, relocatedRoot, tempRoot } from '../testing/harness';
import { AGENT_SKILLS_DOCS, IMPORT_RE, claudeMdTemplate, initProject, parseStackSpec } from './project';

const checkout = resolveRoot({}, __dirname);
const SIX_DIRS = ['.engineos/changes', '.engineos/archived', '.engineos/memory', 'docs/specs', 'docs/prds', 'docs/rules'];

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

// A fake HOME carrying the machine-install import line, so no case depends on (or
// touches) the operator's real ~/.claude/CLAUDE.md.
function fakeHome(root: string, opts: { installed?: boolean } = {}): string {
  const home = join(root, `home-${String(Math.random()).slice(2)}`);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), opts.installed === false ? '' : `@${checkout}/CLAUDE.md\n`);
  return home;
}

function init(argv: string[], opts: { home?: string; cwd?: string; root?: string }): Run {
  const env: NodeJS.ProcessEnv = opts.home === undefined ? {} : { HOME: opts.home };
  const io = memoryIo({ env, cwd: opts.cwd ?? '/' });
  const status = initProject(argv, { io, root: opts.root ?? checkout, spawn: spawnSync });
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

test('the import regex is the same literal install.sh carries', () => {
  const installer = readFileSync(join(checkout, 'install.sh'), 'utf8');
  assert.ok(installer.includes(`IMPORT_RE='${IMPORT_RE}'`), `install.sh does not carry IMPORT_RE=${IMPORT_RE}`);
});

test('bad usage is refused with 64 before anything is touched', () => {
  assert.deepEqual(init(['--dir'], { home: '/nonexistent' }), { status: 64, stdout: '', stderr: '--dir needs a path\n' });
  assert.deepEqual(init(['--wat'], { home: '/nonexistent' }), {
    status: 64,
    stdout: '',
    stderr: 'usage: engineos init [--dir PATH] [--stack auto|<framework>[@dir],...] [--router keyword|llm|jev|auto] [--dry-run]\n',
  });
  assert.deepEqual(init(['--stack'], { home: '/nonexistent' }), {
    status: 64,
    stdout: '',
    stderr: '--stack needs auto or a comma list of framework[@dir]\n',
  });
});

test('a bad --stack spec is refused with 64 and names the offending entry', () => {
  const refuse = (spec: string, message: string): void => {
    assert.deepEqual(init(['--stack', spec], { home: '/nonexistent' }), { status: 64, stdout: '', stderr: `${message}\n` });
  };
  refuse('rails', '--stack: unknown framework "rails" (one of fastapi, django, flask, nestjs, react, next, react-native)');
  refuse('fastapi,', '--stack: empty entry in "fastapi,"');
  refuse('fastapi@/abs', '--stack: "/abs" must be a directory relative to the repo root');
  refuse('fastapi@../up', '--stack: "../up" must be a directory relative to the repo root');
  refuse('fastapi@api,react@./api/', '--stack: "api" is declared twice');
  refuse('', '--stack needs auto or a comma list of framework[@dir]');
});

test('parseStackSpec derives the language from the framework and normalises dirs', () => {
  assert.deepEqual(parseStackSpec('auto'), { ok: true, stack: { kind: 'auto' } });
  assert.deepEqual(parseStackSpec('fastapi@./backend/, react@frontend, react-native'), {
    ok: true,
    stack: {
      kind: 'declared',
      packages: [
        { dir: 'backend', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' },
        { dir: 'frontend', language: 'node', framework: 'react', compose_service: null },
        { dir: '.', language: 'node', framework: 'react-native', compose_service: null },
      ],
    },
  });
});

test('a target outside any git work tree answers 2', (t) => {
  const scratch = tempRoot(t);
  const run = init(['--dir', scratch], { home: fakeHome(scratch) });
  assert.equal(run.status, 2);
  assert.equal(run.stderr, `[engineos] ${scratch} is not inside a git work tree\n`);
});

test('the EngineOS repo itself answers 3, ahead of the machine-level guards', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const marked = fixtureRepo(root, {
    files: { 'hooks/layout-manifest.sh': '#\n', 'hooks/hooks.json': '{}\n', 'install.sh': '#\n' },
  });
  // No HOME at all: the refusal must still be 3, the honest reason.
  const run = init(['--dir', marked], {});
  assert.equal(run.status, 3);
  assert.equal(run.stderr, '[engineos] refusing to init inside the EngineOS repo\n');
});

test('a target that IS this runtime checkout answers 3 even without the marker files', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(init(['--dir', repo], { root: repo }).status, 3);
});

test('an unset HOME answers 1 and says which file it cannot locate', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const run = init(['--dir', repo], {});
  assert.equal(run.status, 1);
  assert.equal(run.stderr, '[engineos] HOME is unset or empty — cannot locate ~/.claude/CLAUDE.md\n');
});

test('a HOME without the machine-install import line answers 1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo], { home: fakeHome(root, { installed: false }) });
  assert.equal(run.status, 1);
  assert.equal(run.stderr, `[engineos] machine install not found in ~/.claude/CLAUDE.md — run once: ${checkout}/install.sh\n`);
});

test('a checkout missing a scaffold sibling answers 1 and names the file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  // relocatedRoot copies registries/ only, so the bash scaffold halves are absent.
  const broken = relocatedRoot(root);
  const run = init(['--dir', repo], { home: fakeHome(root), root: broken });
  assert.equal(run.status, 1);
  assert.equal(run.stderr, `[engineos] broken checkout: ${broken}/hooks/scaffold-layout.sh is missing\n`);
});

test('a fresh project is adopted: layout created, CLAUDE.md seeded, exit 0', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  assert.ok(run.stdout.startsWith(`[engineos] adopting EngineOS in ${repo}\n`));
  assert.ok(run.stdout.includes(`  created: ${SIX_DIRS.join(', ')}\n`));
  assert.ok(run.stdout.includes('  CLAUDE.md: created from templates/project-claude.md'));
  assert.ok(run.stdout.includes('Done. EngineOS is now the default methodology for this project:'));
  for (const dir of SIX_DIRS) assert.equal(existsSync(join(repo, dir)), true, dir);
  assert.equal(
    readFileSync(join(repo, 'CLAUDE.md'), 'utf8'),
    readFileSync(join(checkout, 'templates', 'project-claude.md'), 'utf8'),
  );
});

test('a second run changes nothing and says so', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const home = fakeHome(root);
  init(['--dir', repo], { home });
  writeFileSync(join(repo, 'CLAUDE.md'), '# mine\n');
  const run = init(['--dir', repo], { home });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('  layout: already complete\n'));
  assert.ok(run.stdout.includes('  CLAUDE.md: exists, left untouched'));
  assert.equal(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), '# mine\n');
});

test('--dry-run reports the manifest and writes nothing', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--dry-run'], { home: fakeHome(root) });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('(dry run — nothing written)\n'));
  assert.ok(run.stdout.includes(`  would ensure: ${SIX_DIRS.join(', ')}\n`));
  assert.ok(run.stdout.includes('  would create CLAUDE.md from templates/project-claude.md\n'));
  assert.equal(existsSync(join(repo, '.engineos')), false);
  assert.equal(existsSync(join(repo, 'CLAUDE.md')), false);
});

test('the default target is the working directory', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init([], { home: fakeHome(root), cwd: repo });
  assert.equal(run.status, 0);
  assert.equal(existsSync(join(repo, '.engineos', 'changes')), true);
});

test('a dangling CLAUDE.md symlink is left standing, never written through', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  symlinkSync(join(outside, 'planted.md'), join(repo, 'CLAUDE.md'));
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('  CLAUDE.md: exists, left untouched'));
  assert.equal(existsSync(join(outside, 'planted.md')), false);
});

// ------------------------------------------------------------------ --stack

const CONFIG = '.engineos/config.json';

function readConfig(repo: string): unknown {
  return JSON.parse(readFileSync(join(repo, CONFIG), 'utf8'));
}

test('--stack auto (the default) writes what detection found, pretty-printed with a trailing newline', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root, {
    pkg: { dependencies: { next: '14', react: '18' } },
    files: { 'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n' },
  });
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  stack (detected):\n    next@.                   node\n    fastapi@api              python\n'), run.stdout);
  assert.ok(run.stdout.includes(`  ${CONFIG}: created (detected) — edit it to correct the stack\n`), run.stdout);
  const text = readFileSync(join(repo, CONFIG), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  assert.deepEqual(readConfig(repo), {
    version: 1,
    stack: {
      packages: [
        { dir: '.', language: 'node', framework: 'next', compose_service: null },
        { dir: 'api', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' },
      ],
    },
    router: { mode: 'auto' },
  });
});

test('--stack with a declared list writes exactly that list', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root, { pkg: { dependencies: { react: '18' } } });
  const run = init(['--dir', repo, '--stack', 'fastapi@backend,react@frontend'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  stack (config):\n    fastapi@backend          python\n    react@frontend           node\n'), run.stdout);
  assert.ok(run.stdout.includes(`  ${CONFIG}: created (declared)`), run.stdout);
  assert.deepEqual(readConfig(repo), {
    version: 1,
    stack: {
      packages: [
        { dir: 'backend', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' },
        { dir: 'frontend', language: 'node', framework: 'react', compose_service: null },
      ],
    },
    router: { mode: 'auto' },
  });
});

test('an existing config is never overwritten, even by a different --stack', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const home = fakeHome(root);
  init(['--dir', repo, '--stack', 'flask'], { home });
  const before = readFileSync(join(repo, CONFIG), 'utf8');
  const run = init(['--dir', repo, '--stack', 'django@svc'], { home });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes(`  ${CONFIG}: exists, left untouched\n`), run.stdout);
  assert.equal(readFileSync(join(repo, CONFIG), 'utf8'), before);
});

test('nothing is written when detection finds no package, and the hint says how to declare one', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('  stack (detected): none\n'), run.stdout);
  assert.ok(run.stdout.includes(`  ${CONFIG}: not written — no package detected; declare one with --stack <framework>[@dir]\n`), run.stdout);
  assert.equal(existsSync(join(repo, CONFIG)), false);
});

// ------------------------------------------------------- CLAUDE.md template

test('the CLAUDE.md template follows the resolved stack: python-only → the python variant, anything else → the general one', () => {
  const py = { dir: '.', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' } as const;
  const node = { dir: 'web', language: 'node', framework: 'react', compose_service: null } as const;
  assert.equal(claudeMdTemplate([]), 'templates/project-claude.md');
  assert.equal(claudeMdTemplate([node]), 'templates/project-claude.md');
  assert.equal(claudeMdTemplate([py, node]), 'templates/project-claude.md');
  assert.equal(claudeMdTemplate([py]), 'templates/project-claude-python.md');
  assert.equal(claudeMdTemplate([py, { ...py, dir: 'svc' }]), 'templates/project-claude-python.md');
});

test('both starter templates ship and carry the sections init tells the developer to fill', () => {
  for (const name of ['project-claude.md', 'project-claude-python.md']) {
    const text = readFileSync(join(checkout, 'templates', name), 'utf8');
    for (const heading of ['## Stack (router hints)', '## Commands', '## EngineOS']) {
      assert.ok(text.includes(`${heading}\n`), `${name} lacks ${heading}`);
    }
  }
  const general = readFileSync(join(checkout, 'templates', 'project-claude.md'), 'utf8');
  assert.ok(general.includes('`npm run typecheck`') && general.includes('`pyright`'), 'general template carries both stacks');
  const python = readFileSync(join(checkout, 'templates', 'project-claude-python.md'), 'utf8');
  assert.ok(python.includes('`pyright`') && !python.includes('npm run'), 'python variant is single-stack');
});

test('a python-only repo is seeded from the python variant', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root, { files: { 'pyproject.toml': '[project]\ndependencies = ["fastapi"]\n' } });
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  stack (detected):\n    fastapi@.                python\n'), run.stdout);
  assert.ok(run.stdout.includes('  CLAUDE.md: created from templates/project-claude-python.md'), run.stdout);
  assert.equal(
    readFileSync(join(repo, 'CLAUDE.md'), 'utf8'),
    readFileSync(join(checkout, 'templates', 'project-claude-python.md'), 'utf8'),
  );
});

test('a declared mixed stack is seeded from the general template, which carries both blocks', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--stack', 'fastapi@backend,react@frontend'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  CLAUDE.md: created from templates/project-claude.md'), run.stdout);
  assert.equal(
    readFileSync(join(repo, 'CLAUDE.md'), 'utf8'),
    readFileSync(join(checkout, 'templates', 'project-claude.md'), 'utf8'),
  );
});

test('--dry-run names the python variant for a declared python-only stack and writes nothing', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--dry-run', '--stack', 'fastapi@api'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  would create CLAUDE.md from templates/project-claude-python.md\n'), run.stdout);
  assert.equal(existsSync(join(repo, 'CLAUDE.md')), false);
});

test('--dry-run prints the config it would write and writes nothing', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--dry-run', '--stack', 'nestjs'], { home: fakeHome(root) });
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes(`  would write ${CONFIG}:\n    {\n      "version": 1,\n`), run.stdout);
  assert.equal(existsSync(join(repo, '.engineos')), false);
});

// ----------------------------------------------------------------- --router

test('a bad --router value is refused with 64 before anything is touched', () => {
  const message = '--router needs one of keyword, llm, jev, auto\n';
  assert.deepEqual(init(['--router'], { home: '/nonexistent' }), { status: 64, stdout: '', stderr: message });
  assert.deepEqual(init(['--router', 'regex'], { home: '/nonexistent' }), { status: 64, stdout: '', stderr: message });
});

test('--router writes the mode next to the stack', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--stack', 'fastapi', '--router', 'keyword'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  const text = readFileSync(join(repo, CONFIG), 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(text)), ['version', 'stack', 'router']);
  assert.deepEqual(readConfig(repo), {
    version: 1,
    stack: { packages: [{ dir: '.', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' }] },
    router: { mode: 'keyword' },
  });
});

test('--dry-run shows the router mode in the config it would write', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--dry-run', '--stack', 'nestjs', '--router', 'jev'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('      "router": {\n        "mode": "jev"\n      }\n'), run.stdout);
  assert.equal(existsSync(join(repo, '.engineos')), false);
});

// ---------------------------------------------------- docs/agents/ seeding

test('a fresh project gets both agent-skills docs seeded from templates/agent-skills/', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual([...AGENT_SKILLS_DOCS], ['issue-tracker.md', 'domain.md']);
  for (const name of AGENT_SKILLS_DOCS) {
    assert.ok(run.stdout.includes(`  docs/agents/${name}: created from templates/agent-skills/${name}\n`), run.stdout);
    assert.equal(
      readFileSync(join(repo, 'docs', 'agents', name), 'utf8'),
      readFileSync(join(checkout, 'templates', 'agent-skills', name), 'utf8'),
    );
  }
});

test('existing agent-skills docs are never overwritten, and a dangling symlink is not written through', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'agents', 'issue-tracker.md'), '# mine\n');
  symlinkSync(join(outside, 'planted.md'), join(repo, 'docs', 'agents', 'domain.md'));
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes('  docs/agents/issue-tracker.md: exists, left untouched\n'), run.stdout);
  assert.ok(run.stdout.includes('  docs/agents/domain.md: exists, left untouched\n'), run.stdout);
  assert.equal(readFileSync(join(repo, 'docs', 'agents', 'issue-tracker.md'), 'utf8'), '# mine\n');
  assert.equal(existsSync(join(outside, 'planted.md')), false);
});

test('a symlinked docs/agents/ directory is refused, never seeded through', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  mkdirSync(join(repo, 'docs'), { recursive: true });
  symlinkSync(outside, join(repo, 'docs', 'agents'));
  const run = init(['--dir', repo], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  for (const name of AGENT_SKILLS_DOCS) {
    assert.ok(run.stdout.includes(`  docs/agents/${name}: skipped — `), run.stdout);
    assert.equal(existsSync(join(outside, name)), false);
  }
});

test('--dry-run names the agent-skills docs it would seed and writes nothing', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const run = init(['--dir', repo, '--dry-run'], { home: fakeHome(root) });
  assert.equal(run.status, 0, run.stderr);
  for (const name of AGENT_SKILLS_DOCS) {
    assert.ok(run.stdout.includes(`  would create docs/agents/${name} from templates/agent-skills/${name}\n`), run.stdout);
  }
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('both starter CLAUDE.md templates carry the Agent skills and tlc-spec-lean blocks', () => {
  for (const name of ['project-claude.md', 'project-claude-python.md']) {
    const text = readFileSync(join(checkout, 'templates', name), 'utf8');
    for (const line of ['## Agent skills\n', '### Issue tracker\n', '### Triage labels\n', '### Domain docs\n', '## tlc-spec-lean\n', 'profile: light\n', 'budget: 150k\n']) {
      assert.ok(text.includes(line), `${name} lacks ${line.trim()}`);
    }
    assert.ok(text.includes('`docs/agents/issue-tracker.md`') && text.includes('`docs/agents/domain.md`'), name);
  }
});
