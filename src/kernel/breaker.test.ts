import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError, isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, tempRoot } from '../testing/harness';
import { lazyRegistries, type Registries } from './context';
import { breakerSection } from './breaker';

// The cases of `run breaker` in scripts/test-kernel.sh, at section level. Every
// number comes from the registry, so a threshold change moves the fixtures
// instead of turning them red.
const regs = lazyRegistries(resolveRoot({}, __dirname));
const THRESHOLD = regs.policy.breaker.failure_threshold;
const COOLDOWN_WAVES = regs.policy.breaker.cooldown_waves;
const PROBES = regs.policy.breaker.half_open_probes;

test('a healthy resource stays closed, and the answer is exactly {state, allow, reason}', () => {
  const section = breakerSection({ state: 'closed', failures: 0 }, regs);
  assert.deepEqual(Object.keys(section), ['state', 'allow', 'reason']);
  assert.equal(section.state, 'closed');
  assert.equal(section.allow, true);
  assert.equal(section.reason, `0 of ${THRESHOLD} failures — resource healthy`);
});

// one below the threshold must NOT trip: a table that always opened would
// otherwise pass on the threshold case alone.
test('one failure below the threshold stays closed', () => {
  assert.equal(breakerSection({ state: 'closed', failures: THRESHOLD - 1 }, regs).state, 'closed');
});

test('the threshold opens the breaker and blocks the resource', () => {
  const section = breakerSection({ state: 'closed', failures: THRESHOLD }, regs);
  assert.equal(section.state, 'open');
  assert.equal(section.allow, false);
  assert.equal(
    section.reason,
    `${THRESHOLD} consecutive failures reached threshold ${THRESHOLD} — stop calling this resource for ${COOLDOWN_WAVES} wave(s); route around or report DEGRADED`,
  );
});

test('open before the cooldown stays open', () => {
  const section = breakerSection({ state: 'open', cooldownElapsed: false }, regs);
  assert.equal(section.state, 'open');
  assert.equal(section.allow, false);
  assert.equal(section.reason, 'cooldown not elapsed — do not call; route around or report DEGRADED');
});

test('open after the cooldown goes half-open and allows the declared probes', () => {
  const section = breakerSection({ state: 'open', cooldownElapsed: true }, regs);
  assert.equal(section.state, 'half-open');
  assert.equal(section.allow, true);
  assert.equal(
    section.reason,
    `cooldown elapsed — allow ${PROBES} probe call(s); no fan-out through this resource until it closes`,
  );
});

test('a successful probe closes the breaker', () => {
  const section = breakerSection({ state: 'half-open', probeResult: 'ok' }, regs);
  assert.equal(section.state, 'closed');
  assert.equal(section.allow, true);
  assert.equal(section.reason, 'probe succeeded — resource recovered; reset the failure count to 0');
});

test('a failed probe reopens the breaker', () => {
  const section = breakerSection({ state: 'half-open', probeResult: 'failed' }, regs);
  assert.equal(section.state, 'open');
  assert.equal(section.allow, false);
  assert.equal(section.reason, 'probe failed — reopen for another cooldown');
});

test('each state requires its own fact, and refuses without it', () => {
  assert.throws(
    () => breakerSection({ state: 'closed' }, regs),
    kernelError('breaker --state closed requires a numeric --failures'),
  );
  assert.throws(
    () => breakerSection({ state: 'open' }, regs),
    kernelError('breaker --state open requires --cooldown-elapsed true|false'),
  );
  assert.throws(
    () => breakerSection({ state: 'half-open' }, regs),
    kernelError('breaker --state half-open requires --probe-result ok|failed'),
  );
});

test('a failure count that is not a whole non-negative number is refused', () => {
  const message = 'breaker --state closed requires a numeric --failures';
  assert.throws(() => breakerSection({ state: 'closed', failures: -1 }, regs), kernelError(message));
  assert.throws(() => breakerSection({ state: 'closed', failures: 1.5 }, regs), kernelError(message));
  assert.throws(() => breakerSection({ state: 'closed', failures: Number.NaN }, regs), kernelError(message));
});

test('an unknown probe result is refused', () => {
  assert.throws(
    () => breakerSection({ state: 'half-open', probeResult: 'maybe' }, regs),
    kernelError('breaker --state half-open requires --probe-result ok|failed'),
  );
});

test('an unknown state is refused', () => {
  const message = 'breaker requires --state closed|open|half-open';
  assert.throws(() => breakerSection({ state: 'bogus', failures: 1 }, regs), kernelError(message));
  assert.throws(() => breakerSection({ state: '', failures: 1 }, regs), kernelError(message));
});

// A fact the current state does not read is ignored, exactly as the bash arm
// validated only inside the matching case.
test('a fact the state does not read is ignored', () => {
  assert.equal(breakerSection({ state: 'open', cooldownElapsed: true, failures: -3 }, regs).state, 'half-open');
});

test('every state the registry declares has a transition', () => {
  const answers: Record<string, string> = {
    closed: 'closed',
    open: 'open',
    'half-open': 'open',
  };
  for (const state of regs.policy.breaker.states) {
    const expected = answers[state];
    assert.notEqual(expected, undefined, `policy.breaker.states declares ${state} with no transition`);
    const section = breakerSection(
      { state, failures: 0, cooldownElapsed: false, probeResult: 'failed' },
      regs,
    );
    assert.equal(section.state, expected, state);
  }
});

// The registry says WHICH states exist; the transition table says how each one
// moves. A state declared in one and absent from the other has no answer, and
// answering anyway would be the fabrication the fail-closed guard exists to stop.
test('a declared state with no transition is refused', (t) => {
  const mutated = relocated(t, (p) => {
    breaker(p)['states'] = ['closed', 'half-open', 'open', 'quarantined'];
  });
  assert.throws(
    () => breakerSection({ state: 'quarantined' }, mutated),
    kernelError('breaker requires --state closed|open|half-open'),
  );
});

// The control comes first: without it, the refusal below could be satisfied by a
// relocated tree failing for some reason other than the planted one.
test('a relocated copy with an unmutated policy still answers', (t) => {
  assert.equal(breakerSection({ state: 'closed', failures: 0 }, relocated(t)).state, 'closed');
});

// With .breaker absent, jq sorted null below every number, so `0 >= null` held
// and the bash kernel answered {"state":"open","allow":false} at exit 0 — a
// healthy resource reported open. Fail closed instead.
test('a policy with no breaker block is refused, never a fabricated open', (t) => {
  const mutated = relocated(t, (p) => {
    delete p['breaker'];
  });
  assert.throws(
    () => breakerSection({ state: 'closed', failures: 0 }, mutated),
    kernelError('registries/policy.json: .breaker must be an object'),
  );
});

function relocated(t: TestContext, mutate?: (policy: Record<string, unknown>) => void): Registries {
  const root = mutate === undefined ? relocatedRoot(tempRoot(t)) : relocatedRoot(tempRoot(t), { mutate });
  return lazyRegistries(root);
}

function breaker(policy: Record<string, unknown>): Record<string, unknown> {
  const value = policy['breaker'];
  if (!isRecord(value)) throw new Error('fixture breaker is not an object');
  return value;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
