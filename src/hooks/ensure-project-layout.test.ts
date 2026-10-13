import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, relocatedRoot, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { run } from './ensure-project-layout';
import type { HookContext } from './output';

const checkout = resolveRoot({}, __dirname);
const NOW = Date.now();
const DAY_MS = 86_400_000;
const SIX_DIRS = '.engineos/changes, .engineos/archived, .engineos/memory, docs/specs, docs/prds, docs/rules';
const OPT_IN_HINT =
  '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1';
// Restated rather than imported, like the hint above: a test that imported the
// constant would pass however the note was rewritten.
const STACK_QUESTION_NOTE =
  '[engineos] no stack declared — this repo has no .engineos/config.json and no package manifest. Before writing any code, ask the developer which stack this project uses: NestJS (Node.js/TypeScript) or FastAPI (Python) for application backends (including API, worker and LLM service hosts); Node.js alone is a runtime and tooling environment, not a backend framework choice. Then ask only about unresolved backend scope/package paths, frontend/mobile choices (Next.js, React, React Native), and LLM provider/model or storage requirements. LLM applications and chatbots use Mastra inside NestJS providers on the Node stack and LangGraph on the Python stack; do not ask the developer to reconfirm them once the backend is chosen. Never offer plain Node.js or standalone Express application backends (rules/base.md "New projects — stack first"). Persist the answer with `engineos init --stack <framework>[@dir],...` and record it as the project\'s first ADR.';
// A manifest EngineOS recognises as a stack choice but resolves no package for,
// so the cases that are not about the stack keep their stack line out of the way.
const STACK_FILES: Record<string, string> = { 'go.mod': 'module example.test/app\n' };

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function sessionStart(cwd: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: envelope({ event: 'SessionStart', cwd, sid: 'S1' }) }));
  if (decoded === null) throw new Error('the harness envelope did not decode');
  return decoded;
}

function hookCtx(opts: { env?: NodeJS.ProcessEnv; root?: string } = {}): HookContext {
  return { io: memoryIo({ env: opts.env ?? {} }), root: opts.root ?? checkout, now: () => NOW, spawn: spawnSync };
}

function gitDirOf(repo: string): string {
  const result = spawnSync('git', ['-C', repo, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  return (result.stdout ?? '').trim();
}

// mtime is set relative to the clock the hook is given, so a case says "this file
// is N days old" and never depends on when the suite runs.
function ageFile(path: string, days: number): void {
  writeFileSync(path, 'x\n');
  const seconds = (NOW - days * DAY_MS) / 1000;
  utimesSync(path, seconds, seconds);
}

test('an un-adopted repo is left alone and told how to opt in', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: OPT_IN_HINT,
  });
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('ENGINEOS_SCAFFOLD=0 disables scaffolding even for an adopted repo', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'));
  assert.deepEqual(run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '0' } })), { kind: 'silent' });
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('ENGINEOS_SCAFFOLD=1 scaffolds the six standard dirs and names them once', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  assert.deepEqual(run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } })), {
    kind: 'context',
    event: 'SessionStart',
    text: `[engineos] scaffolded standard layout: ${SIX_DIRS} (review seeded READMEs)`,
  });
  for (const dir of SIX_DIRS.split(', ')) assert.equal(existsSync(join(repo, dir)), true, dir);
  assert.equal(existsSync(join(repo, 'docs', 'specs', 'README.md')), true);
});

test('a repo whose layout is already complete is silent', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } }));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), { kind: 'silent' });
});

test('a directory with a stack outside any git work tree is silent', (t) => {
  const scratch = tempRoot(t);
  writeFileSync(join(scratch, 'go.mod'), 'module example.test/app\n');
  assert.deepEqual(run(sessionStart(scratch), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } })), { kind: 'silent' });
  assert.equal(existsSync(join(scratch, 'docs')), false);
});

test('an empty cwd is silent', () => {
  assert.deepEqual(run(sessionStart(''), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } })), { kind: 'silent' });
});

