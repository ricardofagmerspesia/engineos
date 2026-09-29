// One test per case_ row of C16 in scripts/test-validate-engineos.sh, same
// description text, plus one case per declared code the bash suite never
// exercised. Assertions are on findings, never on rendered lines (design
// deviation 8), so rewording a title is no longer a behaviour change.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import { C16_FINDINGS, DECISION_REGISTRIES_CHECKS } from './decision-registries';

// Filled as the cases run; the last test turns it into the "no dead code"
// assertion the family PR contract requires.
const PRODUCED = new Set<string>();

function run(t: TestContext, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(DECISION_REGISTRIES_CHECKS, 'C16', contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

// ------------------------------------------------------------- JSON mutations

function editJson(root: string, relativePath: string, mutate: (doc: Record<string, unknown>) => void): void {
  editFile(root, relativePath, (text) => {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error(`${relativePath} is not a JSON object`);
    mutate(parsed);
    return JSON.stringify(parsed, null, 2);
  });
}

function arrayAt(doc: Record<string, unknown>, key: string): unknown[] {
  const value = doc[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

function recordAt(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = doc[key];
  if (!isRecord(value)) throw new Error(`${key} is not an object`);
  return value;
}

function rowAt(rows: readonly unknown[], index: number): Record<string, unknown> {
  const row = rows[index];
  if (!isRecord(row)) throw new Error(`row ${index} is not an object`);
  return row;
}

function rowById(rows: readonly unknown[], id: string): Record<string, unknown> {
  for (const row of rows) if (isRecord(row) && row['id'] === id) return row;
  throw new Error(`no row with id ${id}`);
}

function withoutId(rows: readonly unknown[], id: string): unknown[] {
  return rows.filter((row) => !(isRecord(row) && row['id'] === id));
}

function strings(doc: Record<string, unknown>, key: string): string[] {
  return arrayAt(doc, key).filter((entry): entry is string => typeof entry === 'string');
}

function dropLines(root: string, relativePath: string, prefix: string): void {
  editFile(root, relativePath, (text) =>
    text
      .split('\n')
      .filter((line) => !line.startsWith(prefix))
      .join('\n'),
  );
}

// ------------------------------------------------------------------ clean tree

test('C16 reports nothing on an unmutated checkout', (t) => {
  assert.deepEqual(run(t), []);
});

// ------------------------------------------------- ported case_ rows (14 rows)

test('a routing domain deleted out from under its intent FK is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/routing.json', (doc) => {
      doc['domains'] = withoutId(arrayAt(doc, 'domains'), 'llm');
      doc['precedence'] = strings(doc, 'precedence').filter((entry) => entry !== 'llm');
    });
  });
  assert.ok(hasFinding(findings, 'intent-routing-mismatch', 'llm->llm'));
});

test('models.json escalates_to chain break is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      rowById(arrayAt(doc, 'tiers'), 'build')['escalates_to'] = 'cheap';
    });
  });
  assert.ok(hasFinding(findings, 'escalates-to-breaks-order', 'build'));
});

test('models.json work_type with an unknown tier is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      rowAt(arrayAt(doc, 'work_types'), 0)['tier'] = 'turbo';
    });
  });
  assert.ok(hasFinding(findings, 'work-type-unknown-tier', 'spec'));
});

test('moving ADR back off the most-capable tier without editing the prose is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      rowById(arrayAt(doc, 'work_types'), 'adr')['tier'] = 'design';
    });
  });
  assert.ok(hasFinding(findings, 'adr-row-model-mismatch', 'opus'));
});

test('agent declaring a model models.json does not bind is caught', (t) => {
  const findings = run(t, (root) => {
    editFile(root, 'agents/product-spec.md', (text) => text.replace('model: fable', 'model: gpt'));
  });
  assert.ok(hasFinding(findings, 'agent-model-unbound', 'product-spec(gpt)'));
});

test('duplicate intent id is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const intents = arrayAt(doc, 'intents');
      intents.push({ ...rowAt(intents, 0) });
    });
  });
  assert.ok(hasFinding(findings, 'duplicate-intent-id', 'new-feature'));
});

