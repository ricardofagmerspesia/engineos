import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runTelemetry } from './telemetry-cli';

// Differential parity (plan Task 15). Every case runs the SAME argv through the
// pinned bash telemetry CLI and through the TypeScript port, over byte-identical
// registries, and asserts the same exit code, the same stdout and — for append —
// the same bytes in the file. The fixture and its refresh procedure are
// documented in test/fixtures/legacy-journal/README.md.
//
// jq 1.6 is the pinned number-format reference. The port reproduces jq 1.6's
// double-based rendering of JSON numbers — `1e-07`, `1000000000000000`, `1` for
// `1.0` — because that is what the fixture CLI emitted when it was pinned. jq
// 1.7 re-renders numbers through decNumber instead (`1E-7`, `1E+15`, `1.0`), so
// the samples whose bytes depend on that formatter cannot be compared against a
// non-1.6 jq without pinning the port to a formatter it was never written
// against. Those samples are therefore version-gated: the suite probes the jq on
// PATH once and skips only the samples THIS jq renders differently from jq 1.6.
// Everything else, number cases included where the two agree, keeps full byte
// parity on every jq.
//
// Deliberately NOT cases:
//   - anything that reaches usage(). bash interpolates $0, which is the staged
//     path; the port has no $0 and names scripts/telemetry.sh. Exit code and the
//     empty stdout still match, and telemetry-cli.test.ts owns the text.
//   - `append` or `validate` with no file at all. bash dies on `set -u` with a
//     shell diagnostic; the port answers usage. Same exit code, different stream.
//   - a value ending in a newline. jq's Oniguruma `$` matches before a trailing
//     newline where JavaScript's does not, so bash accepts `"ok\n"` and the port
//     refuses it. The port is the stricter of the two on an anti-prompt-text
//     guard, which is the safe direction, and asserting the laxer behaviour would
//     pin it.

const FIXTURE = join(resolveRoot({}, __dirname), 'test', 'fixtures', 'legacy-journal');
const TS = '2026-08-06T00:00:00Z';
const MISSING_TOOL = firstMissingTool(['bash', 'jq']);
const JQ_VERSION = jqVersion();

const APPEND_CASES: string[][] = [
  // Every registry sample, which is the payload each writing hook really emits.
  ...sampleCases(),
  ['--session', 's1', '--event', 'route', '--data', '{}'],
  ['--session', 's1', '--event', 'route', '--data', '{"reasons":[],"intents":[]}'],
  ['--session', 's1', '--event', 'route', '--data', '{"agents":["a"],"escalate":true,"intents":["b"]}'],
  ['--session', 's1', '--event', 'route', '--data', '{"agents":["apps/api/src/x.ts","a@b:c-d_e"]}'],
  ['--session', 's1', '--event', 'verify', '--data', '{"failed":false,"targets":3}'],
  ['--session', 'sessão-1', '--event', 'route', '--data', '{}'],
  // Refusals: one per guard the CLI carries.
  ['--session', 's1', '--event', 'bogus', '--data', '{}'],
  ['--session', 's1', '--event', 'route', '--data', '{"bogus_key":"x"}'],
  ['--session', 's1', '--event', 'route', '--data', '{"intents":["two words"]}'],
  ['--session', 's1', '--event', 'route', '--data', '{"agents":["ok","also fine but not"]}'],
  ['--session', 's1', '--event', 'route', '--data', '{"intents":{"a":1}}'],
  ['--session', 's1', '--event', 'route', '--data', '{"agents":[""]}'],
  ['--session', 's1', '--event', 'route', '--data', '{"escalate":null}'],
  ['--session', 's1', '--event', 'route', '--data', 'not json'],
  ['--session', 's1', '--event', 'route', '--data', 'false'],
  ['--session', 's1', '--event', 'route', '--data', 'null'],
  ['--session', 's1', '--event', 'route', '--data', '0'],
  ['--session', 's1', '--event', 'route', '--data', '[]'],
  ['--session', 's1', '--event', 'route', '--data', '"x"'],
  // A repeated flag: last one wins on both sides.
  ['--session', 's1', '--session', 's2', '--event', 'route', '--data', '{}'],
];

// The number forms where JSON.stringify and jq 1.6 disagree, each paired with
// the `data` bytes jq 1.6 renders for it — measured on jq-1.6, which is the
// pinned reference this port was written against. A jq that renders a sample
// differently gates that one sample and nothing else.
const NUMBER_SAMPLES: { data: string; jq16: string }[] = [
  { data: '{"targets":-0}', jq16: '{"targets":-0}' },
  { data: '{"targets":1e-7}', jq16: '{"targets":1e-07}' },
  { data: '{"targets":1e-6}', jq16: '{"targets":1e-06}' },
  { data: '{"targets":1e15}', jq16: '{"targets":1000000000000000}' },
  { data: '{"targets":1e16}', jq16: '{"targets":1e+16}' },
  { data: '{"targets":1.5e17}', jq16: '{"targets":1.5e+17}' },
  { data: '{"targets":1.0}', jq16: '{"targets":1}' },
  { data: '{"targets":0.1}', jq16: '{"targets":0.1}' },
  { data: '{"targets":123456789012345678901}', jq16: '{"targets":123456789012345680000}' },
];

