// The Stop gate driven end to end over the fixture Python package
// (test/fixtures/py-fastapi): a real git repo, a real transcript, the real
// package walk, real telemetry files — and a FAKE spawn. No machine this suite
// runs on is required to carry ruff, pyright, pytest, uv or docker, so every
// tool call is answered by the responder each case states, and what the cases
// assert is the ladder itself: which argv the gate issued, from where, under
// what budget, and what it decided from the answers.
//
// src/hooks/stop-verify.test.ts is the Node half of the same ladder;
// src/hooks/runner-python.test.ts drives the Python arm with no filesystem at
// all. This file is what is left: the fixture's pyproject.toml read for real,
// the venv/uv/compose cascade over a real tree, and the mixed root.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, tempRoot, transcript, type ToolUse } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { message, silent, type HookContext } from './output';
import type { SpawnSyncLike } from './runner';
import { venvBinDir } from './runner-python';
import { verify } from './stop-verify';
import { PROBE_TIMEOUT_SECONDS } from './verify-targets';

const checkout = resolveRoot({}, __dirname);
const FIXTURE = join(checkout, 'test', 'fixtures', 'py-fastapi');

const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };
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

type Responder = (command: string, args: readonly string[]) => Outcome;

const GREEN: Responder = () => ({});

function spawnWith(respond: Responder): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, timeout: options.timeout });
    const outcome = respond(command, args);
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

function argvOf(calls: readonly Call[]): string[] {
  return calls.map((c) => [c.command, ...c.args].join(' '));
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function skipWithoutGit(t: TestContext): boolean {
  if (hasGit()) return false;
  t.skip('git is not installed');
  return true;
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

// An adopted repo holding a copy of the fixture package at its root. `venv`
// creates the (empty) bin directory the resolver looks for — the tools in it
// are never executed, the fake spawn answers for them.
function pythonRepo(t: TestContext, opts: { venv?: boolean; files?: Record<string, string> } = {}): string {
  const repo = fixtureRepo(tempRoot(t), { files: { '.engineos/.keep': '', ...(opts.files ?? {}) } });
  cpSync(FIXTURE, repo, { recursive: true });
  if (opts.venv === true) mkdirSync(venvBinDir(join(repo, '.venv')), { recursive: true });
  return repo;
}

function stopOf(repo: string, sid: string, transcriptPath: string): HookEnvelope {
  return decode(envelope({ event: 'Stop', cwd: repo, sid, transcript: transcriptPath }));
}

function transcriptOf(repo: string, toolUses: ToolUse[]): string {
  const path = join(repo, 'transcript.jsonl');
  writeFileSync(path, transcript(toolUses));
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
      return isRecord(parsed) ? parsed : {};
    });
}

function eventData(repo: string, sid: string): Record<string, unknown> {
  const lines = telemetryLines(repo, sid, '.jsonl');
  assert.equal(lines.length, 1, 'one stop cycle writes exactly one verify event');
  const data = lines[0]?.['data'];
  return isRecord(data) ? data : {};
}

function spanStatus(repo: string, sid: string): unknown {
  const lines = telemetryLines(repo, sid, '.exec.jsonl');
  assert.equal(lines.length, 1, 'one stop cycle writes exactly one verification span');
  return lines[0]?.['status'];
}

const SKIPPED = (pkg: string): string => `[engineos] stop-verify skipped for ${pkg}: no Python environment found (venv, uv or compose)`;

// ------------------------------------------------------------------ the venv ladder

test('a green Python package runs ruff twice and pyright once through its venv, and is silent', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY1', path), context(), spawn, MODERN), silent);
  assert.deepEqual(argvOf(calls), [
    `${join(bin, 'python')} --version`,
    `${join(bin, 'ruff')} check .`,
    `${join(bin, 'ruff')} format --check .`,
    `${join(bin, 'pyright')}`,
  ]);
  // Every run is issued from the package; the probe from the root (which here is the same dir).
  assert.deepEqual(calls.map((c) => c.cwd), [repo, repo, repo, repo]);
  assert.deepEqual(calls.map((c) => c.timeout)[0], PROBE_TIMEOUT_SECONDS * 1000);
  assert.equal(calls[1]?.timeout, 90_000);
  assert.equal(calls[3]?.timeout, 90_000);
  assert.deepEqual(eventData(repo, 'PY1'), { failed: false, targets: ['.'] });
  assert.equal(spanStatus(repo, 'PY1'), 'OK');
});

