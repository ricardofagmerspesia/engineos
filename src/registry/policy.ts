import type { RiskTier } from './intents';
import type { WorkflowPolicy } from '../workflow/contracts';
import { loadRegistry } from './load';
import { strictReader } from './strict';

// registries/policy.json is the registry whose answers ARE gates: a risk tier,
// an autonomy ceiling, a repair action. A lenient loader that defaulted a
// missing field would answer for a file that says nothing, which is the
// fail-open hole cmd_risk was fixed to close (kernel.sh:200-206). Gate-bearing
// fields are required; additive workflow opt-ins default to false when absent.
// An explicitly malformed field is a KernelError rather than a fabricated answer.
//
// Fields no kernel arm reads are not loaded at all — the same closure
// routing.ts and intents.ts keep. The prose fields (`note`, each input's tier
// descriptions, each level's `permitted`/`typical`) are documentation for the
// human reader, never inputs to a decision.

export interface RiskInput {
  id: string;
}

export interface RiskPolicy {
  aggregation: string;
  inputs: RiskInput[];
  high_floors: string[];
}

export interface RepairSituation {
  situation: string;
  response: string;
}

export interface RepairPolicy {
  checks: string[];
  max_fix_attempts_per_check: number;
  escalations: number;
  by_situation: RepairSituation[];
  never_repair: string[];
}

export interface AutonomyLevel {
  id: string;
}

export interface AutonomyPolicy {
  levels: AutonomyLevel[];
  ceiling_by_risk: Record<RiskTier, string>;
  high_with_thin_evidence: string;
}

export interface RetryPolicy {
  never_retry: string[];
  max_attempts_per_unit: number;
  escalations: number;
}

// One gate id to its status for a single tier, in the registry's own key order:
// the risk and gates arms emit this object verbatim, so insertion order is part
// of the answer.
export type GateStatuses = Record<string, string>;

export interface SpecThreshold {
  files_greater_than: number;
  or_any_new_feature: boolean;
}

export interface GatesPolicy {
  by_risk: Record<RiskTier, GateStatuses>;
  spec_threshold: SpecThreshold;
}

export interface BackpressurePolicy {
  max_queued_units: number;
  overload_action: string;
  actions: string[];
}

export interface PromptSignals {
  action: string;
  substantive_action: string;
  scale: string;
  spec: string;
  design_strong: string;
  design_weak: string;
}

export interface ParallelismPolicy {
  wave_concurrency_cap: number;
  backpressure: BackpressurePolicy;
  prompt_signals: PromptSignals;
}

export interface EscalateWhen {
  multi_agent_intents_min: number;
  unrouted_scale_signals: string[];
}

export interface RouterFixture {
  prompt: string;
  escalate: boolean;
  reasons: string[];
  intents: string[];
}

export interface RouterPolicy {
  agent: string;
  capability: string;
  reasons: string[];
  escalate_when: EscalateWhen;
  fixtures: RouterFixture[];
}

export interface BreakerPolicy {
  failure_threshold: number;
  cooldown_waves: number;
  half_open_probes: number;
  states: string[];
  scopes: string[];
}

export interface HitlPolicy {
  reasons: string[];
  situations: string[];
  record_home: string;
}

export interface PolicyRegistry {
  version: string;
  risk: RiskPolicy;
  repair: RepairPolicy;
  autonomy: AutonomyPolicy;
  retry: RetryPolicy;
  gates: GatesPolicy;
  parallelism: ParallelismPolicy;
  breaker: BreakerPolicy;
  hitl: HitlPolicy;
  router: RouterPolicy;
  workflow: WorkflowPolicy;
}

const { requireRecord, requireString, requireNumber, requireBoolean, requireStrings, requireRows, malformed } =
  strictReader('policy.json');

