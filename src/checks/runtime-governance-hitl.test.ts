// One test per case_ row of C26, C26c and C26d in
// scripts/test-validate-engineos.sh, same description text, plus one case per
// declared code the bash suite never exercised. C26b's cases live beside the
// canary they exercise, in runtime-governance-hitl-canary.test.ts.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import {
  POLICY,
  arrayAt,
  editJson,
  editPolicyBlock,
  recordAt,
  replaceOnce,
  rowWhere,
  stringsAt,
} from './runtime-governance-fixtures';
import { C26_FINDINGS, C26C_FINDINGS, C26D_FINDINGS } from './runtime-governance-hitl';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

const RISK_AUTONOMY_MD = 'rules/risk-autonomy.md';

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editHitl(root: string, mutate: (hitl: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'hitl', mutate);
}

// ------------------------------------------------------------------ C26

test('C26 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C26'), []);
});

test("a reason removed from policy.json's hitl vocabulary is caught", (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      hitl['reasons'] = stringsAt(hitl, 'reasons').filter((reason) => reason !== 'destructive-action');
    });
  });
  assert.ok(hasFinding(findings, 'reasons-below-minimum', '8'));
});

test('an emptied record_home is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      hitl['record_home'] = '';
    });
  });
  assert.ok(hasFinding(findings, 'record-home-missing-or-empty'));
});

test('a situation that also sits on retry.never_retry is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editJson(root, POLICY, (doc) => {
      const hitl = recordAt(doc, 'hitl');
      const [first] = stringsAt(recordAt(doc, 'retry'), 'never_retry');
      if (first === undefined) throw new Error('retry.never_retry is empty');
      hitl['situations'] = [...stringsAt(hitl, 'situations'), first];
    });
  });
  assert.ok(hasFinding(findings, 'situations-overlap-never-retry', 'security-risk'));
});

test('a duplicated reason id is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      const reasons = stringsAt(hitl, 'reasons');
      hitl['reasons'] = [...reasons, 'high-risk'];
    });
  });
  assert.ok(hasFinding(findings, 'reasons-have-duplicates'));
});

test('an emptied situations array is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      hitl['situations'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'situations-missing-or-empty'));
});

// The reason_table rows src/kernel/hitl.ts collects over.

test('an emptied hitl reason_table is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      hitl['reason_table'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'reason-table-malformed', 'reason_table'));
});

test('a reason_table row testing a fact the hitl arm does not know is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      const first = arrayAt(hitl, 'reason_table')[0];
      if (typeof first !== 'object' || first === null || Array.isArray(first)) throw new Error('reason_table[0] is not a row');
      Object.assign(first, { when: { moon_phase: 'full' } });
    });
  });
  assert.ok(hasFinding(findings, 'reason-table-malformed', 'reason_table[0].when.moon_phase'));
});

test('a reason_table row with an empty reason is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      const first = arrayAt(hitl, 'reason_table')[0];
      if (typeof first !== 'object' || first === null || Array.isArray(first)) throw new Error('reason_table[0] is not a row');
      Object.assign(first, { reason: '' });
    });
  });
  assert.ok(hasFinding(findings, 'reason-table-malformed', 'reason_table[0].reason'));
});

test('a reason_table row citing a reason the vocabulary never declares is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      const row = rowWhere(arrayAt(hitl, 'reason_table'), 'reason', 'destructive-action');
      row['reason'] = 'mood-swing';
    });
  });
  assert.ok(hasFinding(findings, 'reason-table-undeclared-reason'));
  assert.ok(findings.some((entry) => entry.code === 'reason-table-undeclared-reason' && entry.subject?.endsWith(':mood-swing') === true));
});

test('a declared reason no reason_table row can raise is caught', (t) => {
  const findings = run(t, 'C26', (root) => {
    editHitl(root, (hitl) => {
      hitl['reason_table'] = arrayAt(hitl, 'reason_table').filter(
        (row) => !(typeof row === 'object' && row !== null && !Array.isArray(row) && 'reason' in row && row.reason === 'destructive-action'),
      );
    });
  });
  assert.ok(hasFinding(findings, 'reason-without-row', 'destructive-action'));
});

// ------------------------------------------------------------------ C26c

test('C26c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C26c'), []);
});

test('a reason row deleted from rules/risk-autonomy.md is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, RISK_AUTONOMY_MD, (text) =>
      replaceOnce(text, /^\| `never-retry-situation`.*$\n/m, ''),
    );
  });
  assert.ok(hasFinding(findings, 'reason-row-missing', 'never-retry-situation'));
});