// data -> what the jq on PATH renders, for the samples where that differs from
// jq 1.6. Empty on jq 1.6.x by construction: that version IS the reference, so a
// mismatch there is a real regression and has to stay red.
const DIVERGENT_NUMBERS = divergentNumbers();

// The corpus every validate case runs over: one file, both implementations, so
// the file path inside each message is the same on both sides.
const VALIDATE_CORPUS: Record<string, string> = {
  'good.jsonl': [
    `{"ts":"${TS}","session_id":"s1","event":"route","data":{"escalate":true}}`,
    `{"ts":"${TS}","session_id":"s1","event":"verify","data":{"failed":false,"targets":["apps/api"]}}`,
    '',
  ].join('\n'),
  'mixed.jsonl': [
    `{"ts":"${TS}","session_id":"s1","event":"route","data":{}}`,
    `{"ts":"${TS}","session_id":"s1","event":"bogus","data":{}}`,
    'not json',
    '{"ts":"","session_id":"s1","event":"route","data":{}}',
    '{"session_id":"s1","event":"route","data":{}}',
    '{"ts":"t","session_id":"","event":"route","data":{}}',
    '{"ts":"t","session_id":"s1","event":"route"}',
    '{"ts":"t","session_id":"s1","event":"route","data":null}',
    '{"ts":"t","session_id":"s1","event":"route","data":false}',
    '{"ts":"t","session_id":"s1","event":"route","data":0}',
    '{"ts":"t","session_id":"s1","event":"route","data":{"intents":["two words"]}}',
    '[1,2]',
    'null',
    '',
    '',
  ].join('\n'),
  // No trailing newline: the last line must still be read and checked.
  'unterminated.jsonl': `{"ts":"${TS}","session_id":"s1","event":"route","data":{}}`,
  'empty.jsonl': '',
  'blank.jsonl': '\n\n',
};

test('append answers identically to the pinned bash telemetry CLI', (t) => {
  const root = skipOrStage(t);
  if (root === null) return;
  for (const args of APPEND_CASES) appendCase(root, args);
});

// One subtest per sample so a jq whose number formatter has moved on gates that
// sample alone, visibly, instead of failing the whole append suite.
test('append renders every number form identically to the pinned bash telemetry CLI', async (t) => {
  const root = skipOrStage(t);
  if (root === null) return;
  for (const { data, jq16 } of NUMBER_SAMPLES) {
    const rendered = DIVERGENT_NUMBERS.get(data);
    await t.test(`append --data ${data}`, (subtest) => {
      if (rendered !== undefined) {
        subtest.skip(
          `jq 1.6 is the pinned number-format reference; ${JQ_VERSION ?? 'the jq on PATH'} renders ${data}`
          + ` as ${rendered} rather than ${jq16}`,
        );
        return;
      }
      appendCase(root, ['--session', 's1', '--event', 'verify', '--data', data]);
    });
  }
});

test('validate answers identically to the pinned bash telemetry CLI', (t) => {
  const root = skipOrStage(t);
  if (root === null) return;
  for (const [name, contents] of Object.entries(VALIDATE_CORPUS)) {
    const path = join(root, name);
    writeFileSync(path, contents);
    compare(root, ['validate', path], `validate ${name}`);
  }
  compare(root, ['validate', join(root, 'nope.jsonl')], 'validate a missing file');
  compare(root, ['validate', root], 'validate a directory');
});

test('a missing policy.json is refused identically', (t) => {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash telemetry CLI needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = tempRoot(t);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  copyFileSync(join(FIXTURE, 'telemetry.sh'), legacyCli(root));
  const path = join(root, 'events.jsonl');
  compare(root, ['append', path, '--session', 's1', '--event', 'route', '--data', '{}'], 'append with no registry');
});

// ------------------------------------------------------------------ internals

