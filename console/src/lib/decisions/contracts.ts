import { z } from 'zod';

export const SCHEMA_VERSION = 'decisions-v1';
export const idSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const timestamp = z.string().datetime();
export const decisionInputSchema = z.object({
  question: z.string().min(1).max(2000), context: z.string().max(20000),
  options: z.array(z.object({ id: idSchema, label: z.string().min(1).max(200), description: z.string().max(5000) }).strict()).min(2).max(20),
  criteria: z.array(z.object({ id: idSchema, label: z.string().min(1).max(200), weight: z.number().finite().nonnegative(), rubric: z.string().min(1).max(5000), minimumScore: z.number().min(0).max(100).nullable() }).strict()).min(1).max(30),
  constraints: z.array(z.object({ id: idSchema, description: z.string().min(1).max(3000) }).strict()).max(30),
  evidence: z.array(z.object({ id: idSchema, source: z.string().min(1).max(2000), excerpt: z.string().max(20000), contentHash: z.string().regex(/^[a-f0-9]{64}$/), observedAt: timestamp, expiresAt: timestamp.nullable() }).strict()).max(100),
  riskTier: z.enum(['low', 'medium', 'high']), reversible: z.boolean(),
}).strict();
export type DecisionInput = z.infer<typeof decisionInputSchema>;

export const evaluationSchema = z.object({
  options: z.array(z.object({
    optionId: z.string(),
    criteria: z.array(z.object({ criterionId: z.string(), score: z.number().nullable(), lower: z.number(), upper: z.number(), rationale: z.string(), evidenceIds: z.array(z.string()), assumptions: z.array(z.string()) }).strict()),
    constraints: z.array(z.object({ constraintId: z.string(), status: z.enum(['pass', 'fail', 'unknown']), rationale: z.string(), evidenceIds: z.array(z.string()) }).strict()),
    risks: z.array(z.object({ id: z.string(), description: z.string(), severity: z.enum(['low', 'medium', 'high', 'critical']), mitigations: z.array(z.string()), evidenceIds: z.array(z.string()) }).strict()),
  }).strict()),
  preferredOptionId: z.string().nullable(), unresolvedQuestions: z.array(z.string()),
  materialClaims: z.array(z.object({ id: z.string(), optionId: z.string(), claim: z.string(), evidenceIds: z.array(z.string()) }).strict()),
}).strict();
export type Evaluation = z.infer<typeof evaluationSchema>;
export type ProviderId = 'openai' | 'anthropic';
export type ProviderFailureKind = 'cancelled' | 'timeout' | 'rate_limit' | 'refusal' | 'incomplete' | 'invalid_output' | 'provider_error' | 'transport_error' | 'budget_exhausted';
export interface ProviderMetadata {
  provider: ProviderId; model: string; requestId: string | null; responseId: string | null;
  startedAt: string; completedAt: string; inputTokens: number | null; outputTokens: number | null;
  cachedReadTokens: number | null; cacheWriteTokens: number | null;
  costMicros: number | null; tariffVersion: string | null; promptVersion: string; schemaVersion: string;
}
export interface ProviderSuccess { ok: true; evaluation: Evaluation; metadata: ProviderMetadata }
export interface ProviderFailure { ok: false; provider: ProviderId; kind: ProviderFailureKind; retryable: boolean; message: string; retryAfterMs: number | null; metadata?: ProviderMetadata }
export type ProviderResult = ProviderSuccess | ProviderFailure;
export interface EvaluationContext { signal: AbortSignal; deadlineAt: number; outputTokenLimit: number; counterAssessment?: Evaluation }
export interface Evaluator { evaluate(provider: ProviderId, input: DecisionInput, context: EvaluationContext): Promise<ProviderResult> }

