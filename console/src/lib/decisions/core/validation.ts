import { createHash } from 'node:crypto';
import { decisionInputSchema, evaluationSchema, type DecisionInput, type Evaluation } from '../contracts';

function unique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} IDs`);
}
function exact(ids: string[], expected: string[], label: string): void {
  unique(ids, label);
  if (ids.length !== expected.length || ids.some(id => !expected.includes(id))) throw new Error(`Invalid ${label} matrix`);
}
export function hashText(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}
export function parseDecisionInput(value: unknown): DecisionInput {
  const input = decisionInputSchema.parse(value);
  for (const [label, items] of [['option', input.options], ['criterion', input.criteria], ['constraint', input.constraints], ['evidence', input.evidence]] as const) unique(items.map(item => item.id), label);
  const sum = input.criteria.reduce((total, criterion) => total + criterion.weight, 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new Error('Criterion weight total must be finite and positive');
  for (const evidence of input.evidence) {
    if (hashText(evidence.excerpt) !== evidence.contentHash) throw new Error(`Evidence ${evidence.id} content hash mismatch`);
    if (evidence.expiresAt && Date.parse(evidence.expiresAt) <= Date.parse(evidence.observedAt)) throw new Error(`Evidence ${evidence.id} expires before observation`);
  }
  return input;
}
export function parseEvaluation(input: DecisionInput, value: unknown): Evaluation {
  const evaluation = evaluationSchema.parse(value);
  const optionIds = input.options.map(option => option.id);
  const evidenceIds = input.evidence.map(item => item.id);
  const refs = (ids: string[]) => {
    unique(ids, 'evidence reference');
    if (ids.some(id => !evidenceIds.includes(id))) throw new Error('Unknown evidence reference');
  };
  exact(evaluation.options.map(option => option.optionId), optionIds, 'option');
  if (evaluation.preferredOptionId !== null && !optionIds.includes(evaluation.preferredOptionId)) throw new Error('Unknown preferred option');
  for (const option of evaluation.options) {
    exact(option.criteria.map(item => item.criterionId), input.criteria.map(item => item.id), 'criterion');
    exact(option.constraints.map(item => item.constraintId), input.constraints.map(item => item.id), 'constraint');
    unique(option.risks.map(item => item.id), 'risk');
    for (const criterion of option.criteria) {
      for (const score of [criterion.score, criterion.lower, criterion.upper]) if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new Error('Invalid score range');
      if (criterion.lower > criterion.upper || (criterion.score !== null && (criterion.lower > criterion.score || criterion.upper < criterion.score))) throw new Error('Bounds do not contain score');
      if (criterion.score === null && (criterion.lower !== 0 || criterion.upper !== 100)) throw new Error('Unsupported score requires full uncertainty interval');
      refs(criterion.evidenceIds);
    }
    option.constraints.forEach(item => refs(item.evidenceIds));
    option.risks.forEach(item => refs(item.evidenceIds));
  }
  unique(evaluation.materialClaims.map(claim => claim.id), 'claim');
  for (const claim of evaluation.materialClaims) {
    if (!optionIds.includes(claim.optionId)) throw new Error('Unknown claim option');
    refs(claim.evidenceIds);
  }
  return evaluation;
}
