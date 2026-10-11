import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { loadPolicy } from './policy';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);

test('the shipped policy registry loads with every field the kernel reads', () => {
  const policy = loadPolicy(root);
  assert.equal(typeof policy.version, 'string');
  assert.equal(policy.risk.aggregation, 'max');
  assert.deepEqual(
    policy.risk.inputs.map((input) => input.id),
    ['reversibility', 'blast-radius', 'data-sensitivity', 'contract-surface', 'spend'],
  );
  assert.ok(policy.risk.high_floors.includes('payments'));
  assert.deepEqual(policy.repair.checks, ['lint', 'typecheck', 'test', 'build', 'startup']);
  assert.equal(policy.repair.max_fix_attempts_per_check, 2);
  assert.equal(policy.repair.escalations, 1);
  assert.ok(policy.repair.never_repair.includes('weaken-the-check'));
  assert.deepEqual(
    policy.repair.by_situation.map((row) => row.situation),
    ['red', 'infra', 'flaky'],
  );
  assert.deepEqual(
    policy.autonomy.levels.map((level) => level.id),
    ['A0', 'A1', 'A2', 'A3', 'A4'],
  );
  assert.deepEqual(policy.autonomy.ceiling_by_risk, { low: 'A2', medium: 'A3', high: 'A3' });
  assert.equal(policy.autonomy.high_with_thin_evidence, 'A1');
  assert.ok(policy.retry.never_retry.includes('security-risk'));
  assert.equal(policy.gates.by_risk.high['validation'], 'required-plus-critic');
  assert.deepEqual(policy.gates.spec_threshold, { files_greater_than: 2, or_any_new_feature: true });
  assert.equal(policy.parallelism.wave_concurrency_cap, 6);
  assert.equal(policy.parallelism.backpressure.max_queued_units, 12);
  assert.equal(policy.parallelism.backpressure.overload_action, 'defer');
  assert.deepEqual(policy.parallelism.backpressure.actions, ['dispatch', 'defer', 'reject']);
  assert.deepEqual(
    policy.parallelism.backpressure.rows.map((row) => row.action),
    ['dispatch', '{overload_action}', 'reject'],
  );
  assert.equal(policy.breaker.failure_threshold, 3);
  assert.equal(policy.breaker.cooldown_waves, 1);
  assert.equal(policy.breaker.half_open_probes, 1);
  assert.deepEqual(policy.breaker.states, ['closed', 'half-open', 'open']);
  assert.deepEqual(policy.breaker.scopes, ['provider', 'mcp', 'tool', 'agent']);
  assert.deepEqual(policy.hitl.reasons, [
    'high-risk',
    'evidence-insufficient',
    'external-effect',
    'policy-conflict',
    'never-retry-situation',
    'destructive-action',
    'budget-exhausted',
    'breaker-open',
    'topology-approval',
  ]);
  assert.deepEqual(policy.hitl.situations, ['destructive', 'budget-exhausted', 'reject', 'breaker-open']);
  assert.equal(policy.hitl.record_home, '.engineos/changes/<record>.md#human-decisions');
  assert.equal(typeof policy.parallelism.prompt_signals.action, 'string');
  assert.equal(typeof policy.parallelism.prompt_signals.substantive_action, 'string');
  assert.equal(policy.parallelism.prompt_signals.design_weak, '\\b(architect|architecture|design)\\b');
  assert.equal(policy.router.agent, 'router');
  assert.equal(policy.router.capability, 'route');
  assert.deepEqual(policy.router.reasons, [
    'multi-agent-dispatch',
    'unrouted-scale',
    'requires-dispatch-plan',
    'low-confidence',
  ]);
  assert.equal(policy.router.escalate_when.multi_agent_intents_min, 2);
  assert.deepEqual(policy.router.escalate_when.unrouted_scale_signals, ['big_task', 'design_work']);
  assert.ok(policy.router.fixtures.length > 0);
  assert.deepEqual(policy.router.combination, {
    gates: 'deterministic-wins',
    judge: 'add-only',
    intents: 'noul-then-primary',
    escalate_on_doubt: true,
  });
  assert.equal(policy.judge.key_env, 'TYPESAFE_API_KEY');
  assert.equal(policy.judge.enabled_env, 'ENGINEOS_JUDGE');
  assert.equal(policy.judge.enabled_value, 'jev');
  assert.equal(policy.judge.mode, 'shadow');
  assert.equal(policy.judge.retries, 0);
});

