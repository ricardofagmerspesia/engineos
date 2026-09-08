// One test per bash case_ row of the 60-contracts family, plus a clean-tree
// case per check and a case for every declared code the suite did not already
// exercise. Assertions are on codes and subjects, never on rendered prose
// (design deviation 8).
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import {
  C19_FINDINGS,
  C19b_FINDINGS,
  C19c_FINDINGS,
  C21_FINDINGS,
  C21b_FINDINGS,
  C21c_FINDINGS,
  C21e_FINDINGS,
  CONTRACTS_CHECKS,
} from './contracts';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { rowsOf } from './mirrors';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding, runCheckById } from './testing';

// Every code the cases below actually produced. The last test compares it with
// the declared lists, so a code no case can trigger is a failing test.
const produced = new Set<string>();

function findings(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const found = findingsOf(CONTRACTS_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of found) produced.add(entry.code);
  return found;
}

const P1 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p1-policy-as-data.md';
const P2 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p2-resolver-api.md';
const P3 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p3-router-agent.md';
const P4 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p4-handoff-frontmatter.md';
const P5 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p5-repair-loop.md';
const P7 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p7-telemetry.md';
const P8 = '.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p8-contradiction-cleanup.md';
const NA_RECORD = '.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md';

// The python3 -c mutations of the bash suite: rewrite one intent row in place.
function editIntent(root: string, id: string, edit: (row: Record<string, unknown>) => void): void {
  editFile(root, 'registries/intents.json', (text) => {
    const document: unknown = JSON.parse(text);
    if (!isRecord(document)) throw new Error('intents.json is not an object');
    const declared: unknown = document['intents'];
    if (!Array.isArray(declared)) throw new Error('intents.json carries no intents array');
    const rows: unknown[] = declared;
    for (const row of rows) if (isRecord(row) && row['id'] === id) edit(row);
    return JSON.stringify(document, null, 2);
  });
}

function contractOf(row: Record<string, unknown>): Record<string, unknown> {
  const contract = row['archive_contract'];
  if (!isRecord(contract)) throw new Error('record-change carries no archive_contract');
  return contract;
}

function listOf(source: Record<string, unknown>, key: string): unknown[] {
  const value: unknown = source[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  const items: unknown[] = value;
  return items;
}

function dropLine(root: string, path: string, line: string): void {
  editFile(root, path, (text) => text.split('\n').filter((candidate) => candidate !== line).join('\n'));
}

// ------------------------------------------------------------------ clean tree

test('C19 holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C19'), []);
});

test('C19b holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C19b'), []);
});

test('C19c holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C19c'), []);
});

test('C21 holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C21'), []);
});

test('C21b holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C21b'), []);
});

test('C21c holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C21c'), []);
});

test('C21e holds on an unmutated checkout', (t) => {
  assert.deepEqual(findings(t, 'C21e'), []);
});

// ------------------------------------------------------------------ C19 / C19b / C19c

test('the section list reintroduced into the handoff note is caught', (t) => {
  const found = findings(t, 'C19', (root) => {
    editIntent(root, 'handoff', (row) => {
      row['note'] = `${String(row['note'] ?? '')} Required sections: objective, state, evidence.`;
    });
  });
  assert.ok(hasFinding(found, 'note-carries-the-section-list'));
});

test('the handoff intent losing required_sections is caught', (t) => {
  const found = findings(t, 'C19', (root) => {
    editIntent(root, 'handoff', (row) => {
      delete row['required_sections'];
    });
  });
  assert.ok(hasFinding(found, 'required-sections-missing-or-empty'));
});

test('the handoff intent losing required_fields is caught', (t) => {
  const found = findings(t, 'C19', (root) => {
    editIntent(root, 'handoff', (row) => {
      delete row['required_fields'];
    });
  });
  assert.ok(hasFinding(found, 'required-fields-missing-or-empty'));
});

