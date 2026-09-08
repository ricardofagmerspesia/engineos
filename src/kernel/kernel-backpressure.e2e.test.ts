import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (the admit and breaker blocks; the
// hitl block is kernel-hitl.e2e.test.ts).
//
// Every number below comes from the registry, so re-parameterising policy.json
// MOVES a fixture instead of turning it red. The tiers and autonomy levels stay
// literal on purpose: they are the INPUTS the kernel is asked about, not registry
// data being mirrored back.

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

const POLICY = record(readJsonFile(join(ROOT, 'registries', 'policy.json')), 'registries/policy.json');

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
const OVERLOAD_ACTION = policyText('parallelism', 'backpressure', 'overload_action');
const THRESHOLD = policyCount('breaker', 'failure_threshold');

// ----------------------------------------------------------------------- admit

// PARTIAL is a load strictly inside any cap >= 1, derived from the cap itself:
// an inflight of 3 was "below the cap" solely because the cap is 6 today.
const PARTIAL = Math.floor(CAP / 2);

test('admit with idle capacity exits 0', () => {
  const answer = okBody(kernel(['admit', '--inflight', '0', '--queued', '0']));
  assert.equal(answer['action'], 'dispatch');
  assert.equal(answer['capacity'], CAP);
});

// capacity is cap - inflight, not a constant: a partial load under the cap must
// report the remainder, which a hardcoded cap would get wrong.
test('admit with a partial load -> dispatch', () => {
  const answer = okBody(kernel(['admit', '--inflight', String(PARTIAL), '--queued', '0']));
  assert.equal(answer['action'], 'dispatch');
  assert.equal(answer['capacity'], CAP - PARTIAL);
  assert.deepEqual(Object.keys(answer).sort(), ['action', 'capacity', 'reason']);
});

// a trailing flag with no value must error, not spin the arg loop forever
test('admit with a valueless --inflight errors instead of hanging', () => {
  errorMessage(kernel(['admit', '--inflight']));
});

test('admit at cap -> overload_action', () => {
  const answer = okBody(kernel(['admit', '--inflight', String(CAP), '--queued', '0']));
  assert.equal(answer['action'], OVERLOAD_ACTION);
  assert.equal(answer['capacity'], 0);
});

// over the cap with room in the queue is still the overload action, not reject.
// The queued count is MAXQ - 1 rather than a literal: any literal is "a non-full
// queue" only for as long as max_queued_units stays above it.
test('admit over cap with a non-full queue -> defer', () => {
  const answer = okBody(kernel(['admit', '--inflight', String(CAP + 1), '--queued', String(MAXQ - 1)]));
  assert.equal(answer['action'], 'defer');
});

test('admit at cap and queue full -> reject', () => {
  const answer = okBody(kernel(['admit', '--inflight', String(CAP), '--queued', String(MAXQ)]));
  assert.equal(answer['action'], 'reject');
  // `hitl --situation reject` keys on this literal.
  const reason = answer['reason'];
  assert.equal(typeof reason, 'string');
  assert.ok(String(reason).includes('budget-exhausted'));
});

// a leading zero is a shell-ism, not a JSON number: it normalises, and must never
// surface as a bare parse error
test('admit normalises a leading-zero --inflight', () => {
  const answer = okBody(kernel(['admit', '--inflight', '02', '--queued', '0']));
  assert.equal(answer['capacity'], CAP - 2);
});

test('admit rejects a non-numeric --inflight', () => {
  errorMessage(kernel(['admit', '--inflight', 'abc', '--queued', '0']));
});

test('admit rejects a non-numeric --queued', () => {
  errorMessage(kernel(['admit', '--inflight', '1', '--queued', 'abc']));
});

test('admit requires --queued', () => {
  errorMessage(kernel(['admit', '--inflight', '1']));
});

// admit fail-closed. The control comes first: without it, an error below could be
// satisfied by a relocated tree that fails for some reason other than the planted
// one, and every case would pass vacuously.
test('a relocated kernel copy with an unmutated policy still answers admit', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t));
  okBody(kernel(['admit', '--inflight', '0', '--queued', '0'], { ENGINEOS_ROOT: root }));
});

test('admit with no wave_concurrency_cap errors on stdout (fail-closed)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['parallelism'], '.parallelism')['wave_concurrency_cap'];
    },
  });
  const message = errorMessage(kernel(['admit', '--inflight', '0', '--queued', '0'], { ENGINEOS_ROOT: root }));
  assert.ok(message.includes('wave_concurrency_cap'), `the error must name the field, got: ${message}`);
});

test('admit with no max_queued_units errors instead of comparing against null', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(record(policy['parallelism'], '.parallelism')['backpressure'], '.parallelism.backpressure')[
        'max_queued_units'
      ];
    },
  });
  errorMessage(kernel(['admit', '--inflight', '0', '--queued', '0'], { ENGINEOS_ROOT: root }));
});

test('admit with no backpressure block errors (fail-closed)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete record(policy['parallelism'], '.parallelism')['backpressure'];
    },
  });
  errorMessage(kernel(['admit', '--inflight', '0', '--queued', '0'], { ENGINEOS_ROOT: root }));
});

