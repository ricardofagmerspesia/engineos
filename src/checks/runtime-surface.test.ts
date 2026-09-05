// The family registry itself: which ids it answers for, and that the codes each
// check declares are well-formed and cover its mirror rows. The behaviour of
// each check is tested in runtime-surface-journal.test.ts,
// runtime-surface-prose.test.ts and runtime-surface-adoption.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_PATTERN } from './findings';
import { CHECK_IDS } from './ids';
import { MIRRORS } from './mirrors';
import { RUNTIME_SURFACE_CHECKS } from './runtime-surface';

const FAMILY: readonly string[] = ['C27', 'C27b', 'C27c', 'C27d', 'C28', 'C29', 'C30'];

test('the family registers exactly the ids of 70-runtime part 2', () => {
  assert.deepEqual(RUNTIME_SURFACE_CHECKS.map((check) => check.id), FAMILY);
});

test('every registered id is a declared check id', () => {
  const declared = new Set<string>(CHECK_IDS);
  assert.deepEqual(RUNTIME_SURFACE_CHECKS.map((check) => check.id).filter((id) => !declared.has(id)), []);
});

test('every code is a well-formed slug and unique within its check', () => {
  for (const check of RUNTIME_SURFACE_CHECKS) {
    assert.deepEqual(check.codes.filter((code) => !CODE_PATTERN.test(code)), [], check.id);
    assert.equal(new Set(check.codes).size, check.codes.length, check.id);
  }
});

// A mirror row's id IS its finding code, so a row whose check is in this family
// and whose id is not in that check's list would report a code the check does
// not declare.
test('every mirror row of this family is declared by the check that runs it', () => {
  const codesById = new Map<string, ReadonlySet<string>>(
    RUNTIME_SURFACE_CHECKS.map((check): [string, ReadonlySet<string>] => [check.id, new Set(check.codes)]));
  const orphans = MIRRORS
    .filter((row) => codesById.has(row.check))
    .filter((row) => codesById.get(row.check)?.has(row.id) !== true)
    .map((row) => `${row.check}:${row.id}`);
  assert.deepEqual(orphans, []);
});
