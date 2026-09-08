import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (the hitl block, including the
// resolve-task cases that block owns: they are about what a CLASSIFIED tier,
// versus a bare risk floor, does to the hitl answer, and about the admit/hitl
// coupling on the budget-exhausted reason id).
//
// The record home, the situation list, the reason vocabulary and the
// thin-evidence ceiling come from the registry, so renaming a reason or adding a
// situation MOVES these fixtures rather than turning them red. The tiers and
// autonomy levels stay literal on purpose: they are the INPUTS the kernel is
// asked about, not registry data being mirrored back.

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
const INTENTS = record(readJsonFile(join(ROOT, 'registries', 'intents.json')), 'registries/intents.json');

function policyAt(...keys: string[]): unknown {
  let cursor: unknown = POLICY;
  for (const key of keys) cursor = record(cursor, `policy.json .${keys.join('.')}`)[key];
  return cursor;
}

// An unusable value is a loud abort rather than fixtures computing nonsense off
// an empty string — the bash suite's `case ... exit 2` guard.
function policyCount(...keys: string[]): number {
  const value = policyAt(...keys);
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`policy.json ${keys.join('.')} is unusable: [${String(value)}]`);
  }
  return value;
}

function policyText(...keys: string[]): string {
  const value = policyAt(...keys);
  if (typeof value !== 'string' || value === '') {
    throw new Error(`policy.json ${keys.join('.')} is unusable: [${String(value)}]`);
  }
  return value;
}

const CAP = policyCount('parallelism', 'wave_concurrency_cap');
const MAXQ = policyCount('parallelism', 'backpressure', 'max_queued_units');
const RECORD_HOME = policyText('hitl', 'record_home');
const THIN_HIGH = policyText('autonomy', 'high_with_thin_evidence');
const HITL_REASONS = stringList(policyAt('hitl', 'reasons'), 'policy.json .hitl.reasons');
const DECLARED_SITUATIONS = [
  ...stringList(policyAt('retry', 'never_retry'), 'policy.json .retry.never_retry'),
  ...stringList(policyAt('hitl', 'situations'), 'policy.json .hitl.situations'),
];

// The floor the security-files intent declares. The intent id is named because
// the prompt has to be written to match some specific intent, so it cannot be
// derived; the floor itself is read, so a registry change moves the fixture.
function securityFilesFloor(): string {
  const rows = INTENTS['intents'];
  if (!Array.isArray(rows)) throw new Error('registries/intents.json .intents is not an array');
  for (const [i, raw] of rows.entries()) {
    const row = record(raw, `registries/intents.json .intents[${i}]`);
    if (row['id'] === 'security-files') {
      const floor = row['risk_floor'];
      if (typeof floor !== 'string') throw new Error('the security-files intent declares no risk_floor');
      return floor;
    }
  }
  throw new Error('registries/intents.json declares no security-files intent');
}

const SECURITY_FILES_FLOOR = securityFilesFloor();

// ------------------------------------------------------------------------ hitl

test('hitl low/A2 exits 0', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2']));
  assert.equal(answer['required'], false);
  assert.deepEqual(answer['reasons'], []);
  // A no-HITL answer must still hand back the ceiling it was given.
  assert.equal(answer['autonomy_after'], 'A2');
  assert.equal(answer['record_home'], RECORD_HOME);
  assert.deepEqual(Object.keys(answer).sort(), ['autonomy_after', 'reasons', 'record_home', 'required']);
});

test('hitl high required', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3']));
  assert.equal(answer['required'], true);
  assert.deepEqual(answer['reasons'], ['high-risk']);
  // required and autonomy_after are the two fields a gate switches on; asserting
  // only one would let a kernel that always dropped to A1 through.
  assert.equal(answer['autonomy_after'], 'A3');
});

test('hitl external effect at A3 required', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A3', '--external-effect', 'true']));
  assert.deepEqual(answer['reasons'], ['external-effect']);
});

// below A3 an external effect is not reachable, so it must NOT be a reason
test('hitl external effect below A3 is not a reason', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A2', '--external-effect', 'true']));
  assert.deepEqual(answer['reasons'], []);
  assert.equal(answer['required'], false);
});

// Thin evidence DROPS autonomy one level and never raises it.
test('thin evidence at medium/A2 drops one level', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A2', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A1');
  assert.deepEqual(answer['reasons'], ['evidence-insufficient']);
});

test('thin evidence at low/A2 drops one level', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A1');
});

test('thin evidence at medium/A3 drops ONE level, not to A1', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A3', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A2');
});

