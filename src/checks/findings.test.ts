import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { CHECK_IDS, isCheckId } from './ids';
import {
  CODE_PATTERN,
  HARNESS_FINDINGS,
  type Finding,
  type HarnessCode,
  finding,
  isHarnessCode,
  render,
  result,
} from './findings';

test('CHECK_IDS carries the 66 check ids with no duplicate', () => {
  assert.equal(CHECK_IDS.length, 66);
  assert.equal(new Set(CHECK_IDS).size, 66);
});

test('every check id is a C-number with at most a one-letter suffix', () => {
  for (const id of CHECK_IDS) assert.match(id, /^C\d+[a-z]?$/);
});

test('isCheckId accepts a declared id', () => {
  assert.equal(isCheckId('C18g'), true);
});

test('isCheckId rejects an id no family declares', () => {
  assert.equal(isCheckId('C99'), false);
});

test('isCheckId rejects a lookalike that is not in the list', () => {
  assert.equal(isCheckId('c1'), false);
});

test('finding omits subject entirely when none is given', () => {
  const reported = finding('C1', 'precondition-missing');
  assert.equal('subject' in reported, false);
  assert.deepEqual(reported, { code: 'precondition-missing' });
});

test('finding carries the subject when one is given', () => {
  assert.deepEqual(finding('C1', 'artifact-pending', 'docs/specs/x.md'), {
    code: 'artifact-pending',
    subject: 'docs/specs/x.md',
  });
});

test('finding accepts every harness code for any check', () => {
  for (const code of HARNESS_FINDINGS) {
    assert.equal(finding('C31', code, 'jq').code, code);
  }
});

test('finding rejects a code outside the slug pattern', () => {
  // Only a mis-typed augmentation can reach this guard, a state the types rule
  // out — so the test has to erase them to get there.
  const mistyped = 'Bad Code' as unknown as HarnessCode;
  assert.throws(() => finding('C1', mistyped), KernelError);
});

test('finding rejects a code that fails CODE_PATTERN at its first character', () => {
  const mistyped = '-leading-dash' as unknown as HarnessCode;
  assert.equal(CODE_PATTERN.test('-leading-dash'), false);
  assert.throws(() => finding('C1', mistyped), KernelError);
});

test('finding rejects a code no augmentation declared', () => {
  // The assertion is the suppression itself: without it this line does not
  // compile, because 'not-declared' is outside CodeOf<'C1'>.
  // @ts-expect-error 'not-declared' is not a code C1 declares
  assert.equal(finding('C1', 'not-declared').code, 'not-declared');
});

test('isHarnessCode tells a harness code from a family code', () => {
  assert.equal(isHarnessCode('artifact-pending'), true);
  assert.equal(isHarnessCode('hook-not-executable'), false);
});

test('result reports ok when the check produced no finding', () => {
  assert.equal(result('C1', 'rules exist', []).status, 'ok');
});

test('result reports fail when the check produced a finding', () => {
  assert.equal(result('C1', 'rules exist', [finding('C1', 'precondition-missing')]).status, 'fail');
});

test('result reports skip when a pending check produced a finding', () => {
  const pending = result('C1', 'rules exist', [finding('C1', 'artifact-pending', 'docs/x.md')], { pending: true });
  assert.equal(pending.status, 'skip');
});

test('result reports ok for a pending check with nothing to report', () => {
  assert.equal(result('C1', 'rules exist', [], { pending: true }).status, 'ok');
});

test('result keeps the check and title it was given', () => {
  const graded = result('C20d', 'stop-verify wiring', []);
  assert.equal(graded.check, 'C20d');
  assert.equal(graded.title, 'stop-verify wiring');
});

test('result copies the findings so later accumulation cannot rewrite it', () => {
  const accumulating: Finding[] = [finding('C1', 'precondition-missing')];
  const graded = result('C1', 'rules exist', accumulating);
  accumulating.push(finding('C1', 'artifact-pending'));
  assert.equal(graded.findings.length, 1);
});

test('render pads ok to five columns and prints the title alone', () => {
  assert.equal(render(result('C1', 'rules exist', [])), 'ok   rules exist');
});

test('render prints every finding of a failing check, subject-less first', () => {
  const graded = result('C2', 'hooks executable', [
    finding('C2', 'precondition-missing'),
    finding('C2', 'artifact-pending', 'hooks/stop-verify.sh'),
  ]);
  assert.equal(render(graded), 'FAIL hooks executable: [precondition-missing] [artifact-pending:hooks/stop-verify.sh]');
});

test('render keeps a colon inside a subject', () => {
  const graded = result('C3', 'rule closure', [finding('C3', 'precondition-missing', 'rules/base.md:12')]);
  assert.equal(render(graded), 'FAIL rule closure: [precondition-missing:rules/base.md:12]');
});

test('render prints a skip line with the same tail shape', () => {
  const graded = result('C3', 'rule closure', [finding('C3', 'artifact-pending', 'docs/specs/x.md')], {
    pending: true,
  });
  assert.equal(render(graded), 'skip rule closure: [artifact-pending:docs/specs/x.md]');
});
