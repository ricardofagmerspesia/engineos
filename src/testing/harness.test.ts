import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { dispatch, type Command } from '../dispatch';
import { envelope, fixtureRepo, relocatedRoot, runCli, runInProcess, tempRoot, transcript } from './harness';

// The compiled harness lives in build/testing, so the checkout is two levels up.
const checkout = realpathSync(join(__dirname, '..', '..'));
const bundle = join(checkout, 'dist', 'engineos.cjs');

// Kept across two tests on purpose: only the second one can observe that the
// first one's t.after cleanup actually ran.
let leakedRoot = '';

test('tempRoot hands out a fresh absolute directory per call', (t) => {
  const first = tempRoot(t);
  const second = tempRoot(t);
  assert.equal(isAbsolute(first), true);
  assert.equal(isAbsolute(second), true);
  assert.notEqual(first, second);
  assert.equal(existsSync(first), true);
  assert.equal(existsSync(second), true);
  leakedRoot = first;
});

test('a temp root is removed when its test ends', () => {
  assert.notEqual(leakedRoot, '');
  assert.equal(existsSync(leakedRoot), false);
});

test('tempRoot refuses a TMPDIR that points inside the checkout', (t) => {
  const original = process.env['TMPDIR'];
  process.env['TMPDIR'] = checkout;
  try {
    assert.throws(() => tempRoot(t), /inside the EngineOS checkout/);
    const strays = readdirSync(checkout).filter((entry) => entry.startsWith('engineos-test-'));
    assert.deepEqual(strays, []);
  } finally {
    if (original === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = original;
  }
});

test('fixtureRepo builds a git repo whose toplevel is the returned path', (t) => {
  if (spawnSync('git', ['--version']).status !== 0) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root, {
    pkg: { name: 'fixture', scripts: { lint: 'true' } },
    nx: { targetDefaults: {} },
    files: { 'src/x.ts': 'export {};\n' },
  });
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' });
  assert.equal(toplevel.status, 0, toplevel.stderr);
  assert.equal(toplevel.stdout.trim(), repo);
  const pkg: unknown = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.deepEqual(pkg, { name: 'fixture', scripts: { lint: 'true' } });
  assert.equal(existsSync(join(repo, 'nx.json')), true);
  assert.equal(readFileSync(join(repo, 'src', 'x.ts'), 'utf8'), 'export {};\n');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  assert.equal(head.status, 0, head.stderr);
});

test('fixtureRepo gives each call its own tree under one root', (t) => {
  if (spawnSync('git', ['--version']).status !== 0) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  assert.notEqual(fixtureRepo(root), fixtureRepo(root));
});

test('relocatedRoot mutates the copy and leaves the checkout registry byte-identical', (t) => {
  const root = tempRoot(t);
  const trackedPolicy = join(checkout, 'registries', 'policy.json');
  const before = readFileSync(trackedPolicy);
  const relocated = relocatedRoot(root, {
    mutate: (policy) => {
      policy['harness_probe'] = 'set';
    },
  });
  assert.equal(readFileSync(trackedPolicy).equals(before), true);
  const copiedPolicy = readFileSync(join(relocated, 'registries', 'policy.json'), 'utf8');
  assert.match(copiedPolicy, /"harness_probe": "set"/);
  assert.equal(existsSync(join(relocated, 'registries', 'routing.json')), true);
});

test('relocatedRoot without a mutation copies the registry unchanged', (t) => {
  const root = tempRoot(t);
  const relocated = relocatedRoot(root);
  const tracked = readFileSync(join(checkout, 'registries', 'policy.json'));
  assert.equal(readFileSync(join(relocated, 'registries', 'policy.json')).equals(tracked), true);
});

test('relocatedRoot refuses a destination inside the checkout', () => {
  const forbidden = join(checkout, 'harness-fixture');
  assert.throws(() => relocatedRoot(forbidden), /inside the EngineOS checkout/);
  assert.equal(existsSync(forbidden), false);
});

test('envelope carries every field a hook decodes', () => {
  const parsed: unknown = JSON.parse(
    envelope({
      event: 'PreToolUse',
      cwd: '/work',
      sid: 'sid-1',
      tool: { name: 'Edit', input: { file_path: '/work/a.ts' } },
      transcript: '/work/transcript.jsonl',
      stopHookActive: true,
    }),
  );
  assert.deepEqual(parsed, {
    hook_event_name: 'PreToolUse',
    cwd: '/work',
    session_id: 'sid-1',
    tool_name: 'Edit',
    tool_input: { file_path: '/work/a.ts' },
    transcript_path: '/work/transcript.jsonl',
    stop_hook_active: true,
  });
});

test('envelope omits an absent tool and transcript and defaults stop_hook_active', () => {
  const parsed: unknown = JSON.parse(envelope({ event: 'Stop', cwd: '/work', sid: 'sid-2' }));
  assert.deepEqual(parsed, { hook_event_name: 'Stop', cwd: '/work', session_id: 'sid-2', stop_hook_active: false });
});

test('transcript emits one line per tool use in the real input shape', () => {
  const jsonl = transcript([
    { name: 'Edit', input: { file_path: '/a.ts' } },
    { name: 'Read', input: { file_path: '/b.ts' } },
  ]);
  const lines = jsonl.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 2);
  const first: unknown = JSON.parse(lines[0] ?? '');
  assert.deepEqual(first, {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/a.ts' } }] },
  });
  assert.equal(jsonl.includes('tool_input'), false);
  assert.equal(jsonl.endsWith('\n'), true);
});

test('transcript in legacy form emits tool_input instead of input', () => {
  const jsonl = transcript([{ name: 'Edit', input: { file_path: '/a.ts' } }], { legacy: true });
  assert.equal(jsonl.includes('"tool_input"'), true);
  assert.equal(jsonl.includes('"input"'), false);
  assert.equal(transcript([]), '');
});

test('both drives report the same version', (t) => {
  if (!existsSync(bundle)) {
    t.skip('dist/engineos.cjs is not built');
    return;
  }
  const version: Command = (_argv, io) => dispatch({}, ['--version'], io);
  const spawned = runCli(['--version']);
  const inProcess = runInProcess(version, []);
  assert.equal(spawned.status, 0, spawned.stderr);
  assert.equal(inProcess.status, 0);
  assert.equal(spawned.stdout, inProcess.stdout);
  assert.match(spawned.stdout, /^engineos \d+\.\d+\.\d+\n$/);
});

test('runInProcess passes stdin, env and cwd through to the command', () => {
  const probe: Command = (argv, io) => {
    io.out(JSON.stringify({ argv, stdin: io.readStdin(), root: io.env['ENGINEOS_ROOT'], cwd: io.cwd() }));
    io.err('note');
    return 3;
  };
  const result = runInProcess(probe, ['x'], { stdin: '{"a":1}', env: { ENGINEOS_ROOT: '/r' }, cwd: '/w' });
  assert.equal(result.status, 3);
  assert.equal(result.stderr, 'note');
  const seen: unknown = JSON.parse(result.stdout);
  assert.deepEqual(seen, { argv: ['x'], stdin: '{"a":1}', root: '/r', cwd: '/w' });
});

test('the shipped bundle never contains the test harness', () => {
  assert.equal(existsSync(bundle), true);
  assert.equal(readFileSync(bundle, 'utf8').includes('src/testing/'), false);
});
