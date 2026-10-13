import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { loadTelemetryPolicy } from '../registry/policy-telemetry';
import { envelope, fixtureRepo, tempRoot, transcript, type ToolUse } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { message, silent, type HookContext } from './output';
import type { SpawnSyncLike } from './runner';
import { run, verify } from './stop-verify';

const checkout = resolveRoot({}, __dirname);

// A machine-wide bypass flag must never make this suite go quiet and read green.
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// The node the CHECKS would run under. Passed explicitly everywhere so a case
// asserts the gate's ladder, never the runtime the suite happens to use.
const MODERN = '22.11.0';

interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
  timeout: number | undefined;
}

interface Outcome {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  error?: Error;
}

// Keyed by the runner target ('lint', 'typecheck', 'test') and 'probe' for the
// `npm --version` existence check. An unlisted key is a green run, so a case
// states only the step it is about.
function runnerSpawn(outcomes: Record<string, Outcome> = {}): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, timeout: options.timeout });
    const key = args.includes('--version') ? 'probe' : (args[args.length - 1] ?? '');
    const outcome = outcomes[key] ?? {};
    return {
      status: outcome.status === undefined ? 0 : outcome.status,
      signal: outcome.signal ?? null,
      stdout: outcome.stdout ?? '',
      stderr: '',
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    };
  };
  return { spawn, calls };
}

// The package directories a ladder actually entered: an npm-family target runs
// from the package's own directory, so the cwd IS the package that was checked.
function runCwds(calls: readonly Call[]): string[] {
  return calls.filter((call) => !call.args.includes('--version')).map((call) => call.cwd);
}

function timedOutError(): Error {
  const error = new Error('spawnSync npm ETIMEDOUT');
  Object.assign(error, { code: 'ETIMEDOUT' });
  return error;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function context(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: checkout, now: () => 1000, spawn: spawnSync };
}

function decode(stdin: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin }));
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

// A repo that has adopted EngineOS — the `.engineos/` marker the gate and the
// telemetry sink both read — whose root package.json declares `scripts`.
function repoWith(t: Parameters<typeof tempRoot>[0], scripts: Record<string, string>): string {
  return fixtureRepo(tempRoot(t), { pkg: { name: 'fixture', scripts }, files: { '.engineos/.keep': '' } });
}

function stopOf(repo: string, sid: string, transcriptPath: string, stopHookActive = false): HookEnvelope {
  return decode(envelope({ event: 'Stop', cwd: repo, sid, transcript: transcriptPath, stopHookActive }));
}

// The transcript file the harness envelope points at. Written outside the repo's
// package so the fixture's own tree stays what the case says it is.
function transcriptOf(repo: string, toolUses: ToolUse[], opts: { legacy?: boolean } = {}): string {
  const path = join(repo, 'transcript.jsonl');
  writeFileSync(path, transcript(toolUses, opts));
  return path;
}

function edits(repo: string, ...files: string[]): ToolUse[] {
  return files.map((file) => ({ name: 'Edit', input: { file_path: join(repo, file) } }));
}

function telemetryLines(repo: string, sid: string, suffix: string): Record<string, unknown>[] {
  const path = join(repo, '.git', 'engineos-telemetry', `${sid}${suffix}`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      assert.equal(isRecord(parsed), true);
      return isRecord(parsed) ? parsed : {};
    });
}

function eventData(repo: string, sid: string): Record<string, unknown> {
  const lines = telemetryLines(repo, sid, '.jsonl');
  assert.equal(lines.length, 1, 'one stop cycle writes exactly one verify event');
  const first = lines[0] ?? {};
  assert.equal(first['event'], 'verify');
  const data = first['data'];
  assert.equal(isRecord(data), true);
  return isRecord(data) ? data : {};
}

function span(repo: string, sid: string): Record<string, unknown> {
  const lines = telemetryLines(repo, sid, '.exec.jsonl');
  assert.equal(lines.length, 1, 'one stop cycle writes exactly one verification span');
  return lines[0] ?? {};
}

