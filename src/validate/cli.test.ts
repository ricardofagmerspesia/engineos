import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { orderIds, selectIds, type Check } from '../checks/index';
import { finding, result, type CheckResult } from '../checks/findings';
import { CHECK_IDS, type CheckId } from '../checks/ids';
import type { CheckContext } from '../checks/lib';
import { runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runValidate } from './cli';

// The natural order the bash harness produced for the declared Checks:
// `sed -E 's/^(C[0-9]+)/\1:/' | sort -t: -k1.2,1n -k2,2`. Written out rather than
// recomputed, so this pins the ordering instead of restating the implementation.
const NATURAL_ORDER: readonly string[] = [
  'C1', 'C2', 'C3', 'C5', 'C5b', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C15b',
  'C16', 'C17', 'C17b', 'C17c', 'C17e', 'C18', 'C18b', 'C18c', 'C18d', 'C18e', 'C18f', 'C18g',
  'C19', 'C19b', 'C19c', 'C20', 'C20b', 'C20c', 'C20d', 'C21', 'C21b', 'C21c', 'C21e',
  'C22', 'C22b', 'C22c', 'C23', 'C23c', 'C24', 'C24b', 'C24c', 'C25', 'C25b', 'C25c',
  'C26', 'C26b', 'C26c', 'C26d', 'C27', 'C27b', 'C27c', 'C27d', 'C28', 'C29', 'C30', 'C31',
  'C32', 'C33', 'C34', 'C35', 'C36', 'C37', 'C38', 'C38b', 'C38c', 'C38d',
];

function check(id: CheckId, run: (ctx: CheckContext) => CheckResult[]): Check {
  return { id, codes: [], run };
}

// One ok, one two-finding failure, one pending skip, one thrower, three sub-checks
// of a parent, and one that answers with nothing (a skipOnce dedupe hit).
// Registered out of order on purpose: the harness orders what it runs.
const FIXTURES: readonly Check[] = [
  check('C17c', () => [result('C17c', 'seventeen c', [])]),
  check('C3', () => [result('C3', 'third check', [finding('C3', 'artifact-pending', 'docs/x.md')], { pending: true })]),
  check('C31', () => []),
  check('C1', () => [result('C1', 'first check', [])]),
  check('C17', () => [result('C17', 'seventeen', [])]),
  check('C5', () => {
    throw new Error('boom');
  }),
  check('C2', () => [
    result('C2', 'second check', [finding('C2', 'precondition-missing'), finding('C2', 'artifact-pending', 'beta')]),
  ]),
  check('C17b', () => [result('C17b', 'seventeen b', [])]),
];

function run(t: TestContext, argv: string[], checks: readonly Check[] = FIXTURES): RunResult {
  const root = tempRoot(t);
  return runInProcess((args, io) => runValidate(args, io, checks), argv, { env: { ENGINEOS_ROOT: root } });
}

// ------------------------------------------------------------------- arguments

test('--list prints every registered id in natural order and exits 0', (t) => {
  const r = run(t, ['--list']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'C1\nC2\nC3\nC5\nC17\nC17b\nC17c\nC31\n');
  assert.equal(r.stderr, '');
});

test('an unrecognised argument exits 2 with the bash message', (t) => {
  const r = run(t, ['--bogus']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'unknown argument: --bogus\n');
  assert.equal(r.stdout, '');
});

test('--only without a value exits 2', (t) => {
  const r = run(t, ['--only']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, '--only requires a comma-separated check list\n');
});

test('--only with an id no Check answers to exits 2', (t) => {
  const r = run(t, ['--only', 'C0nope']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'unknown check id: C0nope\n');
  assert.equal(r.stdout, '');
});

test('a repeated --only takes the last value', (t) => {
  const r = run(t, ['--only', 'C1', '--only', 'C17c']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '== EngineOS integrity ==\nok   seventeen c\n\npassed 1, failed 0\n');
});

