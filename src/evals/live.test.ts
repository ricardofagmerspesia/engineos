import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import { runLiveTier, type LiveDeps, type LiveResult } from './live';

interface Run { out: string; result: LiveResult }

const LIVE_ON: NodeJS.ProcessEnv = { ENGINEOS_EVAL_LIVE: '1' };

// Only the intent file matters here: the live tier grades model output, and never
// looks at rules/, agents/ or the registries.
function intentTree(t: TestContext, cases: readonly string[]): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'evals'), { recursive: true });
  writeFileSync(join(root, 'evals', 'intent-routing-cases.jsonl'), cases.length === 0 ? '' : `${cases.join('\n')}\n`);
  return root;
}

// Answers every case with the same canned transcript, which is all a grading test
// needs: the mapping from input to output is the model's business, not the tier's.
function deps(opts: { env?: NodeJS.ProcessEnv; hasClaude?: boolean; answer?: string }): LiveDeps {
  return {
    env: opts.env ?? LIVE_ON,
    hasClaude: () => opts.hasClaude ?? true,
    runClaude: () => opts.answer ?? '',
  };
}

function graded(t: TestContext, cases: readonly string[], overrides: { env?: NodeJS.ProcessEnv; hasClaude?: boolean; answer?: string }, count = cases.length): Run {
  const io = memoryIo();
  const result = runLiveTier(intentTree(t, cases), io, count, deps(overrides));
  return { out: io.stdout.join(''), result };
}

const BACKEND_CASE = JSON.stringify({
  id: 'intent-001',
  input: 'add a POST /orders endpoint',
  expect_intents: ['backend'],
  must_load: ['backend'],
  must_not_load: ['frontend'],
});

const QUESTION_CASE = JSON.stringify({ id: 'intent-099', input: 'what is a DTO?', expect_intents: [] });

test('without the opt-in the tier skips every case and grades none', (t) => {
  const { out, result } = graded(t, [BACKEND_CASE], { env: {} }, 33);
  assert.equal(out, '\n== live tier ==\nSKIP 33 intent cases — set ENGINEOS_EVAL_LIVE=1 to grade against a live model\n');
  assert.deepEqual(result, { pass: 0, fail: 0, skipped: 33 });
});

test('opted in without the claude CLI the tier skips, and never reports a pass', (t) => {
  const { out, result } = graded(t, [BACKEND_CASE], { hasClaude: false }, 33);
  assert.equal(out, "\n== live tier ==\nSKIP 33 intent cases — ENGINEOS_EVAL_LIVE=1 but the 'claude' CLI is not on PATH\n");
  assert.deepEqual(result, { pass: 0, fail: 0, skipped: 33 });
});

test('a pure question passes when no router line is emitted', (t) => {
  const { out, result } = graded(t, [QUESTION_CASE], { answer: 'A DTO is a data transfer object.' });
  assert.equal(out, '\n== live tier ==\nok   intent-099 (no routing expected)\n');
  assert.deepEqual(result, { pass: 1, fail: 0, skipped: 0 });
});

test('a pure question that gets a router line is over-routed', (t) => {
  const { out, result } = graded(t, [QUESTION_CASE], { answer: 'sure\n[router] intent=backend loaded=backend\n' });
  assert.equal(out, '\n== live tier ==\nFAIL intent-099 over-routed a pure question: [router] intent=backend loaded=backend\n');
  assert.deepEqual(result, { pass: 0, fail: 1, skipped: 0 });
});

test('a routed case with no router line fails', (t) => {
  const { out, result } = graded(t, [BACKEND_CASE], { answer: 'here is the endpoint' });
  assert.equal(out, '\n== live tier ==\nFAIL intent-001 emitted no [router] line\n');
  assert.deepEqual(result, { pass: 0, fail: 1, skipped: 0 });
});

test('the router line is found inside a markdown code span, not only at line start', (t) => {
  const { out, result } = graded(t, [BACKEND_CASE], { answer: 'ok:\n`[router] intent=backend loaded=architecture,backend`\ndone' });
  assert.equal(out, '\n== live tier ==\nok   intent-001\n');
  assert.deepEqual(result, { pass: 1, fail: 0, skipped: 0 });
});

test('a missing required rule and a forbidden one are both named, with the line that was graded', (t) => {
  const { out, result } = graded(t, [BACKEND_CASE], { answer: '[router] intent=frontend loaded=frontend' });
  assert.equal(
    out,
    '\n== live tier ==\nFAIL intent-001 — missing:backend forbidden:frontend | got: [router] intent=frontend loaded=frontend\n',
  );
  assert.deepEqual(result, { pass: 0, fail: 1, skipped: 0 });
});

test('a failed model call grades as a missing router line rather than a pass', (t) => {
  const { out } = graded(t, [BACKEND_CASE], { answer: '' });
  assert.ok(out.includes('FAIL intent-001 emitted no [router] line\n'), out);
});
