import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { REPORTED_AGENTS, REPORTED_SKILLS, collectTranscripts, renderReport, runUsageReport, type UsageDeps } from './usage';

// A fixed clock so every mtime in a fixture is placed relative to a known point
// and the window arithmetic is not a race against the wall clock.
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function projectsDir(home: string): string {
  const dir = join(home, '.claude', 'projects');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// `age` is how far before NOW the file's mtime is placed; the default lands well
// inside every window a case asks for.
function writeAged(path: string, contents: string, age = 1000): void {
  writeFileSync(path, contents);
  const stamp = new Date(NOW - age);
  utimesSync(path, stamp, stamp);
}

function deps(home: string, cwd: string): UsageDeps {
  return { env: { HOME: home }, cwd, now: () => NOW, spawn: spawnSync };
}

function run(days: number, home: string, cwd: string): Run {
  const io = memoryIo({ env: { HOME: home }, cwd });
  const status = renderReport(days, deps(home, cwd), io);
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

// Sections are separated by a blank line, so splitting on it isolates one without
// pinning the rest of the report in every assertion.
function section(stdout: string, header: string): string {
  const chunk = stdout.split('\n\n').find((part) => part.startsWith(header));
  if (chunk === undefined) throw new Error(`section not found: ${header}\n--- got ---\n${stdout}`);
  return chunk;
}

const TELEMETRY_HEADER = '## Kernel telemetry (this repo, .git/engineos-telemetry)';
const NO_TELEMETRY = `${TELEMETRY_HEADER}\n(none — telemetry not adopted here)`;

// Two sessions with overlapping intents, one skill seen in both files and one in
// only one, one mention of each reported agent, and gate blocks split across both.
const TRANSCRIPT_A = [
  '[router] intent=backend risk=low autonomy=A2',
  '[router] intent=backend',
  '[router] intent=frontend',
  '{"skill":"adr"}',
  '{"skill" : "strategy"}',
  'dispatching security-reviewer now',
  'EngineOS gate: unrecorded changes',
  'EngineOS gate: lint red',
  '',
].join('\n');

const TRANSCRIPT_B = [
  '[router] intent=frontend',
  '[router] intent=llm',
  '{"skill":   "adr"}',
  'dispatching test-writer now',
  'EngineOS gate: typecheck red',
  '',
].join('\n');

const FULL_REPORT = [
  'EngineOS usage — last 30 days',
  '=================================',
  '',
  '## Router intents ([router] announce lines)',
  '      2 frontend',
  '      2 backend',
  '      1 llm',
  '',
  '## EngineOS skill invocations',
  '     0  nestjs-patterns',
  '     0  react-patterns',
  '     0  llm-engineering',
  '     2  adr',
  '     0  eval-harness',
  '     0  release-notes',
  '     0  record-change',
  '     1  strategy',
  '',
  '## Subagent dispatches',
  '     1  security-reviewer (sessions mentioning)',
  '     1  test-writer (sessions mentioning)',
  '',
  '## Hook gate hits (stop-verify blocks)',
  '3 blocks',
  '',
  TELEMETRY_HEADER,
  '(none — telemetry not adopted here)',
  '',
  'Zero-hit items are prune candidates — but check the announce habit first.',
  '',
].join('\n');

test('the reported skill and agent lists are the ones the bash loops named', () => {
  assert.deepEqual([...REPORTED_SKILLS], [
    'nestjs-patterns',
    'react-patterns',
    'llm-engineering',
    'adr',
    'eval-harness',
    'release-notes',
    'record-change',
    'strategy',
  ]);
  assert.deepEqual([...REPORTED_AGENTS], ['security-reviewer', 'test-writer']);
});

test('collectTranscripts keeps files inside the window and drops older ones', (t) => {
  const dir = projectsDir(tempRoot(t));
  writeAged(join(dir, 'fresh.jsonl'), 'x');
  writeAged(join(dir, 'stale.jsonl'), 'x', 40 * DAY);

  assert.deepEqual(collectTranscripts(dir, 30, NOW), [join(dir, 'fresh.jsonl')]);
  // The same fixture with a wider window proves the drop was the mtime, not the name.
  assert.deepEqual(collectTranscripts(dir, 60, NOW), [join(dir, 'fresh.jsonl'), join(dir, 'stale.jsonl')]);
});

test('collectTranscripts recurses and ignores everything that is not .jsonl', (t) => {
  const dir = projectsDir(tempRoot(t));
  mkdirSync(join(dir, 'project-a', 'nested'), { recursive: true });
  writeAged(join(dir, 'project-a', 'nested', 'deep.jsonl'), 'x');
  writeAged(join(dir, 'project-a', 'notes.txt'), 'x');
  writeAged(join(dir, 'top.jsonl'), 'x');

  assert.deepEqual(collectTranscripts(dir, 30, NOW), [
    join(dir, 'project-a', 'nested', 'deep.jsonl'),
    join(dir, 'top.jsonl'),
  ]);
});

test('collectTranscripts answers empty for a directory that does not exist', (t) => {
  assert.deepEqual(collectTranscripts(join(tempRoot(t), 'absent'), 30, NOW), []);
});

test('renderReport reports a missing projects directory and exits 1', (t) => {
  const home = tempRoot(t);
  const result = run(30, home, home);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, `No transcripts at ${join(home, '.claude', 'projects')}\n`);
});

test('renderReport prints the header before reporting an empty window', (t) => {
  const home = tempRoot(t);
  const dir = projectsDir(home);
  writeAged(join(dir, 'stale.jsonl'), '[router] intent=backend\n', 40 * DAY);

  const result = run(30, home, home);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, `EngineOS usage — last 30 days\n${'='.repeat(33)}\nNo transcripts in window.\n`);
});

