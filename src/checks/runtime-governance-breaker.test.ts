// One test per case_ row of C25, C25b and C25c in
// scripts/test-validate-engineos.sh, same description text, plus one case per
// declared code the bash suite never exercised. C25b had no bash row: the
// transition canary was covered only by the arm's own unit tests.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import { editPolicyBlock, replaceOnce } from './runtime-governance-fixtures';
import { C25_FINDINGS, C25B_FINDINGS, C25C_FINDINGS } from './runtime-governance-breaker';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

const PARALLELISM_MD = 'rules/parallelism.md';

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editBreaker(root: string, mutate: (breaker: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'breaker', mutate);
}

// ------------------------------------------------------------------ C25

test('C25 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C25'), []);
});

test('a breaker state dropped from policy.json is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      breaker['states'] = ['closed', 'open'];
    });
  });
  assert.ok(hasFinding(findings, 'states-mismatch', 'closed,open'));
});

test('failure_threshold set to 0 is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      breaker['failure_threshold'] = 0;
    });
  });
  assert.ok(hasFinding(findings, 'below-1', 'failure_threshold'));
});

test('a cooldown the breaker cannot read as a whole number is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      breaker['cooldown_waves'] = 'one wave';
    });
  });
  assert.ok(hasFinding(findings, 'not-a-whole-number', 'cooldown_waves'));
});

test('an emptied scopes array is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      breaker['scopes'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'scopes-missing-or-empty'));
});

// The transitions table src/kernel/breaker.ts steps through.

test('an emptied breaker transitions table is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      breaker['transitions'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'transitions-malformed', 'transitions'));
});

test('a transition whose allow is not a boolean is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      transitionAt(breaker, 0)['allow'] = 'yes';
    });
  });
  assert.ok(hasFinding(findings, 'transitions-malformed', 'transitions[0].allow'));
});

test('a transition guard testing a fact its from-state cannot read is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      // closed reads threshold_reached; cooldown_elapsed is an open-state fact.
      transitionAt(breaker, 0)['guard'] = { cooldown_elapsed: true };
    });
  });
  assert.ok(hasFinding(findings, 'transitions-malformed', 'transitions[0].guard.cooldown_elapsed'));
});

test('a transition to a state the breaker never declares is caught', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      transitionAt(breaker, 0)['to'] = 'melted';
    });
  });
  assert.ok(hasFinding(findings, 'transition-state-undeclared', 'transitions[0].to:melted'));
});

test('a state with no edge leading back out is caught as unreachable', (t) => {
  const findings = run(t, 'C25', (root) => {
    editBreaker(root, (breaker) => {
      // Both half-open edges now stay in half-open: closed and open can still
      // reach it, but nothing leaves it.
      transitionAt(breaker, 4)['to'] = 'half-open';
      transitionAt(breaker, 5)['to'] = 'half-open';
    });
  });
  assert.ok(hasFinding(findings, 'state-unreachable', 'half-open->closed'));
  assert.ok(hasFinding(findings, 'state-unreachable', 'half-open->open'));
  // The healthy starts still reach everything, so they are not reported.
  assert.ok(!hasFinding(findings, 'state-unreachable', 'closed->half-open'));
});

// ------------------------------------------------------------------ C25b

test('C25b passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C25b'), []);
});

// A threshold the strict loader refuses: the canary can no longer derive its
// at-threshold input, and every arm it still asks answers an error.
test('a breaker arm that answers no transition is caught', (t) => {
  const findings = run(t, 'C25b', (root) => {
    editBreaker(root, (breaker) => {
      breaker['failure_threshold'] = 'three';
    });
  });
  assert.ok(hasFinding(findings, 'failure-threshold-unusable'));
  assert.ok(hasFinding(findings, 'transition-mismatch', 'cooldown-elapsed:none/null'));
});

// ------------------------------------------------------------------ C25c

test('C25c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C25c'), []);
});

test('the breaker threshold changed in policy.json without the prose is caught', (t) => {
  const findings = run(t, 'C25c', (root) => {
    editBreaker(root, (breaker) => {
      breaker['failure_threshold'] = 7;
    });
  });
  assert.ok(hasFinding(findings, 'failure-threshold-drift', '3!=7'));
});

test("a scope id removed from the breaker's vocabulary sentence is caught", (t) => {
  const findings = run(t, 'C25c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, '`mcp` (an MCP server), ', ''));
  });
  assert.ok(hasFinding(findings, 'scope-vocabulary-missing', 'mcp'));
});

// The vacuity proof: delete the vocabulary sentence outright while every scope
// id survives elsewhere in the same section. The row is anchored on the sentence
// ("scopes over ... `<id>`"), not on the section, so every declared scope is
// reported missing rather than found in the exec-journal paragraph.
test('deleting the scope vocabulary while every id survives elsewhere in the section is caught', (t) => {
  const findings = run(t, 'C25c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => {
      const withoutSentence = replaceOnce(
        text,
        /The breaker is per resource[\s\S]*?`agent` \(an agent type\)\./,
        'The breaker is per resource.',
      );
      // The span-kind list is widened in the SAME section so every scope id
      // still appears inside it — a plausible documentation edit, since `agent`
      // is a real span_kind.
      return replaceOnce(
        withoutSentence,
        '`span_kind` `tool` or `model`',
        '`span_kind` `tool`, `mcp`, `agent`, `provider` or `model`',
      );
    });
  });
  for (const scope of ['provider', 'mcp', 'tool', 'agent']) {
    assert.ok(hasFinding(findings, 'scope-vocabulary-missing', scope));
  }
});

test('a declared state with no row in the breaker table is caught', (t) => {
  const findings = run(t, 'C25c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, '| `half-open` |', '| `probing` |'));
  });
  assert.ok(hasFinding(findings, 'state-row-missing', 'half-open'));
  assert.ok(hasFinding(findings, 'state-row-missing', 'undeclared:probing'));
});

test('the Circuit breaker section renamed in rules/parallelism.md is caught', (t) => {
  const findings = run(t, 'C25c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, '## Circuit breaker', '## Breakers'));
  });
  assert.ok(hasFinding(findings, 'no-circuit-breaker-section', PARALLELISM_MD));
});

test('the kernel.sh breaker call dropped from rules/parallelism.md is caught', (t) => {
  const findings = run(t, 'C25c', (root) => {
    editFile(root, PARALLELISM_MD, (text) => replaceOnce(text, 'kernel.sh breaker', 'the breaker arm'));
  });
  assert.ok(hasFinding(findings, 'does-not-name-kernel-sh-breaker', PARALLELISM_MD));
});


// ------------------------------------------------------------------ internals

function transitionAt(breaker: Record<string, unknown>, index: number): Record<string, unknown> {
  const rows = breaker['transitions'];
  if (!Array.isArray(rows)) throw new Error('breaker.transitions is not an array');
  const row: unknown = rows[index];
  if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new Error(`transitions[${index}] is not a row`);
  const record: Record<string, unknown> = { ...row };
  rows[index] = record;
  return record;
}

// ------------------------------------------------------------------- coverage

test('every declared C25/C25b/C25c code is produced by at least one case above', () => {
  const declared = [...C25_FINDINGS, ...C25B_FINDINGS, ...C25C_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