function skipOrStage(t: TestContext): string | null {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash telemetry CLI needs ${MISSING_TOOL} on PATH`);
    return null;
  }
  return stageFixture(t);
}

// The pinned CLI derives its root from its own location (`$(dirname "$0")/..`)
// and never reads ENGINEOS_ROOT, so it is only pinned to a set of registries when
// it sits one directory below them. Staging into a fresh temp root per test gives
// both sides one root: bash resolves it from the staged path, TypeScript is
// handed it.
function stageFixture(t: TestContext): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'registries'), { recursive: true });
  copyFileSync(join(FIXTURE, 'telemetry.sh'), legacyCli(root));
  copyFileSync(join(checkout(), 'registries', 'policy.json'), join(root, 'registries', 'policy.json'));
  return root;
}

// Each side appends into its own file, because only the bytes are comparable —
// the path is not, and it never appears in an appended line.
function appendCase(root: string, args: string[]): void {
  const label = `append ${args.join(' ')}`;
  const legacyFile = join(root, `legacy-${slug(label)}.jsonl`);
  const portedFile = join(root, `ported-${slug(label)}.jsonl`);
  writeFileSync(legacyFile, '');
  writeFileSync(portedFile, '');

  const legacy = runLegacy(root, ['append', legacyFile, ...args, '--ts', TS]);
  const ported = runPorted(root, ['append', portedFile, ...args, '--ts', TS]);

  assert.equal(ported.status, legacy.status, `${label}: exit codes differ`);
  assert.equal(ported.stdout, legacy.stdout, `${label}: stdout differs`);
  assert.equal(
    readFileSync(portedFile, 'utf8'),
    readFileSync(legacyFile, 'utf8'),
    `${label}: the appended line differs byte for byte`,
  );
}

function compare(root: string, argv: string[], label: string): void {
  const legacy = runLegacy(root, argv);
  const ported = runPorted(root, argv);
  assert.equal(ported.status, legacy.status, `${label}: exit codes differ`);
  assert.equal(ported.stdout, legacy.stdout, `${label}: stdout differs`);
  assert.equal(ported.stderr, legacy.stderr, `${label}: stderr differs`);
}

function runLegacy(root: string, argv: string[]): RunResult {
  const result = spawnSync('bash', [legacyCli(root), ...argv], {
    encoding: 'utf8',
    // PATH so the pinned CLI finds jq, HOME because bash startup reads it.
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
  });
  if (result.error !== undefined) throw new Error(`could not spawn the pinned bash telemetry CLI: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function runPorted(root: string, argv: string[]): RunResult {
  return runInProcess(runTelemetry, argv, { env: { ENGINEOS_ROOT: root } });
}

function legacyCli(root: string): string {
  return join(root, 'scripts', 'telemetry.sh');
}

function checkout(): string {
  return resolveRoot({}, __dirname);
}

// Derived from the registry rather than listed: an event added to policy.json
// gets a parity case without anyone remembering to add one.
function sampleCases(): string[][] {
  const document = readJsonRecord(join(checkout(), 'registries', 'policy.json'));
  const telemetry = isRecord(document['telemetry']) ? document['telemetry'] : {};
  const events = Array.isArray(telemetry['events']) ? telemetry['events'] : [];
  return events.filter(isRecord).map((event) => [
    '--session', 's1',
    '--event', typeof event['id'] === 'string' ? event['id'] : '',
    '--data', JSON.stringify(event['sample'] ?? {}),
  ]);
}

function readJsonRecord(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed;
}

function slug(label: string): string {
  return label.replace(/[^A-Za-z0-9]+/gu, '-').slice(0, 80);
}

// `jq --version` prints one token: `jq-1.6`, `jq-1.7.1`, `jq-1.8.0`. Read once
// per file, because the answer cannot change mid-run.
function jqVersion(): string | null {
  const probe = spawnSync('jq', ['--version'], { encoding: 'utf8' });
  if (probe.error !== undefined || probe.status !== 0) return null;
  return probe.stdout.trim();
}

// Renders every sample through the jq on PATH in ONE invocation, along the same
// path the pinned CLI uses (`--argjson`, then straight out), and keeps the ones
// whose bytes differ from jq 1.6's. A probe that cannot be run at all leaves the
// whole set gated with that stated as the reason: without an established
// equivalence there is no jq-1.6 reference to compare bytes against.
function divergentNumbers(): Map<string, string> {
  const divergent = new Map<string, string>();
  if (MISSING_TOOL !== null || JQ_VERSION === null || JQ_VERSION.startsWith('jq-1.6')) return divergent;
  const payload = `[${NUMBER_SAMPLES.map((sample) => sample.data).join(',')}]`;
  const probe = spawnSync('jq', ['-nc', '--argjson', 'samples', payload, '$samples[]'], { encoding: 'utf8' });
  const lines = probe.status === 0 ? (probe.stdout ?? '').trimEnd().split('\n') : [];
  for (const [index, sample] of NUMBER_SAMPLES.entries()) {
    const rendered = lines.length === NUMBER_SAMPLES.length ? lines[index] : 'nothing — the jq number-format probe failed';
    if (rendered !== undefined && rendered !== sample.jq16) divergent.set(sample.data, rendered);
  }
  return divergent;
}

function firstMissingTool(tools: string[]): string | null {
  for (const tool of tools) {
    const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' });
    if (probe.error !== undefined || probe.status !== 0) return tool;
  }
  return null;
}