// Verified before the guard: rc=0 with the string emitted VERBATIM as the action,
// so the kernel would hand an orchestrator an action outside the registry's own
// declared vocabulary.
test('admit refuses an overload_action outside the declared actions list', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      record(record(policy['parallelism'], '.parallelism')['backpressure'], '.parallelism.backpressure')[
        'overload_action'
      ] = 'launch-the-missiles';
    },
  });
  const result = kernel(['admit', '--inflight', String(CAP), '--queued', '0'], { ENGINEOS_ROOT: root });
  const message = errorMessage(result);
  assert.ok(message.includes('actions'), `the error must name the actions list, got: ${message}`);
  assert.equal('action' in body(result), false);
});

// The declared action itself must still be answerable — a guard that rejected
// every value would satisfy the case above while breaking the normal path.
test('admit still answers when overload_action is a declared action', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      record(record(policy['parallelism'], '.parallelism')['backpressure'], '.parallelism.backpressure')[
        'overload_action'
      ] = 'reject';
    },
  });
  const answer = okBody(kernel(['admit', '--inflight', String(CAP), '--queued', '0'], { ENGINEOS_ROOT: root }));
  assert.equal(answer['action'], 'reject');
});

// --------------------------------------------------------------------- breaker

test('breaker with a healthy resource exits 0', () => {
  const answer = okBody(kernel(['breaker', '--state', 'closed', '--failures', '0']));
  assert.equal(answer['state'], 'closed');
  assert.equal(answer['allow'], true);
  assert.deepEqual(Object.keys(answer).sort(), ['allow', 'reason', 'state']);
});

// one below the threshold must NOT trip: a kernel that always opened would
// otherwise pass on the threshold case alone
test('closed one failure below the threshold stays closed', () => {
  const answer = okBody(kernel(['breaker', '--state', 'closed', '--failures', String(THRESHOLD - 1)]));
  assert.equal(answer['state'], 'closed');
});

test('closed at threshold opens', () => {
  const answer = okBody(kernel(['breaker', '--state', 'closed', '--failures', String(THRESHOLD)]));
  assert.equal(answer['state'], 'open');
  assert.equal(answer['allow'], false);
});

test('open before cooldown stays open', () => {
  assert.equal(okBody(kernel(['breaker', '--state', 'open', '--cooldown-elapsed', 'false']))['state'], 'open');
});

test('open after cooldown goes half-open', () => {
  const answer = okBody(kernel(['breaker', '--state', 'open', '--cooldown-elapsed', 'true']));
  assert.equal(answer['state'], 'half-open');
  assert.equal(answer['allow'], true);
});

test('successful probe closes', () => {
  assert.equal(okBody(kernel(['breaker', '--state', 'half-open', '--probe-result', 'ok']))['state'], 'closed');
});

test('failed probe reopens', () => {
  assert.equal(okBody(kernel(['breaker', '--state', 'half-open', '--probe-result', 'failed']))['state'], 'open');
});

test('closed requires --failures', () => {
  errorMessage(kernel(['breaker', '--state', 'closed']));
});

test('open requires --cooldown-elapsed', () => {
  errorMessage(kernel(['breaker', '--state', 'open']));
});

test('half-open requires --probe-result', () => {
  errorMessage(kernel(['breaker', '--state', 'half-open']));
});

test('unknown state is an error', () => {
  errorMessage(kernel(['breaker', '--state', 'bogus', '--failures', '1']));
});

test('breaker requires --state', () => {
  errorMessage(kernel(['breaker', '--failures', '1']));
});

test('breaker with a valueless --state errors instead of hanging', () => {
  errorMessage(kernel(['breaker', '--state']));
});

// The value is the threshold itself, so the expected answer (open) is one only a
// correctly parsed number produces — "00" would answer closed for any threshold
// >= 1 and discriminate nothing.
test('breaker normalises a leading-zero --failures', () => {
  const answer = okBody(kernel(['breaker', '--state', 'closed', '--failures', `0${THRESHOLD}`]));
  assert.equal(answer['state'], 'open');
});

test('breaker rejects a non-numeric --failures', () => {
  errorMessage(kernel(['breaker', '--state', 'closed', '--failures', 'abc']));
});

test('breaker rejects a non-boolean --cooldown-elapsed', () => {
  errorMessage(kernel(['breaker', '--state', 'open', '--cooldown-elapsed', 'maybe']));
});

test('breaker rejects an unknown --probe-result', () => {
  errorMessage(kernel(['breaker', '--state', 'half-open', '--probe-result', 'maybe']));
});

// With .breaker absent, a comparison against null once held and the kernel
// answered {"state":"open","allow":false} at exit 0 — a healthy resource reported
// open. Fail closed instead.
test('breaker with no breaker policy block errors (fail-closed, never a fabricated open)', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['breaker'];
    },
  });
  errorMessage(kernel(['breaker', '--state', 'closed', '--failures', '0'], { ENGINEOS_ROOT: root }));
});