test('the Human-in-the-loop section renamed in rules/risk-autonomy.md is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, RISK_AUTONOMY_MD, (text) => replaceOnce(text, '## Human-in-the-loop', '## HITL'));
  });
  assert.ok(hasFinding(findings, 'no-hitl-section', RISK_AUTONOMY_MD));
});

test('the record home dropped from the gates.md release checklist is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, 'rules/gates.md', (text) =>
      replaceOnce(text, '`## Human decisions` in the change record', 'the change record'),
    );
  });
  assert.ok(hasFinding(findings, 'release-checklist-does-not-name', 'human-decisions'));
});

test('the kernel.sh hitl call dropped from the section is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, RISK_AUTONOMY_MD, (text) => replaceOnce(text, 'kernel.sh hitl', 'the hitl arm'));
  });
  assert.ok(hasFinding(findings, 'does-not-name-kernel-sh-hitl', RISK_AUTONOMY_MD));
});

test('a record_home with no anchor to derive a heading from is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editHitl(root, (hitl) => {
      hitl['record_home'] = '';
    });
  });
  assert.ok(hasFinding(findings, 'record-home-unusable'));
});

test('the record home dropped from the Human-in-the-loop section is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, RISK_AUTONOMY_MD, (text) =>
      replaceOnce(text, 'under `## Human decisions`', 'somewhere durable'),
    );
  });
  assert.ok(hasFinding(findings, 'does-not-name-the-record-home', 'human-decisions'));
});

test('the change-record template losing its Human decisions section is caught', (t) => {
  const findings = run(t, 'C26c', (root) => {
    editFile(root, '.engineos/changes/_template.md', (text) =>
      replaceOnce(text, /^## Human decisions$/m, '## Approvals'),
    );
  });
  assert.ok(hasFinding(findings, 'change-template-has-no-section', 'human-decisions'));
});

// ------------------------------------------------------------------ C26d

test('C26d passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C26d'), []);
});

test('the reason id renamed in the registry without kernel.sh is caught', (t) => {
  const findings = run(t, 'C26d', (root) => {
    editHitl(root, (hitl) => {
      hitl['reasons'] = renamed(stringsAt(hitl, 'reasons'));
      hitl['situations'] = renamed(stringsAt(hitl, 'situations'));
    });
  });
  assert.deepEqual(
    findings.map((entry) => entry.code),
    ['not-declared-in-both-reasons-and-situations'],
  );
});

// The reject message now lives in the reject row of policy.json
// .parallelism.backpressure.rows (the PR moved it out of src/kernel/admit.ts),
// so the mutation targets that row and the finding names the registry.
test("admit's reject message losing the hitl reason id is caught", (t) => {
  const findings = run(t, 'C26d', (root) => {
    editPolicyBlock(root, 'parallelism', (parallelism) => {
      const reject = rowWhere(arrayAt(recordAt(parallelism, 'backpressure'), 'rows'), 'action', 'reject');
      reject['reason'] = replaceOnce(String(reject['reason']), '(hitl: budget-exhausted)', '(ask a human)');
    });
  });
  assert.ok(hasFinding(findings, 'admit-reject-message-does-not-cite', POLICY));
});

test('an edit to src/kernel/admit.ts alone no longer moves the C26d citation check', (t) => {
  const findings = run(t, 'C26d', (root) => {
    editFile(root, 'src/kernel/admit.ts', (text) => `${text}\n// (ask a human)\n`);
  });
  assert.deepEqual(findings, []);
});

// The third assertion of the coupling: the kernel's own answer to
// --situation reject. An autonomy ceiling the strict loader refuses makes every
// arm answer an error, so the reject situation cites nothing at all.
test('the reject situation answering no reason at all is caught', (t) => {
  const findings = run(t, 'C26d', (root) => {
    editPolicyBlock(root, 'autonomy', (autonomy) => {
      recordAt(autonomy, 'ceiling_by_risk')['low'] = 2;
    });
  });
  assert.ok(hasFinding(findings, 'situation-reject-answered', 'none'));
});

// ------------------------------------------------------------------ internals

function renamed(ids: readonly string[]): string[] {
  return ids.map((id) => (id === 'budget-exhausted' ? 'budget-spent' : id));
}

// ------------------------------------------------------------------- coverage

test('every declared C26/C26c/C26d code is produced by at least one case above', () => {
  const declared = [...C26_FINDINGS, ...C26C_FINDINGS, ...C26D_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
