import type { DecisionRule } from '../registry/decision-rules';
import type { IntentRow } from '../registry/intents';
import { resolveRoot } from '../registry/paths';
import type { ScoringPolicy } from '../registry/policy-router';
import { lazyRegistries, type KernelContext, type Registries } from './context';
import type { JevFact, JudgeMode, RiskLevels } from './judge-facts';

// Shared fixture for combine.test.ts and resolve-task-contract.test.ts. It
// registers no test of its own, so importing it never re-registers anything.
// The registries are built in memory over the shipped bundle: intents, decision
// rules, the router scoring/tiebreak/judge blocks and the autonomy ceilings are
// all fixture values, because the shipped ones are being calibrated (T13) and a
// fold test must not move when a weight does. Every prompt word is a Greek
// letter no shipped scale or substantive signal reads.

const root = resolveRoot(process.env, __dirname);
const shipped = lazyRegistries(root);

// The v1-equivalent cuts: ambiguous only when nothing matches, so the tie-break
// is inert unless a case raises the threshold.
export const FOLD_SCORING: ScoringPolicy = {
  min_score: 1,
  threshold: 0,
  margin: 0,
  top_k: 5,
  max_intents: 8,
  bm25_weight: 0.9,
  path_weight: 1,
};

// The threshold under which two equal-score candidates (confidence 0.5 each)
// make the route ambiguous, which is what arms the tie-break.
export const AMBIGUOUS_PAIR_SCORING: Partial<ScoringPolicy> = { threshold: 0.6 };

export const FOLD_REASONS = ['multi-agent-dispatch', 'unrouted-scale', 'requires-dispatch-plan', 'low-confidence'];

// Prompt words, one per intent, in registry order.
//   new-feature alpha  suppressible, no agent
//   web         beta   low floor,    build tier,  web-agent
//   api         gamma  medium floor, design tier, api-agent
//   guard       delta  high floor,   design tier, guard-agent
//   sweep       epsilon requires a dispatch plan, build tier
//   docs        zeta   no floor,     cheap tier,  no agent
//   tuned       theta  medium floor, build tier,  tuned-agent, own judge threshold 0.9
//   retired     iota   inactive
function fixtureIntents(overrides: Readonly<Record<string, Partial<IntentRow>>>): IntentRow[] {
  const rows: IntentRow[] = [
    intent('new-feature', 'alpha', { suppressible: true, rules: ['new-feature-rule'] }),
    intent('web', 'beta', { risk_floor: 'low', model_tier: 'build', agents: ['web-agent'], rules: ['web-rule'] }),
    intent('api', 'gamma', { risk_floor: 'medium', model_tier: 'design', agents: ['api-agent'], rules: ['api-rule'] }),
    intent('guard', 'delta', { risk_floor: 'high', model_tier: 'design', agents: ['guard-agent'], rules: ['guard-rule'] }),
    intent('sweep', 'epsilon', { requires_dispatch_plan: true, model_tier: 'build' }),
    intent('docs', 'zeta', { model_tier: 'cheap' }),
    intent('tuned', 'theta', { risk_floor: 'medium', model_tier: 'build', agents: ['tuned-agent'], threshold: 0.9 }),
    intent('retired', 'iota', { active: false }),
  ];
  return rows.map((row) => ({ ...row, ...overrides[row.id] }));
}

