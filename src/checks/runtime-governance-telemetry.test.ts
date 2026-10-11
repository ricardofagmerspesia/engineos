// One test per case_ row of C22, C22b and C22c in
// scripts/test-validate-engineos.sh, same description text, plus one case per
// declared code the bash suite never exercised.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { isRecord } from '../lib/json';
import type { CheckId } from './ids';
import type { Finding } from './findings';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding, writeFile } from './testing';
import { arrayAt, editPolicyBlock, editJson, replaceOnce, rowById } from './runtime-governance-fixtures';
import { C22_FINDINGS, C22B_FINDINGS, C22C_FINDINGS } from './runtime-governance-telemetry';
import { RUNTIME_GOVERNANCE_CHECKS } from './runtime-governance';

const PRODUCED = new Set<string>();

const ADVISOR = 'src/hooks/prompt-advisor.ts';
const SCAFFOLDER = 'src/hooks/ensure-project-layout.ts';

function run(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const findings = findingsOf(RUNTIME_GOVERNANCE_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of findings) PRODUCED.add(entry.code);
  return findings;
}

function editTelemetry(root: string, mutate: (telemetry: Record<string, unknown>) => void): void {
  editPolicyBlock(root, 'telemetry', mutate);
}

function editEvent(root: string, id: string, mutate: (event: Record<string, unknown>) => void): void {
  editTelemetry(root, (telemetry) => {
    mutate(rowById(arrayAt(telemetry, 'events'), id));
  });
}

// ------------------------------------------------------------------ C22

test('C22 passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C22'), []);
});

test('the telemetry block deleted from policy.json is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editJson(root, 'registries/policy.json', (doc) => {
      delete doc['telemetry'];
    });
  });
  assert.ok(hasFinding(findings, 'retention-days-not-a-whole-number'));
  assert.ok(hasFinding(findings, 'value-pattern-missing-or-invalid'));
  assert.ok(hasFinding(findings, 'events-missing-or-empty'));
});

test('retention_days set to 0 is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editTelemetry(root, (telemetry) => {
      telemetry['retention_days'] = 0;
    });
  });
  assert.ok(hasFinding(findings, 'retention-days-below-1'));
});

test('an invalid value_pattern ERE is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editTelemetry(root, (telemetry) => {
      telemetry['value_pattern'] = '(';
    });
  });
  assert.ok(hasFinding(findings, 'value-pattern-missing-or-invalid'));
});

test("the route event's keys emptied is caught", (t) => {
  const findings = run(t, 'C22', (root) => {
    editEvent(root, 'route', (event) => {
      event['keys'] = [];
    });
  });
  assert.ok(hasFinding(findings, 'keys-missing-or-empty', 'route'));
});

test('written_by demoted from an array back to a bare string is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editEvent(root, 'route', (event) => {
      event['written_by'] = arrayAt(event, 'written_by')[0];
    });
  });
  assert.ok(hasFinding(findings, 'written-by-not-an-array', 'route'));
});

test('a written_by entry naming a file that does not exist is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editEvent(root, 'hitl', (event) => {
      event['written_by'] = [...arrayAt(event, 'written_by'), 'hooks/no-such-hook.sh'];
    });
  });
  assert.ok(hasFinding(findings, 'written-by-names-a-missing-file', 'hitl:hooks/no-such-hook.sh'));
});

test('a duplicated event id is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editTelemetry(root, (telemetry) => {
      const events = arrayAt(telemetry, 'events');
      telemetry['events'] = [...events, rowById(events, 'route')];
    });
  });
  assert.ok(hasFinding(findings, 'event-ids-have-duplicates'));
});

test('a written_by entry that is not a string is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editEvent(root, 'hitl', (event) => {
      event['written_by'] = [...arrayAt(event, 'written_by'), 7];
    });
  });
  assert.ok(hasFinding(findings, 'written-by-has-a-non-string-entry', 'hitl'));
});

test('a sample key the event never declared is caught', (t) => {
  const findings = run(t, 'C22', (root) => {
    editEvent(root, 'route', (event) => {
      const sample = event['sample'];
      if (!isRecord(sample)) throw new Error('the route sample is not an object');
      sample['prompt'] = 'x';
    });
  });
  assert.ok(hasFinding(findings, 'sample-keys-not-a-subset', 'route'));
});

// ------------------------------------------------------------------ C22b

test('C22b passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C22b'), []);
});

