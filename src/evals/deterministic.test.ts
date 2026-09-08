import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import { runDeterministicTier, type DeterministicResult } from './deterministic';

interface TreeSpec {
  claudeMd?: string;
  rules?: Record<string, string>;
  agents?: string[];
  intents?: string[];
  agentCases?: string[];
  routing?: unknown;
}

interface Run { out: string; result: DeterministicResult }

const CONFORMING_AGENT_CASE = JSON.stringify({
  id: 'agent-001',
  agent: 'backend-coordinator',
  must: ['a request DTO'],
  must_not: ['business logic in the controller'],
});

// A minimal but conforming tree; every case below changes exactly one thing in it,
// so a FAIL line can only come from the thing that case is about.
function evalTree(t: TestContext, spec: TreeSpec = {}): string {
  const root = tempRoot(t);
  writeFileSync(join(root, 'CLAUDE.md'), spec.claudeMd ?? '@rules/base.md\n@rules/security.md\n');
  const rules = spec.rules ?? { base: 'base rules', security: 'security rules', backend: 'backend rules', frontend: 'frontend rules' };
  mkdirSync(join(root, 'rules'), { recursive: true });
  for (const [name, text] of Object.entries(rules)) writeFileSync(join(root, 'rules', `${name}.md`), text);
  mkdirSync(join(root, 'agents'), { recursive: true });
  for (const name of spec.agents ?? ['backend-coordinator']) writeFileSync(join(root, 'agents', `${name}.md`), 'agent');
  mkdirSync(join(root, 'evals'), { recursive: true });
  writeFileSync(join(root, 'evals', 'intent-routing-cases.jsonl'), lines(spec.intents ?? conformingIntents(25)));
  writeFileSync(join(root, 'evals', 'agent-cases.jsonl'), lines(spec.agentCases ?? [CONFORMING_AGENT_CASE]));
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(join(root, 'registries', 'routing.json'), JSON.stringify(spec.routing ?? { domains: [{ id: 'backend' }] }));
  return root;
}

function lines(values: readonly string[]): string {
  return values.length === 0 ? '' : `${values.join('\n')}\n`;
}

function conformingIntents(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) =>
    JSON.stringify({
      id: `intent-${String(index + 1).padStart(3, '0')}`,
      input: 'add a POST /orders endpoint',
      expect_intents: ['backend'],
      must_load: ['backend'],
      must_not_load: ['frontend'],
      notes: 'pins the backend row',
    }),
  );
}

function grade(t: TestContext, spec: TreeSpec = {}): Run {
  const io = memoryIo();
  const result = runDeterministicTier(evalTree(t, spec), io);
  return { out: io.stdout.join(''), result };
}

test('a conforming set produces the eleven ok lines and nothing else', (t) => {
  const { out, result } = grade(t);
  assert.equal(
    out,
    [
      '== deterministic tier ==',
      'ok   evals/intent-routing-cases.jsonl is valid JSONL (25 cases)',
      'ok   evals/agent-cases.jsonl is valid JSONL (1 cases)',
      'ok   expect_risk values are valid and respect registry risk floors',
      'ok   every intent case has id, input and notes',
      'ok   every asserted rule exists in rules/',
      'ok   no rule is both required and forbidden in the same case',
      'ok   no case asserts on an always-on rule (they are implicit)',
      'ok   every must_load set is closed under rule deferrals',
      'ok   every agent case names an existing agent',
      'ok   every agent case has both must and must_not items',
      'ok   intent set size 25 (RUBRIC target 30-60; floor 25)',
      '',
    ].join('\n'),
  );
  assert.deepEqual(result, { pass: 11, fail: 0, intentCount: 25 });
});

test('a malformed line is named by its position among the non-empty lines', (t) => {
  const intents = conformingIntents(25);
  const { out, result } = grade(t, { intents: [...intents.slice(0, 1), '{not json', ...intents.slice(1)] });
  assert.ok(out.includes('FAIL evals/intent-routing-cases.jsonl has malformed lines: line2\n'), out);
  assert.equal(result.intentCount, 26);
});

test('a missing eval file is reported and grades nothing', (t) => {
  const root = evalTree(t);
  rmSync(join(root, 'evals', 'intent-routing-cases.jsonl'));
  const io = memoryIo();
  const result = runDeterministicTier(root, io);
  const out = io.stdout.join('');
  assert.ok(out.includes('FAIL evals/intent-routing-cases.jsonl missing\n'), out);
  assert.ok(out.includes('FAIL intent set has only 0 cases — below the floor of 25, the set is decorative\n'), out);
  assert.equal(result.intentCount, 0);
});

