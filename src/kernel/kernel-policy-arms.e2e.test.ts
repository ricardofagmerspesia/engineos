import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runCli, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (the model, risk, gates, repair,
// waves, decision-rules and scale blocks, plus the risk fail-closed block).
// Every fixture that depends on a registry number reads it from the registry
// rather than restating it: re-parameterising policy.json must MOVE a fixture,
// never turn it red.

const ROOT = resolveRoot({}, __dirname);

function kernel(args: string[]): RunResult {
  return runCli(['kernel', ...args]);
}

function body(result: RunResult): Record<string, unknown> {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isRecord(parsed)) throw new Error(`the kernel answered non-object JSON: ${result.stdout}`);
  return parsed;
}

function okBody(result: RunResult): Record<string, unknown> {
  assert.equal(result.status, 0, `expected rc=0, got rc=${result.status}: ${result.stdout}${result.stderr}`);
  return body(result);
}

function errorMessage(result: RunResult): string {
  assert.notEqual(result.status, 0, `expected a non-zero exit: ${result.stdout}`);
  const message = body(result)['error'];
  assert.equal(typeof message, 'string', `expected an .error body, got ${result.stdout}`);
  return String(message);
}

function record(value: unknown, at: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${at} is not a JSON object`);
  return value;
}

const POLICY = record(readJsonFile(join(ROOT, 'registries', 'policy.json')), 'registries/policy.json');

// An unusable value is a loud abort rather than a fixture computing nonsense off
// an empty string — the bash suite's `case ... exit 2` guard.
function policyCount(...keys: string[]): number {
  let cursor: unknown = POLICY;
  for (const key of keys) cursor = record(cursor, `policy.json .${keys.join('.')}`)[key];
  if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor <= 0) {
    throw new Error(`policy.json ${keys.join('.')} is unusable: [${String(cursor)}]`);
  }
  return cursor;
}

const CAP = policyCount('parallelism', 'wave_concurrency_cap');

// --------------------------------------------------------------------- model

test('model --work adr exits 0', () => {
  const answer = okBody(kernel(['model', '--work', 'adr']));
  assert.equal(answer['tier'], 'most-capable');
  assert.equal(answer['model'], 'fable');
  assert.equal(answer['escalates_to'], null);
});

test('model --work build exits 0', () => {
  const answer = okBody(kernel(['model', '--work', 'build']));
  assert.equal(answer['tier'], 'build');
  assert.equal(answer['model'], 'opus');
  assert.equal(record(answer['escalates_to'], '.escalates_to')['tier'], 'design');
});

test('model --work nonsense exits 1 with .error', () => {
  errorMessage(kernel(['model', '--work', 'nonsense']));
});

// ---------------------------------------------------------------------- risk

test('risk max-aggregation exits 0', () => {
  const answer = okBody(kernel(['risk', '--signals', '{"inputs":{"reversibility":"low","blast-radius":"medium"}}']));
  assert.equal(answer['risk'], 'medium');
  assert.equal(answer['autonomy_ceiling'], 'A3');
});

test('risk floor-forcing exits 0', () => {
  const signals =
    '{"inputs":{"reversibility":"low","blast-radius":"low","data-sensitivity":"low","contract-surface":"low","spend":"low"},"floors":["payments"]}';
  assert.equal(okBody(kernel(['risk', '--signals', signals]))['risk'], 'high');
});

test('risk with unknown input id exits 1 with .error', () => {
  errorMessage(kernel(['risk', '--signals', '{"inputs":{"bogus-input":"low"}}']));
});

test('risk with unknown floor exits 1 with .error', () => {
  errorMessage(kernel(['risk', '--signals', '{"inputs":{"reversibility":"low"},"floors":["bogus-floor"]}']));
});

// --------------------------------------------------------------------- gates

test('gates --risk high exits 0', () => {
  const gates = record(okBody(kernel(['gates', '--risk', 'high']))['gates'], '.gates');
  assert.equal(gates['validation'], 'required-plus-critic');
  assert.equal(gates['release'], 'required-plus-human-approval');
});

test('gates --risk banana exits 1 with .error', () => {
  errorMessage(kernel(['gates', '--risk', 'banana']));
});

// -------------------------------------------------------------------- repair

test('repair lint attempt 1 exits 0', () => {
  assert.equal(okBody(kernel(['repair', '--check', 'lint', '--attempt', '1']))['action'], 'fix-same-tier');
});

test('repair lint attempt 2 -> action', () => {
  assert.equal(okBody(kernel(['repair', '--check', 'lint', '--attempt', '2']))['action'], 'escalate-one-tier');
});

test('repair lint attempt 3 -> action', () => {
  assert.equal(okBody(kernel(['repair', '--check', 'lint', '--attempt', '3']))['action'], 'stop-report-red');
});

test('repair test infra situation -> action', () => {
  assert.equal(okBody(kernel(['repair', '--check', 'test', '--situation', 'infra']))['action'], 'report-tooling-gap');
});

test('repair test flaky situation -> action', () => {
  assert.equal(okBody(kernel(['repair', '--check', 'test', '--situation', 'flaky']))['action'], 'fix-or-delete');
});

// never-repair situations win regardless of attempt.
test('weaken-the-check situation overrides attempt1 -> never-repair', () => {
  const result = kernel(['repair', '--check', 'build', '--attempt', '1', '--situation', 'weaken-the-check']);
  assert.equal(okBody(result)['action'], 'never-repair');
});

test('unknown check errors', () => {
  errorMessage(kernel(['repair', '--check', 'nonsense', '--attempt', '1']));
});

test('missing --check errors', () => {
  errorMessage(kernel(['repair', '--attempt', '1']));
});

test('ladder path missing --attempt errors', () => {
  errorMessage(kernel(['repair', '--check', 'lint']));
});

test('unknown situation errors', () => {
  errorMessage(kernel(['repair', '--check', 'lint', '--attempt', '1', '--situation', 'nonsense']));
});

// --------------------------------------------------------------------- waves

function stringList(value: unknown, at: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${at} is not an array`);
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error(`${at} holds a non-string`);
    return item;
  });
}