function skipWithoutGit(t: { skip: (reason: string) => void }): boolean {
  if (hasGit()) return false;
  t.skip('git is not installed');
  return true;
}

// ------------------------------------------------------------------ silence

// The gate would otherwise run this package.json's `typecheck` with no
// tool-permission prompt in front of it.
test('a project that has not adopted EngineOS has no script executed', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: { name: 'fixture', scripts: { typecheck: 'exit 1' } } });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ typecheck: { status: 1 } });

  const decision = verify(stopOf(repo, 'S1', path), context(), spawn, MODERN);

  assert.deepEqual(decision, silent);
  assert.deepEqual(calls, []);
});

test('a missing transcript is nothing to verify', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const { spawn, calls } = runnerSpawn();
  const env = stopOf(repo, 'S1', join(repo, 'does-not-exist.jsonl'));
  assert.deepEqual(verify(env, context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

test('the loop guard wins over a red package', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path, true), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
  assert.deepEqual(telemetryLines(repo, 'S1', '.jsonl'), []);
});

test('bypass silences the gate before anything runs', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  const ctx = context({ ...ISOLATED, ENGINEOS_BYPASS: '1' });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), ctx, spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

test('a transcript with no JS/TS edit verifies nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, [
    { name: 'Edit', input: { file_path: join(repo, 'docs/notes.md') } },
    { name: 'Edit', input: { file_path: join(repo, 'db/schema.sql') } },
  ]);
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

test('reading a file does not pull its package into the gate', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, [{ name: 'Read', input: { file_path: join(repo, 'src/x.ts') } }]);
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

test('a Read and an Edit on ONE transcript line keep their own packages', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 0' });
  // The read file has a package of its own, and that package is red. Only a flat
  // line-grep would pull it into the gate.
  mkdirSync(join(repo, 'pkgR', 'src'), { recursive: true });
  writeFileSync(join(repo, 'pkgR', 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }));
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Read', input: { file_path: join(repo, 'pkgR/src/readonly.ts') } },
        { type: 'tool_use', name: 'Edit', input: { file_path: join(repo, 'src/edited.ts') } },
      ],
    },
  });
  const path = join(repo, 'mixed.jsonl');
  writeFileSync(path, `${line}\n`);
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  // The Edit's package only — the read file's own package is never entered.
  assert.deepEqual(runCwds(calls), [repo]);
});

test('an undecodable transcript line is skipped, never fatal', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 0' });
  const path = join(repo, 'ragged.jsonl');
  writeFileSync(path, `not json\n${transcript(edits(repo, 'src/x.ts'))}`);
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.equal(calls.length, 2);
});

