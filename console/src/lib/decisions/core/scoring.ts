import type { DecisionInput, EvidenceVerification, OptionScore, ProviderSuccess, SensitivityScenario } from '../contracts';
import { hashText } from './validation';

export function evidenceSupport(input: DecisionInput, checks: EvidenceVerification[], revision: number, now: number) {
  const usable = input.evidence.filter(item => hashText(item.excerpt) === item.contentHash && Date.parse(item.observedAt) <= now && (!item.expiresAt || Date.parse(item.expiresAt) > now));
  return (optionId: string, targetType: EvidenceVerification['targetType'], targetId: string, evidenceIds: string[]): boolean => {
    if (evidenceIds.length === 0) return false;
    return evidenceIds.every(evidenceId => {
      if (!usable.some(item => item.id === evidenceId)) return false;
      const relevant = checks.filter(check => check.revision === revision && check.evidenceId === evidenceId && check.optionId === optionId && check.targetType === targetType && check.targetId === targetId && check.reviewerId.length > 0 && Date.parse(check.createdAt) <= now);
      return relevant.some(check => check.disposition === 'supported') && !relevant.some(check => check.disposition !== 'supported');
    });
  };
}
export type SupportCheck = ReturnType<typeof evidenceSupport>;
export function scoreOptions(input: DecisionInput, evaluations: ProviderSuccess[], support: SupportCheck): OptionScore[] {
  const total = input.criteria.reduce((sum, item) => sum + item.weight, 0);
  return input.options.map(option => {
    const assessments = evaluations.map(item => item.evaluation.options.find(entry => entry.optionId === option.id));
    let eligibility: OptionScore['eligibility'] = 'eligible';
    for (const constraint of input.constraints) {
      const rows = assessments.map(item => item?.constraints.find(entry => entry.constraintId === constraint.id));
      const verifiedFail = rows.some(row => row?.status === 'fail' && support(option.id, 'constraint', constraint.id, row.evidenceIds));
      const disputed = rows.some(row => row?.status === 'pass') && rows.some(row => row?.status === 'fail');
      if (verifiedFail && !disputed) eligibility = 'ineligible';
      else if (eligibility !== 'ineligible' && (rows.length !== 2 || rows.some(row => !row || row.status !== 'pass' || !support(option.id, 'constraint', constraint.id, row.evidenceIds)))) eligibility = 'unresolved';
    }
    let score: number | null = evaluations.length === 2 ? 0 : null;
    let disagreement: number | null = evaluations.length === 2 ? 0 : null;
    let lower = 0, upper = 0, evidenceCoverage = 0;
    const assumptions = new Set<string>();
    for (const criterion of input.criteria) {
      const weight = criterion.weight / total;
      const rows = assessments.map(item => item?.criteria.find(entry => entry.criterionId === criterion.id));
      rows.forEach(row => row?.assumptions.forEach(item => assumptions.add(item)));
      if (weight === 0) continue;
      lower += weight * (rows.length === 2 ? rows.reduce((sum, row) => sum + (row?.lower ?? 0), 0) / 2 : 0);
      upper += weight * (rows.length === 2 ? rows.reduce((sum, row) => sum + (row?.upper ?? 100), 0) / 2 : 100);
      const left = rows[0]?.score, right = rows[1]?.score;
      if (typeof left !== 'number' || typeof right !== 'number') { score = null; disagreement = null; }
      else {
        if (score !== null) score += weight * (left + right) / 2;
        if (disagreement !== null) disagreement += weight * Math.abs(left - right);
      }
      if (rows.length === 2 && rows.every(row => row && support(option.id, 'criterion', criterion.id, row.evidenceIds))) evidenceCoverage += weight;
    }
    return { optionId: option.id, eligibility, score, lower, upper, disagreement, evidenceCoverage, assumptions: [...assumptions].sort() };
  });
}
export function rank(scores: OptionScore[]): OptionScore[] {
  return scores.filter(item => item.eligibility === 'eligible' && item.score !== null).sort((a, b) => (b.score! - a.score!) || a.optionId.localeCompare(b.optionId));
}
export function scenarioScores(input: DecisionInput, evaluations: ProviderSuccess[], scores: OptionScore[], scenario: SensitivityScenario): Record<string, number | null> {
  const validCriteria = new Set(input.criteria.map(item => item.id));
  if (Object.keys(scenario.weights).some(id => !validCriteria.has(id))) throw new Error('Unknown sensitivity criterion');
  const keys = new Set(input.options.flatMap(option => input.criteria.map(criterion => `${option.id}:${criterion.id}`)));
  for (const [key, score] of Object.entries(scenario.scoreOverrides)) if (!keys.has(key) || !Number.isFinite(score) || score < 0 || score > 100) throw new Error('Invalid sensitivity score override');
  const weights = input.criteria.map(criterion => scenario.weights[criterion.id] ?? criterion.weight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0) || !Number.isFinite(total) || total <= 0) throw new Error('Invalid sensitivity weights');
  return Object.fromEntries(input.options.map(option => {
    if (scores.find(item => item.optionId === option.id)?.eligibility !== 'eligible' || evaluations.length !== 2) return [option.id, null];
    let score: number | null = 0;
    input.criteria.forEach((criterion, index) => {
      const weight = weights[index]! / total;
      if (weight === 0 || score === null) return;
      const points = evaluations.map(provider => provider.evaluation.options.find(item => item.optionId === option.id)?.criteria.find(item => item.criterionId === criterion.id)?.score);
      if (points.some(point => typeof point !== 'number')) { score = null; return; }
      score += weight * (scenario.scoreOverrides[`${option.id}:${criterion.id}`] ?? (points[0]! + points[1]!) / 2);
    });
    return [option.id, score];
  }));
}