test('a red pyright blocks with the failure summary naming the package', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn } = spawnWith((command) => (command.endsWith('pyright') ? { status: 1, stdout: 'app/main.py:9:5 - error: "x" is not defined\n1 error\n' } : {}));
  const decision = verify(stopOf(repo, 'PY2', path), context(), spawn, MODERN);
  assert.equal(decision.kind, 'block');
  if (decision.kind !== 'block') return;
  assert.equal(decision.reason.startsWith('EngineOS gate: verification failed. '), true);
  assert.equal(decision.reason.includes(`--- typecheck failed (${repo}) ---`), true);
  assert.equal(decision.reason.includes('"x" is not defined'), true);
  assert.deepEqual(eventData(repo, 'PY2'), { failed: true, targets: ['.'], situation: 'red' });
  assert.equal(spanStatus(repo, 'PY2'), 'FAILED');
});

test('a red ruff check stops lint before the format check, and both ruff argvs are in the summary', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith((_command, args) => (args[0] === 'check' ? { status: 1, stdout: 'app/main.py:3:8: F401 unused import\n' } : {}));
  const decision = verify(stopOf(repo, 'PY3', path), context(), spawn, MODERN);
  assert.equal(decision.kind, 'block');
  if (decision.kind !== 'block') return;
  assert.equal(decision.reason.includes(`--- lint failed (${repo}) ---\n${join(bin, 'ruff')} check .\napp/main.py:3:8: F401`), true);
  assert.deepEqual(argvOf(calls).filter((line) => line.includes('ruff')), [`${join(bin, 'ruff')} check .`]);
});

test('ENGINEOS_VERIFY_TESTS=1 folds pytest -q in under the test budget', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith((command) => (command.endsWith('pytest') ? { status: 1, stdout: '1 failed\n' } : {}));
  const decision = verify(stopOf(repo, 'PY4', path), context({ ...ISOLATED, ENGINEOS_VERIFY_TESTS: '1' }), spawn, MODERN);
  assert.equal(decision.kind, 'block');
  const pytest = calls.find((c) => c.command.endsWith('pytest'));
  assert.deepEqual([pytest?.command, pytest?.args, pytest?.timeout], [join(bin, 'pytest'), ['-q'], 180_000]);
});

test('ENGINEOS_VERIFY_BUDGET_S raises every target budget, and a bad value is ignored', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const raised = spawnWith(GREEN);
  verify(stopOf(repo, 'PY5', path), context({ ...ISOLATED, ENGINEOS_VERIFY_TESTS: '1', ENGINEOS_VERIFY_BUDGET_S: '300' }), raised.spawn, MODERN);
  const firstOfEachTarget = raised.calls.filter((c) => c.args[0] === 'check' || c.command.endsWith('pyright') || c.command.endsWith('pytest'));
  assert.deepEqual(firstOfEachTarget.map((c) => c.timeout), [300_000, 300_000, 300_000]);
  const ignored = spawnWith(GREEN);
  verify(stopOf(repo, 'PY5b', path), context({ ...ISOLATED, ENGINEOS_VERIFY_BUDGET_S: 'soon' }), ignored.spawn, MODERN);
  assert.equal(ignored.calls.find((c) => c.args[0] === 'check')?.timeout, 90_000);
});

test('a budget kill is infra, announced, and the span says DEGRADED', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const timeout = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const { spawn } = spawnWith((command) => (command.endsWith('pyright') ? { status: null, error: timeout } : {}));
  assert.deepEqual(
    verify(stopOf(repo, 'PY6', path), context(), spawn, MODERN),
    message(`EngineOS gate: typecheck skipped — infra (timeout): ${repo} hit its 90s budget. No fix attempt is consumed.`),
  );
  assert.deepEqual(eventData(repo, 'PY6'), { failed: false, targets: ['.'], situation: 'infra', reason: 'timeout' });
  assert.equal(spanStatus(repo, 'PY6'), 'DEGRADED');
});

