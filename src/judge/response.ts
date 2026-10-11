// Schema validation of a Jev response into a JevFact (contracts.md@rev2 §3,
// §10.3). Wire names confirmed against the TypeSafe HTTP API reference
// (https://docs.typesafe.ai/api.md and /primitives/{choice,noul,score}.md, read
// 2026-10-11): top-level `model`, `answers`, `usage.input_tokens`; choice
// `choice`/`probabilities`/`confidence`; noul `noul`; score `score`/`legend`/
// `probabilities` keyed "0".."n-1". The response is untrusted model output: any
// missing answer, wrong type or out-of-range number rejects the whole response
// (null), never a defaulted fact. `usage` is the one exception: it feeds only the
// exec-journal span, so a missing or malformed value reads as null.
import { isRecord } from '../lib/json';
import {
  DESIGN_WORK_KEY,
  FACT_KEY_PREFIX,
  INTENT_KEY_PREFIX,
  IS_PROJECT_CHANGE_KEY,
  PRIMARY_INTENT_KEY,
  RISK_KEY_PREFIX,
  SCALE_KEY,
} from './questions';
import type { JevFact, QuestionSet, RiskLevels, ScoreLevel } from './types';

// Same bound as the exec-journal slug: the model id is journaled as a span field.
const MODEL_SLUG = /^[A-Za-z0-9@_./:-]{1,256}$/;
const RISK_NAMES: ReadonlyArray<keyof RiskLevels> = ['reversibility', 'blast_radius', 'data_sensitivity', 'contract_surface', 'spend'];

export function parseJevResponse(raw: unknown, questions: QuestionSet, latencyMs: number): JevFact | null {
  if (!isRecord(raw)) return null;
  const answers = raw['answers'];
  const model = raw['model'];
  if (!isRecord(answers) || typeof model !== 'string' || !MODEL_SLUG.test(model)) return null;

  const primary = choiceAnswer(answers[PRIMARY_INTENT_KEY], questions);
  const isProjectChange = noulAnswer(answers[IS_PROJECT_CHANGE_KEY]);
  const designWork = noulAnswer(answers[DESIGN_WORK_KEY]);
  const scale = scoreAnswer(answers[SCALE_KEY], levelCount(questions, SCALE_KEY));
  const intents = noulsByPrefix(answers, questions, INTENT_KEY_PREFIX);
  const rules = noulsByPrefix(answers, questions, FACT_KEY_PREFIX);
  const risk = riskAnswers(answers, questions);
  if (primary === null || isProjectChange === null || designWork === null || scale === null) return null;
  if (intents === null || rules === null || risk === null) return null;

  return {
    source: 'jev',
    model,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    is_project_change: isProjectChange,
    primary,
    intents,
    rules,
    scale,
    design_work: designWork,
    risk,
  };
}

// usage.input_tokens for the exec-journal span (rev2 §7, §10.3): a
// non-negative integer, else null. Never fails the response.
export function reportedInputTokens(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const usage = raw['usage'];
  if (!isRecord(usage)) return null;
  const tokens = usage['input_tokens'];
  return typeof tokens === 'number' && Number.isInteger(tokens) && tokens >= 0 ? tokens : null;
}

function choiceAnswer(answer: unknown, questions: QuestionSet): JevFact['primary'] | null {
  const question = questions[PRIMARY_INTENT_KEY];
  if (question === undefined || question.type !== 'choice') return null;
  if (!isRecord(answer) || answer['type'] !== 'choice') return null;
  const choice = answer['choice'];
  const confidence = answer['confidence'];
  const options = Object.keys(question.criteria);
  if (typeof choice !== 'string' || !options.includes(choice) || !isUnit(confidence)) return null;
  const probabilities = choiceProbabilities(answer['probabilities'], options);
  if (probabilities === null) return null;
  const margin = choiceMargin(choice, probabilities, options);
  if (margin === null) return null;
  return { id: choice, confidence, margin };
}

