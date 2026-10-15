import type { DecisionPolicy } from '../contracts';
import { defaultPolicy } from '../core';

export interface Tariff { inputMicrosPerMillion: number; outputMicrosPerMillion: number; cachedReadMicrosPerMillion: number; cacheWriteMicrosPerMillion: number; cacheWriteHourMicrosPerMillion?: number }
export interface DecisionConfig {
  enabled: boolean; identityMode: 'local' | 'trusted'; maxTenantCalls: number; policy: DecisionPolicy;
  openaiModel: string; anthropicModel: string; openaiApiKey: string; anthropicApiKey: string;
  pollMs: number; retentionDays: number; tariffVersion: string | null; tariffs: Record<string, Tariff>;
}
function flag(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key];
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`${key} must be true or false`);
  return value === 'true';
}
function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, maximum: number): number {
  const raw = env[key], value = raw === undefined ? fallback : Number(raw);
  if ((raw !== undefined && !/^\d+$/.test(raw)) || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${key}`);
  return value;
}
function threshold(env: NodeJS.ProcessEnv, key: string, fallback: number, maximum = 100): number {
  const raw = env[key], value = raw === undefined ? fallback : Number(raw);
  if ((raw !== undefined && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) || !Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`Invalid ${key}`);
  return value;
}
function parseTariffs(raw: string | undefined): Record<string, Tariff> {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DECISIONS_TARIFFS_JSON must be an object');
  for (const [model, tariff] of Object.entries(value)) {
    if (!model || !tariff || typeof tariff !== 'object' || Array.isArray(tariff)) throw new Error('Invalid model tariff');
    for (const field of ['inputMicrosPerMillion', 'outputMicrosPerMillion', 'cachedReadMicrosPerMillion', 'cacheWriteMicrosPerMillion']) {
      const rate = (tariff as Record<string, unknown>)[field];
      if (typeof rate !== 'number' || !Number.isSafeInteger(rate) || rate < 0) throw new Error(`Invalid tariff ${field}`);
    }
    const hour = (tariff as Record<string, unknown>).cacheWriteHourMicrosPerMillion;
    if (hour !== undefined && (typeof hour !== 'number' || !Number.isSafeInteger(hour) || hour < 0)) throw new Error('Invalid hour cache tariff');
  }
  return value as Record<string, Tariff>;
}
export function getDecisionConfig(env: NodeJS.ProcessEnv = process.env): DecisionConfig {
  const identityMode = env.DECISIONS_IDENTITY_MODE ?? 'trusted';
  if (identityMode !== 'local' && identityMode !== 'trusted') throw new Error('Invalid DECISIONS_IDENTITY_MODE');
  let scenarios: DecisionPolicy['sensitivityScenarios'] = [];
  if (env.DECISIONS_SENSITIVITY_JSON) {
    const value: unknown = JSON.parse(env.DECISIONS_SENSITIVITY_JSON);
    if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid sensitivity scenario configuration');
    for (const item of value) if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.weights || typeof item.weights !== 'object' || Array.isArray(item.weights) || !item.scoreOverrides || typeof item.scoreOverrides !== 'object' || Array.isArray(item.scoreOverrides)) throw new Error('Invalid sensitivity scenario');
    scenarios = value as DecisionPolicy['sensitivityScenarios'];
  }
  const policy = defaultPolicy({
    version: env.DECISIONS_POLICY_VERSION ?? 'decision-policy-v1',
    shadowMode: flag(env, 'DECISIONS_SHADOW_MODE', true), humanReviewMode: flag(env, 'DECISIONS_HUMAN_REVIEW_MODE', true), lowRiskReadiness: flag(env, 'DECISIONS_LOW_RISK_READINESS', false),
    maxCalls: integer(env, 'DECISIONS_MAX_RUN_CALLS', 8, 100), maxAttemptsPerProvider: integer(env, 'DECISIONS_MAX_PROVIDER_ATTEMPTS', 2, 5),
    deadlineMs: integer(env, 'DECISIONS_DEADLINE_MS', 120000, 600000), outputTokenLimit: integer(env, 'DECISIONS_OUTPUT_TOKEN_LIMIT', 8000, 32000), sensitivityScenarios: scenarios,
    disagreementThreshold: threshold(env, 'DECISIONS_DISAGREEMENT_THRESHOLD', 20), criterionGapThreshold: threshold(env, 'DECISIONS_CRITERION_GAP_THRESHOLD', 30),
    materialWeightThreshold: threshold(env, 'DECISIONS_MATERIAL_WEIGHT_THRESHOLD', 0.15, 1), readyScore: threshold(env, 'DECISIONS_READY_SCORE', 75), readyMargin: threshold(env, 'DECISIONS_READY_MARGIN', 5),
    maxChallengeRounds: threshold(env, 'DECISIONS_MAX_CHALLENGE_ROUNDS', 1, 1), twoReviewersForHighRisk: flag(env, 'DECISIONS_TWO_REVIEWERS_HIGH_RISK', true),
  });
  const tariffs = parseTariffs(env.DECISIONS_TARIFFS_JSON), tariffVersion = env.DECISIONS_TARIFF_VERSION || null;
  if (Object.keys(tariffs).length && !tariffVersion) throw new Error('Configured tariffs require DECISIONS_TARIFF_VERSION');
  return { enabled: flag(env, 'DECISIONS_ENABLED', false), identityMode, maxTenantCalls: integer(env, 'DECISIONS_MAX_TENANT_CALLS', 1000, 1000000), policy,
    openaiModel: env.DECISIONS_OPENAI_MODEL ?? '', anthropicModel: env.DECISIONS_ANTHROPIC_MODEL ?? '', openaiApiKey: env.OPENAI_API_KEY ?? '', anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    pollMs: integer(env, 'DECISIONS_POLL_MS', 2000, 60000), retentionDays: integer(env, 'DECISIONS_RETENTION_DAYS', 90, 3650), tariffVersion, tariffs };
}
