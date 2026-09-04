import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries } from './context';
import { repairSection } from './repair';

const regs = lazyRegistries(resolveRoot({}, __dirname));

test('the first red is fixed at the same tier', () => {
  const section = repairSection({ check: 'lint', attempt: 1 }, regs);
  assert.deepEqual(Object.keys(section), ['check', 'action', 'reason']);
  assert.equal(section.check, 'lint');
  assert.equal(section.action, 'fix-same-tier');
  assert.equal(section.reason, 'first red — fix and re-run the check at the same tier');
});

test('the second red escalates one model tier, and says it is the last attempt', () => {
  const section = repairSection({ check: 'lint', attempt: 2 }, regs);
  assert.equal(section.action, 'escalate-one-tier');
  assert.equal(
    section.reason,
    'the same check failed twice — escalate one model tier for the fix and re-run once; that is the last attempt (rules/models.md)',
  );
});

test('past the bound the ladder stops and reports red', () => {
  const section = repairSection({ check: 'lint', attempt: 3 }, regs);
  assert.equal(section.action, 'stop-report-red');
  assert.equal(
    section.reason,
    'the bound is exhausted — stop, report the check red with what was tried; a loop continued past this point is sampling until it looks right, not fixing (rules/parallelism.md)',
  );
});

test('the ladder rungs come from the registry bound, not from literals', () => {
  const bound = regs.policy.repair.max_fix_attempts_per_check;
  const last = bound + regs.policy.repair.escalations;
  assert.equal(repairSection({ check: 'build', attempt: bound - 1 }, regs).action, 'fix-same-tier');
  assert.equal(repairSection({ check: 'build', attempt: bound }, regs).action, 'escalate-one-tier');
  assert.equal(repairSection({ check: 'build', attempt: last }, regs).action, 'stop-report-red');
});

test('a check that could not run is a tooling gap, and consumes no attempt', () => {
  const section = repairSection({ check: 'test', situation: 'infra' }, regs);
  assert.equal(section.action, 'report-tooling-gap');
  assert.equal(
    section.reason,
    'the check could not run — that is a tooling gap, not a code defect; report it, consume no fix attempt (hooks/stop-verify.sh: never block on infra quirks)',
  );
});

test('a flaky check is fixed or deleted, never retried until green', () => {
  const section = repairSection({ check: 'test', situation: 'flaky' }, regs);
  assert.equal(section.action, 'fix-or-delete');
  assert.equal(
    section.reason,
    'green on re-run with no diff is a broken test, not a pass — fix or delete within the week, never retry-until-green (rules/testing.md)',
  );
});

test('a never-repair situation wins over the attempt count', () => {
  const section = repairSection({ check: 'build', attempt: 1, situation: 'weaken-the-check' }, regs);
  assert.equal(section.action, 'never-repair');
  assert.equal(
    section.reason,
    'situation weaken-the-check is on the never-repair list — a fix that weakens the check or changes behavior is not a fix; escalate to a human on the first occurrence',
  );
});

test('every never-repair id in the registry answers never-repair', () => {
  for (const situation of regs.policy.repair.never_repair) {
    assert.equal(repairSection({ check: 'lint', attempt: 3, situation }, regs).action, 'never-repair', situation);
  }
});

test('an unknown check is refused', () => {
  assert.throws(
    () => repairSection({ check: 'nonsense', attempt: 1 }, regs),
    kernelError('unknown check: nonsense (must be one of policy.json.repair.checks)'),
  );
});

test('a missing check is refused', () => {
  assert.throws(() => repairSection({ check: '', attempt: 1 }, regs), kernelError('repair requires --check'));
});

test('the ladder path without an attempt is refused', () => {
  const message = 'repair (red ladder) requires a numeric --attempt';
  assert.throws(() => repairSection({ check: 'lint' }, regs), kernelError(message));
  assert.throws(() => repairSection({ check: 'lint', attempt: 1.5 }, regs), kernelError(message));
  assert.throws(() => repairSection({ check: 'lint', attempt: -1 }, regs), kernelError(message));
});

test('attempt zero is the first rung, as the bash arithmetic reads it', () => {
  assert.equal(repairSection({ check: 'lint', attempt: 0 }, regs).action, 'fix-same-tier');
});

test('an unknown situation is refused', () => {
  assert.throws(
    () => repairSection({ check: 'lint', attempt: 1, situation: 'nonsense' }, regs),
    kernelError('unknown situation: nonsense'),
  );
});

// `red` is a registered by_situation row whose response is the ladder itself,
// and the ladder needs an attempt count the situation form never carries — so
// naming it as a situation is an error, exactly as in the bash kernel. Same for
// a retry.never_retry id: that list answers the unit-level failure policy, not
// the check-level one.
test('a situation with no check-level answer is refused', () => {
  assert.throws(
    () => repairSection({ check: 'lint', attempt: 1, situation: 'red' }, regs),
    kernelError('unknown situation: red'),
  );
  assert.throws(
    () => repairSection({ check: 'lint', attempt: 1, situation: 'security-risk' }, regs),
    kernelError('unknown situation: security-risk'),
  );
});

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
