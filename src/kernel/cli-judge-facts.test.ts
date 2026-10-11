import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runKernel } from './cli';
import { lazyRegistries } from './context';

// The judge and tiebreak facts through the CLI: `resolve --facts` passes both
// through unread to the kernel, which validates them and answers refusals as
// the JSON error body with exit 1. Runs against the shipped registries, so it
// asserts only structure and refusal messages, never a routed outcome: the
// shipped weights are calibration data.

const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };
const shipped = lazyRegistries(env.ENGINEOS_ROOT);

const TASK_CONTRACT_KEYS = [
  'substantive', 'intents', 'escalates', 'escalation_reasons', 'suppressed', 'agents', 'rules', 'policy_rules',
  'skills', 'skills_suppressed', 'commands', 'mcp', 'model_tier', 'risk_floor', 'autonomy_ceiling_at_floor', 'scale',
  'decision_rules', 'required', 'gates', 'preferences', 'judge', 'risk_proposal', 'tiebreak',
];

test('a fallback judge fact reaches both the task contract and the route summary', () => {
  const answer = resolveFacts({ prompt: firstActivePhrase(), taskContract: true, judge: { source: 'fallback', reason: 'timeout' } }, 0);
  const summary = { source: 'fallback', reason: 'timeout', model: null };
  assert.deepEqual(field(field(answer, 'task_contract'), 'judge'), summary);
  assert.deepEqual(field(field(answer, 'route'), 'judge'), summary);
});

test('an empty tiebreak fact is accepted and selects nothing', () => {
  const answer = resolveFacts({ prompt: firstActivePhrase(), taskContract: true, tiebreak: {} }, 0);
  assert.equal(field(field(answer, 'task_contract'), 'tiebreak'), null);
});

test('a judge or tiebreak fact without a task-contract fact is a JSON error', () => {
  assert.deepEqual(resolveFacts({ prompt: 'x', escalate: true, judge: { source: 'fallback', reason: 'timeout' } }, 1), {
    error: 'a judge fact cannot be declared without a task-contract fact',
  });
  assert.deepEqual(resolveFacts({ prompt: 'x', tiebreak: {} }, 1), {
    error: 'a tiebreak fact cannot be declared without a task-contract fact',
  });
});

test('a malformed judge fact is a JSON error naming the field', () => {
  assert.deepEqual(resolveFacts({ prompt: 'x', taskContract: true, judge: { source: 'model' } }, 1), {
    error: 'resolve --facts: judge.source must be jev|fallback',
  });
});

test('an out-of-range tiebreak score is a JSON error naming the intent', () => {
  const id = firstActiveId();
  assert.deepEqual(resolveFacts({ prompt: 'x', taskContract: true, tiebreak: { [id]: 1.5 } }, 1), {
    error: `resolve --facts: tiebreak.${id} must be a number in [0,1]`,
  });
});

test('resolve-task answers the same 23-key task contract resolve --facts does', () => {
  const prompt = firstActivePhrase();
  const io = memoryIo({ env });
  assert.equal(runKernel(['resolve-task', '--prompt', prompt], io), 0);
  const projected = field(parsed(io.stdout.join('')), 'task_contract');
  if (!isRecord(projected)) throw new Error('resolve-task answered no task contract object');
  assert.deepEqual(Object.keys(projected), TASK_CONTRACT_KEYS);
  assert.deepEqual(projected, field(resolveFacts({ prompt, taskContract: true }, 0), 'task_contract'));
});

// --- helpers -----------------------------------------------------------------------------

function resolveFacts(facts: Record<string, unknown>, status: number): unknown {
  const io = memoryIo({ env });
  assert.equal(runKernel(['resolve', '--facts', JSON.stringify(facts)], io), status, `unexpected exit for ${JSON.stringify(facts)}`);
  return parsed(io.stdout.join(''));
}

function parsed(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}

function field(value: unknown, key: string): unknown {
  if (!isRecord(value)) throw new Error(`expected an object carrying ${key}`);
  return value[key];
}

function firstActiveRow(): { id: string; phrase: string } {
  for (const row of shipped.intents.intents) {
    const [first] = row.phrases;
    if (row.active && first !== undefined) return { id: row.id, phrase: first.text };
  }
  throw new Error('the shipped registry has no active intent with a phrase');
}

function firstActiveId(): string {
  return firstActiveRow().id;
}

function firstActivePhrase(): string {
  return firstActiveRow().phrase;
}
