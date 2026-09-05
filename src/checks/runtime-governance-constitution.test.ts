// One test per case_ row of C23, C23c, C24, C24b and C24c in
// scripts/test-validate-engineos.sh, same description text, plus one case per
// declared code the bash suite never exercised. C24b and C24c had no bash rows
// at all — the kernel canary was covered only by the arm's own unit tests, and
// the prose mirror by nothing.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import { editPolicyBlock, recordAt, replaceOnce } from './runtime-governance-fixtures';
import { C23_FINDINGS, C23C_FINDINGS } from './runtime-governance-constitution';
import { C24_FINDINGS, C24B_FINDINGS, C24C_FINDINGS } from './runtime-governance-backpressure';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

const PARALLELISM_MD = 'rules/parallelism.md';

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editBackpressure(root: string, mutate: (backpressure: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'parallelism', (parallelism) => {
    mutate(recordAt(parallelism, 'backpressure'));
  });
}

// ------------------------------------------------------------------ C23

test('C23 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C23'), []);
});

test("a reordered precedence domain in CLAUDE.md's sentence is caught", (t) => {
  const findings = run(t, 'C23', (root) => {
    editFile(root, 'CLAUDE.md', (text) =>
      replaceOnce(text, 'security → test → backend', 'test → security → backend'),
    );
  });
  assert.ok(hasFinding(findings, 'precedence-sentence-disagrees'));
});

test("context.md dropped from COMPATIBILITY.md's always-on enumeration is caught", (t) => {
  const findings = run(t, 'C23', (root) => {
    editFile(root, 'docs/COMPATIBILITY.md', (text) => replaceOnce(text, '`context.md`) load', ') load'));
  });
  assert.ok(hasFinding(findings, 'missing-from-compatibility', 'context.md'));
});

test('a precedence domain missing from the chain sentence entirely is caught', (t) => {
  const findings = run(t, 'C23', (root) => {
    editFile(root, 'CLAUDE.md', (text) => replaceOnce(text, ' → llm', ''));
  });
  assert.ok(hasFinding(findings, 'precedence-domain-missing', 'llm'));
});

// ------------------------------------------------------------------ C23c

test('C23c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C23c'), []);
});

test('the retired "authoritative for file-pattern routing" claim restored in CLAUDE.md is caught', (t) => {
  const findings = run(t, 'C23c', (root) => {
    editFile(root, 'CLAUDE.md', (text) =>
      replaceOnce(
        text,
        'resolved by `scripts/kernel.sh route-path`',
        'which is authoritative for file-pattern routing, resolved by `scripts/kernel.sh route-path`',
      ),
    );
  });
  assert.ok(hasFinding(findings, 'authority-claim-reintroduced', 'CLAUDE.md'));
});

// ------------------------------------------------------------------ C24

test('C24 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C24'), []);
});

test('max_queued_units set to a word is caught', (t) => {
  const findings = run(t, 'C24', (root) => {
    editBackpressure(root, (backpressure) => {
      backpressure['max_queued_units'] = 'many';
    });
  });
  assert.ok(hasFinding(findings, 'not-a-whole-number', 'max_queued_units'));
});

test('a max_inflight copy of the wave cap added under backpressure is caught', (t) => {
  const findings = run(t, 'C24', (root) => {
    editPolicyBlock(root, 'parallelism', (parallelism) => {
      recordAt(parallelism, 'backpressure')['max_inflight'] = parallelism['wave_concurrency_cap'];
    });
  });
  assert.ok(hasFinding(findings, 'max-inflight-copy-of-wave-cap', 'max_inflight'));
});

test('a queue bound of 0, which makes the overload action unreachable, is caught', (t) => {
  const findings = run(t, 'C24', (root) => {
    editBackpressure(root, (backpressure) => {
      backpressure['max_queued_units'] = 0;
    });
  });
  assert.ok(hasFinding(findings, 'below-1', 'max_queued_units'));
});

test('an overload_action the actions list never declares is caught', (t) => {
  const findings = run(t, 'C24', (root) => {
    editBackpressure(root, (backpressure) => {
      backpressure['overload_action'] = 'queue-forever';
    });
  });
  assert.ok(hasFinding(findings, 'overload-action-not-in-actions', 'queue-forever'));
});

// ------------------------------------------------------------------ C24b

test('C24b passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C24b'), []);
});

// The bash had no admission canary case. A wave cap the kernel's strict loader
// refuses still READS as a whole number here, so both ends are asked and both
// answer nothing — which is what the canary exists to notice.
test('an admission arm that answers neither end is caught', (t) => {
  const findings = run(t, 'C24b', (root) => {
    editPolicyBlock(root, 'parallelism', (parallelism) => {
      parallelism['wave_concurrency_cap'] = String(parallelism['wave_concurrency_cap']);
    });
  });
  assert.ok(hasFinding(findings, 'expected-reject-at-cap-with-full-queue', 'none'));
  assert.ok(hasFinding(findings, 'expected-dispatch-when-idle', 'none'));
});

// ------------------------------------------------------------------ C24c

test('C24c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C24c'), []);
});

test('the kernel.sh admit call dropped from rules/parallelism.md is caught', (t) => {
  const findings = run(t, 'C24c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, 'kernel.sh admit', 'the admission arm'));
  });
  assert.ok(hasFinding(findings, 'does-not-name-kernel-sh-admit', PARALLELISM_MD));
});

test('a declared action with no row in the backpressure table is caught', (t) => {
  const findings = run(t, 'C24c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, '| `defer` |', '| `hold` |'));
  });
  assert.ok(hasFinding(findings, 'action-row-missing', 'defer'));
  // The reverse half of the same row: a table row the kernel never answers.
  assert.ok(hasFinding(findings, 'action-row-missing', 'undeclared:hold'));
});

test('the queue bound changed in policy.json without the prose is caught', (t) => {
  const findings = run(t, 'C24c', (root) => {
    editBackpressure(root, (backpressure) => {
      backpressure['max_queued_units'] = 20;
    });
  });
  assert.ok(hasFinding(findings, 'queue-bound-drift', '12!=20'));
});

test('the overload row explaining the queue bound deleted is caught', (t) => {
  const findings = run(t, 'C24c', (root) => {
    editFile(root, PARALLELISM_MD, (text) =>
      replaceOnce(text, /^\| `defer` \|.*$/m, '| `defer` | cap reached, queue below the bound |'),
    );
  });
  assert.ok(hasFinding(findings, 'overload-row-missing', 'defer'));
});

// ------------------------------------------------------------------- coverage

test('every declared C23/C23c/C24/C24b/C24c code is produced by at least one case above', () => {
  const declared = [...C23_FINDINGS, ...C23C_FINDINGS, ...C24_FINDINGS, ...C24B_FINDINGS, ...C24C_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
