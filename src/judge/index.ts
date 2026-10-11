// Public surface of the judge client (contracts.md@rev1 §10), consumed by the
// prompt advisor (T05). The kernel never imports this module (decision D5).
export { judge } from './jev';
export { buildQuestionSet, QuestionSetError, type QuestionSources, type QuestionSourceIntent, type QuestionSourceRule } from './questions';
export { createFileBreakerStore, BreakerConfigError, type FileBreakerOptions } from './breaker';
export { RedactionPatternError } from './redact';
export { renderShadowRequest } from './shadow-request';
export type {
  BreakerState,
  BreakerStore,
  FallbackFact,
  JevFact,
  JudgeDeps,
  JudgeFact,
  JudgeInput,
  JudgeOutcome,
  JudgePolicy,
  JudgeReason,
  PromptSource,
  QuestionSet,
} from './types';