export function loadPolicy(root: string): PolicyRegistry {
  const raw = loadRegistry(root, 'policy.json');
  const p = requireRecord(raw, '');
  const risk = requireRecord(p['risk'], '.risk');
  const repair = requireRecord(p['repair'], '.repair');
  const autonomy = requireRecord(p['autonomy'], '.autonomy');
  const retry = requireRecord(p['retry'], '.retry');
  const gates = requireRecord(p['gates'], '.gates');
  const specThreshold = requireRecord(gates['spec_threshold'], '.gates.spec_threshold');
  const parallelism = requireRecord(p['parallelism'], '.parallelism');
  const backpressure = requireRecord(parallelism['backpressure'], '.parallelism.backpressure');
  const promptSignals = requireRecord(parallelism['prompt_signals'], '.parallelism.prompt_signals');
  const breaker = requireRecord(p['breaker'], '.breaker');
  const hitl = requireRecord(p['hitl'], '.hitl');
  const router = requireRecord(p['router'], '.router');
  const escalateWhen = requireRecord(router['escalate_when'], '.router.escalate_when');
  return {
    version: requireString(p['version'], '.version'),
    risk: {
      aggregation: requireString(risk['aggregation'], '.risk.aggregation'),
      inputs: requireRows(risk['inputs'], '.risk.inputs').map((row, i) => ({
        id: requireString(row['id'], `.risk.inputs[${i}].id`),
      })),
      high_floors: requireStrings(risk['high_floors'], '.risk.high_floors'),
    },
    repair: {
      checks: requireStrings(repair['checks'], '.repair.checks'),
      max_fix_attempts_per_check: requireNumber(
        repair['max_fix_attempts_per_check'],
        '.repair.max_fix_attempts_per_check',
      ),
      escalations: requireNumber(repair['escalations'], '.repair.escalations'),
      by_situation: requireRows(repair['by_situation'], '.repair.by_situation').map((row, i) => ({
        situation: requireString(row['situation'], `.repair.by_situation[${i}].situation`),
        response: requireString(row['response'], `.repair.by_situation[${i}].response`),
      })),
      never_repair: requireStrings(repair['never_repair'], '.repair.never_repair'),
    },
    autonomy: {
      levels: requireRows(autonomy['levels'], '.autonomy.levels').map((row, i) => ({
        id: requireString(row['id'], `.autonomy.levels[${i}].id`),
      })),
      ceiling_by_risk: requireTierMap(
        autonomy['ceiling_by_risk'],
        '.autonomy.ceiling_by_risk',
        requireString,
      ),
      high_with_thin_evidence: requireString(
        autonomy['high_with_thin_evidence'],
        '.autonomy.high_with_thin_evidence',
      ),
    },
    retry: {
      never_retry: requireStrings(retry['never_retry'], '.retry.never_retry'),
      max_attempts_per_unit: boundedInteger(retry['max_attempts_per_unit'], '.retry.max_attempts_per_unit', 1),
      escalations: boundedInteger(retry['escalations'], '.retry.escalations', 0),
    },
    gates: {
      by_risk: requireTierMap(gates['by_risk'], '.gates.by_risk', requireStringMap),
      spec_threshold: {
        files_greater_than: requireNumber(
          specThreshold['files_greater_than'],
          '.gates.spec_threshold.files_greater_than',
        ),
        or_any_new_feature: requireBoolean(
          specThreshold['or_any_new_feature'],
          '.gates.spec_threshold.or_any_new_feature',
        ),
      },
    },
    parallelism: {
      wave_concurrency_cap: requireNumber(
        parallelism['wave_concurrency_cap'],
        '.parallelism.wave_concurrency_cap',
      ),
      backpressure: {
        max_queued_units: requireNumber(
          backpressure['max_queued_units'],
          '.parallelism.backpressure.max_queued_units',
        ),
        overload_action: requireString(
          backpressure['overload_action'],
          '.parallelism.backpressure.overload_action',
        ),
        actions: requireStrings(backpressure['actions'], '.parallelism.backpressure.actions'),
      },
      prompt_signals: {
        action: requireString(promptSignals['action'], '.parallelism.prompt_signals.action'),
        substantive_action: requireString(
          promptSignals['substantive_action'],
          '.parallelism.prompt_signals.substantive_action',
        ),
        scale: requireString(promptSignals['scale'], '.parallelism.prompt_signals.scale'),
        spec: requireString(promptSignals['spec'], '.parallelism.prompt_signals.spec'),
        design_strong: requireString(
          promptSignals['design_strong'],
          '.parallelism.prompt_signals.design_strong',
        ),
        design_weak: requireString(
          promptSignals['design_weak'],
          '.parallelism.prompt_signals.design_weak',
        ),
      },
    },
    breaker: {
      failure_threshold: requireNumber(breaker['failure_threshold'], '.breaker.failure_threshold'),
      cooldown_waves: requireNumber(breaker['cooldown_waves'], '.breaker.cooldown_waves'),
      half_open_probes: requireNumber(breaker['half_open_probes'], '.breaker.half_open_probes'),
      states: requireStrings(breaker['states'], '.breaker.states'),
      scopes: requireStrings(breaker['scopes'], '.breaker.scopes'),
    },
    hitl: {
      reasons: requireStrings(hitl['reasons'], '.hitl.reasons'),
      situations: requireStrings(hitl['situations'], '.hitl.situations'),
      record_home: requireString(hitl['record_home'], '.hitl.record_home'),
    },
    router: {
      agent: requireString(router['agent'], '.router.agent'),
      capability: requireString(router['capability'], '.router.capability'),
      reasons: requireStrings(router['reasons'], '.router.reasons'),
      escalate_when: {
        multi_agent_intents_min: requireNumber(
          escalateWhen['multi_agent_intents_min'],
          '.router.escalate_when.multi_agent_intents_min',
        ),
        unrouted_scale_signals: requireStrings(
          escalateWhen['unrouted_scale_signals'],
          '.router.escalate_when.unrouted_scale_signals',
        ),
      },
      fixtures: requireRows(router['fixtures'], '.router.fixtures').map((row, i) => ({
        prompt: requireString(row['prompt'], `.router.fixtures[${i}].prompt`),
        escalate: requireBoolean(row['escalate'], `.router.fixtures[${i}].escalate`),
        reasons: requireStrings(row['reasons'], `.router.fixtures[${i}].reasons`),
        intents: requireStrings(row['intents'], `.router.fixtures[${i}].intents`),
      })),
    },
    workflow: workflowPolicy(p['workflow']),
  };
}