test('hook-mirrored intent losing its domain FK is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      delete rowById(arrayAt(doc, 'intents'), 'backend')['domain'];
    });
  });
  assert.ok(hasFinding(findings, 'hook-mirrored-domain-mismatch', 'backend'));
});

test('mirrored intent rules drifting from routing.json is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const backend = rowById(arrayAt(doc, 'intents'), 'backend');
      backend['rules'] = strings(backend, 'rules').filter((rule) => rule !== 'testing');
    });
  });
  assert.ok(
    hasFinding(
      findings,
      'intent-routing-mismatch',
      'backend(rules:backend,architecture,data,observability!=backend,architecture,data,testing,observability)',
    ),
  );
});

test('a routing.json domain left unclaimed by intents is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      doc['intents'] = withoutId(arrayAt(doc, 'intents'), 'android-release');
    });
  });
  assert.ok(hasFinding(findings, 'routing-domain-not-claimed-once', 'android-release(x0)'));
});

test('a CLAUDE.md router row added without a registry update is caught', (t) => {
  const findings = run(t, (root) => {
    editFile(root, 'CLAUDE.md', (text) => {
      const anchor = '| Claiming done / complete / fixed';
      return text.replace(anchor, `| Fake new intent (made up) | nothing |\n${anchor}`);
    });
  });
  assert.ok(hasFinding(findings, 'intent-count-drift', 'registry=32,claude=32'));
});

test('policy.json wave cap drifting from the parallelism prose is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(doc, 'parallelism')['wave_concurrency_cap'] = 4;
    });
  });
  assert.ok(hasFinding(findings, 'wave-cap-drift', '6!=4'));
});

test('policy.json losing an autonomy level is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      const autonomy = recordAt(doc, 'autonomy');
      autonomy['levels'] = withoutId(arrayAt(autonomy, 'levels'), 'A4');
    });
  });
  assert.ok(hasFinding(findings, 'autonomy-levels-drift', 'A0,A1,A2,A3'));
});

test('policy.json gate matrix missing a gate for a tier is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      delete recordAt(recordAt(recordAt(doc, 'gates'), 'by_risk'), 'medium')['release'];
    });
  });
  assert.ok(hasFinding(findings, 'gates-by-risk-incomplete', 'medium'));
});

test('spec threshold drifting between CLAUDE.md and policy.json is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(recordAt(doc, 'gates'), 'spec_threshold')['files_greater_than'] = 5;
    });
  });
  assert.ok(hasFinding(findings, 'spec-threshold-drift', '2!=5'));
});

// ------------------------------------- codes the bash suite never exercised

test('a missing registries/models.json ends the models block', (t) => {
  const findings = run(t, (root) => {
    rmSync(`${root}/registries/models.json`);
  });
  assert.ok(hasFinding(findings, 'registry-unreadable', 'registries/models.json'));
});

test('a tier dropped from escalation_order is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      doc['escalation_order'] = strings(doc, 'escalation_order').filter((tier) => tier !== 'cheap');
    });
  });
  assert.ok(hasFinding(findings, 'escalation-order-not-a-permutation', 'missing:cheap'));
});

test('a duplicated tier id is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      const tiers = arrayAt(doc, 'tiers');
      tiers.push({ ...rowAt(tiers, 0) });
    });
  });
  assert.ok(hasFinding(findings, 'duplicate-tier-id', 'most-capable'));
});

test('a shared model binding no longer documented in rules/models.md is caught', (t) => {
  const findings = run(t, (root) => {
    editFile(root, 'rules/models.md', (text) => text.replace('bound to the same model', 'bound to one model'));
  });
  assert.ok(hasFinding(findings, 'shared-binding-undocumented', 'opus'));
});

test('a tier model missing from the rules/models.md prose is caught', (t) => {
  const findings = run(t, (root) => {
    editFile(root, 'rules/models.md', (text) => text.replace('`haiku`', 'haiku'));
  });
  assert.ok(hasFinding(findings, 'model-missing-from-prose', 'haiku'));
});

