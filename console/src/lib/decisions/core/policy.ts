import type { DecisionPolicy } from '../contracts';
import { canonical, hashText } from './validation';

export function defaultPolicy(overrides: Partial<DecisionPolicy> = {}): DecisionPolicy {
  const policy: DecisionPolicy = {
    version: 'decision-policy-v1', disagreementThreshold: 20, criterionGapThreshold: 30,
    materialWeightThreshold: 0.15, readyScore: 75, readyMargin: 5, maxChallengeRounds: 1,
    maxCalls: 8, maxAttemptsPerProvider: 2, deadlineMs: 120_000, outputTokenLimit: 8000,
    twoReviewersForHighRisk: true, shadowMode: true, humanReviewMode: true,
    lowRiskReadiness: false, sensitivityScenarios: [], ...overrides,
  };
  for (const field of ['disagreementThreshold', 'criterionGapThreshold', 'readyScore', 'readyMargin'] as const) {
    if (!Number.isFinite(policy[field]) || policy[field] < 0 || policy[field] > 100) throw new Error(`Invalid policy ${field}`);
  }
  if (!Number.isFinite(policy.materialWeightThreshold) || policy.materialWeightThreshold < 0 || policy.materialWeightThreshold > 1) throw new Error('Invalid material weight threshold');
  for (const field of ['maxCalls', 'maxAttemptsPerProvider', 'deadlineMs', 'outputTokenLimit'] as const) {
    if (!Number.isSafeInteger(policy[field]) || policy[field] < 1) throw new Error(`Invalid policy ${field}`);
  }
  if (!Number.isSafeInteger(policy.maxChallengeRounds) || policy.maxChallengeRounds < 0 || policy.maxChallengeRounds > 1) throw new Error('At most one challenge round is supported');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(policy.version)) throw new Error('Invalid policy version');
  if (new Set(policy.sensitivityScenarios.map(item => item.id)).size !== policy.sensitivityScenarios.length) throw new Error('Duplicate sensitivity scenarios');
  const baseVersion = policy.version.replace(/-[a-f0-9]{12}$/, '');
  if (baseVersion.length > 106) throw new Error('Policy version prefix too long');
  policy.version = `${baseVersion}-${hashText(canonical({ ...policy, version: baseVersion })).slice(0, 12)}`;
  return policy;
}
