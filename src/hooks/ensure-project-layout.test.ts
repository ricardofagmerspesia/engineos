import { test } from 'node:test';
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
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), {
    kind: 'context',
    event: 'SessionStart',
    text: '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1',
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
  const repo = fixtureRepo(tempRoot(t));
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
  const repo = fixtureRepo(tempRoot(t));
  run(sessionStart(repo), hookCtx({ env: { ENGINEOS_SCAFFOLD: '1' } }));
  assert.deepEqual(run(sessionStart(repo), hookCtx()), { kind: 'silent' });
});

test('a directory outside any git work tree is silent', (t) => {
  const scratch = tempRoot(t);
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
