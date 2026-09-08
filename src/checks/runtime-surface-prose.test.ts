// C27d: the "Agent traces" prose mirror in rules/observability.md. Three of its
// assertions are MIRRORS rows (span-kind-missing, journal-home-missing,
// value-length-drift); the rest are literal caveats with no registry side to
// derive them from, so they stay code here.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import { rowsOf } from './mirrors';
import { C27d_FINDINGS, RUNTIME_SURFACE_CHECKS } from './runtime-surface';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';

const OBSERVABILITY = 'rules/observability.md';
const ALTERNATION = '`router | coordinator | agent | tool | model | verification`';
const produced = new Set<string>();

function run(root: string): Finding[] {
  const found = findingsOf(RUNTIME_SURFACE_CHECKS, 'C27d', contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

// A substitution in the COPY of the mirrored document. Asserting the needle was
// present keeps a case from silently becoming a no-op when the prose is reworded.
function rewrite(root: string, path: string, needle: string, replacement: string): void {
  editFile(root, path, (text) => {
    if (!text.includes(needle)) throw new Error(`${path} no longer contains: ${needle}`);
    return text.replace(needle, replacement);
  });
}

test('C27d is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t)), []);
});

test('a span kind renamed in the registry without the prose is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, 'registries/policy.json', (text) => {
      const policy: unknown = JSON.parse(text);
      if (!isRecord(policy)) throw new Error('policy.json is not an object');
      const telemetry = policy['telemetry'];
      if (!isRecord(telemetry)) throw new Error('policy.json has no telemetry block');
      const block = telemetry['exec_journal'];
      if (!isRecord(block)) throw new Error('policy.json has no telemetry.exec_journal block');
      const kinds = block['span_kinds'];
      if (!Array.isArray(kinds)) throw new Error('span_kinds is not an array');
      block['span_kinds'] = kinds.map((kind) => (kind === 'verification' ? 'verify' : kind));
      return JSON.stringify(policy, null, 2);
    });
  });
  const findings = run(root);
  assert.ok(hasFinding(findings, 'span-kind-missing', 'verify'));
  assert.ok(hasFinding(findings, 'span-kind-alternation-missing'));
});

test('the Agent traces section renamed in rules/observability.md is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, '## Agent traces', '## Traces'));
  assert.ok(hasFinding(run(root), 'section-missing', '## Agent traces'));
});

test('an Agent traces section emptied of its body is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, OBSERVABILITY, (text) => text.replace(/^## Agent traces\n[\s\S]*$/m, '## Agent traces\n'));
  });
  assert.ok(hasFinding(run(root), 'section-empty', '## Agent traces'));
});

test('a span kind dropped from the Agent traces section is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, ALTERNATION, '`router | agent`'));
  const findings = run(root);
  assert.ok(hasFinding(findings, 'span-kind-alternation-missing'));
  assert.ok(hasFinding(findings, 'span-kind-missing', 'coordinator'));
});

test('the span-kind alternation line deleted from the prose is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, OBSERVABILITY, (text) =>
      text.split('\n').filter((line) => !line.includes(ALTERNATION)).join('\n'));
  });
  assert.ok(hasFinding(run(root), 'span-kind-alternation-missing'));
});

test('the 0-is-not-free caveat dropped from the Agent traces section is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, '; do not read 0 as free', ''));
  assert.ok(hasFinding(run(root), 'zero-is-not-free-caveat-missing'));
});

test('tokens_in dropped from the Agent traces field list is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, '`tokens_in`, `tokens_out`, ', ''));
  assert.ok(hasFinding(run(root), 'field-not-named', 'tokens_in'));
});

test('the status-is-a-floor caveat dropped from the prose is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, 'is a FLOOR', 'is a count'));
  assert.ok(hasFinding(run(root), 'status-floor-caveat-missing'));
});

test('the slug claim re-broadened past note is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) =>
    rewrite(copy, OBSERVABILITY, 'every field EXCEPT `note` is a slug', 'every field is a slug'));
  assert.ok(hasFinding(run(root), 'slug-claim-not-scoped-to-note'));
});

test('the slug guard re-claiming that it classifies content is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) =>
    rewrite(copy, OBSERVABILITY, 'it does not classify the content', 'a PII value cannot be written through those'));
  assert.ok(hasFinding(run(root), 'classifies-content-reclaimed'));
});

test('the registry home dropped from the Agent traces section is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) =>
    rewrite(copy, OBSERVABILITY, '.git/engineos-telemetry/<session_id>.exec.jsonl', '.git/telemetry/<id>.exec.jsonl'));
  assert.ok(hasFinding(run(root), 'journal-home-missing', '.git/engineos-telemetry/<session_id>.exec.jsonl'));
});

test('the length bound drifting between the prose and the registry is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, OBSERVABILITY, 'max_value_length` (256)', 'max_value_length` (512)'));
  assert.ok(hasFinding(run(root), 'value-length-drift', '512!=256'));
});

test("parallelism.md losing its Agent traces back-reference is caught", (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, 'rules/parallelism.md', (text) => text.split('Agent traces').join('span records'));
  });
  assert.ok(hasFinding(run(root), 'parallelism-reference-missing', 'rules/parallelism.md'));
});

test('every C27d mirror row id is one of its declared codes', () => {
  const declared = new Set<string>(C27d_FINDINGS);
  assert.deepEqual(rowsOf('C27d').map((row) => row.id).filter((id) => !declared.has(id)), []);
});

test('every code C27d declares is produced by a case above', () => {
  assert.deepEqual(C27d_FINDINGS.filter((code) => !produced.has(code)), []);
});