test('a file that belongs to no package is not verified', (t) => {
  if (skipWithoutGit(t)) return;
  // No package.json anywhere: fixtureRepo without `pkg`. Adopted, so the case
  // fails on the package lookup rather than on the opt-in guard above.
  const repo = fixtureRepo(tempRoot(t), { files: { '.engineos/.keep': '' } });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

// The gate's consent marker is `.engineos/` at the session repo root, so a
// package BESIDE that root never consented. Unbounded, the ascent ran its
// scripts with no tool-permission prompt in front of them.
test('a package beside the repo root is never entered', (t) => {
  if (skipWithoutGit(t)) return;
  const base = tempRoot(t);
  const repo = fixtureRepo(base, { pkg: { name: 'fixture', scripts: { lint: 'exit 0' } }, files: { '.engineos/.keep': '' } });
  const sibling = join(base, 'sibling');
  mkdirSync(join(sibling, 'src'), { recursive: true });
  writeFileSync(join(sibling, 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }));
  // The transcript lives in the repo; the file it names does not.
  const path = join(repo, 'outside.jsonl');
  writeFileSync(path, transcript([{ name: 'Edit', input: { file_path: join(sibling, 'src', 'x.ts') } }]));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

// A second, non-adopted checkout containing this one — or a package.json planted
// in a world-writable directory above it — is the same missing consent one level
// up. The repo carries no package.json of its own, so the nearest marker for the
// edited file IS the one that must be refused.
test('a package above the adopted root is not in the run set', (t) => {
  if (skipWithoutGit(t)) return;
  const base = tempRoot(t);
  const repo = fixtureRepo(base, { files: { '.engineos/.keep': '' } });
  writeFileSync(join(base, 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }));
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

// The other direction: the ceiling must not narrow the gate to the root alone —
// packages nested UNDER the root consented with it and still run.
test('packages under the adopted root still run while an outer one is refused', (t) => {
  if (skipWithoutGit(t)) return;
  const base = tempRoot(t);
  const repo = fixtureRepo(base, { pkg: { name: 'fixture', scripts: { lint: 'exit 0' } }, files: { '.engineos/.keep': '' } });
  writeFileSync(join(base, 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }));
  mkdirSync(join(repo, 'pkgB', 'src'), { recursive: true });
  writeFileSync(join(repo, 'pkgB', 'package.json'), JSON.stringify({ scripts: { lint: 'exit 0' } }));
  const path = transcriptOf(repo, edits(repo, 'src/a.ts', 'pkgB/src/b.ts'));
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(runCwds(calls), [repo, join(repo, 'pkgB')]);
});

// A lexical prefix is not containment. `<root>/vendor` reads as being under the
// root in every string form, existsSync follows the link, and the runner would
// then execute /outside's `lint` — the very consent gap the ceiling exists to
// close, walked through the front door. Two shapes, because they fail at
// different layers: an existing directory is caught when the walk STARTS from
// its physical form, a non-existent one only when the OWNER the walk returned is
// realpath'd.
test('a symlink under the root that points outside is never entered', (t) => {
  if (skipWithoutGit(t)) return;
  const base = tempRoot(t);
  const repo = fixtureRepo(base, { pkg: { name: 'fixture', scripts: { lint: 'exit 0' } }, files: { '.engineos/.keep': '' } });
  const outside = join(base, 'outside');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }));
  symlinkSync(outside, join(repo, 'vendor'), 'dir');
  const path = transcriptOf(repo, edits(repo, 'vendor/a.ts', 'vendor/gone/b.ts'));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

// The other direction, and the reason containment is realpath'd on BOTH sides
// rather than only on the owner: `git rev-parse --show-toplevel` answers with the
// physical path while the transcript carries whatever form the session used
// (macOS `/tmp` -> `/private/tmp`, a symlinked checkout). Compared lexically,
// every file was refused and the gate went quiet with nothing to say — a
// verification gate disabled by a path spelling.
test('a root whose files are named through a symlink still verifies its package', (t) => {
  if (skipWithoutGit(t)) return;
  const base = tempRoot(t);
  // `src/` exists because the edited file's own directory is what gets realpath'd:
  // a file in a directory that does not exist yet has no physical form to compare,
  // and the gate stays silent rather than guessing at one.
  const repo = fixtureRepo(base, { pkg: { name: 'fixture', scripts: { lint: 'exit 0' } }, files: { '.engineos/.keep': '', 'src/.keep': '' } });
  const link = join(base, 'link');
  symlinkSync(repo, link, 'dir');
  // The split this case needs is git answering with the physical path while the
  // cwd was the link. A platform that answers with the link has no split to test.
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: link, encoding: 'utf8' }).stdout.trim();
  if (toplevel !== repo) {
    t.skip(`git resolves --show-toplevel to ${toplevel}, so there is no path-form split to exercise`);
    return;
  }
  const path = transcriptOf(repo, [{ name: 'Edit', input: { file_path: join(link, 'src', 'a.ts') } }]);
  const { spawn, calls } = runnerSpawn();
  const env = decode(envelope({ event: 'Stop', cwd: link, sid: 'S1', transcript: path }));
  assert.deepEqual(verify(env, context(), spawn, MODERN), silent);
  // The physical package, entered once: the gate is not silently disabled.
  assert.deepEqual(runCwds(calls), [repo]);
});

// ------------------------------------------------------------------ the ladder

