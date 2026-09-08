import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExecJournalPolicy, SPAN_KINDS, SPAN_STATUSES } from './policy-exec-journal';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

// The two pins. SpanKind and SpanStatus are derived from these arrays, so a
// vocabulary changed in registries/policy.json fails here rather than producing
// a span the journal's enum guard silently rejects at the write boundary.
test('the SpanKind literals are exactly the registry span kinds, in registry order', () => {
  assert.deepEqual([...SPAN_KINDS], loadExecJournalPolicy(root).span_kinds);
});

test('the SpanStatus literals are exactly the registry statuses, in registry order', () => {
  assert.deepEqual([...SPAN_STATUSES], loadExecJournalPolicy(root).statuses);
});

test('the shipped exec-journal block carries its home and its length bound', () => {
  const policy = loadExecJournalPolicy(root);
  assert.match(policy.home, /\.exec\.jsonl$/);
  assert.ok(policy.max_value_length > 0);
});