// The shape a venv without pyright really produces: spawnSync fails to start
// the binary at all — ENOENT, no status, no output. Before the runner named it,
// that was a red block with an empty summary.
test('a tool missing from the venv is a missing runner, never red', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const enoent = Object.assign(new Error('spawnSync ENOENT'), { code: 'ENOENT' });
  const { spawn } = spawnWith((command) => (command.endsWith('pyright') ? { status: null, error: enoent } : {}));
  assert.deepEqual(
    verify(stopOf(repo, 'PY7', path), context(), spawn, MODERN),
    message(`EngineOS gate: typecheck skipped — infra (runner-missing): ${repo}: No such file or directory: ${join(bin, 'pyright')}. No fix attempt is consumed.`),
  );
  assert.deepEqual(eventData(repo, 'PY7'), { failed: false, targets: ['.'], situation: 'infra', reason: 'runner-missing' });
  assert.equal(spanStatus(repo, 'PY7'), 'DEGRADED');
});

test('a venv whose python does not answer is reported once and runs nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py', 'tests/test_health.py'));
  const { spawn, calls } = spawnWith(() => ({ status: null, error: new Error('spawnSync ENOENT') }));
  assert.deepEqual(
    verify(stopOf(repo, 'PY8', path), context(), spawn, MODERN),
    message(`EngineOS gate: lint, typecheck skipped — infra (runner-missing): ${join(bin, 'python')} did not answer --version (.venv/bin). No fix attempt is consumed.`),
  );
  assert.deepEqual(argvOf(calls), [`${join(bin, 'python')} --version`]);
  assert.deepEqual(telemetryLines(repo, 'PY8', '.jsonl'), []);
});

// ------------------------------------------------------------------ no environment

test('a Python package with no environment is skipped with the visible line, and nothing runs', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t);
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY9', path), context(), spawn, MODERN), message(SKIPPED('.')));
  assert.deepEqual(calls, []);
  assert.deepEqual(telemetryLines(repo, 'PY9', '.jsonl'), []);
  assert.deepEqual(telemetryLines(repo, 'PY9', '.exec.jsonl'), []);
});

test('a nested package names itself relative to the root in the skip line', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: { '.engineos/.keep': '' } });
  cpSync(FIXTURE, join(repo, 'services', 'api'), { recursive: true });
  const path = transcriptOf(repo, edits(repo, 'services/api/app/main.py'));
  const { spawn } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY10', path), context(), spawn, MODERN), message(SKIPPED('services/api')));
});

// ------------------------------------------------------------------ uv and compose

test('a uv.lock with uv on PATH runs every tool through uv run --directory', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { files: { 'uv.lock': 'version = 1\n' } });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY11', path), context(), spawn, MODERN), silent);
  assert.deepEqual(argvOf(calls), [
    // Resolution asks uv once; the runner-found probe asks it once more, from the root.
    'uv --version',
    'uv --version',
    `uv run --directory ${repo} ruff check .`,
    `uv run --directory ${repo} ruff format --check .`,
    `uv run --directory ${repo} pyright`,
  ]);
});

test('a uv.lock with no uv on PATH is no environment at all', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { files: { 'uv.lock': 'version = 1\n' } });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn } = spawnWith(() => ({ status: null, error: new Error('spawnSync uv ENOENT') }));
  assert.deepEqual(verify(stopOf(repo, 'PY12', path), context(), spawn, MODERN), message(SKIPPED('.')));
});

test('a compose service declared in .engineos/config.json runs the tools inside the container', (t) => {
  if (skipWithoutGit(t)) return;
  const config = JSON.stringify({ version: 1, stack: { packages: [{ dir: '.', language: 'python', framework: 'fastapi', compose_service: 'api' }] } });
  const repo = pythonRepo(t, { files: { '.engineos/config.json': config } });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY13', path), context(), spawn, MODERN), silent);
  assert.deepEqual(argvOf(calls), [
    'docker compose exec -T api python --version',
    'docker compose exec -T api ruff check .',
    'docker compose exec -T api ruff format --check .',
    'docker compose exec -T api pyright',
  ]);
});