// 3 units: a, b independent; c depends on both -> two waves, no violations.
test('waves 3-unit dag exits 0', () => {
  const units =
    '[{"id":"a","files":["a.ts"],"depends_on":[]},{"id":"b","files":["b.ts"],"depends_on":[]},{"id":"c","files":["c.ts"],"depends_on":["a","b"]}]';
  const answer = okBody(kernel(['waves', '--units', units]));
  assert.deepEqual(answer['waves'], [['a', 'b'], ['c']]);
  assert.deepEqual(answer['violations'], []);
  const line = answer['fanout_line'];
  assert.equal(typeof line, 'string');
  assert.ok(String(line).includes('waves=2'));
});

// Two units in the same wave sharing a file: reported as a violation naming the
// file and both unit ids, wave still emitted (not an error).
test('waves same-file collision exits 0', () => {
  const units =
    '[{"id":"a","files":["shared.ts"],"depends_on":[]},{"id":"b","files":["shared.ts"],"depends_on":[]}]';
  const violations = okBody(kernel(['waves', '--units', units]))['violations'];
  if (!Array.isArray(violations)) throw new Error('.violations is not an array');
  const first = record(violations[0], '.violations[0]');
  assert.equal(first['file'], 'shared.ts');
  assert.deepEqual(stringList(first['units'], '.violations[0].units').sort(), ['a', 'b']);
});

// The unit list is GENERATED from the cap: a literal count is "two units over the
// cap" only for one value of wave_concurrency_cap. cap + 2 independent units is
// always exactly two waves, sized cap and 2.
test('waves cap+2-unit split exits 0', () => {
  const units = JSON.stringify(
    Array.from({ length: CAP + 2 }, (_unused, i) => ({ id: `u${i + 1}`, files: [], depends_on: [] })),
  );
  const waves = okBody(kernel(['waves', '--units', units]))['waves'];
  if (!Array.isArray(waves)) throw new Error('.waves is not an array');
  assert.equal(waves.length, 2);
  assert.equal(stringList(waves[0], '.waves[0]').length, CAP);
  assert.equal(stringList(waves[1], '.waves[1]').length, 2);
});

// Cycle a -> b -> a is an error, not a silently-empty wave list.
test('waves cycle exits 1 with .error mentioning cycle', () => {
  const units = '[{"id":"a","files":[],"depends_on":["b"]},{"id":"b","files":[],"depends_on":["a"]}]';
  assert.ok(errorMessage(kernel(['waves', '--units', units])).toLowerCase().includes('cycle'));
});

test('waves duplicate ids exits 1 with .error', () => {
  const units = '[{"id":"a","files":[],"depends_on":[]},{"id":"a","files":[],"depends_on":[]}]';
  errorMessage(kernel(['waves', '--units', units]));
});

// --------------------------------------------------------------- decision-rules

test('decision-rules destructive prompt exits 0', () => {
  const answer = okBody(kernel(['decision-rules', '--prompt', 'drop the users table in production']));
  const matches = answer['matches'];
  if (!Array.isArray(matches)) throw new Error('.matches is not an array');
  const ids = matches.map((row, i) => record(row, `.matches[${i}]`)['id']);
  assert.ok(ids.includes('rule-destructive-ddl'));
  assert.ok(ids.includes('rule-production-write'));
  assert.equal(answer['any_high'], true);
});

test('decision-rules innocuous prompt exits 0', () => {
  const answer = okBody(kernel(['decision-rules', '--prompt', "let's write a friendly test"]));
  assert.deepEqual(answer['matches'], []);
  assert.equal(answer['any_high'], false);
});

// --------------------------------------------------------------------- scale

test('scale big-task prompt exits 0', () => {
  assert.equal(okBody(kernel(['scale', '--prompt', 'implement all the endpoints across the codebase']))['big_task'], true);
});

test('scale spec-authoring prompt exits 0', () => {
  assert.equal(okBody(kernel(['scale', '--prompt', 'write a spec for the payment flow']))['spec_authoring'], true);
});

test('scale neutral prompt exits 0', () => {
  const answer = okBody(kernel(['scale', '--prompt', 'what time is it']));
  assert.equal(answer['big_task'], false);
  assert.equal(answer['spec_authoring'], false);
  assert.equal(answer['design_work'], false);
});

// design_weak ("design") alone, with no action verb, must NOT count as design_work.
test('scale weak-design prompt exits 0', () => {
  assert.equal(okBody(kernel(['scale', '--prompt', 'the button design looks good']))['design_work'], false);
});

// --------------------------------------------------------- risk fail-closed

test('risk with neither inputs nor floors is an error, not low', () => {
  errorMessage(kernel(['risk', '--signals', '{}']));
});

test('risk with empty inputs and no floors is an error', () => {
  errorMessage(kernel(['risk', '--signals', '{"inputs":{}}']));
});

test('risk with a floor and no inputs is still answerable', () => {
  assert.equal(okBody(kernel(['risk', '--signals', '{"floors":["destructive-ddl-dml"]}']))['risk'], 'high');
});