test('moving code review off the build tier without editing the prose is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      rowById(arrayAt(doc, 'work_types'), 'code-review')['tier'] = 'cheap';
    });
  });
  assert.ok(hasFinding(findings, 'code-review-row-model-mismatch', 'haiku'));
});

test('an intent naming a rule file that does not exist is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const intent = rowAt(arrayAt(doc, 'intents'), 0);
      intent['rules'] = [...strings(intent, 'rules'), 'nonexistent'];
    });
  });
  assert.ok(hasFinding(findings, 'dangling-reference', 'rule:nonexistent'));
});

test('an intent naming a command file that does not exist is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const intent = rowAt(arrayAt(doc, 'intents'), 0);
      intent['commands'] = [...strings(intent, 'commands'), '/engineos:no-such-command'];
    });
  });
  assert.ok(hasFinding(findings, 'dangling-reference', 'command:/engineos:no-such-command'));
});

test('a signal carrying placeholder metasyntax is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      const intent = rowAt(arrayAt(doc, 'intents'), 0);
      intent['signals'] = [...strings(intent, 'signals'), 'should we use X or Y'];
    });
  });
  assert.ok(hasFinding(findings, 'unmatchable-signal', 'new-feature:should-we-use-X-or-Y'));
});

test('an intent model_tier no tier answers to is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      rowAt(arrayAt(doc, 'intents'), 0)['model_tier'] = 'turbo';
    });
  });
  assert.ok(hasFinding(findings, 'intent-unknown-model-tier', 'new-feature'));
});

test('an intent risk_floor outside the three tiers is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/intents.json', (doc) => {
      rowAt(arrayAt(doc, 'intents'), 0)['risk_floor'] = 'critical';
    });
  });
  assert.ok(hasFinding(findings, 'intent-invalid-risk-floor', 'new-feature'));
});

test('policy.json risk aggregation other than max is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(doc, 'risk')['aggregation'] = 'avg';
    });
  });
  assert.ok(hasFinding(findings, 'risk-aggregation-not-max', 'avg'));
});

test('policy.json losing a risk input is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      const risk = recordAt(doc, 'risk');
      risk['inputs'] = withoutId(arrayAt(risk, 'inputs'), 'spend');
    });
  });
  assert.ok(hasFinding(findings, 'risk-inputs-drift', 'missing:spend'));
});

test('an autonomy ceiling keyed by something that is not a risk tier is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(recordAt(doc, 'autonomy'), 'ceiling_by_risk')['critical'] = 'A2';
    });
  });
  assert.ok(hasFinding(findings, 'ceiling-by-risk-invalid', 'critical'));
});

test('a gate dropped from the rules/gates.md ladder table is caught', (t) => {
  const findings = run(t, (root) => {
    dropLines(root, 'rules/gates.md', '| Release |');
  });
  assert.ok(hasFinding(findings, 'gate-ladder-missing-from-prose', 'release'));
});

test('policy.json never_retry shrinking below four entries is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      const retry = recordAt(doc, 'retry');
      retry['never_retry'] = arrayAt(retry, 'never_retry').slice(0, 2);
    });
  });
  assert.ok(hasFinding(findings, 'never-retry-shrunk', '2'));
});

test('policy.json retry escalations drifting from the prose bound is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(doc, 'retry')['escalations'] = 2;
    });
  });
  assert.ok(hasFinding(findings, 'retry-bound-drift', 'escalations:2'));
});

test('fan-out threshold drifting between rules/parallelism.md and policy.json is caught', (t) => {
  const findings = run(t, (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      recordAt(recordAt(doc, 'parallelism'), 'fanout_signals')['files_greater_than'] = 9;
    });
  });
  assert.ok(hasFinding(findings, 'fanout-threshold-drift', '3!=9'));
});

// ------------------------------------------------------------------- coverage

// A declared code no case produces is dead: nothing proves it can ever be
// reported, and nothing would notice if the branch that reports it went away.
test('every declared C16 code is produced by at least one case above', () => {
  const dead = C16_FINDINGS.filter((code) => !PRODUCED.has(code));
  assert.deepEqual(dead, []);
});
