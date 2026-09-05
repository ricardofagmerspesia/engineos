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

// ------------------------------------------------------------------- coverage

// A declared code no case produces is dead: nothing proves it can ever be
// reported, and nothing would notice if the branch that reports it went away.
test('every declared C20/C20b/C20c/C20d code is produced by at least one case above', () => {
  const declared = [...C20_FINDINGS, ...C20B_FINDINGS, ...C20C_FINDINGS, ...C20D_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
