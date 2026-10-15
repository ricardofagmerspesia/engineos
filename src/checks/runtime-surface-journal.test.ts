// C27, C27b and C27c: the exec-journal registry block, the live CLI canary and
// the span wiring. One test per bash `case_` row of these checks, plus the
// cases each declared code needs to stay refutable.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { RUNTIME_SURFACE_CHECKS, C27_FINDINGS, C27b_FINDINGS, C27c_FINDINGS } from './runtime-surface';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding, writeFile } from './testing';

const OWNED: readonly CheckId[] = ['C27', 'C27b', 'C27c'];
const produced = new Set<string>();

function run(root: string, id: CheckId): Finding[] {
  const found = findingsOf(RUNTIME_SURFACE_CHECKS, id, contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

// The exec_journal block, rewritten in the COPY. The narrowing is explicit
// rather than an assertion so a fixture that stopped matching the registry
// fails loudly here instead of mutating nothing.
function editBlock(root: string, mutate: (block: Record<string, unknown>) => void): void {
  editFile(root, 'registries/policy.json', (text) => {
    const policy: unknown = JSON.parse(text);
    if (!isRecord(policy)) throw new Error('policy.json is not an object');
    const telemetry = policy['telemetry'];
    if (!isRecord(telemetry)) throw new Error('policy.json has no telemetry block');
    const block = telemetry['exec_journal'];
    if (!isRecord(block)) throw new Error('policy.json has no telemetry.exec_journal block');
    mutate(block);
    return JSON.stringify(policy, null, 2);
  });
}

function dropLines(root: string, path: string, needle: string): void {
  editFile(root, path, (text) => text.split('\n').filter((line) => !line.includes(needle)).join('\n'));
}

// ------------------------------------------------------------------------ C27

test('C27 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C27'), []);
});

// The family's one shared precondition is the registry every check here reads
// through. It reports once, as a skip, rather than as a per-check cascade.
test('C27 reports the shared precondition once when policy.json is absent', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rmSync(join(copy, 'registries/policy.json')));
  assert.deepEqual(run(root, 'C27'), [{ code: 'precondition-missing', subject: 'exec-journal' }]);
});

test('a home that no longer names the .exec.jsonl journal is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => { block['home'] = '.git/engineos-telemetry/<session_id>.jsonl'; });
  });
  assert.ok(hasFinding(run(root, 'C27'), 'home-does-not-end-in-exec-jsonl'));
});

test('the length bound removed from policy.json is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => { delete block['max_value_length']; });
  });
  assert.ok(hasFinding(run(root, 'C27'), 'max-value-length-not-a-positive-integer', 'missing'));
});

test("the length bound drifting from the port's standalone fallback is caught", (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, 'src/registry/policy-exec-journal.ts', (text) =>
      text.replace('MAX_VALUE_LENGTH_FALLBACK = 256;', 'MAX_VALUE_LENGTH_FALLBACK = 512;'));
  });
  assert.ok(hasFinding(run(root, 'C27'), 'max-value-length-fallback-drift', 'registry:256-source:512'));
});

test('the exec_journal block removed from policy.json is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, 'registries/policy.json', (text) => {
      const policy: unknown = JSON.parse(text);
      if (!isRecord(policy)) throw new Error('policy.json is not an object');
      const telemetry = policy['telemetry'];
      if (!isRecord(telemetry)) throw new Error('policy.json has no telemetry block');
      delete telemetry['exec_journal'];
      return JSON.stringify(policy, null, 2);
    });
  });
  assert.deepEqual(run(root, 'C27'), [{ code: 'block-missing', subject: 'registries/policy.json' }]);
});

test('the journal home removed from policy.json is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { delete block['home']; }));
  assert.ok(hasFinding(run(root, 'C27'), 'home-missing'));
});

test('the schema pointer removed from policy.json is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { delete block['schema']; }));
  assert.ok(hasFinding(run(root, 'C27'), 'schema-missing'));
});

test('a schema pointer naming a non-executable file is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { block['schema'] = 'README.md'; }));
  assert.ok(hasFinding(run(root, 'C27'), 'schema-not-executable', 'README.md'));
});

test('an emptied span-kind vocabulary is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { block['span_kinds'] = []; }));
  assert.ok(hasFinding(run(root, 'C27'), 'enumeration-empty', 'span_kinds'));
});

test('an emptied writer list is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { block['written_by'] = []; }));
  assert.ok(hasFinding(run(root, 'C27'), 'written-by-empty'));
});

test('a declared writer that does not exist is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => { block['written_by'] = ['src/hooks/gone.ts']; });
  });
  assert.ok(hasFinding(run(root, 'C27'), 'written-by-names-a-missing-file', 'src/hooks/gone.ts'));
});

test('the span sink pointer removed from policy.json is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { delete block['written_by_helper']; }));
  assert.ok(hasFinding(run(root, 'C27'), 'written-by-helper-missing'));
});

test('a span sink pointer naming a missing file is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => { block['written_by_helper'] = 'src/hooks/gone.ts'; });
  });
  assert.ok(hasFinding(run(root, 'C27'), 'written-by-helper-names-a-missing-file', 'src/hooks/gone.ts'));
});