test('a case naming a rule that does not exist fails', (t) => {
  const { out } = grade(t, {
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', expect_intents: ['backend'], must_load: ['ghost'] })],
  });
  assert.ok(out.includes('FAIL cases naming nonexistent rules: intent-x->ghost\n'), out);
});

test('a rule both required and forbidden fails', (t) => {
  const { out } = grade(t, {
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', must_load: ['backend'], must_not_load: ['backend'] })],
  });
  assert.ok(out.includes('FAIL contradictory expectations: intent-x->backend\n'), out);
});

test('a case asserting on an always-on rule fails on both sides', (t) => {
  const { out } = grade(t, {
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', must_load: ['security'], must_not_load: ['base'] })],
  });
  assert.ok(out.includes('FAIL always-on rules asserted: intent-x->must_load:security intent-x->must_not_load:base\n'), out);
});

test('a must_load set that is not closed under deferrals fails', (t) => {
  const { out } = grade(t, {
    rules: { base: 'base', security: 'security', backend: 'defers logging to observability.md', observability: 'observability' },
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', must_load: ['backend'] })],
  });
  assert.ok(out.includes('FAIL unclosed must_load sets: intent-x(backend-defers-to-observability)\n'), out);
});

test('a must_load set that names the deferral too is closed', (t) => {
  const { out } = grade(t, {
    rules: { base: 'base', security: 'security', backend: 'defers logging to observability.md', observability: 'observability' },
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', must_load: ['backend', 'observability'] })],
  });
  assert.ok(out.includes('ok   every must_load set is closed under rule deferrals\n'), out);
});

test('a case missing id, input or notes is listed, with <no-id> when the id is the missing field', (t) => {
  const { out } = grade(t, {
    intents: [JSON.stringify({ id: 'intent-x', input: 'i' }), JSON.stringify({ input: 'i', notes: 'n' })],
  });
  assert.ok(out.includes('FAIL cases missing required fields: intent-x <no-id>\n'), out);
});

test('an expect_risk that is not a real tier fails', (t) => {
  const { out } = grade(t, {
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', expect_risk: 'critical', expect_intents: ['backend'] })],
  });
  assert.ok(out.includes("FAIL risk expectation problems: intent-x(tier='critical')\n"), out);
});

test('an expect_risk below the registry floor for an expected domain fails', (t) => {
  const { out } = grade(t, {
    routing: { domains: [{ id: 'dba', risk_floor: 'medium' }] },
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', expect_risk: 'low', expect_intents: ['dba'] })],
  });
  assert.ok(out.includes("FAIL risk expectation problems: intent-x(expects 'low' but domain 'dba' floors at 'medium')\n"), out);
});

test('a domain with no risk_floor key skips the floor comparison', (t) => {
  const { out } = grade(t, {
    routing: { domains: [{ id: 'dba' }] },
    intents: [JSON.stringify({ id: 'intent-x', input: 'i', notes: 'n', expect_risk: 'low', expect_intents: ['dba'] })],
  });
  assert.ok(out.includes('ok   expect_risk values are valid and respect registry risk floors\n'), out);
});

test('an agent case naming a missing agent fails, and `any` does not', (t) => {
  const { out } = grade(t, {
    agentCases: [
      JSON.stringify({ id: 'agent-x', agent: 'ghost', must: ['a'], must_not: ['b'] }),
      JSON.stringify({ id: 'agent-y', agent: 'any', must: ['a'], must_not: ['b'] }),
    ],
  });
  assert.ok(out.includes('FAIL cases naming nonexistent agents: agent-x->ghost\n'), out);
});

test('an agent case with an empty or missing must list fails', (t) => {
  const { out } = grade(t, {
    agentCases: [
      JSON.stringify({ id: 'agent-x', agent: 'any', must: [], must_not: ['b'] }),
      JSON.stringify({ id: 'agent-y', agent: 'any', must: ['a'] }),
    ],
  });
  assert.ok(out.includes('FAIL cases with an empty must/must_not list: agent-x agent-y\n'), out);
});

test('a set below the coverage floor is called decorative', (t) => {
  const { out, result } = grade(t, { intents: conformingIntents(1) });
  assert.ok(out.includes('FAIL intent set has only 1 cases — below the floor of 25, the set is decorative\n'), out);
  assert.equal(result.intentCount, 1);
});