test('thin evidence at low/A4 drops one level', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A4', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A3');
});

// The inversion this field existed to prevent: a drop must never hand back MORE
// autonomy than it was given.
test('thin evidence at low/A0 stays A0 and never raises', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A0', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A0');
});

test('thin evidence at high/A0 stays A0 and never raises', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'high', '--autonomy', 'A0', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A0');
});

test('thin evidence at medium/A1 bottoms out at A1', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A1', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], 'A1');
});

// Risk high is the one tier the registry overrides, and the expected value is
// read from the field itself so a policy change moves the fixture with it.
test('thin evidence at high/A3 lands on autonomy.high_with_thin_evidence', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], THIN_HIGH);
});

test('thin evidence at high/A4 lands on autonomy.high_with_thin_evidence', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'high', '--autonomy', 'A4', '--evidence', 'thin']));
  assert.equal(answer['autonomy_after'], THIN_HIGH);
});

// Adequate evidence is the identity: without this half a kernel that always
// dropped would pass every case above.
test('adequate evidence at medium/A3 keeps the given ceiling', () => {
  assert.equal(okBody(kernel(['hitl', '--risk', 'medium', '--autonomy', 'A3']))['autonomy_after'], 'A3');
});

test('adequate evidence at low/A0 keeps A0', () => {
  assert.equal(okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A0']))['autonomy_after'], 'A0');
});

test('never-retry situation is a hitl reason', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'security-risk']));
  assert.deepEqual(answer['reasons'], ['never-retry-situation']);
});

test('backpressure reject maps to budget-exhausted', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'reject']));
  assert.deepEqual(answer['reasons'], ['budget-exhausted']);
});

test('open breaker is a hitl reason', () => {
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'breaker-open']));
  assert.deepEqual(answer['reasons'], ['breaker-open']);
});

test('reasons accumulate in fixed order', () => {
  const answer = okBody(
    kernel(['hitl', '--risk', 'high', '--autonomy', 'A3', '--conflict', 'true', '--external-effect', 'true']),
  );
  assert.deepEqual(answer['reasons'], ['high-risk', 'external-effect', 'policy-conflict']);
});

// Every declared situation must produce at least one reason from the closed
// vocabulary. A situation the kernel accepts and then drops would answer
// required:false — "no human needed" for an input the kernel did not act on.
for (const situation of DECLARED_SITUATIONS) {
  test(`situation ${situation} requires a human and cites only declared reasons`, () => {
    const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', situation]));
    assert.equal(answer['required'], true);
    const undeclared = stringList(answer['reasons'], '.reasons').filter((reason) => !HITL_REASONS.includes(reason));
    assert.deepEqual(undeclared, []);
  });
}

test('unknown situation is an error', () => {
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'nonsense']));
});

test('hitl requires --risk', () => {
  errorMessage(kernel(['hitl', '--autonomy', 'A2']));
});

test('hitl requires --autonomy', () => {
  errorMessage(kernel(['hitl', '--risk', 'low']));
});

test('hitl rejects an autonomy level outside A0..A4', () => {
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A9']));
});

test('hitl rejects an unknown --evidence', () => {
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--evidence', 'maybe']));
});

test('hitl rejects a non-boolean --conflict', () => {
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--conflict', 'yes']));
});

test('hitl with an unknown argument errors', () => {
  errorMessage(kernel(['hitl', '--bogus', 'x']));
});

// a trailing flag with no value must error, not spin the arg loop forever
test('hitl with a valueless --risk errors instead of hanging', () => {
  errorMessage(kernel(['hitl', '--risk']));
});

test('hitl with a valueless --situation errors instead of hanging', () => {
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation']));
});

// resolve-task carries the answer, so an adapter needs one call, not two — but
// only for a CLASSIFIED tier. A matched decision rule carrying risk=high is a
// classification: this prompt trips rule-destructive-ddl and rule-production-write.
test('resolve-task with a destructive prompt exits 0', () => {
  const answer = okBody(kernel(['resolve-task', '--prompt', 'drop the users table in production']));
  assert.equal(record(answer['decision_rules'], '.decision_rules')['any_high'], true);
  const hitl = record(answer['hitl'], '.hitl');
  assert.equal(hitl['required'], true);
  // The whole list, not a subset: no --conflict is synthesized from any_high, so
  // a conflict nobody observed is never claimed, and a reason creeping back in
  // fails here.
  assert.deepEqual(hitl['reasons'], ['high-risk']);
});

