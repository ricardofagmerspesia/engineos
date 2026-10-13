// End-to-end port of hooks/test-layout.sh: the standard-layout scaffold as a
// caller outside the process sees it — the JSON manifest, a spawned `engineos
// hook ensure-project-layout` on a SessionStart envelope, and a spawned
// `engineos init` over a fake HOME. One test per bash case, in the bash suite's
// order, named as the claim the bash case's failure message denied.
//
// ./ensure-project-layout.test.ts and ../init/project.test.ts are the in-process
// halves: they drive `run` and `initProject` with an injected io, clock and
// spawner, so they own decision shapes, reaping windows and exit-code wording.
// This file asserts only what survives the process boundary — rendered stdout,
// exit status, and what actually landed on disk.
//
// The bash suite sourced hooks/layout-manifest.sh for its first case; the port
// reads registries/layout-manifest.json, which is the source of truth that shim
// itself reads.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, runCli, tempRoot, type RunResult } from '../testing/harness';

const checkout = resolveRoot({}, __dirname);

// hooks/test-layout.sh:7 — the machine-wide bypass flag is pointed at a path that
// cannot exist, so an operator's pause can never make this suite go quiet and
// report green. ENGINEOS_BYPASS itself is already kept out by the harness env
// allowlist, which also means every ENGINEOS_* a case needs is passed explicitly.
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

const SESSION = 'S1';

const SIX_DIRS = ['.engineos/changes', '.engineos/archived', '.engineos/memory', 'docs/specs', 'docs/prds', 'docs/rules'];

const OPT_IN_HINT =
  '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1';

const SCAFFOLDED = `[engineos] scaffolded standard layout: ${SIX_DIRS.join(', ')} (review seeded READMEs)`;

// The fragment the stack question opens with (design 2026-10-06 §C2); the full
// string is pinned by the in-process suite, this one asserts it crosses the
// process boundary.
const STACK_QUESTION = '[engineos] no stack declared';

// A manifest that answers the stack question without resolving a package, so the
// cases about the opt-in gate and the scaffold keep their exact payloads.
const STACK_FILES: Record<string, string> = { 'go.mod': 'module example.test/app\n' };

// ------------------------------------------------------------------ helpers

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// The bash suite refused to run at all without git; a node:test suite says so per
// case instead of aborting the whole run.
function skipWithoutGit(t: TestContext): boolean {
  if (hasGit()) return false;
  t.skip('git is not installed');
  return true;
}

// bash `printf '{"cwd":"%s","session_id":"S1"}' "$X" | bash ensure-project-layout.sh`.
function hook(cwd: string, env: Record<string, string> = {}): RunResult {
  return runCli(['hook', 'ensure-project-layout'], {
    stdin: envelope({ event: 'SessionStart', cwd, sid: SESSION }),
    env: { ...ISOLATED, ...env },
    cwd,
  });
}

// bash `HOME="$HOME_FAKE" bash scripts/init-project.sh --dir X [--dry-run]`.
function init(argv: string[], home: string): RunResult {
  return runCli(['init', ...argv], { env: { ...ISOLATED, HOME: home } });
}

function hookSpecificOutput(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const specific = parsed['hookSpecificOutput'];
  return isRecord(specific) ? specific : null;
}

// The bash suite grepped the raw stdout for 'opt-in' and for the warn line; the
// port asserts the parsed field those greps were reaching for.
function contextText(stdout: string): string {
  const specific = hookSpecificOutput(stdout);
  if (specific === null) return '';
  const injected = specific['additionalContext'];
  return typeof injected === 'string' ? injected : '';
}

function contextEvent(stdout: string): string {
  const specific = hookSpecificOutput(stdout);
  if (specific === null) return '';
  const event = specific['hookEventName'];
  return typeof event === 'string' ? event : '';
}

// A git repo that has already adopted EngineOS: `.engineos/` is the opt-in signal
// the hook gates on, so these cases need no ENGINEOS_SCAFFOLD at all.
function adoptedRepo(t: TestContext): string {
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'));
  return repo;
}

// A fake HOME carrying the machine-install import line install.sh writes, so no
// case depends on (or touches) the operator's real ~/.claude/CLAUDE.md.
function fakeHome(root: string, opts: { installed?: boolean } = {}): string {
  const home = join(root, `home-${String(Math.random()).slice(2)}`);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), opts.installed === false ? '' : `@${checkout}/CLAUDE.md\n`);
  return home;
}

function isDanglingSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink() && !existsSync(path);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ manifest

