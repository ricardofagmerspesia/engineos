// Contract types for the Jev judge client (contracts.md@rev1 §3, §6.2, §10).
//
// The kernel never imports src/judge/** (decision D5), and src/judge/** never
// imports the kernel's mirror either: the fact shapes below are re-declared
// identically to src/kernel/judge-facts.ts (T06) so neither side can drift the
// other silently. A change here is a contracts rev 2 first.

export type JudgeReason =
  | 'disabled' | 'no-key' | 'no-fetch' | 'breaker-open'
  | 'not-user-input'
  | 'timeout' | 'http-429' | 'http-4xx' | 'http-5xx'
  | 'network' | 'invalid-response' | 'oversize-state'
  | 'no-judge-fact';

export interface FallbackFact {
  source: 'fallback';
  reason: Exclude<JudgeReason, 'not-user-input' | 'no-judge-fact'>;
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

// Mirrors src/hooks/prompt-source.ts (T05, contracts §5); re-declared so this
// module compiles before that file lands.
export type PromptSource = 'user' | 'notification' | 'tool-result' | 'hook-echo';

export interface JudgeInput {
  text: string;
  source: PromptSource;
  repository: { declared_stack: string[]; active_spec: boolean; open_change_record: boolean };
  session: { last_intent: string | null };
}

export interface BreakerState {
  failures: number;
  opened_at: number | null;
}

export interface BreakerStore {
  read(): BreakerState;
  recordFailure(now: number): void;
  recordSuccess(): void;
}

export interface RedactionPattern {
  kind: string;
  pattern: string;
}

// The `policy.judge` block (contracts §6.2) as the strict loader (T09) yields it.
export interface JudgePolicy {
  enabled_env: string;
  enabled_value: string;
  provider: string;
  endpoint: string;
  model: string;
  timeout_ms: number;
  retries: number;
  key_env: string;
  mode: 'shadow' | 'advisory' | 'authoritative';
  max_state_bytes: number;
  thresholds: { intent_default: number; primary_confidence: number; margin: number; rule_default: number };
  redaction: { patterns: RedactionPattern[] };
  breaker: { scope: string; state_file: string; cooldown_ms: number };
}

// Question wire shapes (TypeSafe HTTP API, https://docs.typesafe.ai/api.md).
export type Description = string | { what: string; not_for: string };

export interface ChoiceQuestion {
  type: 'choice';
  instructions: { question: string; focus: string };
  criteria: Record<string, Description>;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string | { work: Description; question: string };
  criteria?: { true: string; false: string };
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export type QuestionSet = Record<string, Question>;

export interface JudgeState {
  request: { text: string; source: 'user'; truncated?: true };
  repository: JudgeInput['repository'];
  session: JudgeInput['session'];
}

export interface JudgeDeps {
  fetch: typeof globalThis.fetch | undefined;
  now: () => number;
  env: Record<string, string | undefined>;
  breaker: BreakerStore;
  policy: JudgePolicy;
  questions: QuestionSet;
}

export type SkippedReason = 'disabled' | 'no-key' | 'no-fetch' | 'breaker-open' | 'not-user-input';

export type FailedReason =
  | 'timeout' | 'http-429' | 'http-4xx' | 'http-5xx' | 'network' | 'invalid-response' | 'oversize-state';

export type JudgeOutcome =
  | { kind: 'facts'; facts: JevFact }
  | { kind: 'skipped'; reason: SkippedReason }
  | { kind: 'failed'; reason: FailedReason };
