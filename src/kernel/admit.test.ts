import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError, isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, tempRoot } from '../testing/harness';
import { lazyRegistries, type Registries } from './context';
import { admitSection } from './admit';

// The cases of `run admit` in scripts/test-kernel.sh, at section level. Every
// number comes from the registry the section itself reads, so re-parameterising
// the cap or the queue bound moves the fixtures instead of turning them red — a
// literal inflight of 3 was "below the cap" only for as long as the cap was 6.
const regs = lazyRegistries(resolveRoot({}, __dirname));
const CAP = regs.policy.parallelism.wave_concurrency_cap;
const MAX_QUEUED = regs.policy.parallelism.backpressure.max_queued_units;
const OVERLOAD = regs.policy.parallelism.backpressure.overload_action;
// A load strictly inside any cap >= 1, derived from the cap itself.
const PARTIAL = Math.floor(CAP / 2);

test('idle capacity dispatches, and reports the whole cap', () => {
  const section = admitSection({ inflight: 0, queued: 0 }, regs);
  assert.deepEqual(Object.keys(section), ['action', 'capacity', 'reason']);
  assert.equal(section.action, 'dispatch');
  assert.equal(section.capacity, CAP);
  assert.equal(section.reason, `inflight 0 below cap ${CAP}`);
});

// capacity is cap - inflight, not a constant: a partial load under the cap must
// report the remainder, which a hardcoded cap would get wrong.
test('a partial load dispatches with the remaining capacity', () => {
  const section = admitSection({ inflight: PARTIAL, queued: 0 }, regs);
  assert.equal(section.action, 'dispatch');
  assert.equal(section.capacity, CAP - PARTIAL);
});

test('at the cap the queue absorbs the unit with the declared overload action', () => {
  const section = admitSection({ inflight: CAP, queued: 0 }, regs);
  assert.equal(section.action, OVERLOAD);
  assert.equal(section.capacity, 0);
  assert.equal(section.reason, `cap ${CAP} reached; 0 of ${MAX_QUEUED} queued — hold the unit for the next wave`);
});

// over the cap with room in the queue is still the overload action, not reject.
test('over the cap with a non-full queue is still the overload action', () => {
  const section = admitSection({ inflight: CAP + 1, queued: MAX_QUEUED - 1 }, regs);
  assert.equal(section.action, 'defer');
  assert.equal(section.capacity, 0);
});

test('at the cap with a full queue rejects, and names the HITL trigger', () => {
  const section = admitSection({ inflight: CAP, queued: MAX_QUEUED }, regs);
  assert.equal(section.action, 'reject');
  assert.equal(section.capacity, 0);
  assert.equal(
    section.reason,
    `cap ${CAP} reached and queue full (${MAX_QUEUED}/${MAX_QUEUED}) — stop planning, report BLOCKED, re-plan with a human (hitl: budget-exhausted)`,
  );
  // Check C26d greps the source for this literal; the answer must carry it too.
  assert.ok(section.reason.includes('hitl: budget-exhausted'));
});

test('a load that is not a whole non-negative count is refused', () => {
  const inflight = 'admit requires a numeric --inflight';
  const queued = 'admit requires a numeric --queued';
  assert.throws(() => admitSection({ inflight: -1, queued: 0 }, regs), kernelError(inflight));
  assert.throws(() => admitSection({ inflight: 1.5, queued: 0 }, regs), kernelError(inflight));
  assert.throws(() => admitSection({ inflight: Number.NaN, queued: 0 }, regs), kernelError(inflight));
  assert.throws(() => admitSection({ inflight: 1, queued: -1 }, regs), kernelError(queued));
  assert.throws(() => admitSection({ inflight: 1, queued: 1.5 }, regs), kernelError(queued));
});

// Fail-closed, against relocated copies so the checkout's registries are never
// touched. The control comes first: without it, a refusal below could be
// satisfied by a relocated tree failing for some reason other than the planted
// one, and every case would pass vacuously.
test('a relocated copy with an unmutated policy still answers', (t) => {
  const section = admitSection({ inflight: 0, queued: 0 }, relocated(t));
  assert.equal(section.action, 'dispatch');
});

test('a policy with no wave_concurrency_cap is refused, and the error names the field', (t) => {
  const mutated = relocated(t, (p) => {
    delete parallelism(p)['wave_concurrency_cap'];
  });
  assert.throws(
    () => admitSection({ inflight: 0, queued: 0 }, mutated),
    kernelError('registries/policy.json: .parallelism.wave_concurrency_cap must be a number'),
  );
});

test('a policy with no max_queued_units is refused instead of comparing against null', (t) => {
  const mutated = relocated(t, (p) => {
    delete backpressure(p)['max_queued_units'];
  });
  assert.throws(
    () => admitSection({ inflight: 0, queued: 0 }, mutated),
    kernelError('registries/policy.json: .parallelism.backpressure.max_queued_units must be a number'),
  );
});

test('a policy with no backpressure block is refused', (t) => {
  const mutated = relocated(t, (p) => {
    delete parallelism(p)['backpressure'];
  });
  assert.throws(
    () => admitSection({ inflight: 0, queued: 0 }, mutated),
    kernelError('registries/policy.json: .parallelism.backpressure must be an object'),
  );
});

// The overload action is checked against the registry's own declared vocabulary:
// a hand-edited value was emitted VERBATIM by the bash arm before its guard, so
// the kernel handed an orchestrator an action nothing can execute.
test('an overload_action outside the declared actions is refused', (t) => {
  const mutated = relocated(t, (p) => {
    backpressure(p)['overload_action'] = 'launch-the-missiles';
  });
  assert.throws(
    () => admitSection({ inflight: CAP, queued: 0 }, mutated),
    kernelError(
      'policy.json parallelism.backpressure.overload_action is not one of the declared backpressure.actions — admit will not emit an action the registry does not declare',
    ),
  );
});

// A guard that rejected every value would satisfy the case above while breaking
// the normal path.
test('a declared overload_action is still answerable, and is the one emitted', (t) => {
  const mutated = relocated(t, (p) => {
    backpressure(p)['overload_action'] = 'reject';
  });
  assert.equal(admitSection({ inflight: CAP, queued: 0 }, mutated).action, 'reject');
});

function relocated(t: TestContext, mutate?: (policy: Record<string, unknown>) => void): Registries {
  const root = mutate === undefined ? relocatedRoot(tempRoot(t)) : relocatedRoot(tempRoot(t), { mutate });
  return lazyRegistries(root);
}

function parallelism(policy: Record<string, unknown>): Record<string, unknown> {
  const value = policy['parallelism'];
  if (!isRecord(value)) throw new Error('fixture parallelism is not an object');
  return value;
}

function backpressure(policy: Record<string, unknown>): Record<string, unknown> {
  const value = parallelism(policy)['backpressure'];
  if (!isRecord(value)) throw new Error('fixture backpressure is not an object');
  return value;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
