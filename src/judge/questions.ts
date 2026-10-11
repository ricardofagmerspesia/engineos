// Deterministic Jev question set (contracts.md@rev1 §10.4). Membership and
// order come from the registries; wording comes from question-text.ts. The same
// registries always yield the same object with the same key order, so
// JSON.stringify of it is byte-stable — the committed shadow request
// (docs/specs/2026-10-10-jev-shadow-request.json) is this output.
import {
  DESIGN_WORK_QUESTION,
  FACT_QUESTIONS,
  INTENT_QUESTION,
  INTENT_WORK,
  IS_PROJECT_CHANGE_QUESTION,
  OTHER_OPTION,
  OTHER_WORK,
  PRIMARY_INTENT_INSTRUCTIONS,
  RISK_QUESTIONS,
  SCALE_QUESTION,
} from './question-text';
import type { ChoiceQuestion, Description, NoulQuestion, QuestionSet } from './types';

export const PRIMARY_INTENT_KEY = 'primary_intent';
export const INTENT_KEY_PREFIX = 'intent.';
export const FACT_KEY_PREFIX = 'fact.';
export const RISK_KEY_PREFIX = 'risk.';
export const IS_PROJECT_CHANGE_KEY = 'is_project_change';
export const DESIGN_WORK_KEY = 'design_work';
export const SCALE_KEY = 'scale';

// Plain projections of registry rows, so the generator does not depend on
// loader fields that land in other tickets. `active` is false for
// `enabled: false` rows (today only the deprecated `backend-python`).
export interface QuestionSourceIntent {
  id: string;
  active: boolean;
}

export interface QuestionSourceRule {
  id: string;
  judge_fact: string | null;
}

export interface QuestionSources {
  intents: readonly QuestionSourceIntent[];
  rules: readonly QuestionSourceRule[];
}

export class QuestionSetError extends Error {
  readonly kind = 'judge-question-set';
}

export function buildQuestionSet(sources: QuestionSources): QuestionSet {
  const intentIds = activeIntentIds(sources.intents);
  const facts = judgeFacts(sources.rules);
  const questions: QuestionSet = {};
  questions[PRIMARY_INTENT_KEY] = primaryIntentQuestion(intentIds);
  for (const id of intentIds) questions[`${INTENT_KEY_PREFIX}${id}`] = intentNoul(id);
  questions[IS_PROJECT_CHANGE_KEY] = IS_PROJECT_CHANGE_QUESTION;
  questions[DESIGN_WORK_KEY] = DESIGN_WORK_QUESTION;
  for (const fact of facts) questions[`${FACT_KEY_PREFIX}${fact}`] = factNoul(fact);
  questions[SCALE_KEY] = SCALE_QUESTION;
  for (const [name, question] of RISK_QUESTIONS) questions[`${RISK_KEY_PREFIX}${name}`] = question;
  return questions;
}

function activeIntentIds(intents: readonly QuestionSourceIntent[]): string[] {
  const ids: string[] = [];
  for (const row of intents) {
    if (!row.active) continue;
    if (row.id === OTHER_OPTION) throw new QuestionSetError(`intent id '${OTHER_OPTION}' is reserved for the judge's fallback option`);
    if (ids.includes(row.id)) throw new QuestionSetError(`intent id '${row.id}' appears twice`);
    ids.push(row.id);
  }
  return ids;
}

function judgeFacts(rules: readonly QuestionSourceRule[]): string[] {
  const facts: string[] = [];
  for (const rule of rules) {
    if (rule.judge_fact === null) continue;
    if (facts.includes(rule.judge_fact)) throw new QuestionSetError(`judge_fact '${rule.judge_fact}' is declared by more than one rule`);
    facts.push(rule.judge_fact);
  }
  return facts;
}

function workOf(id: string): Description {
  const work = INTENT_WORK[id];
  if (work === undefined) throw new QuestionSetError(`active intent '${id}' has no question wording in src/judge/question-text.ts`);
  return work;
}

function primaryIntentQuestion(intentIds: readonly string[]): ChoiceQuestion {
  const criteria: Record<string, Description> = {};
  for (const id of intentIds) criteria[id] = workOf(id);
  criteria[OTHER_OPTION] = OTHER_WORK;
  return {
    type: 'choice',
    instructions: { question: PRIMARY_INTENT_INSTRUCTIONS.question, focus: PRIMARY_INTENT_INSTRUCTIONS.focus },
    criteria,
  };
}

function intentNoul(id: string): NoulQuestion {
  return { type: 'noul', instructions: { work: workOf(id), question: INTENT_QUESTION } };
}

function factNoul(fact: string): NoulQuestion {
  const question = FACT_QUESTIONS[fact];
  if (question === undefined) throw new QuestionSetError(`judge_fact '${fact}' has no question wording in src/judge/question-text.ts`);
  return question;
}
