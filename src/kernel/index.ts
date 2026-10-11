export { resolve } from './resolve';
export type { Answer, AnswerRouteSection, DeclaredFacts, JudgedEscalateRouteSection, TaskContractSection } from './resolve';
export type { KernelContext, Registries } from './context';
export type { ModelEscalation, ModelSection } from './model';
export type { ClassifiedRiskSection, RiskSection, TierRiskSection } from './risk';
export type { RepairFacts, RepairSection } from './repair';
export type { AdmitFacts, AdmitSection } from './admit';
export type { BreakerFacts, BreakerSection } from './breaker';
export type { HitlFacts, HitlSection } from './hitl';
export type { WaveViolation, WavesFacts, WavesSection } from './waves';
export type { EscalateRouteSection, RankedIntent, SuppressedIntent } from './route';
// Carried by the route sections and by TaskContractSection, so a consumer of
// either needs the member type the barrel already implies.
export type { SkillLookupSection, SkillReading, SkillState, SkillStateSection, SuppressedSkill } from './skill-state';
export type { ComposedDecisionsSection, DecisionMatch, DecisionsFacts, DecisionsSection } from './decisions';
export type { CombineInput, CombineOutput } from './combine';
// The kernel-side judge fact (contracts.md@rev1 §3); src/judge/types.ts
// re-declares the same shapes rather than importing them (decision D5).
export type {
  FallbackFact,
  FallbackReason,
  JevFact,
  JudgeFact,
  JudgeMode,
  JudgeReason,
  JudgeSummary,
  RiskLevels,
  ScoreLevel,
} from './judge-facts';
export type { ScaleFacts, ScaleSection } from './scale';