test('an empty registry exits 2', (t) => {
  const r = run(t, [], []);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'no Checks registered\n');
});

// --------------------------------------------------------------------- running

test('a bare parent id selects its letter-suffixed sub-checks', (t) => {
  const r = run(t, ['--only', 'C17']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '== EngineOS integrity ==\nok   seventeen\nok   seventeen b\nok   seventeen c\n\npassed 3, failed 0\n');
});

test('a sub-check id selects only that sub-check', (t) => {
  const r = run(t, ['--only', 'C17c']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '== EngineOS integrity ==\nok   seventeen c\n\npassed 1, failed 0\n');
});

test('an unfiltered run renders every result and counts by status', (t) => {
  const r = run(t, []);
  assert.equal(r.status, 1);
  assert.equal(
    r.stdout,
    [
      '== EngineOS integrity ==',
      'ok   first check',
      'FAIL second check: [precondition-missing] [artifact-pending:beta]',
      'skip third check: [artifact-pending:docs/x.md]',
      'FAIL C5: [precondition-missing:C5]',
      'ok   seventeen',
      'ok   seventeen b',
      'ok   seventeen c',
      '',
      'passed 4, failed 2',
      '',
    ].join('\n'),
  );
});

test('a Check that throws reports on stderr and counts one failure', (t) => {
  const r = run(t, ['--only', 'C5']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'validate: C5 threw: boom\n');
  assert.equal(r.stdout, '== EngineOS integrity ==\nFAIL C5: [precondition-missing:C5]\n\npassed 0, failed 1\n');
});

test('a skip counts in neither column and leaves the run green', (t) => {
  const r = run(t, ['--only', 'C1,C3']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '== EngineOS integrity ==\nok   first check\nskip third check: [artifact-pending:docs/x.md]\n\npassed 1, failed 0\n');
});

test('a Check answering with nothing prints nothing and counts nothing', (t) => {
  const r = run(t, ['--only', 'C31']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '== EngineOS integrity ==\n\npassed 0, failed 0\n');
});

// -------------------------------------------------------------------- id algebra

test('orderIds puts the real check ids in the bash natural order', () => {
  // Byte order is a genuine shuffle here: it puts C10 before C2.
  const shuffled = [...CHECK_IDS].sort();
  assert.deepEqual(orderIds(shuffled), NATURAL_ORDER);
});

test('orderIds is stable against the reversed input', () => {
  assert.deepEqual(orderIds([...NATURAL_ORDER].reverse()), NATURAL_ORDER);
});

test('orderIds sorts the empty suffix before a lettered one', () => {
  assert.deepEqual(orderIds(['C17e', 'C17b', 'C17', 'C17c']), ['C17', 'C17b', 'C17c', 'C17e']);
});

test('selectIds with all selects every id', () => {
  assert.deepEqual(selectIds(['C1', 'C17', 'C17b'], 'all'), { selected: ['C1', 'C17', 'C17b'], unknown: [] });
});

test('selectIds keeps the order of the id list, not of the wants', () => {
  assert.deepEqual(selectIds(['C1', 'C2', 'C3'], 'C3,C1').selected, ['C1', 'C3']);
});

test('selectIds de-duplicates a repeated want', () => {
  assert.deepEqual(selectIds(['C17', 'C17b'], 'C17,C17,C17b').selected, ['C17', 'C17b']);
});

test('selectIds ignores empty comma segments', () => {
  assert.deepEqual(selectIds(['C1', 'C2'], 'C1,,C2'), { selected: ['C1', 'C2'], unknown: [] });
});

test('selectIds reports unknown wants in input order and selects the known ones', () => {
  assert.deepEqual(selectIds(['C1'], 'zz,C1,aa'), { selected: ['C1'], unknown: ['zz', 'aa'] });
});

test('a sub-check want never selects its parent', () => {
  assert.deepEqual(selectIds(['C17', 'C17b'], 'C17b').selected, ['C17b']);
});
