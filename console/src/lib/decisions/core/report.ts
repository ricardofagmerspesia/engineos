import type { DecisionInput, DecisionPolicy, DecisionReport, Disagreement, EvidenceVerification, GateOutcome, GateReason, ProviderSuccess, ReportContext } from '../contracts';
import { canonical, hashText, parseDecisionInput, parseEvaluation } from './validation';
import { defaultPolicy } from './policy';
import { evidenceSupport, rank, scenarioScores, scoreOptions } from './scoring';

function disagreementsFor(input: DecisionInput, evaluations: ProviderSuccess[], policy: DecisionPolicy, scores: ReturnType<typeof scoreOptions>): Disagreement[] {
  if (evaluations.length !== 2) return [];
  const left = evaluations[0]!.evaluation, right = evaluations[1]!.evaluation;
  const items: Disagreement[] = [];
  const add = (kind: Disagreement['kind'], message: string, optionId: string | null = null, criterionId: string | null = null) => items.push({ kind, material: true, optionId, criterionId, message });
  // Rank each provider by the same deterministic weighted rubric; preferences cannot override it.
  const rankings = evaluations.map(provider => rank(scoreOptions(input, [provider, provider], () => true))[0]?.optionId ?? null);
  if (rankings[0] !== rankings[1]) add('priorities', 'Providers rank different eligible options first');
  const total = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  for (const option of input.options) {
    const a = left.options.find(item => item.optionId === option.id)!;
    const b = right.options.find(item => item.optionId === option.id)!;
    if ((scores.find(item => item.optionId === option.id)?.disagreement ?? 0) >= policy.disagreementThreshold) add('judgment', 'Weighted score disagreement exceeds policy', option.id);
    for (const criterion of input.criteria) {
      const x = a.criteria.find(item => item.criterionId === criterion.id)!;
      const y = b.criteria.find(item => item.criterionId === criterion.id)!;
      if (criterion.weight / total >= policy.materialWeightThreshold && x.score !== null && y.score !== null && Math.abs(x.score - y.score) >= policy.criterionGapThreshold) {
        add(canonical(x.assumptions) !== canonical(y.assumptions) ? 'assumption' : 'rubric', 'Material criterion score gap exceeds policy', option.id, criterion.id);
      }
    }
    for (const constraint of input.constraints) if (a.constraints.find(item => item.constraintId === constraint.id)!.status !== b.constraints.find(item => item.constraintId === constraint.id)!.status) add('factual', `Conflicting constraint assessments: ${constraint.id}`, option.id);
  }
  // Differing material claims remain unresolved; shared evidence IDs do not establish agreement.
  const claims = (evaluation: typeof left, optionId: string) => evaluation.materialClaims.filter(item => item.optionId === optionId).map(item => item.claim.trim()).sort();
  for (const option of input.options) if (canonical(claims(left, option.id)) !== canonical(claims(right, option.id))) add('factual', 'Providers supply different material evidence claims requiring verification', option.id);
  return items;
}
export function createReport(rawInput: DecisionInput, supplied: ProviderSuccess[], checks: EvidenceVerification[], rawPolicy: DecisionPolicy, ctx: ReportContext): DecisionReport {
  const input = parseDecisionInput(rawInput), policy = defaultPolicy(rawPolicy);
  const reasons: GateReason[] = [];
  const add = (gate: GateOutcome, code: string, message: string, optionId?: string) => reasons.push({ gate, code, message, ...(optionId ? { optionId } : {}) });
  let evaluations: ProviderSuccess[] = [];
  try {
    if (supplied.length !== 2 || new Set(supplied.map(item => item.metadata.provider)).size !== 2 || !supplied.some(item => item.metadata.provider === 'openai') || !supplied.some(item => item.metadata.provider === 'anthropic')) throw new Error('Both independent providers are required');
    evaluations = supplied.map(item => ({ ...item, evaluation: parseEvaluation(input, item.evaluation) }));
  } catch { add('PAUSED', 'provider_evaluation_unavailable', 'Both valid, complete provider evaluations are required'); }
  const now = Date.parse(ctx.createdAt);
  if (!Number.isFinite(now) || !Number.isSafeInteger(ctx.revision) || ctx.revision < 1 || ctx.challengeRounds < 0 || ctx.challengeRounds > policy.maxChallengeRounds) throw new Error('Invalid report context');
  const support = evidenceSupport(input, checks, ctx.revision, now);
  const scores = scoreOptions(input, evaluations, support);
  const ranked = rank(scores), winner = ranked[0], runnerUp = ranked[1];
  const disagreements = disagreementsFor(input, evaluations, policy, scores);
  const sensitivity = policy.sensitivityScenarios.map(scenario => {
    const scenarioResult = scenarioScores(input, evaluations, scores, scenario);
    const rankedScenario = Object.entries(scenarioResult).filter((entry): entry is [string, number] => entry[1] !== null).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const first = rankedScenario[0], second = rankedScenario[1];
    return { id: scenario.id, scores: scenarioResult, winnerOptionId: first && (!second || first[1] > second[1]) ? first[0] : null };
  });
  if (evaluations.length === 2 && scores.every(item => item.eligibility === 'ineligible')) add('BLOCKED', 'all_constraints_failed', 'All options have verified hard-constraint violations');
  for (const score of scores) {
    if (score.eligibility === 'unresolved') add('NEEDS_EVIDENCE', 'constraint_unresolved', 'Hard-constraint evidence is unresolved or disputed', score.optionId);
    if (score.eligibility !== 'ineligible' && score.evidenceCoverage < 1 - Number.EPSILON * 16) add('NEEDS_EVIDENCE', 'criterion_evidence_unverified', 'Positive-weight criterion assessments require current verified support', score.optionId);
    if (score.eligibility !== 'ineligible' && score.score === null) add('NEEDS_EVIDENCE', 'score_unavailable', 'A positively weighted assessment is unsupported', score.optionId);
  }
  for (const provider of evaluations) {
    for (const claim of provider.evaluation.materialClaims) if (!support(claim.optionId, 'claim', claim.id, claim.evidenceIds)) add('NEEDS_EVIDENCE', 'material_claim_unverified', 'A material factual claim lacks verified support', claim.optionId);
    for (const option of provider.evaluation.options) {
      if (scores.find(item => item.optionId === option.optionId)?.eligibility === 'ineligible') continue;
      if (option.risks.some(risk => risk.severity === 'critical')) add('HUMAN_REVIEW', 'critical_risk', 'Critical risk requires explicit human disposition; proposed mitigation is not proof of resolution', option.optionId);
      for (const criterion of input.criteria) {
        const assessment = option.criteria.find(item => item.criterionId === criterion.id)!;
        if (criterion.minimumScore !== null && (assessment.score === null || assessment.lower < criterion.minimumScore)) add('HUMAN_REVIEW', 'criterion_minimum', `Criterion minimum is not robustly met: ${criterion.id}`, option.optionId);
      }
    }
    if (provider.evaluation.unresolvedQuestions.length) add('HUMAN_REVIEW', 'unresolved_questions', 'Provider has unresolved questions');
  }
  if (disagreements.some(item => item.material)) add('HUMAN_REVIEW', 'material_disagreement', 'Material provider disagreement remains unresolved');
  if (input.riskTier !== 'low' || !input.reversible) add('HUMAN_REVIEW', 'risk_or_irreversibility', 'Automatic readiness requires low risk and reversibility');
  if (!winner || winner.score === null || winner.score < policy.readyScore) add('HUMAN_REVIEW', 'ready_score', 'No eligible winner meets the readiness score');
  if (winner && runnerUp && winner.score! - runnerUp.score! < policy.readyMargin) add('HUMAN_REVIEW', 'ready_margin', 'Winning margin is insufficient');
  if (winner && scores.some(item => item.optionId !== winner.optionId && item.eligibility === 'eligible' && winner.lower <= item.upper)) add('HUMAN_REVIEW', 'interval_overlap', 'Winning lower bound does not exceed every other eligible upper bound');
  if (!sensitivity.length || sensitivity.some(item => !winner || item.winnerOptionId !== winner.optionId)) add('HUMAN_REVIEW', 'sensitivity_unstable', 'Explicit deterministic sensitivity scenarios are absent or change the winner');
  if (policy.shadowMode || policy.humanReviewMode || !policy.lowRiskReadiness) add('HUMAN_REVIEW', 'rollout_mode', 'Configured rollout mode requires human review');
  const strength: GateOutcome[] = ['PAUSED', 'BLOCKED', 'NEEDS_EVIDENCE', 'HUMAN_REVIEW', 'READY'];
  reasons.sort((a, b) => strength.indexOf(a.gate) - strength.indexOf(b.gate) || a.code.localeCompare(b.code) || (a.optionId ?? '').localeCompare(b.optionId ?? ''));
  const originalEvaluations = ctx.originalEvaluations ?? supplied;
  const changes = evaluations.flatMap(provider => {
    const previous = originalEvaluations.find(item => item.metadata.provider === provider.metadata.provider);
    if (!previous || canonical(previous.evaluation) === canonical(provider.evaluation)) return [];
    return [`${provider.metadata.provider}: revised assessment; original and revised rationales, evidence and assumptions preserved`];
  });
  const report: DecisionReport = { ...ctx, policyVersion: policy.version, reportHash: '', outcome: reasons[0]?.gate ?? 'READY', winnerOptionId: winner?.optionId ?? null, reasons, scores, disagreements, sensitivity, originalEvaluations, evaluations: supplied, evidenceChecks: checks, changes, independentVerification: false };
  report.reportHash = hashText(canonical(report));
  return JSON.parse(JSON.stringify(report)) as DecisionReport;
}
export function needsChallenge(report: DecisionReport): boolean {
  return report.challengeRounds === 0 && report.evaluations.length === 2 && report.outcome !== 'PAUSED' && report.disagreements.some(item => item.material);
}
