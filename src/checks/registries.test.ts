import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { REGISTRIES_CHECKS } from './registries';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';

// Which codes the cases below actually produced. The last test compares it with
// every declared list, so a code no case can trigger is a failing test rather
// than a finding nobody has ever seen.
const produced = new Set<string>();

function findingsFor(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const found = findingsOf(REGISTRIES_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of found) produced.add(`${id}:${entry.code}`);
  return found;
}

// ---------------------------------------------------------------- C6/C7/C8

test('C6 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C6'), []);
});

test('a domain naming a nonexistent agent is caught', (t) => {
  const found = findingsFor(t, 'C6', (root) => {
    editDomain(root, 'test', (row) => {
      row['agent'] = 'ghost-writer';
    });
  });
  assert.ok(hasFinding(found, 'missing-agent', 'ghost-writer'));
});

test('C7 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C7'), []);
});

test('a domain naming a nonexistent skill is caught', (t) => {
  const found = findingsFor(t, 'C7', (root) => {
    editDomain(root, 'frontend', (row) => {
      row['skills'] = ['ghost-skill'];
    });
  });
  assert.ok(hasFinding(found, 'missing-skill', 'ghost-skill'));
});

test('C8 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C8'), []);
});

test('a domain naming a nonexistent rule is caught', (t) => {
  const found = findingsFor(t, 'C8', (root) => {
    editDomain(root, 'backend', (row) => {
      row['rules'] = ['ghost-rule'];
    });
  });
  assert.ok(hasFinding(found, 'missing-rule', 'ghost-rule'));
});

// -------------------------------------------------------------------- C14

test('C14 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C14'), []);
});

test('a registry that is not valid JSON is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editFile(root, 'registries/docs-ledger.json', () => '{ "version": ');
  });
  assert.ok(hasFinding(found, 'malformed-json', 'registries/docs-ledger.json'));
});

test('a deleted routing registry is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    rmSync(join(root, 'registries/routing.json'));
  });
  assert.ok(hasFinding(found, 'missing', 'registries/routing.json'));
});

test('a deleted decision-rules registry is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    rmSync(join(root, 'registries/decision-rules.json'));
  });
  assert.ok(hasFinding(found, 'missing', 'registries/decision-rules.json'));
});

test('registry precedence out of map order is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/routing.json', (document) => {
      const order = list(document, 'precedence');
      const head = order[0];
      order[0] = order[1];
      order[1] = head;
    });
  });
  assert.ok(hasFinding(found, 'precedence-order-drift', 'test'));
});

test('a domain naming missing agents, skills and rules is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editDomain(root, 'llm', (row) => {
      row['agent'] = 'ghost-agent';
      row['skills'] = ['ghost-skill'];
      row['rules'] = ['ghost-rule'];
    });
  });
  assert.ok(hasFinding(found, 'missing-agent', 'ghost-agent'));
  assert.ok(hasFinding(found, 'missing-skill', 'ghost-skill'));
  assert.ok(hasFinding(found, 'missing-rule', 'ghost-rule'));
});

test('duplicate decision rule id is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      const rules = list(document, 'rules');
      rules.push(rules[0]);
    });
  });
  assert.ok(hasFinding(found, 'duplicate-rule-id', 'rule-spec-threshold'));
});

test('decision rule that requires nothing is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      list(document, 'rules').push({ id: 'rule-noop', priority: 1, when: {}, then: {} });
    });
  });
  assert.ok(hasFinding(found, 'empty-then', 'rule-noop'));
});

test('a decision rule signal that is not a valid regex is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      rule(document, 'rule-fanout')['signals'] = ['([unclosed'];
    });
  });
  assert.ok(hasFinding(found, 'invalid-signal', 'rule-fanout'));
});

test('verification registry drifting back to mandatory tests is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      outcome(rule(document, 'rule-verification'))['require'] = [
        'typecheck', 'lint', 'relevant-tests', 'output-shown',
      ];
    });
  });
  assert.ok(hasFinding(found, 'verification-require-drift', 'lint,output-shown,relevant-tests,typecheck'));
});