export interface EvidenceVerification {
  id: string; evidenceId: string; optionId: string; targetType: 'criterion' | 'constraint' | 'claim'; targetId: string;
  disposition: 'supported' | 'contradicted' | 'unverified'; rationale: string;
  reviewerId: string; createdAt: string; revision: number;
}
export const evidenceVerificationRequestSchema = z.object({
  revision: z.number().int().positive(), evidenceId: idSchema, optionId: idSchema,
  targetType: z.enum(['criterion', 'constraint', 'claim']), targetId: idSchema,
  disposition: z.enum(['supported', 'contradicted', 'unverified']), rationale: z.string().min(1).max(3000),
}).strict();
export type GateOutcome = 'PAUSED' | 'BLOCKED' | 'NEEDS_EVIDENCE' | 'HUMAN_REVIEW' | 'READY';
export interface GateReason { code: string; message: string; gate: GateOutcome; optionId?: string }
export interface OptionScore {
  optionId: string; eligibility: 'eligible' | 'ineligible' | 'unresolved';
  score: number | null; lower: number; upper: number; disagreement: number | null;
  evidenceCoverage: number; assumptions: string[];
}
export interface Disagreement { kind: 'factual' | 'assumption' | 'rubric' | 'priorities' | 'judgment'; material: boolean; optionId: string | null; criterionId: string | null; message: string }
export interface SensitivityScenario { id: string; weights: Record<string, number>; scoreOverrides: Record<string, number> }
export interface SensitivityResult { id: string; winnerOptionId: string | null; scores: Record<string, number | null> }
export interface DecisionPolicy {
  version: string; disagreementThreshold: number; criterionGapThreshold: number; materialWeightThreshold: number;
  readyScore: number; readyMargin: number; maxChallengeRounds: number; maxCalls: number; maxAttemptsPerProvider: number;
  deadlineMs: number; outputTokenLimit: number; twoReviewersForHighRisk: boolean;
  shadowMode: boolean; humanReviewMode: boolean; lowRiskReadiness: boolean;
  sensitivityScenarios: SensitivityScenario[];
}
export interface DecisionRevision {
  decisionId: string; revision: number; tenantId: string; ownerId: string;
  input: DecisionInput; inputHash: string; createdAt: string;
}
export interface DecisionSummary { id: string; question: string; revision: number; tenantId: string; ownerId: string; createdAt: string }
export interface DecisionReport {
  id: string; decisionId: string; runId: string; revision: number; policyVersion: string; reportHash: string;
  createdAt: string; outcome: GateOutcome; winnerOptionId: string | null; reasons: GateReason[];
  scores: OptionScore[]; disagreements: Disagreement[]; sensitivity: SensitivityResult[];
  originalEvaluations: ProviderSuccess[]; evaluations: ProviderSuccess[]; evidenceChecks: EvidenceVerification[];
  challengeRounds: number; changes: string[]; independentVerification: false;
}
export interface ReportContext { id: string; decisionId: string; runId: string; revision: number; createdAt: string; challengeRounds: number; originalEvaluations?: ProviderSuccess[] }
export type RunStatus = 'queued' | 'running' | 'completed' | 'paused' | 'cancelled';
export interface RunRecord {
  id: string; decisionId: string; revision: number; tenantId: string; policyVersion: string;
  status: RunStatus; stage: string; version: number; createdAt: string; updatedAt: string;
  deadlineAt: string; callsReserved: number; maxCalls: number; evaluations: ProviderResult[];
  error: string | null;
}
export interface Principal { tenantId: string; actorId: string; role: 'owner' | 'reviewer' | 'admin'; identityMode: 'local' | 'trusted' }
export type ReviewDisposition = 'approve' | 'reject' | 'request_changes';
export const reviewRequestSchema = z.object({
  revision: z.number().int().positive(), reportHash: z.string().regex(/^[a-f0-9]{64}$/), policyVersion: idSchema,
  selectedOptionId: idSchema, disposition: z.enum(['approve', 'reject', 'request_changes']),
  rationale: z.string().min(1).max(5000), expiresAt: timestamp.nullable(), expectedVersion: z.number().int().nonnegative(),
}).strict();
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export interface ReviewRecord extends ReviewRequest { id: string; decisionId: string; reviewerId: string; tenantId: string; createdAt: string; valid: boolean }
export interface AuditEvent { id: number; decisionId: string; event: string; actorId: string; createdAt: string; data: Record<string, unknown> }
export interface DecisionDetail {
  decision: DecisionSummary; revisions: DecisionRevision[]; runs: RunRecord[]; reports: DecisionReport[];
  reviews: ReviewRecord[]; evidenceChecks: EvidenceVerification[]; audit: AuditEvent[];
  capabilities: { identityMode: 'local' | 'trusted'; canReview: boolean; requiredReviewers: number };
}
export interface DecisionList { items: DecisionSummary[]; total: number; offset: number; limit: number }
export interface ApiFailure { error: { code: string; message: string; correlationId: string; fields?: string[] } }
export const startRunRequestSchema = z.object({ revision: z.number().int().positive(), idempotencyKey: idSchema }).strict();
export const createDecisionRequestSchema = z.object({ input: decisionInputSchema, idempotencyKey: idSchema }).strict();
export const revisionRequestSchema = z.object({ input: decisionInputSchema, expectedRevision: z.number().int().positive() }).strict();
