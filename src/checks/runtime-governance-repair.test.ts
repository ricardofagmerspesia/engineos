// One test per case_ row of C20, C20b, C20c and C20d in
// scripts/test-validate-engineos.sh, same description text, plus one case per
// declared code the bash suite never exercised. Assertions are on findings,
// never on rendered lines (design deviation 8).
//
// The bash C20b row mutated dist/engineos.cjs, because scripts/kernel.sh is a
// shim over that bundle. The port calls the kernel IN PROCESS, so a mutated
// bundle changes nothing; the equivalent break is a registry the kernel's strict
// loader refuses, which is what makes the ladder answer nothing.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import { isRecord } from '../lib/json';
import { arrayAt, editPolicyBlock, editJson, replaceOnce, rowById, rowWhere } from './runtime-governance-fixtures';
import {
  C20_FINDINGS,
  C20B_FINDINGS,
  C20C_FINDINGS,
  C20D_FINDINGS,
} from './runtime-governance-repair';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editRepair(root: string, mutate: (repair: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'repair', mutate);
}

// ------------------------------------------------------------------ C20

test('C20 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C20'), []);
});

test('the repair block deleted from policy.json is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      delete doc['repair'];
    });
  });
  assert.ok(hasFinding(findings, 'checks-missing-or-empty'));
  assert.ok(hasFinding(findings, 'not-a-whole-number', 'max_fix_attempts_per_check'));
  assert.ok(hasFinding(findings, 'not-a-whole-number', 'escalations'));
  assert.ok(hasFinding(findings, 'by-situation-mismatch', 'none'));
  assert.ok(hasFinding(findings, 'never-repair-missing-or-empty'));
});

test('max_fix_attempts_per_check set to 0 is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['max_fix_attempts_per_check'] = 0;
    });
  });
  assert.ok(hasFinding(findings, 'below-1', 'max_fix_attempts_per_check'));
});

test('an emptied never_repair array is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['never_repair'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'never-repair-missing-or-empty'));
});

test('the flaky entry dropped from by_situation is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['by_situation'] = arrayAt(repair, 'by_situation').filter(
        (row) => !(isRecord(row) && row['situation'] === 'flaky'),
      );
    });
  });
  assert.ok(hasFinding(findings, 'by-situation-mismatch', 'infra,red'));
});

test('a duplicated entry in repair.checks is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      const checks = arrayAt(repair, 'checks');
      repair['checks'] = [...checks, checks[0]];
    });
  });
  assert.ok(hasFinding(findings, 'checks-has-duplicates'));
});

test('a by_situation row with an emptied response is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      rowWhere(arrayAt(repair, 'by_situation'), 'situation', 'red')['response'] = '';
    });
  });
  assert.ok(hasFinding(findings, 'by-situation-empty-response'));
});

// The answer data src/kernel/repair.ts and src/hooks/classify-failure.ts read.

test('an emptied repair ladder is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['ladder'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'ladder-malformed', 'ladder'));
});

test('a ladder row testing a fact the repair arm does not measure is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      recordIn(arrayAt(repair, 'ladder'), 0)['when'] = { within_budget: true };
    });
  });
  assert.ok(hasFinding(findings, 'ladder-malformed', 'ladder[0].when.within_budget'));
});

test('a ladder whose last row still tests a fact is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['ladder'] = arrayAt(repair, 'ladder').slice(0, -1);
    });
  });
  assert.ok(hasFinding(findings, 'ladder-no-catch-all', 'ladder[1]'));
});

test('a by_situation row carrying an action without a reason is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      delete rowWhere(arrayAt(repair, 'by_situation'), 'situation', 'infra')['reason'];
    });
  });
  assert.ok(hasFinding(findings, 'situation-answer-malformed', 'by_situation[1].reason'));
});

test('the red by_situation row answering through neither action nor reason passes', (t) => {
  const findings = run(t, 'C20');
  assert.ok(!hasFinding(findings, 'situation-answer-malformed'));
});

test('a never-repair answer naming a slot the arm cannot fill is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      const never = repair['never_repair_answer'];
      if (!isRecord(never)) throw new Error('never_repair_answer is not an object');
      never['reason'] = 'situation {situation} on {weekday}';
    });
  });
  assert.ok(hasFinding(findings, 'never-repair-answer-malformed', 'never_repair_answer.reason{weekday}'));
});

test('a never-repair answer with no action is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      const never = repair['never_repair_answer'];
      if (!isRecord(never)) throw new Error('never_repair_answer is not an object');
      delete never['action'];
    });
  });
  assert.ok(hasFinding(findings, 'never-repair-answer-malformed', 'never_repair_answer.action'));
});

test('infra_patterns deleted from policy.json is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      delete repair['infra_patterns'];
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns'));
});

test('a runner with no infra pattern row is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      repair['infra_patterns'] = arrayAt(repair, 'infra_patterns').filter(
        (row) => !(isRecord(row) && row['runner'] === 'nx'),
      );
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns:nx'));
});

test('a duplicated infra pattern runner is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      const rows = arrayAt(repair, 'infra_patterns');
      repair['infra_patterns'] = [...rows, { ...recordIn(rows, 0) }];
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns[3].runner'));
});

test('an infra pattern for a runner kind the classifier does not know is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      recordIn(arrayAt(repair, 'infra_patterns'), 0)['runner'] = 'gradle';
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns[0].runner'));
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns:nx'));
});

test('an infra pattern rendering a reason outside the vocabulary is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      recordIn(arrayAt(repair, 'infra_patterns'), 0)['reason'] = 'looked-bad';
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns[0].reason'));
});