test('a required section removed from the handoff template is caught', (t) => {
  const found = findings(t, 'C19b', (root) => dropLine(root, 'templates/handoff.md', '## Evidence'));
  assert.ok(hasFinding(found, 'template-missing-section', 'Evidence'));
});

test('a registry-required section absent from the template is caught', (t) => {
  const found = findings(t, 'C19b', (root) => {
    editIntent(root, 'handoff', (row) => {
      listOf(row, 'required_sections').push('Ghost section');
    });
  });
  assert.ok(hasFinding(found, 'template-missing-section', 'Ghost section'));
});

test('a template section added without a registry update is caught', (t) => {
  const found = findings(t, 'C19b', (root) => {
    editFile(root, 'templates/handoff.md', (text) => `${text}\n## Scratch notes\n\n<anything>\n`);
  });
  assert.ok(hasFinding(found, 'template-section-not-declared', 'Scratch notes'));
});

test('the Gate field dropped from the handoff template is caught', (t) => {
  const found = findings(t, 'C19b', (root) => {
    editFile(root, 'templates/handoff.md', (text) => text.replace(/^Gate:/m, 'Gato:'));
  });
  assert.ok(hasFinding(found, 'template-missing-field', 'Gate'));
});

test('CLAUDE.md handoff row dropping a section name is caught', (t) => {
  const found = findings(t, 'C19c', (root) => {
    editFile(root, 'CLAUDE.md', (text) => text.replace(' evidence, known failures', ' known failures'));
  });
  assert.ok(hasFinding(found, 'claude-row-missing-section', 'Evidence'));
});

test('CLAUDE.md handoff row dropping a required field name is caught', (t) => {
  const found = findings(t, 'C19c', (root) => {
    editFile(root, 'CLAUDE.md', (text) => text.replace('state (gate, risk)', 'state (risk)'));
  });
  assert.ok(hasFinding(found, 'claude-row-missing-field', 'Gate'));
});

// The short-circuit the bash kept: no row at all is one defect, not ten.
test('CLAUDE.md losing the handoff router row entirely is one finding', (t) => {
  const found = findings(t, 'C19c', (root) => {
    editFile(root, 'CLAUDE.md', (text) => text.replace('templates/handoff.md', 'templates/handoff-gone.md'));
  });
  assert.deepEqual(found, [{ code: 'router-row-missing', subject: 'CLAUDE.md' }]);
});

// ------------------------------------------------------------------ C21 / C21b

test('an invalid spec_exempt_pattern ERE is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      contractOf(row)['spec_exempt_pattern'] = '(';
    });
  });
  assert.ok(hasFinding(found, 'spec-exempt-pattern-missing-or-invalid'));
});

test('the record-change intent losing required_sections is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      delete row['required_sections'];
    });
  });
  assert.ok(hasFinding(found, 'required-sections-missing-or-empty'));
});

test('the record-change intent losing required_fields is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      delete row['required_fields'];
    });
  });
  assert.ok(hasFinding(found, 'required-fields-missing-or-empty'));
});

test('the archive contract losing its domain enum is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      delete contractOf(row)['domains'];
    });
  });
  assert.ok(hasFinding(found, 'domains-missing-or-empty'));
});

test('a duplicated domain in the archive contract is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      listOf(contractOf(row), 'domains').push('general');
    });
  });
  assert.ok(hasFinding(found, 'domains-has-duplicates'));
});

test('a grandfathered_before that is not a date is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      contractOf(row)['grandfathered_before'] = 'soon';
    });
  });
  assert.ok(hasFinding(found, 'date-field-not-a-date', 'grandfathered_before'));
});

test('an instance section that no required_sections entry declares is caught', (t) => {
  const found = findings(t, 'C21', (root) => {
    editIntent(root, 'record-change', (row) => {
      listOf(contractOf(row), 'instance_sections').push('Ghost');
    });
  });
  assert.ok(hasFinding(found, 'instance-section-not-required', 'Ghost'));
});

