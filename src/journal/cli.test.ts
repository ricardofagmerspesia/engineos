import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { relocatedRoot, runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runJournal } from './cli';

// The command shell: which stream each answer lands on, which exit code it
// carries, and the two texts a consumer greps for. Error convention here is
// plain text on stderr and exit 1 — deliberately not the kernel's JSON envelope.

const REQUIRED = ['--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '2', '--duration-ms', '3'];

test('append writes a line and says nothing at all', (t) => {
  const w = world(t);
  const r = run(w, ['append', w.file, ...REQUIRED]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.equal(readFileSync(w.file, 'utf8').split('\n').length, 2);
});

test('append defaults the timestamp to the format the bash CLI wrote', (t) => {
  const w = world(t);
  run(w, ['append', w.file, ...REQUIRED]);
  const row: unknown = JSON.parse(readFileSync(w.file, 'utf8').trim());
  assert.ok(typeof row === 'object' && row !== null);
  const stamp = (row as Record<string, unknown>)['timestamp'];
  assert.match(String(stamp), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('validate reports the count on stdout when every line is valid', (t) => {
  const w = world(t);
  run(w, ['append', w.file, ...REQUIRED]);
  run(w, ['append', w.file, ...REQUIRED]);
  const r = run(w, ['validate', w.file]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${w.file}: 2 line(s), all valid\n`);
  assert.equal(r.stderr, '');
});

test('validate names each bad line and then the total, on stderr', (t) => {
  const w = world(t);
  writeFileSync(w.file, 'nonsense\n{"run_id":"r"}\n');
  const r = run(w, ['validate', w.file]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, `line 1: does not match the exec-journal schema\nline 2: does not match the exec-journal schema\n2 invalid line(s) in ${w.file}\n`);
});

test('a rejected value is plain text on stderr with exit 1, never a JSON envelope', (t) => {
  const w = world(t);
  const r = run(w, ['append', w.file, ...REQUIRED, '--trace-id', 'has space']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '--trace-id must match ^[A-Za-z0-9@_./:-]+$, got: has space\n');
  assert.doesNotMatch(r.stderr, /^\{/);
});

test('an unknown argument prints its name and the usage block', (t) => {
  const w = world(t);
  const r = run(w, ['append', w.file, ...REQUIRED, '--bogus', 'x']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^unknown arg: --bogus\nusage: scripts\/exec-journal\.sh append <file> /);
  assert.match(r.stderr, /\n {7}scripts\/exec-journal\.sh validate <file>\n$/);
});

test('an unknown subcommand, no subcommand and a validate with no file all print usage', (t) => {
  const w = world(t);
  for (const argv of [[], ['nonsense'], ['validate'], ['append']]) {
    const r = run(w, argv);
    assert.equal(r.status, 1, argv.join(' '));
    assert.equal(r.stdout, '', argv.join(' '));
    assert.match(r.stderr, /^usage: scripts\/exec-journal\.sh append <file> /, argv.join(' '));
  }
});

test('a missing file is named on stderr rather than counted as zero lines', (t) => {
  const w = world(t);
  const absent = join(w.root, 'no-such.jsonl');
  const r = run(w, ['validate', absent]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `no such file: ${absent}\n`);
});

test('a malformed registry is reported in this CLI convention, not the kernel envelope', (t) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      policy['telemetry'] = { exec_journal: { home: 'x.exec.jsonl' } };
    },
  });
  const r = runInProcess(runJournal, ['append', join(root, 'j.jsonl'), ...REQUIRED], { env: { ENGINEOS_ROOT: root } });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^registries\/policy\.json: /);
});

// ------------------------------------------------------------------ internals

interface World { root: string; file: string }

function world(t: TestContext): World {
  const root = relocatedRoot(tempRoot(t));
  return { root, file: join(root, 'spans.exec.jsonl') };
}

function run(w: World, argv: string[]): RunResult {
  return runInProcess(runJournal, argv, { env: { ENGINEOS_ROOT: w.root } });
}
