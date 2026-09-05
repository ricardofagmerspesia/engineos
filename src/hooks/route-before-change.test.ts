import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, tempRoot } from '../testing/harness';
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext } from './output';
import { run } from './route-before-change';

const root = resolveRoot({}, __dirname);

// One of the ten guidance strings hooks/test-route.sh asserts, kept whole: a
// stale rules list is exactly what a substring check would let through.
const BACKEND = 'rules/backend.md+architecture.md+data.md+testing.md+observability.md | skill:nestjs-patterns | agent:backend-coordinator';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// Every case points the machine-wide bypass flag at a path that does not exist,
// so the operator's own ~/.claude/engineos.bypass can never decide a test.
function ctxWith(env: NodeJS.ProcessEnv = {}): HookContext {
  return {
    io: memoryIo({ env: { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass', ...env } }),
    root,
    now: () => 1000,
    spawn: spawnSync,
  };
}

function payload(file: string, opts: { cwd?: string; sid?: string } = {}): HookEnvelope {
  return {
    cwd: opts.cwd ?? '',
    sessionId: opts.sid ?? 'nosession',
    prompt: '',
    file,
    tool: 'Edit',
    transcriptPath: '',
    stopHookActive: false,
    raw: {},
  };
}

// Every *.route entry under a cache tree, which is what the bash suite counts to
// prove one session reuses one entry and a buster creates another.
function routeEntries(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...routeEntries(path));
    else if (name.endsWith('.route')) found.push(path);
  }
  return found;
}

function cacheTree(repo: string): string {
  return join(repo, '.git', 'engineos-route-cache');
}

test('a payload without a file path is silent', () => {
  assert.deepEqual(run(payload(''), ctxWith()), silent);
});

test('an EngineOS meta path is excluded from routing', (t) => {
  const dir = tempRoot(t);
  assert.deepEqual(run(payload(join(root, 'docs', 'x.ts'), { cwd: dir }), ctxWith()), silent);
});

test('a routed path injects the kernel guidance verbatim', (t) => {
  const dir = tempRoot(t);
  const decision = run(payload(join(dir, 'api', 'user.controller.ts'), { cwd: dir }), ctxWith());
  assert.deepEqual(decision, context('PreToolUse', `[router] ${BACKEND}`));
});

test('an unrouted path with nothing else to say is silent', (t) => {
  const dir = tempRoot(t);
  assert.deepEqual(run(payload(join(dir, 'lib', 'paragraph', 'split.ts'), { cwd: dir }), ctxWith()), silent);
});

test('a project CLAUDE.md is appended after the default guide', (t) => {
  const dir = tempRoot(t);
  const claude = join(dir, 'CLAUDE.md');
  writeFileSync(claude, '# project\n');
  const decision = run(payload(join(dir, 'lib', 'paragraph', 'split.ts'), { cwd: dir }), ctxWith());
  assert.deepEqual(decision, context('PreToolUse', `[router] base.md+git.md only | follow project CLAUDE.md (project > EngineOS): ${claude}`));
});

test('a code edit with no active change record gets the reminder', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos', 'changes'), { recursive: true });
  const decision = run(payload(join(repo, 'lib', 'paragraph', 'split.ts'), { cwd: repo }), ctxWith());
  assert.deepEqual(
    decision,
    context('PreToolUse', '[router] base.md+git.md only | no active .engineos/changes record — open one (.engineos/changes/_template.md)'),
  );
});

test('an active change record silences the reminder', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos', 'changes'), { recursive: true });
  writeFileSync(join(repo, '.engineos', 'changes', '2026-09-04-work.md'), 'status:  active\n');
  assert.deepEqual(run(payload(join(repo, 'lib', 'paragraph', 'split.ts'), { cwd: repo }), ctxWith()), silent);
});

test('a repeated route reuses one session cache entry, and a buster adds another', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const edit = payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo, sid: 'route-cache' });
  const first = run(edit, ctxWith());
  const second = run(edit, ctxWith());
  assert.deepEqual(first, context('PreToolUse', `[router] ${BACKEND}`));
  assert.deepEqual(second, first);
  assert.equal(routeEntries(cacheTree(repo)).length, 1);
  run(edit, ctxWith({ ENGINEOS_ROUTE_CACHE_BUSTER: 'changed' }));
  assert.equal(routeEntries(cacheTree(repo)).length, 2);
});

test('a cache hit answers without consulting the kernel', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const edit = payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo, sid: 'route-cache' });
  run(edit, ctxWith());
  const entry = routeEntries(cacheTree(repo))[0];
  assert.notEqual(entry, undefined);
  if (entry === undefined) return;
  // A guide the registry could never produce: seeing it back proves the answer
  // came from the cache and not from a second resolve.
  writeFileSync(entry, 'SENTINEL-GUIDE\n');
  rmSync(`${entry}.output`, { force: true });
  assert.deepEqual(run(edit, ctxWith()), context('PreToolUse', '[router] SENTINEL-GUIDE'));
});

test('the decision cache is returned as stored', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const edit = payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo, sid: 'route-cache' });
  run(edit, ctxWith());
  const entry = routeEntries(cacheTree(repo))[0];
  assert.notEqual(entry, undefined);
  if (entry === undefined) return;
  writeFileSync(`${entry}.output`, `${JSON.stringify(context('PreToolUse', 'CACHED'))}\n`);
  assert.deepEqual(run(edit, ctxWith()), context('PreToolUse', 'CACHED'));
});

test('a malformed decision cache is a miss, not a failure', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const edit = payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo, sid: 'route-cache' });
  const first = run(edit, ctxWith());
  const entry = routeEntries(cacheTree(repo))[0];
  assert.notEqual(entry, undefined);
  if (entry === undefined) return;
  writeFileSync(`${entry}.output`, 'not json at all');
  assert.deepEqual(run(edit, ctxWith()), first);
});

test('ENGINEOS_BYPASS=1 silences the routing', (t) => {
  const dir = tempRoot(t);
  const edit = payload(join(dir, 'api', 'user.controller.ts'), { cwd: dir });
  assert.deepEqual(run(edit, ctxWith({ ENGINEOS_BYPASS: '1' })), silent);
});

test('the per-repo marker silences the routing before any kernel call', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  writeFileSync(join(repo, '.git', 'ENGINEOS_BYPASS'), '');
  const edit = payload(join(repo, 'api', 'user.controller.ts'), { cwd: repo });
  assert.deepEqual(run(edit, ctxWith()), silent);
  // Nothing was cached either: the bypass rung precedes the cache rung.
  assert.equal(routeEntries(cacheTree(repo)).length, 0);
});