test('a required section removed from the change template is caught', (t) => {
  const found = findings(t, 'C21b', (root) => dropLine(root, '.engineos/changes/_template.md', '## Verification'));
  assert.ok(hasFinding(found, 'template-missing-section', 'Verification'));
});

test('a template section added without a registry update is caught (change record)', (t) => {
  const found = findings(t, 'C21b', (root) => {
    editFile(root, '.engineos/changes/_template.md', (text) => `${text}\n## Scratch\n\n<x>\n`);
  });
  assert.ok(hasFinding(found, 'template-section-not-declared', 'Scratch'));
});

test('a registry-required section absent from the template is caught (change record)', (t) => {
  const found = findings(t, 'C21b', (root) => {
    editIntent(root, 'record-change', (row) => {
      listOf(row, 'required_sections').push('Ghost section');
    });
  });
  assert.ok(hasFinding(found, 'template-missing-section', 'Ghost section'));
});

test('the owner field dropped from the change template is caught', (t) => {
  const found = findings(t, 'C21b', (root) => {
    editFile(root, '.engineos/changes/_template.md', (text) => text.replace(/^owner:/m, 'ownr:'));
  });
  assert.ok(hasFinding(found, 'template-missing-field', 'owner'));
});

// ------------------------------------------------------------------ C21c

test("an archived record's spec link pointing at a nonexistent file is caught", (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P5, (text) =>
      text.replace(
        'spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md',
        'spec: docs/specs/ghost.md',
      ));
  });
  assert.ok(hasFinding(found, 'spec-file-missing-or-empty', '2026-08-06-decision-kernel-p5-repair-loop:docs/specs/ghost.md'));
});

test("an archived record's n/a exemption stripped of its reason is caught", (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, NA_RECORD, (text) => text.replace(/^spec: n\/a — .*$/m, 'spec: n/a'));
  });
  assert.ok(hasFinding(found, 'spec-not-under-prefix', '2026-07-30-full-config-audit-fixes:n/a'));
});

test('an archived record losing its completed date is caught', (t) => {
  const found = findings(t, 'C21c', (root) => dropLine(root, P4, 'completed: 2026-08-06'));
  const base = '2026-08-06-decision-kernel-p4-handoff-frontmatter';
  assert.ok(hasFinding(found, 'completed-missing-or-malformed', base));
  // The derived layout uses the record's own date, so losing it also files the
  // record nowhere.
  assert.ok(hasFinding(found, 'filed-at-wrong-path', base));
});

test('an unresolved checklist item in an archived record is caught', (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P3, (text) => `${text}\n- [ ] leftover\n`);
  });
  assert.ok(hasFinding(found, 'unresolved-checklist-item', '2026-08-06-decision-kernel-p3-router-agent'));
});

test("an archived record's domain drifting off the enum is caught", (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P2, (text) => text.replace(/^domain: general$/m, 'domain: platform'));
  });
  assert.ok(hasFinding(found, 'domain-not-in-enum', '2026-08-06-decision-kernel-p2-resolver-api:platform'));
});

test('an archived record still claiming status: active is caught', (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P1, (text) => text.replace(/^status: done$/m, 'status: active'));
  });
  assert.ok(hasFinding(found, 'status-not-done', '2026-08-06-decision-kernel-p1-policy-as-data:active'));
});

test("an archived record's name drifting from its filename is caught", (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P7, (text) => text.replace(/^name: .*$/m, 'name: 2026-08-06-something-else'));
  });
  assert.ok(hasFinding(found, 'name-drifts-from-filename', '2026-08-06-decision-kernel-p7-telemetry'));
});

test('an archived record missing a required instance section is caught', (t) => {
  const found = findings(t, 'C21c', (root) => dropLine(root, P8, '## Verification'));
  assert.ok(hasFinding(found, 'missing-section', '2026-08-06-decision-kernel-p8-contradiction-cleanup:Verification'));
});