test('the manifest loads six or more entries', () => {
  const raw = readJsonFile(join(checkout, 'registries', 'layout-manifest.json'));
  // if/throw rather than assert.ok: an assertion on a type-guard CALL narrows
  // nothing about the value the guard was asked about.
  if (!isRecord(raw)) throw new Error('layout-manifest.json is not a JSON object');
  const rawEntries = raw['entries'];
  if (!Array.isArray(rawEntries)) throw new Error('layout-manifest.json has no entries array');
  // Array.from rather than a cast: Array.isArray narrows unknown to any[].
  const entries: unknown[] = Array.from<unknown>(rawEntries);
  assert.ok(entries.length >= 6, `manifest has ${entries.length} entries, expected 6 or more`);
});

// ------------------------------------------------------------------ the opt-in gate

test('an un-adopted repo is not scaffolded without opt-in', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo);
  assert.equal(existsSync(join(repo, 'docs')), false);
  assert.equal(existsSync(join(repo, '.engineos')), false);
});

test('an un-adopted repo is told how to opt in', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  assert.equal(contextText(hook(repo).stdout), OPT_IN_HINT);
});

test('ENGINEOS_SCAFFOLD=0 disables scaffolding even for an adopted repo', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = adoptedRepo(t);
  const result = hook(repo, { ENGINEOS_SCAFFOLD: '0' });
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('an empty non-git dir is asked for its stack, with exit 0 and nothing written', (t) => {
  const scratch = tempRoot(t);
  const result = hook(scratch);
  assert.equal(result.status, 0);
  assert.equal(contextEvent(result.stdout), 'SessionStart');
  assert.ok(contextText(result.stdout).startsWith(STACK_QUESTION), result.stdout);
  assert.equal(existsSync(join(scratch, 'docs')), false);
});

test('an un-adopted stackless repo is told how to opt in and asked for its stack', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  const lines = contextText(hook(repo).stdout).split('\n');
  assert.equal(lines[0], OPT_IN_HINT);
  assert.ok((lines[1] ?? '').startsWith(STACK_QUESTION), lines.join('\n'));
});

// ------------------------------------------------------------------ the scaffold

test('the scaffold creates all six standard dirs', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  for (const dir of SIX_DIRS) assert.equal(existsSync(join(repo, dir)), true, `missing ${dir}`);
});

test('the specs README is seeded', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(existsSync(join(repo, 'docs', 'specs', 'README.md')), true);
});

test('the prd template is seeded as _template.md', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(existsSync(join(repo, 'docs', 'prds', '_template.md')), true);
});

test('the changes template is seeded', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(existsSync(join(repo, '.engineos', 'changes', '_template.md')), true);
});

test('the scaffold line is emitted as SessionStart context', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  assert.equal(contextEvent(hook(repo, { ENGINEOS_SCAFFOLD: '1' }).stdout), 'SessionStart');
});

test('the scaffold prints one warn line naming what it created', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  assert.equal(contextText(hook(repo, { ENGINEOS_SCAFFOLD: '1' }).stdout), SCAFFOLDED);
});

test('a re-run creates nothing and prints nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  // No ENGINEOS_SCAFFOLD on the second run: .engineos/ now carries the opt-in.
  assert.equal(hook(repo).stdout, '');
});

test('an existing file is never overwritten', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  const seeded = join(repo, 'docs', 'rules', 'README.md');
  writeFileSync(seeded, 'KEEP\n');
  hook(repo);
  assert.equal(readFileSync(seeded, 'utf8'), 'KEEP\n');
});

test('a non-git dir with a stack is left alone, silently, with exit 0', (t) => {
  const scratch = tempRoot(t);
  writeFileSync(join(scratch, 'go.mod'), 'module example.test/app\n');
  const result = hook(scratch, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(scratch, 'docs')), false);
});

test('the engineos repo itself is skipped', (t) => {
  if (skipWithoutGit(t)) return;
  // The bash suite pointed the hook at the real checkout. A node:test suite must
  // not: this hook also reaps the git dir it is given (route cache, telemetry),
  // and a test never writes inside the checkout. So the claim is split in two —
  // the checkout really does carry both marker files, and a repo carrying them is
  // skipped even when it has opted in.
  for (const marker of [join(checkout, 'hooks', 'layout-manifest.sh'), join(checkout, 'install.sh')]) {
    assert.equal(existsSync(marker), true, `the checkout no longer carries ${marker}`);
  }
  const repo = fixtureRepo(tempRoot(t), { files: { 'hooks/layout-manifest.sh': '#\n', 'install.sh': '#\n' } });
  mkdirSync(join(repo, '.engineos'));
  const result = hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(repo, 'docs')), false);
});