// Signals are words of their own, so a prompt matches a rule only when a case
// says so. rule-spec-threshold and rule-fanout are derived in code (§4.3) and
// rule-change-record is owed by every change, so none of the three is ever
// judge-added through a fact.
function fixtureRules(): DecisionRule[] {
  return [
    rule('rule-sensitive', 90, {
      signals: ['omega'],
      then: { require: ['threat-model'], gate: 'security-review', risk: 'high', prefer: null },
      judge_fact: 'handles_sensitive_data',
    }),
    rule('rule-large-change', 80, {
      signals: ['kappa'],
      then: { require: ['plan'], gate: null, risk: null, prefer: 'split' },
      judge_fact: 'large_change',
      judge_threshold: 0.7,
    }),
    rule('rule-multi-agent-design', 70, {
      signals: ['lambda'],
      when: { multi_agent_system: true },
      then: { require: ['topology-spec'], gate: 'design', risk: null, prefer: null },
      judge_fact: 'multi_agent_system',
      judge_threshold: 0.5,
    }),
    rule('rule-spec-threshold', 60, {
      then: { require: ['design-doc'], gate: 'design', risk: null, prefer: null },
    }),
    rule('rule-fanout', 50, {
      then: { require: ['dispatch-plan'], gate: null, risk: null, prefer: 'parallel' },
    }),
    rule('rule-change-record', 10, {
      then: { require: ['change-record'], gate: null, risk: null, prefer: null },
    }),
  ];
}

export interface FoldFixtureOptions {
  mode?: JudgeMode;
  scoring?: Partial<ScoringPolicy>;
  intents?: Readonly<Record<string, Partial<IntentRow>>>;
}

export function foldRegistries(options: FoldFixtureOptions = {}): Registries {
  return {
    ...shipped,
    intents: { version: 'fixture', intents: fixtureIntents(options.intents ?? {}) },
    decisionRules: {
      version: 'fixture',
      precedence: [],
      conflict_policy: shipped.decisionRules.conflict_policy,
      rules: fixtureRules(),
    },
    policy: {
      ...shipped.policy,
      autonomy: { ...shipped.policy.autonomy, ceiling_by_risk: { low: 'A2', medium: 'A3', high: 'A3' } },
      router: {
        ...shipped.policy.router,
        reasons: FOLD_REASONS,
        escalate_when: { multi_agent_intents_min: 2, unrouted_scale_signals: ['big_task', 'design_work'] },
        scoring: { ...FOLD_SCORING, ...options.scoring },
        tiebreak: { min_similarity: 0.6, margin: 0.1 },
      },
      judge: {
        ...shipped.policy.judge,
        mode: options.mode ?? 'authoritative',
        thresholds: { intent_default: 0.5, primary_confidence: 0.6, margin: 0.2, rule_default: 0.5 },
      },
    },
  };
}

export function foldContext(options: FoldFixtureOptions = {}): KernelContext {
  return { root, registries: foldRegistries(options) };
}

export const NO_RISK: RiskLevels = {
  reversibility: 0,
  blast_radius: 0,
  data_sensitivity: 0,
  contract_surface: 0,
  spend: 0,
};

// A jev fact that, by default, confidently answers "no routed intent" and
// proposes the lowest risk: each case states only the evidence it is about.
export function jev(over: Partial<JevFact> = {}): JevFact {
  return {
    source: 'jev',
    model: 'fixture-model',
    latency_ms: 12,
    is_project_change: 1,
    primary: { id: 'other', confidence: 0.9, margin: 0.9 },
    intents: {},
    rules: {},
    scale: 0,
    design_work: 0,
    risk: NO_RISK,
    ...over,
  };
}

function intent(id: string, text: string, over: Partial<IntentRow>): IntentRow {
  return {
    id,
    title: id,
    signals: [text],
    rules: [],
    skills: [],
    agents: [],
    commands: [],
    mcp: [],
    model_tier: null,
    risk_floor: null,
    domain: null,
    note: null,
    suppressible: false,
    suppressed_by: [],
    requires_dispatch_plan: false,
    active: true,
    phrases: [{ text, weight: 1 }],
    phrases_declared: true,
    verb_object: null,
    negative: [],
    exemplars: [],
    threshold: null,
    router_row: null,
    stack: null,
    stack_sibling: null,
    stack_frameworks: [],
    generic_signals: [],
    ...over,
  };
}

function rule(id: string, priority: number, over: Partial<DecisionRule>): DecisionRule {
  return {
    id,
    priority,
    source: 'fixture',
    when: {},
    then: { require: [], gate: null, risk: null, prefer: null },
    judge_fact: null,
    judge_threshold: null,
    signals: [],
    ...over,
  };
}
