import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type KernelContext } from './context';
import { AMBIGUOUS_PAIR_SCORING, foldContext, jev, NO_RISK, type FoldFixtureOptions } from './fold-fixture.test';
import type { ComposedDecisionsSection } from './decisions';
import type { RiskLevels } from './judge-facts';
import { resolve, type Answer, type DeclaredFacts, type JudgedEscalateRouteSection, type TaskContractSection } from './resolve';

// The task-contract composition (contracts.md §2.4, §4): the judge summary and
// risk proposal keys, the post-fold floor and ceiling, the hitl fold, the
// composed decision_rules, and the tie-break key. Everything runs over the
// fold fixture (fold-fixture.test.ts) except the one structural check on the
// shipped registries at the end, which pins key order only.

const TASK_CONTRACT_KEYS = [
  'substantive',
  'intents',
  'escalates',
  'escalation_reasons',
  'suppressed',
  'agents',
  'rules',
  'policy_rules',
  'skills',
  'skills_suppressed',
  'commands',
  'mcp',
  'model_tier',
  'risk_floor',
  'autonomy_ceiling_at_floor',
  'scale',
  'decision_rules',
  'required',
  'gates',
  'preferences',
  'judge',
  'risk_proposal',
  'tiebreak',
];

const SENSITIVE_DATA_RISK: RiskLevels = { ...NO_RISK, data_sensitivity: 2 };

// --- judge keys -------------------------------------------------------------------

test('the task contract judge summary is the route judge summary', () => {
  const answer = taskContract({ prompt: 'beta', judge: { source: 'fallback', reason: 'timeout' } });
  assert.deepEqual(contractOf(answer).judge, { source: 'fallback', reason: 'timeout', model: null });
  assert.deepEqual(routeOf(answer).judge, contractOf(answer).judge);
});

test('without facts the judge, risk proposal and tie-break keys answer their empty values', () => {
  const contract = contractOf(taskContract({ prompt: 'beta' }));
  assert.deepEqual(contract.judge, { source: 'fallback', reason: 'no-judge-fact', model: null });
  assert.equal(contract.risk_proposal, null);
  assert.equal(contract.tiebreak, null);
});

test('in shadow mode the risk proposal is published and the floor is the deterministic one', () => {
  const answer = taskContract({ prompt: 'beta', judge: jev({ intents: { docs: 0.9 }, risk: SENSITIVE_DATA_RISK }) }, { mode: 'shadow' });
  const contract = contractOf(answer);
  assert.deepEqual(contract.intents, ['web']);
  assert.equal(contract.risk_proposal, 'high');
  assert.equal(contract.risk_floor, 'low');
  assert.equal(contract.autonomy_ceiling_at_floor, 'A2');
  assert.equal(answer.hitl, undefined);
});

// --- authoritative floor, ceiling and hitl ------------------------------------------------

test('an authoritative fold with a low proposal keeps the low floor and ceiling and no hitl', () => {
  const answer = taskContract({ prompt: 'beta', judge: jev({ intents: { web: 0.9 } }) });
  const contract = contractOf(answer);
  assert.equal(contract.risk_floor, 'low');
  assert.equal(contract.autonomy_ceiling_at_floor, 'A2');
  assert.equal(answer.hitl, undefined);
  assert.deepEqual(composedDecisions(answer).judge_added, []);
});

test('a judge-raised floor moves the ceiling but alone folds no hitl', () => {
  const answer = taskContract({ prompt: 'beta', judge: jev({ intents: { web: 0.9 }, risk: SENSITIVE_DATA_RISK }) });
  const contract = contractOf(answer);
  assert.equal(contract.risk_floor, 'high');
  assert.equal(contract.autonomy_ceiling_at_floor, 'A3');
  assert.equal(answer.hitl, undefined);
});

test('a judge-added high rule folds hitl with high-risk and contributes its requirements', () => {
  const answer = taskContract({
    prompt: 'beta',
    judge: jev({ intents: { web: 0.9 }, rules: { handles_sensitive_data: 0.9 } }),
  });
  const contract = contractOf(answer);
  assert.deepEqual(composedDecisions(answer).judge_added, ['rule-sensitive']);
  assert.deepEqual(contract.decision_rules, ['rule-sensitive']);
  assert.ok(contract.required.includes('threat-model'));
  assert.ok(contract.gates.includes('security-review'));
  assert.equal(contract.risk_floor, 'high');
  const hitl = answer.hitl;
  if (hitl === undefined) throw new Error('expected a hitl section');
  assert.equal(hitl.required, true);
  assert.deepEqual(hitl.reasons, ['high-risk']);
});

test('the topology rule folds hitl at the post-fold tier', () => {
  const deterministic = taskContract({ prompt: 'lambda beta' });
  assert.equal(contractOf(deterministic).risk_floor, 'low');
  assert.deepEqual(hitlReasons(deterministic), ['topology-approval']);

  const raised = taskContract({ prompt: 'lambda beta', judge: jev({ intents: { web: 0.9 }, risk: SENSITIVE_DATA_RISK }) });
  assert.equal(contractOf(raised).risk_floor, 'high');
  assert.deepEqual(hitlReasons(raised), ['high-risk', 'topology-approval']);
});

test('a fold to two agent intents escalates with multi-agent-dispatch', () => {
  const contract = contractOf(taskContract({ prompt: 'beta', judge: jev({ intents: { web: 0.9, api: 0.9 } }) }));
  assert.equal(contract.escalates, true);
  assert.deepEqual(contract.escalation_reasons, ['multi-agent-dispatch']);
  assert.deepEqual(contract.agents, ['web-agent', 'api-agent']);
});

