// Renders the committed reviewable draft request,
// docs/specs/2026-10-10-jev-shadow-request.json (contracts.md@rev1 §10.2,
// §10.4). Its `state` is the routing plan's misroute 2 sample, and its
// `questions` are buildQuestionSet() over the shipped registries, so the file
// and the live request body cannot disagree on wording or order. Rendering is
// pure: it sends nothing.
import { buildQuestionSet, type QuestionSources } from './questions';
import type { JudgeState } from './types';

export const SHADOW_SAMPLE_STATE: Readonly<JudgeState> = {
  request: {
    text: 'create a plan to replace our routing and check the other files which could be replaceable by julia or jev or a more suitable decision framework to make this enginoes framework faster and intelligent',
    source: 'user',
  },
  repository: { declared_stack: ['typescript', 'nextjs'], active_spec: false, open_change_record: false },
  session: { last_intent: null },
};

export function renderShadowRequest(sources: QuestionSources, model: string): string {
  const body = { model, state: SHADOW_SAMPLE_STATE, questions: buildQuestionSet(sources) };
  return `${JSON.stringify(body, null, 2)}\n`;
}
