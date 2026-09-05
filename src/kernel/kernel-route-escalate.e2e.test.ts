import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (the route-escalate and resolve-task
// blocks). Spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md,
// "Test surface". The registry fixtures are looped from policy.json, so a new
// router fixture is covered here automatically.

const ROOT = resolveRoot({}, __dirname);

function kernel(args: string[], env: Record<string, string> = {}): RunResult {
  return runCli(['kernel', ...args], { env });
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

function stringList(value: unknown, at: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${at} is not an array`);
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error(`${at} holds a non-string`);
    return item;
  });
}

const POLICY = record(readJsonFile(join(ROOT, 'registries', 'policy.json')), 'registries/policy.json');

interface RouterFixture {
  prompt: string;
  escalate: boolean;
  reasons: string[];
}

function routerFixtures(): RouterFixture[] {
  const rows = record(POLICY['router'], 'policy.json .router')['fixtures'];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('policy.json .router.fixtures is unusable');
  return rows.map((raw, i) => {
    const row = record(raw, `policy.json .router.fixtures[${i}]`);
    const prompt = row['prompt'];
    const escalate = row['escalate'];
    if (typeof prompt !== 'string' || typeof escalate !== 'boolean') {
      throw new Error(`policy.json .router.fixtures[${i}] is malformed`);
    }
    return { prompt, escalate, reasons: stringList(row['reasons'], `.router.fixtures[${i}].reasons`) };
  });
}

// The `by` of one suppressed intent — the field the bash suite read with
// `[.suppressed[] | select(.id==...) | .by][0]`.
function suppressedBy(answer: Record<string, unknown>, id: string): unknown {
  const rows = answer['suppressed'];
  if (!Array.isArray(rows)) throw new Error('.suppressed is not an array');
  for (const [i, raw] of rows.entries()) {
    const row = record(raw, `.suppressed[${i}]`);
    if (row['id'] === id) return row['by'];
  }
  return undefined;
}

// ------------------------------------------------------------- route-escalate

for (const fixture of routerFixtures()) {
  test(`route-escalate fixture: ${fixture.prompt}`, () => {
    const answer = okBody(kernel(['route-escalate', '--prompt', fixture.prompt]));
    assert.equal(answer['escalate'], fixture.escalate);
    assert.deepEqual(stringList(answer['reasons'], '.reasons').sort(), [...fixture.reasons].sort());
  });
}

// Suppression: a suppressible fallback (new-feature) drops when a more specific
// stack row also matches.
test('suppression (new-feature) prompt exits 0', () => {
  const prompt = 'add a paginated orders endpoint to the API and mirror the screen to mobile';
  const answer = okBody(kernel(['route-escalate', '--prompt', prompt]));
  assert.equal(stringList(answer['intents'], '.intents').sort().join(','), 'backend,mobile');
  assert.equal(suppressedBy(answer, 'new-feature'), 'more-specific-match');
});

// Suppression: mobile is suppressed_by ios-release/android-release when a
// store-release row also matches (raw matches verified: mobile, ios-release).
test('suppression (mobile/ios-release) prompt exits 0', () => {
  const answer = okBody(kernel(['route-escalate', '--prompt', 'publish to App Store the iOS app screen']));
  assert.equal(stringList(answer['intents'], '.intents').join(','), 'ios-release');
  assert.equal(suppressedBy(answer, 'mobile'), 'ios-release');
});

// Aggregation: model_tier/risk_floor are max-by-lookup over surviving intents,
// never a naive last-match or first-match.
test('aggregation prompt exits 0', () => {
  const prompt = 'add a paginated orders endpoint to the API and mirror the screen to mobile';
  const answer = okBody(kernel(['route-escalate', '--prompt', prompt]));
  assert.notEqual(answer['model_tier'], null);
  assert.notEqual(answer['risk_floor'], null);
});

// A deliberately meaningless string, not a realistic prompt: this case exists to
// prove the zero-intent branch aggregates to null, and a realistic prompt would
// make it vacuous the moment routing improves.
test('no matched intent -> model_tier and risk_floor null, intents empty', () => {
  const answer = okBody(kernel(['route-escalate', '--prompt', 'zzqq wibble frobnicate']));
  assert.equal(answer['model_tier'], null);
  assert.equal(answer['risk_floor'], null);
  assert.deepEqual(answer['intents'], []);
});

// The regression guard against the bug intent's signal dying again: this is the
// prompt that used to prove "no match" only because that signal was a dead
// placeholder.
test('a real bug report resolves the bug intent', () => {
  const answer = okBody(kernel(['route-escalate', '--prompt', 'why does the login handler fail with a 500']));
  assert.deepEqual(answer['intents'], ['bug']);
  assert.equal(answer['model_tier'], 'design');
});

// Non-triggers stay non-triggers. "migration" (singular) is deliberately avoided:
// it is one of big-sweep's own signals, so a prompt containing it also escalates
// via requires-dispatch-plan. "query perf" is dba-only and signal-clean.
test('dba-only prompt exits 0', () => {
  const answer = okBody(kernel(['route-escalate', '--prompt', 'improve query perf on the orders table']));
  assert.equal(stringList(answer['intents'], '.intents').join(','), 'dba');
  assert.equal(answer['escalate'], false);
});

test('divergent tier/floor across suppressed matches is not a trigger', () => {
  const answer = okBody(kernel(['route-escalate', '--prompt', 'build the ios release and upload to TestFlight']));
  assert.equal(answer['escalate'], false);
});

// Errors: fail-closed, not silently ignored.
test('route-escalate with no --prompt errors', () => {
  errorMessage(kernel(['route-escalate']));
});

test('route-escalate with unknown argument errors', () => {
  errorMessage(kernel(['route-escalate', '--bogus', 'x']));
});

// The fail-closed router-block case, run as a MATCHED PAIR against relocated
// copies: without the `with` control, the `without` half could error for any
// reason at all and still satisfy the assertion, which would make the
// fail-closed claim vacuous. Nothing here touches the tracked registries.
test('relocated kernel copy with the router block intact still answers route-escalate', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t));
  okBody(kernel(['route-escalate', '--prompt', 'add a feature'], { ENGINEOS_ROOT: root }));
});

test('route-escalate with no router policy block errors (fail-closed)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['router'];
    },
  });
  const message = errorMessage(kernel(['route-escalate', '--prompt', 'add a feature'], { ENGINEOS_ROOT: root }));
  assert.ok(message.includes('router'), `the error must name the missing block, got: ${message}`);
});

// -------------------------------------------------------------- resolve-task

function taskContract(answer: Record<string, unknown>): Record<string, unknown> {
  return record(answer['task_contract'], '.task_contract');
}

test('resolve-task substantive prompt exits 0', () => {
  const prompt = 'add a paginated orders endpoint and mirror the screen to mobile';
  const contract = taskContract(okBody(kernel(['resolve-task', '--prompt', prompt])));
  assert.deepEqual(contract['intents'], ['mobile']);
  assert.deepEqual(contract['agents'], ['mobile-coordinator']);
  assert.ok(stringList(contract['required'], '.task_contract.required').includes('design-doc'));
  assert.equal(contract['risk_floor'], 'medium');
  const rules = stringList(contract['policy_rules'], '.task_contract.policy_rules');
  assert.ok(rules.includes('subagents'));
  assert.ok(rules.includes('models'));
});

test('resolve-task high-risk prompt exits 0', () => {
  const contract = taskContract(okBody(kernel(['resolve-task', '--prompt', 'deploy the billing service to production'])));
  assert.equal(contract['risk_floor'], 'high');
  assert.equal(contract['autonomy_ceiling_at_floor'], 'A3');
  assert.ok(stringList(contract['gates'], '.task_contract.gates').includes('release'));
});

test('resolve-task pure prompt exits 0', () => {
  const contract = taskContract(okBody(kernel(['resolve-task', '--prompt', 'the weather is nice today'])));
  assert.equal(contract['substantive'], false);
  assert.deepEqual(contract['policy_rules'], []);
});

test('resolve-task unrouted action prompt exits 0', () => {
  const contract = taskContract(okBody(kernel(['resolve-task', '--prompt', 'update the prose in this document'])));
  assert.equal(contract['substantive'], true);
  const rules = stringList(contract['policy_rules'], '.task_contract.policy_rules');
  assert.ok(rules.includes('gates'));
  assert.ok(rules.includes('risk-autonomy'));
  assert.ok(rules.includes('verification'));
});

test('resolve-task with no --prompt errors', () => {
  errorMessage(kernel(['resolve-task']));
});
