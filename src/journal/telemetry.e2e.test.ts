// Spawned black-box contract for the kernel-decision telemetry CLI — the port of
// scripts/test-telemetry.sh, one test per bash case, in the bash suite's order.
//
// src/journal/telemetry-cli.test.ts already drives `runTelemetry` in process, and
// src/journal/telemetry-parity.test.ts compares it against the pinned bash CLI.
// This file is the third angle neither can take: the whole `node dist/engineos.cjs
// telemetry <sub>` binary, over the checkout's REAL registries, appending to a
// real file — which is how every writing hook reaches it.
//
// The registry samples are read from registries/policy.json rather than pasted in:
// the bash suite fed jq's `.telemetry.events[].sample` to the CLI on purpose, so a
// sample edited into a shape the CLI refuses fails here (the self-validating
// registry pattern), and a pasted copy would silently stop checking that.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runCli, tempRoot, type RunResult } from '../testing/harness';

const checkout = resolveRoot({}, __dirname);

// The deterministic timestamp the bash suite pinned, so an appended line is
// byte-comparable across runs.
const TS = '2026-08-06T00:00:00Z';

// scripts/telemetry.sh execs the bundle with ENGINEOS_ROOT set to its own
// checkout; the harness strips every ENGINEOS_* from the spawned env, so the
// suite has to state it. Without it the CLI would resolve registries from
// whatever the runner's environment happened to carry.
const ENV: Record<string, string> = { ENGINEOS_ROOT: checkout };

// The events the bash suite looped over — every id in the registry's telemetry
// block at the time of the port.
const SAMPLE_EVENTS = ['route', 'decision-rules', 'verify'];

const SAMPLES = loadSamples();

// ------------------------------------------------------------------ helpers

function loadSamples(): Map<string, string> {
  const policy = readJsonFile(join(checkout, 'registries', 'policy.json'));
  if (!isRecord(policy)) throw new Error('registries/policy.json is not a JSON object');
  const telemetry = policy['telemetry'];
  if (!isRecord(telemetry)) throw new Error('registries/policy.json has no telemetry object');
  const events = telemetry['events'];
  if (!Array.isArray(events)) throw new Error('registries/policy.json telemetry.events is not an array');
  const samples = new Map<string, string>();
  for (const row of events) {
    if (!isRecord(row)) continue;
    const id = row['id'];
    if (typeof id !== 'string') continue;
    // jq -c of the sample: every sample is booleans, numbers, strings and arrays
    // of strings, where JSON.stringify and jq agree byte for byte.
    const sample = row['sample'];
    samples.set(id, JSON.stringify(sample === undefined ? {} : sample));
  }
  return samples;
}

function sampleFor(event: string): string {
  const sample = SAMPLES.get(event);
  if (sample === undefined) throw new Error(`registries/policy.json carries no telemetry event ${event}`);
  return sample;
}

function telemetry(args: string[]): RunResult {
  return runCli(['telemetry', ...args], { env: ENV });
}

// bash `mktemp`: an empty file the case appends to, inside a temp root the
// harness removes at test end.
function eventFile(t: TestContext, contents = ''): string {
  const path = join(tempRoot(t), 'events.jsonl');
  writeFileSync(path, contents);
  return path;
}

function appendSample(path: string, event: string): RunResult {
  return telemetry(['append', path, '--session', 's1', '--event', event, '--data', sampleFor(event), '--ts', TS]);
}

// The bash suite appended all three samples into one file and then asserted the
// file three times; each node:test case rebuilds that state itself so the cases
// stay independent of each other's order.
function appendAllSamples(path: string): void {
  for (const event of SAMPLE_EVENTS) {
    const result = appendSample(path, event);
    assert.equal(result.status, 0, `appending the ${event} sample failed: ${result.stdout}${result.stderr}`);
  }
}

function appendRoute(path: string, data: string): RunResult {
  return telemetry(['append', path, '--session', 's1', '--event', 'route', '--data', data]);
}

function lineCount(path: string): number {
  // bash counted newlines with `wc -l`; the CLI always terminates a line, so the
  // non-empty split parts are the same number.
  return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '').length;
}

function fieldOfFirstLine(path: string, key: string): unknown {
  const [line] = readFileSync(path, 'utf8').split('\n');
  const parsed: unknown = JSON.parse(line ?? '');
  if (!isRecord(parsed)) throw new Error(`first line of ${path} is not a JSON object: ${line ?? ''}`);
  return parsed[key];
}

