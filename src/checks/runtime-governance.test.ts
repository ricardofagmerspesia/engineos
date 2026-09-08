// The family's registration contract: which ids it owns, and the two invariants
// the code lists have to satisfy for the Finding model to hold. The behavioural
// cases live in the per-part test files beside the checks they exercise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsOf } from './mirrors';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

// scripts/checks/70-runtime.sh lines 1-832, in the order the bash file declares
// them. The rest of that file (C27 onwards) is the runtime-surface family.
const OWNED = [
  'C20', 'C20b', 'C20c', 'C20d',
  'C22', 'C22b', 'C22c',
  'C23', 'C23c',
  'C24', 'C24b', 'C24c',
  'C25', 'C25b', 'C25c',
  'C26', 'C26b', 'C26c', 'C26d',
] as const;

test('the family registers exactly the checks it owns, in bash order', () => {
  assert.deepEqual(RUNTIME_GOVERNANCE_CHECKS.map((check) => check.id), [...OWNED]);
});

test('every code is unique within its check and matches the code grammar', () => {
  for (const check of RUNTIME_GOVERNANCE_CHECKS) {
    assert.deepEqual(new Set(check.codes).size, check.codes.length, `${check.id} declares a duplicate code`);
    for (const code of check.codes) {
      assert.match(code, /^[a-z][a-z0-9-]*$/, `${check.id}:${code} is not a valid code`);
    }
  }
});

// A mirror row reports under its own id, so a row whose id the owning check does
// not declare would produce a finding no code list knows about.
test('every mirror row id of an owned check is declared in that check codes', () => {
  for (const check of RUNTIME_GOVERNANCE_CHECKS) {
    for (const row of rowsOf(check.id)) {
      assert.ok(check.codes.includes(row.id), `${check.id} does not declare mirror row ${row.id}`);
    }
  }
});