test('the verification rule repointed at another source is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      rule(document, 'rule-verification')['source'] = 'rules/gates.md';
    });
  });
  assert.ok(hasFinding(found, 'verification-source-drift', 'rules/gates.md'));
});

test('rules/verification.md losing the final-integrated-approval sentence is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editFile(root, 'rules/verification.md', (text) =>
      text.replace('Checks join the gate ONLY after implementation and integration are complete', 'Checks may run whenever convenient'));
  });
  assert.ok(hasFinding(found, 'verification-rule-prose-missing', 'rules/verification.md'));
});

test('rules/gates.md losing the deferral to the verification rule is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editFile(root, 'rules/gates.md', (text) =>
      text.replace('`rules/verification.md` owns which checks are in', '`rules/verification.md` lists checks in'));
  });
  assert.ok(hasFinding(found, 'verification-gate-prose-missing', 'rules/gates.md'));
});

test('a decision rule source naming a file that does not exist is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      rule(document, 'rule-fanout')['source'] = 'rules/no-such.md';
    });
  });
  assert.ok(hasFinding(found, 'source-file-missing', 'rule-fanout:rules/no-such.md'));
});

// The sweep reads a sentence, not a path. Prose with no path token reports
// nothing, and a token embedded in a longer word (`decision-rules/rules.json`)
// is not mistaken for `rules/rules.json`.
test('a prose source, with or without an embedded path-like token, is clean', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/decision-rules.json', (document) => {
      rule(document, 'rule-fanout')['source'] = 'adapted from the corpus (decision-rules/rules.json)';
    });
  });
  assert.deepEqual(found, []);
});

test('an agent capability_id that no capability defines is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/agents.json', (document) => {
      first(document, 'agents')['capability_ids'] = ['ghost-capability'];
    });
  });
  assert.ok(found.some((entry) =>
    entry.code === 'dangling-capability-id' && (entry.subject ?? '').endsWith(':ghost-capability')));
});

// Absent means "binds no workflow capability", which is what most agent rows
// mean; only a declared id that resolves to nothing is a finding.
test('agent rows declaring no capability_ids at all are clean', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editJson(root, 'registries/agents.json', (document) => {
      for (const row of rows(document, 'agents')) delete row['capability_ids'];
    });
  });
  assert.deepEqual(found, []);
});

test('a capability bound to an agent absent from agents.json is caught', (t) => {
  const found = findingsFor(t, 'C14', (root) => {
    editCapability(root, 'route', (row) => {
      row['agent'] = 'ghost-agent';
    });
  });
  assert.ok(hasFinding(found, 'unknown-capability-agent', 'route:ghost-agent'));
});

// -------------------------------------------------------------------- C15

test('C15 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C15'), []);
});

test('capabilities.json binding a nonexistent agent is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    editCapability(root, 'implement', (row) => {
      row['agent'] = 'ghost-writer';
    });
  });
  assert.ok(hasFinding(found, 'capability-missing-agent', 'ghost-writer'));
});

test('route capability repointed at a nonexistent agent is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    editCapability(root, 'route', (row) => {
      row['agent'] = 'ghost-router';
    });
  });
  assert.ok(hasFinding(found, 'capability-missing-agent', 'ghost-router'));
});

test('capabilities.json with an invalid model tier is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    editCapability(root, 'implement', (row) => {
      row['model_tier'] = 'medium';
    });
  });
  assert.ok(hasFinding(found, 'capability-invalid-tier', 'implement'));
});

test('agents.json with an invalid model tier is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    editJson(root, 'registries/agents.json', (document) => {
      first(document, 'agents')['model_tier'] = 'fast';
    });
  });
  assert.ok(hasFinding(found, 'agent-invalid-tier', 'android-builder'));
});