test('gate statuses keep the registry key order they are emitted in', () => {
  assert.deepEqual(Object.keys(loadPolicy(root).gates.by_risk.low), [
    'discovery',
    'design',
    'implementation',
    'validation',
    'release',
  ]);
});

// A registry whose answers are gates cannot be read leniently: a defaulted
// field would answer for a file that says nothing.
const malformed: [string, (policy: Record<string, unknown>) => void, string][] = [
  ['a missing risk block', (p) => { delete p['risk']; }, '.risk must be an object'],
  ['a non-string aggregation', (p) => { record(p, 'risk')['aggregation'] = 7; }, '.risk.aggregation must be a string'],
  ['an input row without an id', (p) => { record(p, 'risk')['inputs'] = [{}]; }, '.risk.inputs[0].id must be a string'],
  ['a non-array high_floors', (p) => { record(p, 'risk')['high_floors'] = 'payments'; }, '.risk.high_floors must be an array of strings'],
  ['a non-numeric fix bound', (p) => { record(p, 'repair')['max_fix_attempts_per_check'] = '2'; }, '.repair.max_fix_attempts_per_check must be a number'],
  ['a situation row without a response', (p) => { record(p, 'repair')['by_situation'] = [{ situation: 'infra' }]; }, '.repair.by_situation[0].response must be a string'],
  ['a ceiling map missing the high tier', (p) => { record(record(p, 'autonomy'), 'ceiling_by_risk')['high'] = null; }, '.autonomy.ceiling_by_risk.high must be a string'],
  ['a missing retry block', (p) => { delete p['retry']; }, '.retry must be an object'],
  ['a gate status that is not a string', (p) => { record(record(p, 'gates'), 'by_risk')['medium'] = { validation: 3 }; }, '.gates.by_risk.medium.validation must be a string'],
  ['a spec threshold that is not a count', (p) => { record(record(p, 'gates'), 'spec_threshold')['files_greater_than'] = 'two'; }, '.gates.spec_threshold.files_greater_than must be a number'],
  ['a missing parallelism block', (p) => { delete p['parallelism']; }, '.parallelism must be an object'],
  ['a missing backpressure block', (p) => { delete record(p, 'parallelism')['backpressure']; }, '.parallelism.backpressure must be an object'],
  ['a non-numeric wave cap', (p) => { record(p, 'parallelism')['wave_concurrency_cap'] = '6'; }, '.parallelism.wave_concurrency_cap must be a number'],
  ['a queue bound that is not a count', (p) => { delete record(record(p, 'parallelism'), 'backpressure')['max_queued_units']; }, '.parallelism.backpressure.max_queued_units must be a number'],
  ['a backpressure actions list that is not an array', (p) => { record(record(p, 'parallelism'), 'backpressure')['actions'] = 'defer'; }, '.parallelism.backpressure.actions must be an array of strings'],
  ['a missing breaker block', (p) => { delete p['breaker']; }, '.breaker must be an object'],
  ['a non-numeric failure threshold', (p) => { record(p, 'breaker')['failure_threshold'] = null; }, '.breaker.failure_threshold must be a number'],
  ['a breaker state list that is not an array', (p) => { record(p, 'breaker')['states'] = 'closed'; }, '.breaker.states must be an array of strings'],
  ['a missing hitl block', (p) => { delete p['hitl']; }, '.hitl must be an object'],
  ['a reason that is not a string', (p) => { record(p, 'hitl')['reasons'] = [7]; }, '.hitl.reasons[0] must be a string'],
  ['a record home that is not a string', (p) => { delete record(p, 'hitl')['record_home']; }, '.hitl.record_home must be a string'],
  ['a missing prompt_signals block', (p) => { delete record(p, 'parallelism')['prompt_signals']; }, '.parallelism.prompt_signals must be an object'],
  ['a prompt signal that is not a string', (p) => { record(record(p, 'parallelism'), 'prompt_signals')['design_weak'] = ['design']; }, '.parallelism.prompt_signals.design_weak must be a string'],
  ['a missing router block', (p) => { delete p['router']; }, '.router must be an object'],
  ['a missing escalate_when block', (p) => { delete record(p, 'router')['escalate_when']; }, '.router.escalate_when must be an object'],
  ['a non-numeric multi-agent threshold', (p) => { record(record(p, 'router'), 'escalate_when')['multi_agent_intents_min'] = '2'; }, '.router.escalate_when.multi_agent_intents_min must be a number'],
  ['a fixture without an escalate verdict', (p) => { record(p, 'router')['fixtures'] = [{ prompt: 'x', reasons: [], intents: [] }]; }, '.router.fixtures[0].escalate must be a boolean'],
  ['a missing never-repair answer', (p) => { delete record(p, 'repair')['never_repair_answer']; }, '.repair.never_repair_answer must be an object'],
  ['an empty repair ladder', (p) => { record(p, 'repair')['ladder'] = []; }, '.repair.ladder must not be empty'],
  ['an infra pattern with an unknown reason', (p) => { record(p, 'repair')['infra_patterns'] = [{ runner: 'nx', pattern: 'x', reason: 'flaky' }]; }, '.repair.infra_patterns[0].reason must be target-absent or runner-missing'],
  ['a backpressure row with an unknown capacity', (p) => { record(record(p, 'parallelism'), 'backpressure')['rows'] = [{ when: {}, action: 'reject', capacity: 'some', reason: 'r' }]; }, '.parallelism.backpressure.rows[0].capacity must be remaining or none'],
  ['an empty breaker transition table', (p) => { record(p, 'breaker')['transitions'] = []; }, '.breaker.transitions must not be empty'],
  ['a hitl reason row without a when', (p) => { record(p, 'hitl')['reason_table'] = [{ reason: 'high-risk' }]; }, '.hitl.reason_table[0].when must be an object'],
  ['a missing router scoring block', (p) => { delete record(p, 'router')['scoring']; }, '.router.scoring must be an object'],
  ['a missing router tiebreak block', (p) => { delete record(p, 'router')['tiebreak']; }, '.router.tiebreak must be an object'],
  ['a zero tiebreak margin', (p) => { record(record(p, 'router'), 'tiebreak')['margin'] = 0; }, '.router.tiebreak.margin must be greater than 0 and at most 1'],
  ['a missing judge block', (p) => { delete p['judge']; }, '.judge must be an object'],
  ['a zero judge intent threshold', (p) => { record(record(p, 'judge'), 'thresholds')['intent_default'] = 0; }, '.judge.thresholds.intent_default must be greater than 0 and at most 1'],
  ['a judge breaker scope outside .breaker.scopes', (p) => { record(record(p, 'judge'), 'breaker')['scope'] = 'agent'; }, '.judge.breaker.scope must be one of .breaker.scopes'],
];