test('the EngineOS checkout itself is never scaffolded', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  // The marker files the skip keys on, in a fixture: a unit test must not reach
  // into the real checkout's .git, which this hook reaps.
  const repo = fixtureRepo(tempRoot(t), { files: { 'hooks/layout-manifest.sh': '#\n', 'install.sh': '#\n' } });
  mkdirSync(join(repo, '.engineos'));
  assert.deepEqual(run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } })), { kind: 'silent' });
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('a leftover bypass marker expires even in a repo the scaffold skips', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { files: { 'hooks/layout-manifest.sh': '#\n', 'install.sh': '#\n' } });
  const marker = join(gitDirOf(repo), 'ENGINEOS_BYPASS');
  writeFileSync(marker, '');
  assert.deepEqual(run(sessionStart(repo), hookCtx()), { kind: 'silent' });
  assert.equal(existsSync(marker), false);
});

test('unrecorded-change flags older than seven days are reaped, newer ones kept', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const git = gitDirOf(repo);
  const stale = join(git, 'ENGINEOS_UNRECORDED.old');
  const fresh = join(git, 'ENGINEOS_UNRECORDED.new');
  ageFile(stale, 8);
  ageFile(fresh, 3);
  run(sessionStart(repo), hookCtx());
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
});

test('the route cache is wiped on every session start', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const cache = join(gitDirOf(repo), 'engineos-route-cache');
  mkdirSync(join(cache, 'S1-sig-0', 'src'), { recursive: true });
  writeFileSync(join(cache, 'S1-sig-0', 'src', 'a.ts.route'), 'backend');
  run(sessionStart(repo), hookCtx());
  assert.equal(existsSync(cache), false);
});

test('telemetry and span files past the registry window are reaped, recent ones kept', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const dir = join(gitDirOf(repo), 'engineos-telemetry');
  mkdirSync(join(dir, 'spans'), { recursive: true });
  const staleEvents = join(dir, 'old.jsonl');
  const staleSpans = join(dir, 'old.exec.jsonl');
  const staleMarker = join(dir, 'spans', 'old-span');
  const fresh = join(dir, 'new.jsonl');
  const other = join(dir, 'old.txt');
  for (const path of [staleEvents, staleSpans, staleMarker, other]) ageFile(path, 400);
  ageFile(fresh, 1);
  run(sessionStart(repo), hookCtx());
  assert.equal(existsSync(staleEvents), false);
  assert.equal(existsSync(staleSpans), false);
  assert.equal(existsSync(staleMarker), false);
  assert.equal(existsSync(fresh), true);
  // Only the two streams the window covers: a file the reaper does not name stays.
  assert.equal(existsSync(other), true);
});

test('the retention window comes from the registry, not from a literal', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const relocated = relocatedRoot(root, {
    mutate: (policy) => {
      const telemetry = policy['telemetry'];
      if (!isRecord(telemetry)) throw new Error('policy.telemetry is not an object');
      telemetry['retention_days'] = 1;
    },
  });
  const dir = join(gitDirOf(repo), 'engineos-telemetry');
  mkdirSync(dir, { recursive: true });
  const events = join(dir, 'three-days.jsonl');
  ageFile(events, 3);
  run(sessionStart(repo), hookCtx({ root: relocated }));
  assert.equal(existsSync(events), false);
});

test('a malformed layout manifest leaves the session start silent', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  mkdirSync(join(repo, '.engineos'));
  const relocated = relocatedRoot(root);
  writeFileSync(join(relocated, 'registries', 'layout-manifest.json'), '{"entries":[{"dir":1}]}');
  assert.deepEqual(run(sessionStart(repo), hookCtx({ root: relocated })), { kind: 'silent' });
  assert.equal(existsSync(join(repo, 'docs')), false);
});

// ------------------------------------------------------------------ the stack line