// The one case that still drives the bash shim rather than the CLI: its whole
// claim is about the PATH the shim runs under. The payload is decoded in the node
// runtime now (src/hooks/ensure-project-layout.ts), so no grep/sed fallback is
// left to exercise — but jq-independence is still the claim, and this asserts it
// end to end through hooks/ensure-project-layout.sh itself.
test('the hook still scaffolds on a PATH without jq', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const bin = jqFreeBin(root);
  if (bin === null) {
    // Environments without usable symlinks (Windows/Git Bash without Developer
    // Mode) cannot build the reduced PATH, which would make this a false negative.
    t.skip('cannot build a jq-free PATH here (symlinks, bash or node unavailable)');
    return;
  }
  const repo = fixtureRepo(root, { files: STACK_FILES });
  const result = spawnSync('bash', [join(checkout, 'hooks', 'ensure-project-layout.sh')], {
    input: envelope({ event: 'SessionStart', cwd: repo, sid: SESSION }),
    env: { ...ISOLATED, PATH: `${bin}:/bin`, ENGINEOS_SCAFFOLD: '1' },
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(existsSync(join(repo, 'docs', 'specs')), true);
  assert.equal(contextText(result.stdout ?? ''), SCAFFOLDED);
});

// A directory of symlinks to the tools the shim needs, jq deliberately absent.
// Null when the sandbox cannot be built or does not work, so the caller skips
// rather than reporting a failure the environment caused.
function jqFreeBin(root: string): string | null {
  const bin = join(root, 'nojq-bin');
  mkdirSync(bin, { recursive: true });
  for (const tool of ['git', 'node', 'grep', 'sed', 'head', 'bash', 'cp', 'mkdir', 'dirname']) {
    const resolved = tool === 'node' ? process.execPath : which(tool);
    if (resolved === null) continue;
    try {
      symlinkSync(resolved, join(bin, tool));
    } catch {
      return null;
    }
  }
  // Probe the sandbox by RUNNING its git and node: on Windows a symlink to
  // git.exe exists and is executable but cannot load its sibling DLLs, so an
  // existence test passes while every call silently produces nothing.
  const git = spawnSync(join(bin, 'git'), ['--version'], { encoding: 'utf8' });
  if (git.status !== 0 || (git.stdout ?? '') === '') return null;
  if (spawnSync(join(bin, 'node'), ['-e', ''], { encoding: 'utf8' }).status !== 0) return null;
  for (const tool of ['grep', 'sed', 'bash', 'dirname']) {
    if (!existsSync(join(bin, tool))) return null;
  }
  return bin;
}

function which(tool: string): string | null {
  const result = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
  const path = (result.stdout ?? '').trim();
  // bash `[ -f "$_p" ]`: a builtin or alias resolves to something that is not a
  // file, and symlinking it would produce a broken sandbox.
  return result.status === 0 && path !== '' && existsSync(path) ? path : null;
}

// ------------------------------------------------------------------ init-project

test('--dry-run reports cleanly without writing', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const result = init(['--dir', repo, '--dry-run'], fakeHome(root));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('dry run'), result.stdout);
  assert.equal(existsSync(join(repo, '.engineos')), false);
});

test('init exits 0 on a fresh git repo', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  assert.equal(init(['--dir', repo], fakeHome(root)).status, 0);
});

test('init creates .engineos/changes', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  init(['--dir', repo], fakeHome(root));
  assert.equal(existsSync(join(repo, '.engineos', 'changes')), true);
});

test('init copies CLAUDE.md', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  init(['--dir', repo], fakeHome(root));
  assert.equal(existsSync(join(repo, 'CLAUDE.md')), true);
});

test('a second init succeeds', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const home = fakeHome(root);
  init(['--dir', repo], home);
  assert.equal(init(['--dir', repo], home).status, 0);
});

test('init does not overwrite an existing CLAUDE.md', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const home = fakeHome(root);
  init(['--dir', repo], home);
  writeFileSync(join(repo, 'CLAUDE.md'), '# mine\n');
  init(['--dir', repo], home);
  assert.equal(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), '# mine\n');
});

test('init exits 1 without the machine install', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  assert.equal(init(['--dir', repo], fakeHome(root, { installed: false })).status, 1);
});

test('init refuses the engineos repo with 3', (t) => {
  if (skipWithoutGit(t)) return;
  // Safe to aim at the real checkout: the refusal happens before anything is
  // written, which is the whole point of the case.
  const root = tempRoot(t);
  assert.equal(init(['--dir', checkout], fakeHome(root)).status, 3);
});

test('the hook stops showing the opt-in hint after init', (t) => {
  if (skipWithoutGit(t)) return;
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  init(['--dir', repo], fakeHome(root));
  assert.ok(!contextText(hook(repo).stdout).includes('not scaffolded'));
});

// ------------------------------------------------------------------ containment

// The hostile-repo case: a clone ships .engineos/ (the opt-in signal this hook
// gates on) plus docs/specs/README.md as a symlink to an absolute path outside
// the project. An existence test is FALSE for a dangling link, so the unguarded
// scaffolder proceeded and copied the template THROUGH the link, creating the
// attacker's file.
interface DanglingSeed {
  repo: string;
  outside: string;
  planted: string;
  result: RunResult;
}

