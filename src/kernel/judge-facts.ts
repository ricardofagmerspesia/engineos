import { KernelError, isRecord } from '../lib/json';
import type { Registries } from './context';

// The judge fact (contracts.md@rev1 §3), typed and validated on the kernel side.
// The kernel never imports src/judge/** (decision D5): src/judge/types.ts
// re-declares these shapes identically, so a change to either is a contracts
// revision first. The kernel reads no clock, network or env for this fact, which
// is what makes `prompt` + a journaled fact replay the same answer offline.

export type JudgeReason =
  | 'disabled' | 'no-key' | 'no-fetch' | 'breaker-open'
  | 'not-user-input'
  | 'timeout' | 'http-429' | 'http-4xx' | 'http-5xx'
  | 'network' | 'invalid-response' | 'oversize-state'
  | 'no-judge-fact';

export type FallbackReason = Exclude<JudgeReason, 'not-user-input' | 'no-judge-fact'>;

export interface FallbackFact {
  source: 'fallback';
  reason: FallbackReason;
}

export type ScoreLevel = 0 | 1 | 2;

export interface RiskLevels {
  reversibility: ScoreLevel;
  blast_radius: ScoreLevel;
  data_sensitivity: ScoreLevel;
  contract_surface: ScoreLevel;
  spend: ScoreLevel;
}

export interface JevFact {
  source: 'jev';
  model: string;
  latency_ms: number;
  is_project_change: number;
  primary: { id: string; confidence: number; margin: number };
  intents: Record<string, number>;
  rules: Record<string, number>;
  scale: ScoreLevel;
  design_work: number;
  risk: RiskLevels;
}

export type JudgeFact = JevFact | FallbackFact;

// Where the routing answer came from (contracts §2.1). The kernel emits 'jev'
// or 'fallback'; 'skipped' is written only by the hook's route event.
export interface JudgeSummary {
  source: 'jev' | 'fallback' | 'skipped';
  reason: JudgeReason | null;
  model: string | null;
}

export type JudgeMode = 'shadow' | 'advisory' | 'authoritative';

// The id a Choice answer carries when no registered intent fits the prompt.
export const OTHER_PRIMARY = 'other';

const FALLBACK_REASONS: readonly FallbackReason[] = [
  'disabled', 'no-key', 'no-fetch', 'breaker-open',
  'timeout', 'http-429', 'http-4xx', 'http-5xx',
  'network', 'invalid-response', 'oversize-state',
];

const RISK_KEYS: readonly (keyof RiskLevels)[] = [
  'reversibility', 'blast_radius', 'data_sensitivity', 'contract_surface', 'spend',
];

const FALLBACK_KEYS: readonly string[] = ['source', 'reason'];
const JEV_KEYS: readonly string[] = [
  'source', 'model', 'latency_ms', 'is_project_change', 'primary', 'intents', 'rules', 'scale', 'design_work', 'risk',
];
const PRIMARY_KEYS: readonly string[] = ['id', 'confidence', 'margin'];

// Same bound as the exec-journal slug: the model id is journaled as a span field.
const MODEL_SLUG = /^[A-Za-z0-9@_./:-]{1,256}$/;

export function judgeSummary(fact: JudgeFact | null): JudgeSummary {
  if (fact === null) return { source: 'fallback', reason: 'no-judge-fact', model: null };
  if (fact.source === 'fallback') return { source: 'fallback', reason: fact.reason, model: null };
  return { source: 'jev', reason: null, model: fact.model };
}

// Read field by field rather than cast, with the vocabulary checked against the
// registries: an intent id or rule fact the registry does not declare is a fact
// about a question nobody asked, and folding it would route on noise.
export function judgeFact(value: unknown, regs: Registries): JudgeFact {
  const row = record('judge', value);
  const source = row['source'];
  if (source === 'fallback') return fallbackFact(row);
  if (source === 'jev') return jevFact(row, regs);
  throw new KernelError('resolve --facts: judge.source must be jev|fallback');
}