test('a green ladder is silent and writes an OK span and a failed:false event', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 0', typecheck: 'exit 0' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'G1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(
    calls.map((c) => c.args.join(' ')),
    ['--version', 'run -s lint', 'run -s typecheck'],
  );
  assert.deepEqual(eventData(repo, 'G1'), { failed: false, targets: ['.'] });
  const line = span(repo, 'G1');
  assert.equal(line['span_kind'], 'verification');
  assert.equal(line['capability_id'], 'validate');
  assert.equal(line['model_tier'], 'cheap');
  assert.equal(line['status'], 'OK');
  assert.equal(line['trace_id'], 'G1');
  assert.equal(typeof line['duration_ms'], 'number');
});

test('tests are opt-in: a red test script alone does not block', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { test: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ test: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls.map((c) => c.args.join(' ')), ['--version']);
});

test('ENGINEOS_VERIFY_TESTS=1 is deprecated: the test target never runs and the notice says so', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 0', typecheck: 'exit 0', test: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ test: { status: 1, stdout: '2 failing' } });
  const ctx = context({ ...ISOLATED, ENGINEOS_VERIFY_TESTS: '1' });
  const decision = verify(stopOf(repo, 'T1', path), ctx, spawn, MODERN);
  assert.deepEqual(decision, message('[engineos] ENGINEOS_VERIFY_TESTS is deprecated and ignored: tests require explicit user approval and a separate final command after integration.'));
  const budgets = calls.filter((c) => !c.args.includes('--version')).map((c) => [c.args.join(' '), c.timeout]);
  assert.deepEqual(budgets, [
    ['run -s lint', 90_000],
    ['run -s typecheck', 90_000],
  ]);
});

test('a red check blocks with the kernel ladder and the failure summary', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ lint: { status: 1, stdout: 'x.ts:1:1 no-unused-vars\n' } });
  const decision = verify(stopOf(repo, 'R1', path), context(), spawn, MODERN);
  assert.equal(decision.kind, 'block');
  if (decision.kind !== 'block') return;
  assert.equal(decision.reason.startsWith('EngineOS gate: verification failed. '), true);
  // The ladder text is the kernel's own answer for the first red of this check —
  // the hook states no bound of its own (registries/policy.json .repair is read
  // by src/kernel/repair, never here).
  assert.equal(decision.reason.includes('first red — fix and re-run the check at the same tier'), true);
  assert.equal(decision.reason.includes(`--- lint failed (${repo}) ---\nx.ts:1:1 no-unused-vars`), true);
  assert.deepEqual(eventData(repo, 'R1'), { failed: true, targets: ['.'], situation: 'red' });
  assert.equal(span(repo, 'R1')['status'], 'FAILED');
});

test('every red target reaches the summary', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1', typecheck: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ lint: { status: 1, stdout: 'lint said no' }, typecheck: { status: 2, stdout: 'TS2345' } });
  const decision = verify(stopOf(repo, 'R2', path), context(), spawn, MODERN);
  assert.equal(decision.kind, 'block');
  if (decision.kind !== 'block') return;
  assert.equal(decision.reason.includes('lint said no'), true);
  assert.equal(decision.reason.includes('TS2345'), true);
});

test('two edits in one package are one run, and a sibling package is left alone', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 0' });
  mkdirSync(join(repo, 'pkgB'), { recursive: true });
  writeFileSync(join(repo, 'pkgB', 'package.json'), JSON.stringify({ scripts: { lint: 'exit 0' } }));
  const path = transcriptOf(repo, edits(repo, 'src/a.ts', 'src/b.tsx'));
  const { spawn, calls } = runnerSpawn();
  assert.deepEqual(verify(stopOf(repo, 'S1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(runCwds(calls), [repo]);
});

test('the legacy tool_input transcript shape is read too', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'), { legacy: true });
  const { spawn } = runnerSpawn({ lint: { status: 1 } });
  assert.equal(verify(stopOf(repo, 'L1', path), context(), spawn, MODERN).kind, 'block');
});

// ------------------------------------------------------------------ infra

test('a node too old to start the toolchain skips loudly and runs nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(
    verify(stopOf(repo, 'N1', path), context(), spawn, '16.17.0'),
    message('EngineOS gate: lint, typecheck skipped — infra (node-too-old): node 16 cannot start the toolchain. No fix attempt is consumed.'),
  );
  assert.deepEqual(calls, []);
  // No verdict was reached, so no fix attempt and no evidence of one.
  assert.deepEqual(telemetryLines(repo, 'N1', '.jsonl'), []);
  assert.deepEqual(telemetryLines(repo, 'N1', '.exec.jsonl'), []);
});

