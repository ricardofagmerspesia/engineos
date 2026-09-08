// One test per case_ row of C26b in scripts/test-validate-engineos.sh, same
// description text, plus one case per declared code the bash suite never
// exercised.
//
// All four bash rows mutated dist/engineos.cjs, because scripts/kernel.sh is a
// shim over that bundle. The port calls the kernel IN PROCESS, so a mutated
// bundle changes nothing: each row is re-expressed as the registry break that
// produces the same finding — a ceiling, a thin-evidence target or a decision
// rule the kernel then answers differently.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, findingsOf, hasFinding } from './testing';
import { arrayAt, editJson, editPolicyBlock, recordAt, rowById, stringsAt } from './runtime-governance-fixtures';
import { C26B_FINDINGS } from './runtime-governance-hitl-canary';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

const DECISION_RULES = 'registries/decision-rules.json';
const INTENTS = 'registries/intents.json';

// src/kernel/hitl.ts throws before it can emit a reason outside the closed
// vocabulary, so no registry or prose mutation reaches this branch: it guards a
// future kernel regression, and the coverage test below asserts it stays
// unproduced rather than pretending a case exercises it.
const UNPRODUCIBLE_BY_MUTATION = new Set(['situation-cites-undeclared-reason']);

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editAutonomy(root: string, mutate: (autonomy: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'autonomy', mutate);
}

test('C26b passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C26b'), []);
});

// A situation the kernel accepts and then silently drops answers required:false
// — "no human needed" for an input it did not act on. In process the equivalent
// break is a situation DECLARED in the registry that no reason maps to.
test('a declared situation the kernel no longer maps to a reason is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editPolicyBlock(root, 'hitl', (hitl) => {
      hitl['situations'] = [...stringsAt(hitl, 'situations'), 'queue-drained'];
    });
  });
  assert.ok(hasFinding(findings, 'situation-not-required', 'queue-drained:false'));
});

test('the high-risk reason removed from the kernel is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editAutonomy(root, (autonomy) => {
      recordAt(autonomy, 'ceiling_by_risk')['high'] = '';
    });
  });
  assert.ok(hasFinding(findings, 'autonomy-ceilings-unusable'));
});

// The ruling, pinned from the failing side: a resolve-task that folds hitl off a
// bare route.risk_floor again would announce a human gate on every auth-guard
// edit. A high-risk decision rule that starts matching that prompt is exactly
// that regression seen from the registry side.
test('resolve-task folding hitl off a bare risk floor is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editJson(root, DECISION_RULES, (doc) => {
      const rule = rowById(arrayAt(doc, 'rules'), 'rule-secret-exposure');
      rule['signals'] = [...arrayAt(rule, 'signals'), '\\bauth guard\\b'];
    });
  });
  assert.ok(hasFinding(findings, 'resolve-task-folds-hitl-off-a-bare-floor', 'present/high'));
});

// The other ruling, same treatment: restoring an unconditional "A1" makes
// autonomy_after RAISE A0 to A1 and drop medium/A3 two levels. A thin-evidence
// target the strict loader refuses is the in-process equivalent — every answer
// the tier and drop cases read stops arriving.
test('autonomy_after reverting to an unconditional A1 is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editAutonomy(root, (autonomy) => {
      autonomy['high_with_thin_evidence'] = 1;
    });
  });
  assert.ok(hasFinding(findings, 'thin-target-unusable'));
  assert.ok(hasFinding(findings, 'answer-mismatch', 'low-risk:none/none'));
  assert.ok(hasFinding(findings, 'situation-not-required', 'destructive:none'));
});

test('a thin-evidence target that is not a drop at all is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editAutonomy(root, (autonomy) => {
      autonomy['high_with_thin_evidence'] = 'A4';
    });
  });
  assert.ok(hasFinding(findings, 'thin-target-is-a4'));
});

test('an unknown situation the kernel accepts instead of rejecting is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editPolicyBlock(root, 'hitl', (hitl) => {
      hitl['situations'] = [...stringsAt(hitl, 'situations'), 'engineos-no-such-situation'];
    });
  });
  assert.ok(hasFinding(findings, 'unknown-situation-not-rejected', 'engineos-no-such-situation'));
});

test('resolve-task no longer carrying the answer for a classified tier is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editJson(root, DECISION_RULES, (doc) => {
      // Both rules the canary's prompt trips: "drop the users table in
      // production" matches the destructive-DDL signals AND rule-production-write.
      for (const id of ['rule-destructive-ddl', 'rule-production-write']) {
        recordAt(rowById(arrayAt(doc, 'rules'), id), 'then')['risk'] = 'medium';
      }
    });
  });
  assert.ok(hasFinding(findings, 'resolve-task-does-not-carry-hitl', 'none'));
});

// The expected floor comes from intents.json; an intent whose floor is not high
// would make the bare-floor case assert nothing, so that is its own finding.
test('the security-files risk floor dropping below high is caught', (t) => {
  const findings = run(t, 'C26b', (root) => {
    editJson(root, INTENTS, (doc) => {
      rowById(arrayAt(doc, 'intents'), 'security-files')['risk_floor'] = 'medium';
    });
  });
  assert.ok(hasFinding(findings, 'security-files-floor-not-high', 'medium'));
});

// ------------------------------------------------------------------- coverage

test('every declared C26b code is produced by at least one case above', () => {
  const declared = C26B_FINDINGS.filter((code) => !UNPRODUCIBLE_BY_MUTATION.has(code));
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});

// The other half of the exclusion: a code listed as unproducible that a case
// DOES produce has become reachable, and belongs in the list above instead.
test('the unproducible C26b codes stay unproduced', () => {
  assert.deepEqual([...UNPRODUCIBLE_BY_MUTATION].filter((code) => PRODUCED.has(code)), []);
});