test('renderReport counts intents, skills, agent mentions and gate blocks', (t) => {
  const root = tempRoot(t);
  const home = join(root, 'home');
  const dir = projectsDir(home);
  writeAged(join(dir, 'a.jsonl'), TRANSCRIPT_A);
  writeAged(join(dir, 'b.jsonl'), TRANSCRIPT_B);

  // cwd is the temp root, which is not a git repository, so the telemetry section
  // takes its no-repo branch and the whole report is comparable byte for byte.
  const result = run(30, home, root);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, FULL_REPORT);
  assert.equal(result.stderr, '');
});

test('renderReport breaks an intent tie in reverse byte order, as sort -rn did', (t) => {
  const home = tempRoot(t);
  const dir = projectsDir(home);
  writeAged(join(dir, 'a.jsonl'), '[router] intent=alpha\n[router] intent=zulu\n[router] intent=mike\n');

  const result = run(30, home, home);

  assert.equal(
    section(result.stdout, '## Router intents'),
    ['## Router intents ([router] announce lines)', '      1 zulu', '      1 mike', '      1 alpha'].join('\n'),
  );
});

test('renderReport says so when no router line was announced at all', (t) => {
  const home = tempRoot(t);
  const dir = projectsDir(home);
  writeAged(join(dir, 'a.jsonl'), 'nothing announced here\n');

  const result = run(30, home, home);

  assert.equal(
    section(result.stdout, '## Router intents'),
    '## Router intents ([router] announce lines)\n(none found — router not announcing?)',
  );
});

test('renderReport counts a skill once per file, not once per occurrence', (t) => {
  const home = tempRoot(t);
  const dir = projectsDir(home);
  writeAged(join(dir, 'a.jsonl'), '{"skill":"adr"}\n{"skill":"adr"}\n{"skill":"adr"}\n');

  const result = run(30, home, home);

  assert.match(section(result.stdout, '## EngineOS skill invocations'), /\n {5}1 {2}adr\n/);
});

test('renderReport reports no telemetry when the repo has no telemetry directory', (t) => {
  if (!hasGit()) {
    t.skip('git not available');
    return;
  }
  const root = tempRoot(t);
  const home = join(root, 'home');
  writeAged(join(projectsDir(home), 'a.jsonl'), '[router] intent=backend\n');
  const repo = fixtureRepo(root);

  const result = run(30, home, repo);

  assert.equal(section(result.stdout, TELEMETRY_HEADER), NO_TELEMETRY);
});