function hasTool(command: string): boolean {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

// `command -v <tool>` — the absolute path the bash case symlinked into its
// stripped PATH, or undefined when the tool is not installed.
function toolPath(command: string): string | undefined {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf8' });
  const path = (result.stdout ?? '').trim();
  return result.status === 0 && path !== '' ? path : undefined;
}

// ---------- append: every registry sample the writing hooks really emit ----------

// scripts/test-telemetry.sh:26-31 — the `for ev in route decision-rules verify`
// loop, one check per event.
for (const event of SAMPLE_EVENTS) {
  test(`append the ${event} registry sample succeeds`, (t) => {
    const path = eventFile(t);
    const result = appendSample(path, event);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
}

// scripts/test-telemetry.sh:33-35.
test('all three appended lines are present', (t) => {
  const path = eventFile(t);
  appendAllSamples(path);
  assert.equal(lineCount(path), 3);
});

// scripts/test-telemetry.sh:37-39 — the --ts override is what makes an appended
// line reproducible; without it the CLI stamps the wall clock.
test('the --ts override round-trips (determinism)', (t) => {
  const path = eventFile(t);
  appendAllSamples(path);
  assert.equal(fieldOfFirstLine(path, 'ts'), TS);
});

// scripts/test-telemetry.sh:41-42 — append and validate share one schema, so
// what one writes the other must accept.
test('validate accepts what append wrote', (t) => {
  const path = eventFile(t);
  appendAllSamples(path);
  const result = telemetry(['validate', path]);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

// ---------- append: the refusals ----------

// scripts/test-telemetry.sh:46-47.
test('append rejects an unknown event', (t) => {
  const path = eventFile(t);
  const result = telemetry(['append', path, '--session', 's1', '--event', 'bogus', '--data', '{}']);
  assert.notEqual(result.status, 0);
});

// scripts/test-telemetry.sh:49-50 — the per-event key set is a closed allowlist.
test("append rejects a data key not in the event's keys", (t) => {
  const path = eventFile(t);
  assert.notEqual(appendRoute(path, '{"bogus_key":"x"}').status, 0);
});

// scripts/test-telemetry.sh:52-53 — value_pattern has no whitespace class: this
// is the structural guard against prompt text entering the store.
test('append rejects a string value containing a space', (t) => {
  const path = eventFile(t);
  assert.notEqual(appendRoute(path, '{"intents":["two words"]}').status, 0);
});

// scripts/test-telemetry.sh:55-56 — one bad element condemns the whole array.
test('append rejects an array-of-strings with one whitespace value', (t) => {
  const path = eventFile(t);
  assert.notEqual(appendRoute(path, '{"agents":["ok","also fine but not"]}').status, 0);
});

// scripts/test-telemetry.sh:58-59 — data is flat by contract.
test('append rejects a nested object as a value', (t) => {
  const path = eventFile(t);
  assert.notEqual(appendRoute(path, '{"intents":{"a":1}}').status, 0);
});

// scripts/test-telemetry.sh:61-62.
test('append rejects --data that is not JSON', (t) => {
  const path = eventFile(t);
  assert.notEqual(appendRoute(path, 'not json').status, 0);
});

// scripts/test-telemetry.sh:64-65 — a flag left dangling is a usage error, not
// an unhandled crash in the argument parser.
test('append rejects a flag given with no value, not a bash crash', (t) => {
  const path = eventFile(t);
  const result = telemetry(['append', path, '--session', 's1', '--event', 'route', '--data']);
  assert.notEqual(result.status, 0);
});

// ---------- validate ----------

// scripts/test-telemetry.sh:68-77 — a valid line followed by a hand-written bad
// one; validate must name WHICH line is bad, not just that the file is.
// bash captured 2>&1, so the assertion is on the combined output: the port
// writes the per-line reports to stderr.
test("validate reports the bad line's number", (t) => {
  const path = eventFile(t);
  assert.equal(appendSample(path, 'route').status, 0);
  writeFileSync(path, '{"ts":"2026-08-06T00:00:00Z","session_id":"s1","event":"bogus","data":{}}', { flag: 'a' });
  const result = telemetry(['validate', path]);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(output.includes('line 2:'), true, `got: ${output}`);
});

// scripts/test-telemetry.sh:79-83 — a file whose last line has no terminator is
// still one line, and it is still checked.
test('validate checks the final line even with no trailing newline', (t) => {
  const path = eventFile(t, '{"ts":"2026-08-06T00:00:00Z","session_id":"s1","event":"route","data":{}}');
  const result = telemetry(['validate', path]);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

// ---------- the shim, driven as bash ----------

// scripts/test-telemetry.sh:85-105. The one case that is still bash: it strips
// node out of PATH to prove the SHIM fails loudly instead of dropping the event,
// and `runCli` — which spawns the bundle with the running node — can never reach
// that path. The exit code is not asserted (an unfound `exec node` leaves 127
// where the old bash CLI's err() left 1); what matters is that it is non-zero
// and that nothing was written.
test('a missing runtime is a hard error, not a silent skip', (t) => {
  if (!hasTool('bash')) {
    t.skip('bash is not installed');
    return;
  }
  const bash = toolPath('bash');
  if (bash === undefined) {
    t.skip('bash is not on PATH');
    return;
  }
  const root = tempRoot(t);
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  // Everything the shim's own prologue needs, and nothing else — no node.
  for (const command of ['cat', 'dirname', 'pwd', 'printf', 'mktemp']) {
    const source = toolPath(command);
    if (source !== undefined) symlinkSync(source, join(bin, command));
  }
  // Never created: the assertion is that the run leaves no event behind.
  const sink = join(root, 'sink.jsonl');
  // bash is invoked by absolute path because the child's PATH no longer finds it.
  const result = spawnSync(bash, [join(checkout, 'scripts', 'telemetry.sh'), 'append', sink, '--session', 's', '--event', 'route', '--data', '{}'], {
    env: { PATH: bin },
    encoding: 'utf8',
  });
  const wrote = existsSync(sink) && readFileSync(sink, 'utf8') !== '';
  assert.deepEqual(
    { failed: result.status !== 0, wrote },
    { failed: true, wrote: false },
    `rc=${String(result.status)} out=${result.stdout ?? ''}${result.stderr ?? ''}`,
  );
});