function danglingSeedFixture(t: TestContext): DanglingSeed {
  const root = tempRoot(t);
  const repo = adoptedRepo(t);
  const outside = join(root, 'outside');
  mkdirSync(outside, { recursive: true });
  mkdirSync(join(repo, 'docs', 'specs'), { recursive: true });
  const planted = join(repo, 'docs', 'specs', 'README.md');
  symlinkSync(join(outside, 'pwned.md'), planted);
  return { repo, outside, planted, result: hook(repo) };
}

test('the scaffolder exits 0 on a dangling-symlink destination', (t) => {
  if (skipWithoutGit(t)) return;
  assert.equal(danglingSeedFixture(t).result.status, 0);
});

test('the scaffolder never writes through a dangling symlink', (t) => {
  if (skipWithoutGit(t)) return;
  const fixture = danglingSeedFixture(t);
  assert.equal(existsSync(join(fixture.outside, 'pwned.md')), false);
});

test('a planted dangling symlink is skipped, not written to', (t) => {
  if (skipWithoutGit(t)) return;
  assert.equal(isDanglingSymlink(danglingSeedFixture(t).planted), true);
});

test('one refused destination does not abort the rest of the scaffold', (t) => {
  if (skipWithoutGit(t)) return;
  const fixture = danglingSeedFixture(t);
  assert.equal(existsSync(join(fixture.repo, 'docs', 'prds')), true);
});

// The directory form of the same defect: `mkdir -p` follows a symlinked component
// without complaint, so an unguarded scaffolder creates docs/specs INSIDE the
// attacker's directory and seeds it there.
interface SymlinkedDir {
  repo: string;
  outside: string;
  result: RunResult;
}

function symlinkedDirFixture(t: TestContext): SymlinkedDir {
  const root = tempRoot(t);
  const repo = adoptedRepo(t);
  const outside = join(root, 'outside-docs');
  mkdirSync(join(outside, 'docs'), { recursive: true });
  symlinkSync(join(outside, 'docs'), join(repo, 'docs'));
  return { repo, outside, result: hook(repo) };
}

test('the scaffolder exits 0 on a symlinked directory component', (t) => {
  if (skipWithoutGit(t)) return;
  assert.equal(symlinkedDirFixture(t).result.status, 0);
});

test('the scaffolder does not follow a symlinked directory out of the project', (t) => {
  if (skipWithoutGit(t)) return;
  const fixture = symlinkedDirFixture(t);
  assert.equal(existsSync(join(fixture.outside, 'docs', 'specs')), false);
});

test('a refused directory component does not abort the rest of the scaffold', (t) => {
  if (skipWithoutGit(t)) return;
  const fixture = symlinkedDirFixture(t);
  assert.equal(existsSync(join(fixture.repo, '.engineos', 'changes')), true);
});

interface DanglingClaudeMd {
  outside: string;
  result: RunResult;
}

function danglingClaudeMdFixture(t: TestContext): DanglingClaudeMd {
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const outside = join(root, 'outside-claude');
  mkdirSync(outside, { recursive: true });
  symlinkSync(join(outside, 'planted.md'), join(repo, 'CLAUDE.md'));
  return { outside, result: init(['--dir', repo], fakeHome(root)) };
}

test('init-project exits 0 on a dangling CLAUDE.md symlink', (t) => {
  if (skipWithoutGit(t)) return;
  assert.equal(danglingClaudeMdFixture(t).result.status, 0);
});

test('init-project never writes CLAUDE.md through a dangling symlink', (t) => {
  if (skipWithoutGit(t)) return;
  const fixture = danglingClaudeMdFixture(t);
  assert.equal(existsSync(join(fixture.outside, 'planted.md')), false);
});

// ------------------------------------------------------------------ regression

// The guarded happy path still seeds the real template content: the containment
// rewrite above must not have turned every write into a refusal.
test('the guarded scaffold still creates all six dirs', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  for (const dir of SIX_DIRS) assert.equal(existsSync(join(repo, dir)), true, `missing ${dir}`);
});

test('the seeded docs/specs/README.md is the template byte for byte', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(
    readFileSync(join(repo, 'docs', 'specs', 'README.md'), 'utf8'),
    readFileSync(join(checkout, 'templates', 'project-layout', 'specs-README.md'), 'utf8'),
  );
});

test('the seeded .engineos/changes/_template.md is the in-repo template', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t));
  hook(repo, { ENGINEOS_SCAFFOLD: '1' });
  assert.equal(
    readFileSync(join(repo, '.engineos', 'changes', '_template.md'), 'utf8'),
    readFileSync(join(checkout, '.engineos', 'changes', '_template.md'), 'utf8'),
  );
});