test('a malformed config is read as no config: the cascade still runs on the venv', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true, files: { '.engineos/config.json': '{ not json' } });
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY14', path), context(), spawn, MODERN), silent);
  assert.equal(calls.length, 4);
});

// ------------------------------------------------------------------ pins

test('an unpinned dev tool is one advisory line on a green run, and never blocks', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const pyproject = readFileSync(join(repo, 'pyproject.toml'), 'utf8').replace('"ruff==0.13.0"', '"ruff>=0.13"').replace('"pytest==8.4.1"', '"pytest"');
  writeFileSync(join(repo, 'pyproject.toml'), pyproject);
  const path = transcriptOf(repo, edits(repo, 'app/main.py'));
  const { spawn } = spawnWith(GREEN);
  assert.deepEqual(
    verify(stopOf(repo, 'PY15', path), context(), spawn, MODERN),
    message('[engineos] .: ruff, pytest not pinned to exact versions (rules/verification.md)'),
  );
  assert.deepEqual(eventData(repo, 'PY15'), { failed: false, targets: ['.'] });
  assert.equal(spanStatus(repo, 'PY15'), 'OK');
});

// ------------------------------------------------------------------ mixed root and containment

test('a root holding both pyproject.toml and package.json runs under both runners', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true, files: { 'package.json': JSON.stringify({ scripts: { lint: 'exit 0' } }), 'web/index.ts': '' } });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py', 'web/index.ts'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY16', path), context(), spawn, MODERN), silent);
  assert.deepEqual(argvOf(calls), [
    `${join(bin, 'python')} --version`,
    'npm --version',
    `${join(bin, 'ruff')} check .`,
    `${join(bin, 'ruff')} format --check .`,
    `${join(bin, 'pyright')}`,
    'npm run -s lint',
  ]);
  // One directory, entered under two runners, is one package in the event.
  assert.deepEqual(eventData(repo, 'PY16'), { failed: false, targets: ['.'] });
});

test('a node too old for the Node arm still verifies the Python package beside it', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true, files: { 'package.json': JSON.stringify({ scripts: { lint: 'exit 1' } }), 'web/index.ts': '' } });
  const bin = venvBinDir(join(repo, '.venv'));
  const path = transcriptOf(repo, edits(repo, 'app/main.py', 'web/index.ts'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(
    verify(stopOf(repo, 'PY17', path), context(), spawn, '16.17.0'),
    message('EngineOS gate: lint, typecheck skipped — infra (node-too-old): node 16 cannot start the toolchain. No fix attempt is consumed.'),
  );
  assert.deepEqual(argvOf(calls), [
    `${join(bin, 'python')} --version`,
    `${join(bin, 'ruff')} check .`,
    `${join(bin, 'ruff')} format --check .`,
    `${join(bin, 'pyright')}`,
  ]);
});

test('an edit inside .venv/site-packages never enters the wheel that owns it', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true });
  const wheel = join(repo, '.venv', 'lib', 'python3.12', 'site-packages', 'vendored');
  mkdirSync(wheel, { recursive: true });
  writeFileSync(join(wheel, 'pyproject.toml'), '[tool.ruff]\n');
  writeFileSync(join(wheel, 'x.py'), '');
  const path = transcriptOf(repo, edits(repo, '.venv/lib/python3.12/site-packages/vendored/x.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY18', path), context(), spawn, MODERN), silent);
  assert.deepEqual(calls, []);
});

test('a requirements.txt directory under the package belongs to the pyproject.toml above it', (t) => {
  if (skipWithoutGit(t)) return;
  const repo = pythonRepo(t, { venv: true, files: { 'scripts/requirements.txt': 'rich\n', 'scripts/tool.py': '' } });
  const path = transcriptOf(repo, edits(repo, 'scripts/tool.py'));
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(stopOf(repo, 'PY19', path), context(), spawn, MODERN), silent);
  // The root package ran, once, not a `scripts/` package of its own.
  assert.deepEqual(calls.filter((c) => c.args[0] === 'check').map((c) => c.cwd), [repo]);
  assert.deepEqual(eventData(repo, 'PY19'), { failed: false, targets: ['.'] });
});