test('renderReport summarises kernel telemetry, skipping malformed and span lines', (t) => {
  if (!hasGit()) {
    t.skip('git not available');
    return;
  }
  const root = tempRoot(t);
  const home = join(root, 'home');
  writeAged(join(projectsDir(home), 'a.jsonl'), '[router] intent=backend\n');

  const repo = fixtureRepo(root);
  const telemetry = join(repo, '.git', 'engineos-telemetry');
  mkdirSync(telemetry, { recursive: true });
  writeAged(
    join(telemetry, 'events.jsonl'),
    [
      '{"ts":1,"session_id":"s1","event":"route","data":{"escalate":false,"intents":["backend","frontend"]}}',
      '{"ts":2,"session_id":"s1","event":"route","data":{"escalate":true,"intents":["backend"]}}',
      '{"ts":3,"session_id":"s1","event":"route","data":{"escalate":false,"intents":[]}}',
      '{"ts":4,"session_id":"s1","event":"route","data":{"escalate":false}}',
      '{"ts":5,"session_id":"s1","event":"decision-rules","data":{"rules":["spec-required","adr-required"]}}',
      '{"ts":6,"session_id":"s1","event":"decision-rules","data":{"rules":["spec-required"]}}',
      '{"ts":7,"session_id":"s1","event":"decision-rules","data":{}}',
      '{"ts":8,"session_id":"s1","event":"verify","data":{"failed":true}}',
      '{"ts":9,"session_id":"s1","event":"verify","data":{"failed":false}}',
      '{ this line never parsed',
      '',
    ].join('\n'),
  );
  // Span files share the directory and match *.jsonl; they carry no `event`, which
  // is what keeps them out of the counts.
  writeAged(
    join(telemetry, 'sid.exec.jsonl'),
    '{"trace_id":"s1","span_kind":"tool","status":"FAILED","tool":"git"}\n',
  );

  const result = run(30, home, repo);

  assert.equal(
    section(result.stdout, TELEMETRY_HEADER),
    [
      TELEMETRY_HEADER,
      // The fourth route event has no intents array: jq read that as length 0, so
      // it counts as unrouted here too.
      'prompts routed: 4 (2 unrouted, 1 escalated)',
      'intents fired:',
      '  2  backend',
      '  1  frontend',
      'decision rules fired:',
      '  1  adr-required',
      '  2  spec-required',
      'verify runs: 2 (1 red)',
    ].join('\n'),
  );
});

test('renderReport keeps telemetry inside the same window as the transcripts', (t) => {
  if (!hasGit()) {
    t.skip('git not available');
    return;
  }
  const root = tempRoot(t);
  const home = join(root, 'home');
  writeAged(join(projectsDir(home), 'a.jsonl'), '[router] intent=backend\n');

  const repo = fixtureRepo(root);
  const telemetry = join(repo, '.git', 'engineos-telemetry');
  mkdirSync(telemetry, { recursive: true });
  writeAged(
    join(telemetry, 'old.jsonl'),
    '{"event":"route","data":{"escalate":true,"intents":["backend"]}}\n',
    40 * DAY,
  );

  const result = run(30, home, repo);

  assert.equal(
    section(result.stdout, TELEMETRY_HEADER),
    [
      TELEMETRY_HEADER,
      'prompts routed: 0 (0 unrouted, 0 escalated)',
      'intents fired:',
      'decision rules fired:',
      'verify runs: 0 (0 red)',
    ].join('\n'),
  );
});

test('runUsageReport defaults to a 30-day window', (t) => {
  const root = tempRoot(t);
  const home = join(root, 'home');
  // Written without an explicit mtime: the default deps run on the real clock, so
  // the file has to be genuinely fresh rather than placed relative to NOW.
  writeFileSync(join(projectsDir(home), 'a.jsonl'), '[router] intent=backend\n');

  const io = memoryIo({ env: { HOME: home }, cwd: root });
  const status = runUsageReport([], io);

  assert.equal(status, 0);
  assert.equal(io.stdout.join('').split('\n')[0], 'EngineOS usage — last 30 days');
});

test('runUsageReport honours an explicit window', (t) => {
  const root = tempRoot(t);
  const home = join(root, 'home');
  writeFileSync(join(projectsDir(home), 'a.jsonl'), '[router] intent=backend\n');

  const io = memoryIo({ env: { HOME: home }, cwd: root });

  assert.equal(runUsageReport(['7'], io), 0);
  assert.equal(io.stdout.join('').split('\n')[0], 'EngineOS usage — last 7 days');
});

test('runUsageReport rejects a window that is not a positive integer', () => {
  for (const bad of ['abc', '0', '-5', '1.5', '']) {
    const io = memoryIo({ env: { HOME: '/nonexistent' }, cwd: '/' });
    const status = runUsageReport([bad], io);

    assert.equal(status, 1, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.equal(io.stderr.join(''), 'usage: engineos usage-report [days]\n');
    assert.equal(io.stdout.join(''), '');
  }
});