test('agents.json naming a file that does not exist under agents/ is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    editJson(root, 'registries/agents.json', (document) => {
      first(document, 'agents')['name'] = 'ghost-writer';
    });
  });
  assert.ok(hasFinding(found, 'agent-file-missing', 'ghost-writer'));
});

test('a deleted capabilities registry is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    rmSync(join(root, 'registries/capabilities.json'));
  });
  assert.ok(hasFinding(found, 'missing', 'registries/capabilities.json'));
});

test('a deleted agents registry is caught', (t) => {
  const found = findingsFor(t, 'C15', (root) => {
    rmSync(join(root, 'registries/agents.json'));
  });
  assert.ok(hasFinding(found, 'missing', 'registries/agents.json'));
});

// ------------------------------------------------------------------- C15b

test('C15b passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C15b'), []);
});

test("capability tier drifting from its agent's tier is caught", (t) => {
  const found = findingsFor(t, 'C15b', (root) => {
    editCapability(root, 'implement', (row) => {
      row['model_tier'] = 'design';
    });
  });
  assert.ok(hasFinding(found, 'tier-mismatch', 'implement'));
});

// C15b reads two registries and reports nothing when either is absent, the way
// the bash `[ -f "$C" ] && [ -f "$A" ] || return 0` guard did: C15 owns the
// missing file, and a second copy of that finding helps nobody.
test('C15b reports nothing when a registry it compares is absent', (t) => {
  assert.deepEqual(findingsFor(t, 'C15b', (root) => {
    rmSync(join(root, 'registries/agents.json'));
  }), []);
});

// ---------------------------------------------------------------- coverage

test('every declared finding code is produced by a case in this file', () => {
  const dead: string[] = [];
  for (const check of REGISTRIES_CHECKS) {
    for (const code of check.codes) {
      if (!produced.has(`${check.id}:${code}`)) dead.push(`${check.id}:${code}`);
    }
  }
  assert.deepEqual(dead, []);
});

// -------------------------------------------------------------------- helpers

// The sed/python mutations of the bash suite, typed: read the JSON, hand the
// caller the object it wants to break, write it back.
function editJson(root: string, relativePath: string, edit: (document: Record<string, unknown>) => void): void {
  editFile(root, relativePath, (text) => {
    const document: unknown = JSON.parse(text);
    if (!isRecord(document)) throw new Error(`${relativePath} is not a JSON object`);
    edit(document);
    return `${JSON.stringify(document, null, 2)}\n`;
  });
}

function list(document: Record<string, unknown>, key: string): unknown[] {
  const value = document[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

function rows(document: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return list(document, key).filter(isRecord);
}

function first(document: Record<string, unknown>, key: string): Record<string, unknown> {
  const row = rows(document, key)[0];
  if (row === undefined) throw new Error(`${key} is empty`);
  return row;
}

function rowWithId(document: Record<string, unknown>, key: string, id: string): Record<string, unknown> {
  const row = rows(document, key).find((candidate) => candidate['id'] === id);
  if (row === undefined) throw new Error(`no ${key} row with id ${id}`);
  return row;
}

function rule(document: Record<string, unknown>, id: string): Record<string, unknown> {
  return rowWithId(document, 'rules', id);
}

function outcome(target: Record<string, unknown>): Record<string, unknown> {
  const then = target['then'];
  if (!isRecord(then)) throw new Error('rule has no then object');
  return then;
}

// The two mutation shapes that need their own file read: a routing domain and a
// capability, each addressed by id and edited in place.
function editDomain(root: string, id: string, edit: (row: Record<string, unknown>) => void): void {
  editJson(root, 'registries/routing.json', (document) => {
    edit(rowWithId(document, 'domains', id));
  });
}

function editCapability(root: string, id: string, edit: (row: Record<string, unknown>) => void): void {
  editJson(root, 'registries/capabilities.json', (document) => {
    edit(rowWithId(document, 'capabilities', id));
  });
}
