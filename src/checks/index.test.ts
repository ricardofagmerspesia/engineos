import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, orderIds } from './index';
import { CHECK_IDS } from './ids';
import { CODE_PATTERN, HARNESS_FINDINGS } from './findings';
import { MIRRORS } from './mirrors';

test('every declared check id is registered exactly once', () => {
  const registered = CHECKS.map((check) => check.id);
  assert.deepEqual(orderIds(registered), orderIds([...CHECK_IDS]));
  assert.equal(new Set(registered).size, registered.length);
});

test('every check declares a non-empty code list of valid, unique codes', () => {
  for (const check of CHECKS) {
    assert.ok(check.codes.length > 0, `${check.id} declares no codes`);
    assert.equal(new Set(check.codes).size, check.codes.length, `${check.id} repeats a code`);
    for (const code of check.codes) {
      assert.match(code, CODE_PATTERN, `${check.id} code ${code}`);
    }
  }
});

test('no family redeclares a harness code as its own', () => {
  const harness: readonly string[] = HARNESS_FINDINGS;
  for (const check of CHECKS) {
    for (const code of check.codes) {
      assert.ok(!harness.includes(code), `${check.id} redeclares ${code}`);
    }
  }
});

test('every mirror row id is declared in its check code list', () => {
  const byId = new Map(CHECKS.map((check) => [check.id, check]));
  for (const row of MIRRORS) {
    const check = byId.get(row.check);
    assert.ok(check !== undefined, `${row.check} has no registered check`);
    assert.ok(check.codes.includes(row.id), `${row.check} does not declare mirror row ${row.id}`);
  }
});