function boundedInteger(value: unknown, path: string, min: number): number {
  const number = requireNumber(value, path);
  if (!Number.isSafeInteger(number) || number < min) malformed(`${path} must be an integer >= ${min}`);
  return number;
}

function workflowPolicy(value: unknown): WorkflowPolicy {
  const row = requireRecord(value, '.workflow');
  for (const key of Object.keys(row)) {
    if (!['task_budgets', 'direct_max_files', 'simple_spec_choice', 'final_validation_prompt', 'note'].includes(key)) malformed(`.workflow unknown field ${key}`);
  }
  const budgets = requireRecord(row['task_budgets'], '.workflow.task_budgets');
  for (const key of Object.keys(budgets)) {
    if (!['small', 'medium', 'large'].includes(key)) malformed(`.workflow.task_budgets unknown complexity ${key}`);
  }
  function budget(key: string): { min: number; max: number } {
    const path = `.workflow.task_budgets.${key}`;
    const item = requireRecord(budgets[key], path);
    if (Object.keys(item).some((field) => field !== 'min' && field !== 'max')) malformed(`${path} only accepts min and max`);
    const min = boundedInteger(item['min'], `${path}.min`, 1);
    const max = boundedInteger(item['max'], `${path}.max`, min);
    return { min, max };
  }
  return {
    task_budgets: { small: budget('small'), medium: budget('medium'), large: budget('large') },
    direct_max_files: boundedInteger(row['direct_max_files'], '.workflow.direct_max_files', 1),
    simple_spec_choice: Object.hasOwn(row, 'simple_spec_choice') ? requireBoolean(row['simple_spec_choice'], '.workflow.simple_spec_choice') : false,
    final_validation_prompt: Object.hasOwn(row, 'final_validation_prompt') ? requireBoolean(row['final_validation_prompt'], '.workflow.final_validation_prompt') : false,
  };
}

// Insertion order is the registry's, so an object emitted verbatim by a
// projection keeps the key order the bash kernel answered with.
function requireStringMap(value: unknown, path: string): Record<string, string> {
  const row = requireRecord(value, path);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(row)) out[key] = requireString(item, `${path}.${key}`);
  return out;
}

// The three tiers are the whole key set: a policy block missing one would make
// that tier unanswerable at the moment a gate needs it.
function requireTierMap<T>(
  value: unknown,
  path: string,
  item: (v: unknown, p: string) => T,
): Record<RiskTier, T> {
  const row = requireRecord(value, path);
  return {
    low: item(row['low'], `${path}.low`),
    medium: item(row['medium'], `${path}.medium`),
    high: item(row['high'], `${path}.high`),
  };
}