for (const [name, breakIt, detail] of malformed) {
  test(`loadPolicy refuses ${name}`, () => {
    const policy = basePolicy();
    breakIt(policy);
    const dir = rootWith(policy);
    try {
      assert.throws(() => loadPolicy(dir), kernelError(`registries/policy.json: ${detail}`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the minimal valid fixture loads, so the refusals above are about the break', () => {
  const dir = rootWith(basePolicy());
  try {
    assert.equal(loadPolicy(dir).risk.aggregation, 'max');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function basePolicy(): Record<string, unknown> {
  return {
    version: '1.6.0',
    risk: {
      aggregation: 'max',
      inputs: [{ id: 'reversibility' }],
      high_floors: ['payments'],
    },
    repair: {
      checks: ['lint'],
      max_fix_attempts_per_check: 2,
      escalations: 1,
      by_situation: [{ situation: 'infra', response: 'report-tooling-gap-no-attempt-consumed' }],
      never_repair: ['weaken-the-check'],
      never_repair_answer: { action: 'never-repair', reason: 'situation {situation} is on the never-repair list' },
      ladder: [{ when: {}, action: 'stop-report-red', reason: 'the bound is exhausted' }],
      infra_patterns: [{ runner: 'nx', pattern: 'cannot find project', reason: 'target-absent' }],
    },
    autonomy: {
      levels: [{ id: 'A0' }],
      ceiling_by_risk: { low: 'A2', medium: 'A3', high: 'A3' },
      high_with_thin_evidence: 'A1',
    },
    retry: { never_retry: ['security-risk'] },
    gates: {
      by_risk: {
        low: { validation: 'required' },
        medium: { validation: 'required' },
        high: { validation: 'required-plus-critic' },
      },
      spec_threshold: { files_greater_than: 2, or_any_new_feature: true },
    },
    parallelism: {
      wave_concurrency_cap: 6,
      backpressure: {
        max_queued_units: 12,
        overload_action: 'defer',
        actions: ['dispatch', 'defer', 'reject'],
        rows: [{ when: {}, action: 'reject', capacity: 'none', reason: 'queue full' }],
      },
      prompt_signals: {
        action: '\\b(add|build)\\b',
        substantive_action: '\\b(add|build|review)\\b',
        scale: '\\b(all|every)\\b',
        spec: '\\b(spec|prd)\\b',
        design_strong: '\\b(decompose|adr)\\b',
        design_weak: '\\b(architecture|design)\\b',
      },
    },
    breaker: {
      failure_threshold: 3,
      cooldown_waves: 1,
      half_open_probes: 1,
      states: ['closed', 'half-open', 'open'],
      scopes: ['provider'],
      transitions: [{ from: 'closed', guard: {}, to: 'closed', allow: true, reason: 'healthy' }],
    },
    hitl: {
      reasons: ['high-risk'],
      situations: ['destructive'],
      record_home: '.engineos/changes/<record>.md#human-decisions',
      reason_table: [{ reason: 'high-risk', when: { risk: 'high' } }],
    },
    router: {
      agent: 'router',
      capability: 'route',
      reasons: ['multi-agent-dispatch'],
      escalate_when: { multi_agent_intents_min: 2, unrouted_scale_signals: ['big_task'] },
      scoring: { min_score: 0, threshold: 0.5, margin: 0.1, top_k: 5, max_intents: 3, bm25_weight: 1, path_weight: 0 },
      combination: { gates: 'deterministic-wins', judge: 'add-only', intents: 'noul-then-primary', escalate_on_doubt: true },
      source_markers: { notification: ['<task-notification>'], tool_result: ['<tool_result>'], hook_echo: ['[engineos]'] },
      tiebreak: { min_similarity: 0.6, margin: 0.1 },
      fixtures: [{ prompt: 'modernize all services', escalate: true, reasons: ['unrouted-scale'], intents: [] }],
    },
    judge: shippedJudgeBlock(),
  };
}

// The judge block's redaction list is pinned by hash in code, so the minimal
// fixture carries the shipped block verbatim rather than a hand-written one.
function shippedJudgeBlock(): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'));
  if (!isRecord(raw)) throw new Error('registries/policy.json is not an object');
  const judge = raw['judge'];
  if (!isRecord(judge)) throw new Error('registries/policy.json carries no judge block');
  return judge;
}

// The fixture is built fresh per case, so a nested block can be reached and
// mutated in place once it is known to be a record.
function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`fixture ${key} is not an object`);
  return value;
}

function rootWith(policy: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-policy-'));
  mkdirSync(join(dir, 'registries'));
  writeFileSync(join(dir, 'registries', 'policy.json'), JSON.stringify(policy), 'utf8');
  return dir;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