// The mirror, and the point of the whole distinction: a risk FLOOR is an input to
// classification, not a classification. security-files carries a high risk_floor,
// so the old shape announced a human gate on every auth-guard edit — gate theatre.
// task_contract.risk_floor is asserted alongside because otherwise `hitl: null`
// proves nothing.
test('resolve-task with a floor-only prompt exits 0', () => {
  const answer = okBody(kernel(['resolve-task', '--prompt', 'fix the auth guard bug']));
  const contract = record(answer['task_contract'], '.task_contract');
  assert.deepEqual(contract['intents'], ['security-files']);
  assert.equal(record(answer['decision_rules'], '.decision_rules')['any_high'], false);
  assert.equal(contract['risk_floor'], SECURITY_FILES_FLOOR);
  assert.equal(answer['hitl'], null);
  // The floor is carried in exactly one place; a second top-level copy shipped
  // once with no reader, so its absence is asserted rather than left to drift back.
  assert.equal('risk_floor' in answer, false);
});

// No intent, no rule, no scale signal: no floor either, and still no hitl. This
// separates "hitl null because the floor is unclassified" from "hitl null because
// there is no risk evidence at all".
test('resolve-task with no risk evidence exits 0', () => {
  const answer = okBody(kernel(['resolve-task', '--prompt', 'what does this function return?']));
  assert.equal(record(answer['task_contract'], '.task_contract')['risk_floor'], null);
  assert.equal(answer['hitl'], null);
});

// The coupling, from the caller's side: admit's reject message embeds the literal
// "hitl: budget-exhausted", and `hitl --situation reject` must answer with that
// same id. The id is read from the registry rather than spelled here.
test("hitl.reasons declares the id admit's reject message cites", () => {
  assert.ok(HITL_REASONS.includes('budget-exhausted'));
});

test("admit's reject reason names the hitl id, and hitl answers with it", () => {
  const admitted = okBody(kernel(['admit', '--inflight', String(CAP), '--queued', String(MAXQ)]));
  const reason = admitted['reason'];
  assert.equal(typeof reason, 'string');
  assert.ok(String(reason).includes('hitl: budget-exhausted'));
  const answer = okBody(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'reject']));
  assert.deepEqual(answer['reasons'], ['budget-exhausted']);
});

// With .hitl absent, the situation allowlist reads every situation as unknown and
// any answer that got through would carry a null record_home at exit 0.
test('hitl with no hitl policy block errors (fail-closed, never a null record_home)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['hitl'];
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2'], { ENGINEOS_ROOT: root }));
});

test('hitl with no hitl policy block errors even on the required path', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['hitl'];
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3'], { ENGINEOS_ROOT: root }));
});

// ... and the KEY, not just the block: deleting hitl.record_home alone once
// answered {"required":true,...,"record_home":null} at rc=0 — a caller told a
// human must decide and given nowhere to record the decision.
test('hitl with no hitl.record_home errors (fail-closed, never a null record home)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['hitl'], '.hitl')['record_home'];
    },
  });
  const message = errorMessage(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3'], { ENGINEOS_ROOT: root }));
  assert.ok(message.includes('record_home'), `the error must name the field, got: ${message}`);
});

test('hitl with no hitl.record_home errors on the not-required path too', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['hitl'], '.hitl')['record_home'];
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'low', '--autonomy', 'A2'], { ENGINEOS_ROOT: root }));
});

// The control: the same relocated shape with the key intact still answers, and
// still answers with the registry's own value.
test('a relocated kernel copy with record_home intact still answers hitl', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t));
  const answer = okBody(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3'], { ENGINEOS_ROOT: root }));
  assert.equal(answer['record_home'], RECORD_HOME);
});

// Same shape for the other registry value the answer depends on. The node runtime
// goes further than the bash one: its policy loader is strict, so a malformed
// policy.json is refused at load and even the adequate-evidence path (which never
// reads the field) fails closed.
test('hitl errors when autonomy.high_with_thin_evidence is missing', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['autonomy'], '.autonomy')['high_with_thin_evidence'];
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3', '--evidence', 'thin'], { ENGINEOS_ROOT: root }));
});

test('hitl refuses with adequate evidence too: a malformed policy.json never answers', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['autonomy'], '.autonomy')['high_with_thin_evidence'];
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3'], { ENGINEOS_ROOT: root }));
});

test('hitl errors when autonomy.high_with_thin_evidence is not a level id', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      record(policy['autonomy'], '.autonomy')['high_with_thin_evidence'] = 'sideways';
    },
  });
  errorMessage(kernel(['hitl', '--risk', 'high', '--autonomy', 'A3', '--evidence', 'thin'], { ENGINEOS_ROOT: root }));
});