test('a standalone fallback that can no longer be read is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/registry/policy-exec-journal.ts', 'MAX_VALUE_LENGTH_FALLBACK ='));
  assert.ok(hasFinding(run(root, 'C27'), 'fallback-unreadable', 'src/registry/policy-exec-journal.ts'));
});

// ----------------------------------------------------------------------- C27b
// The bash canary ran `bash scripts/exec-journal.sh`, so its four `case_` rows
// mutated dist/engineos.cjs — the slug class, the enum guard, the --agent guard
// and the length bound. The port calls runJournal in-process, so the canary and
// the test run the same code and there is no bundle left to break: those rows
// are not portable and are replaced below by the mutations that DO still reach
// the CLI, the registries it enforces. Guard regressions themselves are covered
// by src/journal/exec-journal.test.ts.

test('C27b is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C27b'), []);
});

test('an unknown enum member silently accepted is caught by the live canary', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => {
      const kinds = block['span_kinds'];
      block['span_kinds'] = Array.isArray(kinds) ? [...kinds, 'bogus-kind'] : ['bogus-kind'];
    });
  });
  assert.ok(hasFinding(run(root, 'C27b'), 'append-contract-broken', 'unknown-span_kind-was-not-rejected'));
});

test('free text admitted into the status vocabulary is caught on validate', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editBlock(copy, (block) => {
      const statuses = block['statuses'];
      block['statuses'] = Array.isArray(statuses) ? [...statuses, 'it went fine, mostly'] : ['it went fine, mostly'];
    });
  });
  assert.ok(hasFinding(run(root, 'C27b'), 'validate-contract-broken', 'validate-accepted-free-text-in-status'));
});

test('a CLI that can no longer write or read a span at all is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rmSync(join(copy, 'registries/models.json')));
  const findings = run(root, 'C27b');
  assert.ok(hasFinding(findings, 'append-contract-broken', 'full-v2-line-was-rejected'));
  assert.ok(hasFinding(findings, 'validate-contract-broken', 'validate-rejected-a-declared-status:OK'));
});

// ----------------------------------------------------------------------- C27c

test('C27c is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C27c'), []);
});

test('the router span removed from prompt-advisor.ts is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/prompt-advisor.ts', 'withSpanAsync(run.sink, ROUTER_SPAN,'));
  assert.ok(hasFinding(run(root, 'C27c'), 'declared-writer-writes-no-span', 'src/hooks/prompt-advisor.ts'));
});

test('the verification span removed from stop-verify.ts is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/stop-verify.ts', 'withSpan(sink, VERIFICATION_SPAN,'));
  assert.ok(hasFinding(run(root, 'C27c'), 'declared-writer-writes-no-span', 'src/hooks/stop-verify.ts'));
});

test('the span start marker no longer opened at dispatch is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/announce-agent-dispatch.ts', 'openSpan('));
  assert.ok(hasFinding(run(root, 'C27c'), 'dispatch-hook-opens-no-span', 'src/hooks/announce-agent-dispatch.ts'));
});

test('the span no longer closed at return is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/announce-agent-return.ts', 'closeSpan('));
  assert.ok(hasFinding(run(root, 'C27c'), 'return-hook-closes-no-span', 'src/hooks/announce-agent-return.ts'));
});

test('the span start markers no longer reaped is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/ensure-project-layout.ts', 'reapFilesBelow(spans'));
  assert.ok(hasFinding(run(root, 'C27c'), 'reaper-ignores-span-markers', 'src/hooks/ensure-project-layout.ts'));
});

test('the .jsonl reaper pass removed from the layout hook is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => dropLines(copy, 'src/hooks/ensure-project-layout.ts', "endsWith('.jsonl')"));
  assert.ok(hasFinding(run(root, 'C27c'), 'reaper-ignores-exec-jsonl', 'src/hooks/ensure-project-layout.ts'));
});

test('an emptied span-kind vocabulary makes the wiring uncheckable', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editBlock(copy, (block) => { block['span_kinds'] = []; }));
  assert.ok(hasFinding(run(root, 'C27c'), 'span-kinds-empty'));
});

test('a hook that writes a span without being declared a writer is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    writeFile(copy, 'src/hooks/probe-writer.ts', "export const SPAN = { kind: 'agent' };\n");
  });
  assert.ok(hasFinding(run(root, 'C27c'), 'undeclared-span-writer', 'src/hooks/probe-writer.ts'));
});

test('the span sink reaching for prompt text is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, 'src/hooks/telemetry.ts', (text) => `${text}\n// probe: env.prompt\n`);
  });
  assert.ok(hasFinding(run(root, 'C27c'), 'span-sink-references-prompt-text', 'src/hooks/telemetry.ts'));
});

// ------------------------------------------------------------------- coverage

test('every code these checks declare is produced by a case above', () => {
  const declared = [...C27_FINDINGS, ...C27b_FINDINGS, ...C27c_FINDINGS];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
  assert.deepEqual(OWNED.filter((id) => !RUNTIME_SURFACE_CHECKS.some((check) => check.id === id)), []);
});