test('an adopted repo with package markers gets one stack line after the scaffold line', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), {
    pkg: { dependencies: { react: '18' } },
    files: { 'backend/requirements.txt': 'fastapi==0.110.0\n' },
  });
  mkdirSync(join(repo, '.engineos'));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: `[engineos] scaffolded standard layout: ${SIX_DIRS} (review seeded READMEs)\n`
      + '[engineos] stack: react@. · fastapi@backend · runners: node: lint/typecheck scripts, python: ruff/pyright/pytest',
  });
  // A second start scaffolds nothing and still says what the stack is.
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: '[engineos] stack: react@. · fastapi@backend · runners: node: lint/typecheck scripts, python: ruff/pyright/pytest',
  });
});

test('the stack line reads .engineos/config.json when present and reports one that is malformed', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { pkg: { dependencies: { react: '18' } } });
  run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } }));
  const config = join(repo, '.engineos', 'config.json');
  writeFileSync(config, JSON.stringify({
    version: 1,
    stack: { packages: [{ dir: 'svc', language: 'python', framework: 'django', compose_service: 'svc' }] },
  }));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: '[engineos] stack: django@svc · runners: python: ruff/pyright/pytest',
  });
  writeFileSync(config, '{"version":1,"stack":{"packages":[{"dir":"a","language":"go","framework":null,"compose_service":null}]}}');
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: `[engineos] stack: ${config}: .stack.packages[0].language must be one of python|node`,
  });
});

test('an adopted repo with a manifest but no runnable package stays silent once its layout is complete', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), { files: STACK_FILES });
  run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } }));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), { kind: 'silent' });
});

// ------------------------------------------------------------------ the stack question

// os.homedir() reads HOME on POSIX, so the home-directory guard is exercised
// against a temp dir instead of the developer's real home.
function withHome(t: TestContext, home: string): void {
  const previous = process.env['HOME'];
  process.env['HOME'] = home;
  t.after(() => {
    if (previous === undefined) delete process.env['HOME'];
    else process.env['HOME'] = previous;
  });
}

test('an empty directory outside git is asked for its stack and never scaffolded', (t) => {
  const scratch = tempRoot(t);
  assert.deepEqual(run(sessionStart(scratch), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: STACK_QUESTION_NOTE,
  });
  assert.equal(existsSync(join(scratch, 'docs')), false);
  assert.equal(existsSync(join(scratch, '.engineos')), false);
});

test('a session started in the home directory is never asked for a stack', (t) => {
  const home = tempRoot(t);
  withHome(t, home);
  assert.deepEqual(run(sessionStart(home), hookCtx()), { kind: 'silent' });
});

test('a home directory that is a git repo gets the opt-in hint without the stack question', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  withHome(t, repo);
  assert.deepEqual(run(sessionStart(repo), hookCtx()), { kind: 'context', event: 'SessionStart', text: OPT_IN_HINT });
});

test('an un-adopted stackless repo gets the opt-in hint and the stack question in one payload', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: `${OPT_IN_HINT}\n${STACK_QUESTION_NOTE}`,
  });
  assert.equal(existsSync(join(repo, 'docs')), false);
});

test('an adopted stackless repo carries the stack question after the scaffold line, and on every start', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } })), {
    kind: 'context',
    event: 'SessionStart',
    text: `[engineos] scaffolded standard layout: ${SIX_DIRS} (review seeded READMEs)\n${STACK_QUESTION_NOTE}`,
  });
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: STACK_QUESTION_NOTE,
  });
});

test('a declared .engineos/config.json answers the stack question', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t), {
    files: { '.engineos/config.json': JSON.stringify({ version: 1, stack: { packages: [] } }) },
  });
  run(sessionStart(repo), hookCtx());
  const decision = run(sessionStart(repo), hookCtx());
  assert.ok(decision.kind !== 'context' || !decision.text.includes('no stack declared'), JSON.stringify(decision));
});

test('ENGINEOS_SCAFFOLD=0 keeps a stackless repo silent', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '0' } })), { kind: 'silent' });
});