test('an infra pattern that does not compile as a regular expression is caught', (t) => {
  const findings = run(t, 'C20', (root) => {
    editRepair(root, (repair) => {
      recordIn(arrayAt(repair, 'infra_patterns'), 0)['pattern'] = 'cannot find (project';
    });
  });
  assert.ok(hasFinding(findings, 'infra-patterns-malformed', 'infra_patterns[0].pattern'));
});

// ------------------------------------------------------------------ C20b

test('C20b passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C20b'), []);
});

// The bash sed broke `stop-report-red` inside dist/engineos.cjs. In process the
// equivalent is a bound the strict loader refuses: "2" still READS as a whole
// number here (jq's own comparison), so the breakpoint is computed and the
// kernel is asked — and answers an error.
test('the stop-report-red ladder literal broken in the runtime is caught', (t) => {
  const findings = run(t, 'C20b', (root) => {
    editRepair(root, (repair) => {
      repair['max_fix_attempts_per_check'] = '2';
    });
  });
  assert.ok(hasFinding(findings, 'ladder-did-not-stop', 'attempt-4:none'));
  assert.ok(hasFinding(findings, 'never-repair-did-not-win', 'none'));
});

test('an escalations count the ladder cannot read is caught', (t) => {
  const findings = run(t, 'C20b', (root) => {
    editRepair(root, (repair) => {
      repair['escalations'] = 'many';
    });
  });
  assert.ok(hasFinding(findings, 'breakpoint-uncomputable'));
});

// ------------------------------------------------------------------ C20c

test('C20c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C20c'), []);
});

test('until clean reintroduced into the CLAUDE.md verify-done row is caught', (t) => {
  const findings = run(t, 'C20c', (root) => {
    editFile(root, 'CLAUDE.md', (text) =>
      replaceOnce(text, /a bounded fix loop[\s\S]*?reports done\./, 'fix loop until clean before reporting done.'),
    );
  });
  assert.ok(hasFinding(findings, 'until-clean-present', 'CLAUDE.md'));
});

test('until clean reintroduced into the intents registry is caught', (t) => {
  const findings = run(t, 'C20c', (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const row = rowById(arrayAt(doc, 'intents'), 'verify-done');
      row['note'] = `${String(row['note'] ?? '')} Repeat until clean.`;
    });
  });
  assert.ok(hasFinding(findings, 'until-clean-present', 'registries/intents.json'));
});

test("the verify-done note losing its kernel.sh repair pointer is caught", (t) => {
  const findings = run(t, 'C20c', (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const row = rowById(arrayAt(doc, 'intents'), 'verify-done');
      row['note'] = replaceOnce(String(row['note'] ?? ''), 'scripts/kernel.sh repair', 'the repair policy');
    });
  });
  assert.ok(hasFinding(findings, 'verify-done-note-lost-the-pointer'));
});

test('the fix-attempt bound changed in policy.json without the CLAUDE.md row is caught', (t) => {
  const findings = run(t, 'C20c', (root) => {
    editRepair(root, (repair) => {
      repair['max_fix_attempts_per_check'] = 5;
    });
  });
  assert.ok(hasFinding(findings, 'fix-attempt-bound-drift', '2!=5'));
});

// ------------------------------------------------------------------ C20d

test('C20d passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C20d'), []);
});

// One mutation, both findings: dropping the kernel call is exactly how a private
// copy of the number gets reintroduced.
test("the hook's kernel repair call replaced with a hardcoded sentence is caught", (t) => {
  const findings = run(t, 'C20d', (root) => {
    editFile(root, 'src/hooks/stop-verify.ts', (text) =>
      replaceOnce(
        text,
        /return repairSection\([\s\S]*?\)\.reason;/,
        "return 'stop after 2 fix attempts';",
      ),
    );
  });
  assert.ok(hasFinding(findings, 'does-not-call-repair-section', 'src/hooks/stop-verify.ts'));
  assert.ok(hasFinding(findings, 'hardcoded-number-literal', 'src/hooks/stop-verify.ts'));
});

test("the hook's kernel repair import dropped is caught", (t) => {
  const findings = run(t, 'C20d', (root) => {
    editFile(root, 'src/hooks/stop-verify.ts', (text) =>
      replaceOnce(text, "from '../kernel/repair'", "from '../kernel/repair-moved'"),
    );
  });
  assert.ok(hasFinding(findings, 'does-not-import-kernel-repair', 'src/hooks/stop-verify.ts'));
});

test('the Stop-gate hook deleted outright is caught', (t) => {
  const findings = run(t, 'C20d', (root) => {
    rmSync(join(root, 'src/hooks/stop-verify.ts'));
  });
  assert.deepEqual(findings.map((entry) => entry.code), ['missing']);
});

// ------------------------------------------------------------------ internals

// The row at `index`, replaced in place by a plain copy the case may edit.
function recordIn(rows: unknown[], index: number): Record<string, unknown> {
  const row: unknown = rows[index];
  if (!isRecord(row)) throw new Error(`row ${index} is not an object`);
  const record: Record<string, unknown> = { ...row };
  rows[index] = record;
  return record;
}

// ------------------------------------------------------------------- coverage

// A declared code no case produces is dead: nothing proves it can ever be
// reported, and nothing would notice if the branch that reports it went away.
test('every declared C20/C20b/C20c/C20d code is produced by at least one case above', () => {
  const declared = [...C20_FINDINGS, ...C20B_FINDINGS, ...C20C_FINDINGS, ...C20D_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