test('a two-word string in the decision-rules sample is caught by the live canary', (t) => {
  const findings = run(t, 'C22b', (root) => {
    editEvent(root, 'decision-rules', (event) => {
      const sample = event['sample'];
      if (!isRecord(sample)) throw new Error('the decision-rules sample is not an object');
      sample['rules'] = ['two words'];
    });
  });
  assert.ok(hasFinding(findings, 'sample-did-not-round-trip', 'decision-rules'));
});

test('an event the writer accepts without the registry declaring it is caught', (t) => {
  const findings = run(t, 'C22b', (root) => {
    editTelemetry(root, (telemetry) => {
      telemetry['events'] = [
        ...arrayAt(telemetry, 'events'),
        { id: 'bogus-event', keys: [], written_by: ['src/hooks/telemetry.ts'], sample: {} },
      ];
    });
  });
  assert.ok(hasFinding(findings, 'unknown-event-was-not-rejected'));
});

test('a value_pattern that admits whitespace is caught', (t) => {
  const findings = run(t, 'C22b', (root) => {
    editTelemetry(root, (telemetry) => {
      telemetry['value_pattern'] = '.*';
    });
  });
  assert.ok(hasFinding(findings, 'whitespace-value-was-not-rejected'));
});

// ------------------------------------------------------------------ C22c

test('C22c passes on an unmutated checkout', (t) => {
  assert.deepEqual(run(t, 'C22c'), []);
});

test('the route telemetry event removed from prompt-advisor.ts is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    // Global: prompt-advisor.ts emits `route` twice (the routed answer and the
    // not-user-input skip), and the event is removed only when every emission is.
    editFile(root, ADVISOR, (text) => replaceOnce(text, /event\(sink, 'route',/g, "event(sink, 'route-missing',"));
  });
  assert.ok(hasFinding(findings, 'does-not-emit-event', `${ADVISOR}:route`));
});

test("prompt-advisor's event call reading the prompt instead of the route data is caught", (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, ADVISOR, (text) =>
      replaceOnce(text, "event(sink, 'route', routeData);", "event(sink, 'route', { intents: [env.prompt] });"),
    );
  });
  assert.ok(hasFinding(findings, 'event-call-references-prompt-text', ADVISOR));
});

test("ensure-project-layout's registry read replaced with a hardcoded retention window is caught", (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, SCAFFOLDER, (text) =>
      replaceOnce(text, 'reapIfStale(join(dir, name), days, now)', 'reapIfStale(join(dir, name), 90, now)'),
    );
  });
  assert.ok(hasFinding(findings, 'hardcoded-retention-literal', SCAFFOLDER));
});

// The reverse half: a module that emits a registered event without being
// declared as one of its writers. Named zz- rather than *.test.ts, because tests
// are excluded by design (a test asserts on an event, it does not produce one).
test('a hook emitting a registered event without being declared its writer is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    writeFile(root, 'src/hooks/zz-fake-writer.ts', "event(sink, 'hitl', data);\n");
  });
  assert.ok(hasFinding(findings, 'emits-but-is-not-declared', 'src/hooks/zz-fake-writer.ts:hitl'));
});

test('the hitl telemetry event removed from prompt-advisor.ts is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, ADVISOR, (text) => replaceOnce(text, "event(sink, 'hitl',", "event(sink, 'hitl-missing',"));
  });
  assert.ok(hasFinding(findings, 'does-not-emit-event', `${ADVISOR}:hitl`));
});

test('the scaffolder reading a retention window it no longer loads is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, SCAFFOLDER, (text) => replaceOnce(text, 'loadTelemetryPolicy(', 'loadRetentionPolicy('));
  });
  assert.ok(hasFinding(findings, 'does-not-read-the-registry-field', SCAFFOLDER));
});

test('the telemetry sink reaching for the prompt is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, 'src/hooks/telemetry.ts', (text) => `${text}\n// canary: env.prompt\n`);
  });
  assert.ok(hasFinding(findings, 'sink-references-prompt-text', 'src/hooks/telemetry.ts'));
});

test('a reader that no longer names the telemetry source is caught', (t) => {
  const findings = run(t, 'C22c', (root) => {
    editFile(root, 'scripts/usage-report.sh', (text) =>
      replaceOnce(text, /engineos-telemetry/g, 'engineos-events'),
    );
  });
  assert.ok(hasFinding(findings, 'lost-the-telemetry-source', 'scripts/usage-report.sh'));
});

// ------------------------------------------------------------------- coverage

test('every declared C22/C22b/C22c code is produced by at least one case above', () => {
  const declared = [...C22_FINDINGS, ...C22B_FINDINGS, ...C22C_FINDINGS];
  assert.deepEqual(declared.filter((code) => !PRODUCED.has(code)), []);
});