test('an archived record with no spec field at all is caught', (t) => {
  const found = findings(t, 'C21c', (root) => {
    editFile(root, P8, (text) => text.replace(/^spec: .*$/m, 'spec:'));
  });
  assert.ok(hasFinding(found, 'spec-field-missing-or-empty', '2026-08-06-decision-kernel-p8-contradiction-cleanup'));
});

// ------------------------------------------------------------------ C21e

test('a domain dropped from the SKILL.md mirror or the killed README copy regrowing is caught', (t) => {
  const found = findings(t, 'C21e', (root) => {
    editFile(root, 'skills/record-change/SKILL.md', (text) => text.replace('`dba`, ', ''));
    editFile(root, '.engineos/changes/README.md', (text) => `${text}status: active\n`);
  });
  assert.ok(hasFinding(found, 'skill-missing-domain', 'dba'));
  assert.ok(hasFinding(found, 'changes-readme-regrew-inline-schema-copy', '.engineos/changes/README.md'));
});

test('a domain dropped from the archive README is caught', (t) => {
  const found = findings(t, 'C21e', (root) => {
    editFile(root, '.engineos/archived/README.md', (text) => text.replace('`dba`, ', ''));
  });
  assert.ok(hasFinding(found, 'archive-readme-missing-domain', 'dba'));
});

test('a domain dropped from the change template is caught', (t) => {
  const found = findings(t, 'C21e', (root) => {
    editFile(root, '.engineos/changes/_template.md', (text) => text.replace('|dba', ''));
  });
  assert.ok(hasFinding(found, 'template-missing-domain', 'dba'));
});

// ------------------------------------------------------------------ preconditions

// The bash `have_handoff_inputs` / `have_change_record_inputs` guards: one FAIL
// for the family, not one per check, and the second caller in the same run
// prints nothing.
test('a missing intents.json reports the shared precondition once per family', (t) => {
  const root = checkoutCopy(t, (copy) => {
    rmSync(join(copy, 'registries/intents.json'));
  });
  const ctx = contextFor(root);
  assert.deepEqual(runCheckById(CONTRACTS_CHECKS, 'C19', ctx).flatMap((r) => [...r.findings]), [
    { code: 'precondition-missing', subject: 'handoff' },
  ]);
  assert.deepEqual(runCheckById(CONTRACTS_CHECKS, 'C19b', ctx), []);
  assert.deepEqual(runCheckById(CONTRACTS_CHECKS, 'C21', ctx).flatMap((r) => [...r.findings]), [
    { code: 'precondition-missing', subject: 'change-record' },
  ]);
  assert.deepEqual(runCheckById(CONTRACTS_CHECKS, 'C21c', ctx), []);
});

// ------------------------------------------------------------------ coverage

test('every declared code of the family is produced by at least one case above', () => {
  const declared: readonly (readonly string[])[] = [
    C19_FINDINGS,
    C19b_FINDINGS,
    C19c_FINDINGS,
    C21_FINDINGS,
    C21b_FINDINGS,
    C21c_FINDINGS,
    C21e_FINDINGS,
  ];
  const dead = declared.flat().filter((code) => !produced.has(code));
  assert.deepEqual(dead, [], `codes no case produces: ${dead.join(', ')}`);
});

test('every registered check declares its codes and every mirror row id is among them', () => {
  const ids = CONTRACTS_CHECKS.map((check) => check.id);
  assert.deepEqual(ids, ['C19', 'C19b', 'C19c', 'C21', 'C21b', 'C21c', 'C21e']);
  for (const check of CONTRACTS_CHECKS) {
    assert.equal(new Set(check.codes).size, check.codes.length, `${check.id} declares a duplicate code`);
    for (const code of check.codes) assert.match(code, /^[a-z][a-z0-9-]*$/);
    // A mirror row's id is the finding code it reports, so a row this family
    // runs but never declared would be a finding no code list admits.
    for (const row of rowsOf(check.id)) {
      assert.ok(check.codes.includes(row.id), `${check.id} runs mirror row '${row.id}' that its code list omits`);
    }
  }
});