// --- composed sections and route ----------------------------------------------------------

test('judge_added appears only in decision_rules composed with a task contract', () => {
  const ctx = foldContext();
  const standalone = resolve({ decisions: { prompt: 'beta omega' } }, ctx).decision_rules;
  if (standalone === undefined) throw new Error('expected a decision_rules section');
  assert.deepEqual(Object.keys(standalone), ['matches', 'any_high']);
  assert.deepEqual(Object.keys(composedDecisions(taskContract({ prompt: 'beta omega' }))), ['matches', 'any_high', 'judge_added']);
});

test('the route section is identical with and without a tiebreak fact', () => {
  const options: FoldFixtureOptions = { scoring: AMBIGUOUS_PAIR_SCORING };
  const plain = taskContract({ prompt: 'beta gamma' }, options);
  const broken = taskContract({ prompt: 'beta gamma', tiebreak: { web: 0.9, api: 0.5 } }, options);
  assert.equal(JSON.stringify(routeOf(broken)), JSON.stringify(routeOf(plain)));
  assert.equal(contractOf(plain).tiebreak, null);
  assert.deepEqual(contractOf(plain).intents, ['web', 'api']);
  assert.equal(contractOf(broken).tiebreak, 'web');
  assert.deepEqual(contractOf(broken).intents, ['web']);
  assert.deepEqual(contractOf(broken).suppressed, [{ id: 'api', by: 'web' }]);
});

test('an authoritative fold leaves the route section unchanged apart from its judge key', () => {
  const { judge: _plainJudge, ...plain } = routeOf(taskContract({ prompt: 'beta gamma' }));
  const { judge: _foldedJudge, ...folded } = routeOf(
    taskContract({ prompt: 'beta gamma', judge: jev({ intents: { docs: 0.9 } }) }),
  );
  assert.deepEqual(folded, plain);
});

test('an empty tiebreak fact is accepted and selects nothing', () => {
  const contract = contractOf(taskContract({ prompt: 'beta gamma', tiebreak: {} }, { scoring: AMBIGUOUS_PAIR_SCORING }));
  assert.equal(contract.tiebreak, null);
});

// --- refusals ------------------------------------------------------------------------------

test('a judge or tiebreak fact without a task-contract fact is refused', () => {
  const ctx = foldContext();
  assert.throws(
    () => resolve({ prompt: 'beta', escalate: true, judge: jev() }, ctx),
    refusal('a judge fact cannot be declared without a task-contract fact'),
  );
  assert.throws(
    () => resolve({ prompt: 'beta', tiebreak: { web: 0.5 } }, ctx),
    refusal('a tiebreak fact cannot be declared without a task-contract fact'),
  );
});

test('a tiebreak score for a candidate this prompt never ranked is refused', () => {
  assert.throws(
    () => taskContract({ prompt: 'beta', tiebreak: { docs: 0.5 } }),
    refusal('resolve --facts: tiebreak.docs is not a ranked candidate'),
  );
});

test('judge and tiebreak facts naming an unknown or inactive intent are refused', () => {
  assert.throws(
    () => taskContract({ prompt: 'beta', judge: jev({ intents: { nope: 0.9 } }) }),
    refusal('resolve --facts: unknown fact judge.intents.nope'),
  );
  assert.throws(
    () => taskContract({ prompt: 'beta', judge: jev({ intents: { retired: 0.9 } }) }),
    refusal('resolve --facts: unknown fact judge.intents.retired'),
  );
  assert.throws(
    () => taskContract({ prompt: 'beta', tiebreak: { retired: 0.9 } }),
    refusal('resolve --facts: unknown fact tiebreak.retired'),
  );
});

// --- shipped registries: structure only ------------------------------------------------------

test('the shipped task contract carries the 23 keys in contract order', () => {
  const root = resolveRoot(process.env, __dirname);
  const ctx: KernelContext = { root, registries: lazyRegistries(root) };
  for (const prompt of ['add a paginated orders endpoint', 'what time is it', 'modernize all services']) {
    const contract = contractOf(resolve({ prompt, taskContract: true }, ctx));
    assert.deepEqual(Object.keys(contract), TASK_CONTRACT_KEYS, prompt);
  }
});

// --- helpers ---------------------------------------------------------------------------------

interface TaskContractFacts {
  prompt: string;
  judge?: unknown;
  tiebreak?: unknown;
}

function taskContract(facts: TaskContractFacts, options: FoldFixtureOptions = {}): Answer {
  const declared: DeclaredFacts = { prompt: facts.prompt, taskContract: true };
  if (facts.judge !== undefined) declared.judge = facts.judge;
  if (facts.tiebreak !== undefined) declared.tiebreak = facts.tiebreak;
  return resolve(declared, foldContext(options));
}

function contractOf(answer: Answer): TaskContractSection {
  if (answer.task_contract === undefined) throw new Error('expected a task_contract section');
  return answer.task_contract;
}

function routeOf(answer: Answer): JudgedEscalateRouteSection {
  const route = answer.route;
  if (route === undefined || !('judge' in route)) throw new Error('expected an escalate route with a judge key');
  return route;
}

function composedDecisions(answer: Answer): ComposedDecisionsSection {
  const section = answer.decision_rules;
  if (section === undefined || !('judge_added' in section)) throw new Error('expected composed decision_rules');
  return section;
}

function hitlReasons(answer: Answer): string[] {
  if (answer.hitl === undefined) throw new Error('expected a hitl section');
  return answer.hitl.reasons;
}

function refusal(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof KernelError, `expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