test('a runner that is not installed is reported, never blocked on', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn, calls } = runnerSpawn({ probe: { status: null, error: new Error('spawnSync npm ENOENT') } });
  assert.deepEqual(
    verify(stopOf(repo, 'M1', path), context(), spawn, MODERN),
    message('EngineOS gate: lint, typecheck skipped — infra (runner-missing): npm is not on PATH. No fix attempt is consumed.'),
  );
  assert.deepEqual(calls.map((c) => c.args.join(' ')), ['--version']);
  assert.deepEqual(telemetryLines(repo, 'M1', '.jsonl'), []);
});

test('a check killed by its budget is infra, and the span says DEGRADED', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { typecheck: 'sleep 999' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ typecheck: { status: null, error: timedOutError() } });
  assert.deepEqual(
    verify(stopOf(repo, 'B1', path), context(), spawn, MODERN),
    message(`EngineOS gate: typecheck skipped — infra (timeout): ${repo} hit its 90s budget. No fix attempt is consumed.`),
  );
  assert.deepEqual(eventData(repo, 'B1'), { failed: false, targets: ['.'], situation: 'infra', reason: 'timeout' });
  assert.equal(span(repo, 'B1')['status'], 'DEGRADED');
});

test('a stale target probe is nothing to run, not a finding', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ lint: { status: 1, stdout: 'Missing script: "lint"' } });
  assert.deepEqual(verify(stopOf(repo, 'A1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(eventData(repo, 'A1'), { failed: false, targets: ['.'] });
});

test('the verify event declares exactly the keys this gate can emit', () => {
  const row = loadTelemetryPolicy(checkout).events.find((event) => event.id === 'verify');
  assert.notEqual(row, undefined);
  // Two keys on every cycle, plus the verdict when there is one. The append
  // boundary refuses an undeclared key by dropping the whole line, so a key this
  // hook learns to write without the registry learning it is a silent data loss.
  assert.deepEqual(row?.keys, ['failed', 'targets', 'situation', 'reason']);
});

// ------------------------------------------------------------------ telemetry switch

test('ENGINEOS_TELEMETRY=0 leaves no event, no span and no directory', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ lint: { status: 1 } });
  const ctx = context({ ...ISOLATED, ENGINEOS_TELEMETRY: '0' });
  assert.equal(verify(stopOf(repo, 'Q1', path), ctx, spawn, MODERN).kind, 'block');
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

// The decision here used to be `block`: the gate ran a non-adopted repo's
// scripts and only the telemetry sink knew about adoption. The gate now returns
// before either, so this case states the file-system half of that — the sink's
// own guard is driven directly in src/hooks/telemetry.test.ts.
test('a project that never adopted EngineOS gets no telemetry', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { pkg: { name: 'fixture', scripts: { lint: 'exit 1' } } });
  const path = transcriptOf(repo, edits(repo, 'src/x.ts'));
  const { spawn } = runnerSpawn({ lint: { status: 1 } });
  assert.deepEqual(verify(stopOf(repo, 'P1', path), context(), spawn, MODERN), silent);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

// ------------------------------------------------------------------ the adapter entry

test('run drives the same ladder through the context spawner', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = repoWith(t, { lint: 'exit 1' });
  // No transcript: the silent path proves the entry point without spawning a
  // real package manager.
  assert.deepEqual(run(stopOf(repo, 'S1', join(repo, 'missing.jsonl')), context()), silent);
});