function fallbackFact(row: Record<string, unknown>): FallbackFact {
  refuseUnknown('judge', row, FALLBACK_KEYS);
  const reason = FALLBACK_REASONS.find((candidate) => candidate === row['reason']);
  if (reason === undefined) {
    throw new KernelError(`resolve --facts: judge.reason must be one of ${FALLBACK_REASONS.join('|')}`);
  }
  return { source: 'fallback', reason };
}

function jevFact(row: Record<string, unknown>, regs: Registries): JevFact {
  refuseUnknown('judge', row, JEV_KEYS);
  const active = new Set(regs.intents.intents.filter((intent) => intent.active).map((intent) => intent.id));
  const ruleFacts = new Set(
    regs.decisionRules.rules.flatMap((rule) => (rule.judge_fact === null ? [] : [rule.judge_fact])),
  );
  return {
    source: 'jev',
    model: modelSlug(row['model']),
    latency_ms: count('judge.latency_ms', row['latency_ms']),
    is_project_change: probability('judge.is_project_change', row['is_project_change']),
    primary: primaryOf(row['primary'], active),
    intents: probabilities('judge.intents', row['intents'], active),
    rules: probabilities('judge.rules', row['rules'], ruleFacts),
    scale: level('judge.scale', row['scale']),
    design_work: probability('judge.design_work', row['design_work']),
    risk: riskOf(row['risk']),
  };
}

function primaryOf(value: unknown, active: ReadonlySet<string>): JevFact['primary'] {
  const row = record('judge.primary', value);
  refuseUnknown('judge.primary', row, PRIMARY_KEYS);
  const id = row['id'];
  if (typeof id !== 'string' || (id !== OTHER_PRIMARY && !active.has(id))) {
    throw new KernelError(`resolve --facts: judge.primary.id must be an active intent id or ${OTHER_PRIMARY}`);
  }
  return {
    id,
    confidence: probability('judge.primary.confidence', row['confidence']),
    margin: probability('judge.primary.margin', row['margin']),
  };
}

function riskOf(value: unknown): RiskLevels {
  const row = record('judge.risk', value);
  refuseUnknown('judge.risk', row, RISK_KEYS);
  return {
    reversibility: level('judge.risk.reversibility', row['reversibility']),
    blast_radius: level('judge.risk.blast_radius', row['blast_radius']),
    data_sensitivity: level('judge.risk.data_sensitivity', row['data_sensitivity']),
    contract_surface: level('judge.risk.contract_surface', row['contract_surface']),
    spend: level('judge.risk.spend', row['spend']),
  };
}

// Sparse by contract: an absent key reads as 0 at the fold, so only the keys
// present are checked, and each must belong to the declared vocabulary.
function probabilities(at: string, value: unknown, known: ReadonlySet<string>): Record<string, number> {
  const row = record(at, value);
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(row)) {
    if (!known.has(key)) throw new KernelError(`resolve --facts: unknown fact ${at}.${key}`);
    out[key] = probability(`${at}.${key}`, item);
  }
  return out;
}

function refuseUnknown(at: string, row: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(row)) {
    if (!allowed.includes(key)) throw new KernelError(`resolve --facts: unknown fact ${at}.${key}`);
  }
}

function record(at: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new KernelError(`resolve --facts: ${at} must be an object`);
  return value;
}

function modelSlug(value: unknown): string {
  if (typeof value !== 'string' || !MODEL_SLUG.test(value)) {
    throw new KernelError('resolve --facts: judge.model must be a slug of at most 256 characters');
  }
  return value;
}

function probability(at: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new KernelError(`resolve --facts: ${at} must be a number in [0,1]`);
  }
  return value;
}

function count(at: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new KernelError(`resolve --facts: ${at} must be an integer >= 0`);
  }
  return value;
}

// Levels, never probabilities: the judge client rounds the Score's expected
// value before the fact reaches the kernel (contracts §3).
function level(at: string, value: unknown): ScoreLevel {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new KernelError(`resolve --facts: ${at} must be 0|1|2`);
}