// margin = p[choice] - max(p[other options]); 1 with a single option (rev2
// §10.3). Clamped at 0: the API reports `choice` as the most probable option, so
// a negative value only arises from an inconsistent answer and must not leave
// the JevFact [0,1] range.
// The chosen option must itself be reported; its absence is a schema failure.
function choiceMargin(choice: string, probabilities: Record<string, number>, options: readonly string[]): number | null {
  const chosen = probabilities[choice];
  if (chosen === undefined) return null;
  const others = options.filter((option) => option !== choice).map((option) => probabilities[option] ?? 0);
  if (others.length === 0) return 1;
  return clampUnit(chosen - Math.max(...others));
}

// Each reported key must be a sent option with a [0,1] number. Options the API
// leaves out read as 0.
function choiceProbabilities(value: unknown, options: readonly string[]): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, p] of Object.entries(value)) {
    if (!options.includes(key) || !isUnit(p)) return null;
    out[key] = p;
  }
  return out;
}

function noulAnswer(answer: unknown): number | null {
  if (!isRecord(answer) || answer['type'] !== 'noul') return null;
  const p = answer['noul'];
  return isUnit(p) ? p : null;
}

// Level = round(sum(i * p_i)) over the ordered level probabilities (contracts §3);
// the wire `score` field is the same expectation, but the frozen mapping reads
// the distribution so a rounding difference upstream cannot shift a level.
// `score` and `legend` are schema-checked only (rev2 §10.3).
function scoreAnswer(answer: unknown, levels: number | null): ScoreLevel | null {
  if (levels === null || !isRecord(answer) || answer['type'] !== 'score') return null;
  const score = answer['score'];
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > levels - 1) return null;
  if (!isRecord(answer['legend'])) return null;
  const keys = Array.from({ length: levels }, (_, i) => String(i));
  const probabilities = probabilityMap(answer['probabilities'], keys);
  if (probabilities === null) return null;
  let expectation = 0;
  for (let i = 0; i < levels; i += 1) expectation += i * (probabilities[String(i)] ?? 0);
  return toScoreLevel(Math.round(expectation));
}

function noulsByPrefix(answers: Record<string, unknown>, questions: QuestionSet, prefix: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const key of Object.keys(questions)) {
    if (!key.startsWith(prefix)) continue;
    const p = noulAnswer(answers[key]);
    if (p === null) return null;
    out[key.slice(prefix.length)] = p;
  }
  return out;
}

function riskAnswers(answers: Record<string, unknown>, questions: QuestionSet): RiskLevels | null {
  const level = (name: keyof RiskLevels): ScoreLevel | null => {
    const key = `${RISK_KEY_PREFIX}${name}`;
    return scoreAnswer(answers[key], levelCount(questions, key));
  };
  const [reversibility, blastRadius, dataSensitivity, contractSurface, spend] = RISK_NAMES.map(level);
  if (reversibility == null || blastRadius == null || dataSensitivity == null) return null;
  if (contractSurface == null || spend == null) return null;
  return {
    reversibility,
    blast_radius: blastRadius,
    data_sensitivity: dataSensitivity,
    contract_surface: contractSurface,
    spend,
  };
}

function levelCount(questions: QuestionSet, key: string): number | null {
  const question = questions[key];
  return question !== undefined && question.type === 'score' ? question.criteria.length : null;
}

// Score levels: exactly the keys "0".."<levels-1>", each a [0,1] number.
function probabilityMap(value: unknown, keys: readonly string[]): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, number> = {};
  for (const key of Object.keys(value)) if (!keys.includes(key)) return null;
  for (const key of keys) {
    const p = value[key];
    if (!isUnit(p)) return null;
    out[key] = p;
  }
  return out;
}

function toScoreLevel(n: number): ScoreLevel | null {
  if (n === 0 || n === 1 || n === 2) return n;
  return null;
}

function isUnit(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function clampUnit(n: number): number {
  return Math.min(1, Math.max(0, n));
}
