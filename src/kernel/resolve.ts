import { KernelError } from '../lib/json';
import { admitSection, type AdmitFacts, type AdmitSection } from './admit';
import { breakerSection, type BreakerFacts, type BreakerSection } from './breaker';
import type { KernelContext, RiskTier } from './context';
import { decisionsSection, type ComposedDecisionsSection, type DecisionsFacts, type DecisionsSection } from './decisions';
import { hitlSection, type HitlFacts, type HitlSection } from './hitl';
import { judgeFact, judgeSummary, type JudgeSummary } from './judge-facts';
import { modelSection, type ModelSection } from './model';
import { repairSection, type RepairFacts, type RepairSection } from './repair';
import { composeTaskContract, type TaskContractSection } from './resolve-task-contract';
import { riskSection, type RiskSection } from './risk';
import {
  routeByIntent,
  routeByPath,
  routeEscalate,
  type EscalateRouteSection,
  type IntentRouteSection,
  type PathRouteSection,
} from './route';
import { scaleSection, type ScaleFacts, type ScaleSection } from './scale';
import { tiebreakFact } from './tiebreak-facts';
import { wavesSection, type WavesFacts, type WavesSection } from './waves';

// The task-contract block lives in resolve-task-contract.ts; its section type
// stays importable from here, where the answer that carries it is declared.
export type { TaskContractSection } from './resolve-task-contract';

// Declared facts, sparse by design: a section is answered iff the facts it needs
// were declared. With Wave 1(d) the set is complete — every legacy arm is a
// projection of one call (design "Kernel shape").
//
// A multi-field fact travels as the section's own facts type under the section's
// own key (`scale`, `decisions`, `repair`, `admit`, `breaker`, `hitl`, `waves`),
// so the fact key and the answer key are the same word and a section owns the
// shape of its input. `decisions` is the one place the two words differ: the
// answer key is the legacy projection's name, `decision_rules`, which is frozen
// public surface, while the module and its section are named for the concept.
// `signals` and `riskTier` are the other exception, and the reason is visible in
// the pair: they are two FORMS of one section's input, so neither can be named
// after the key they both answer.
//
// `escalate` and `taskContract` are not facts about the world; they are
// MODIFIERS that say which question the prompt fact is being asked. A prompt
// answers the route section in three forms, and the forms are not
// interchangeable — the intent form is P2 public surface and never carries the
// suppression fields — so the caller declares which one it wants rather than the
// kernel guessing from the other facts. `taskContract` implies `escalate`,
// because the task contract is composed out of the escalate form.
export interface DeclaredFacts {
  path?: string;
  prompt?: string;
  escalate?: boolean;
  taskContract?: boolean;
  workType?: string;
  // The PARSED --signals payload. Reading the flag's string is the CLI's job;
  // the risk section owns what a well-formed payload is.
  signals?: unknown;
  riskTier?: RiskTier;
  scale?: ScaleFacts;
  decisions?: DecisionsFacts;
  repair?: RepairFacts;
  admit?: AdmitFacts;
  breaker?: BreakerFacts;
  hitl?: HitlFacts;
  waves?: WavesFacts;
  // Passed through unread, like `signals`: judge-facts.ts owns what a
  // well-formed fact is, and checks its vocabulary against the registries.
  judge?: unknown;
  // The same, for tiebreak-facts.ts: the embedding tie-break scores
  // (contracts.md@rev3 §3.1), checked against the registries and the ranking.
  tiebreak?: unknown;
}

// The escalate form carries the judge summary as its trailing key
// (contracts.md@rev1 §2.3) in every answer: the declared fact's summary, or the
// no-judge-fact fallback when none was declared.
export type JudgedEscalateRouteSection = EscalateRouteSection & { judge: JudgeSummary };

export type AnswerRouteSection = PathRouteSection | IntentRouteSection | JudgedEscalateRouteSection;

// Keys appear in the order resolve fills them, which is the order below for
// every fact but the task contract: that block is composed last and fills
// `decision_rules`, `hitl` and `task_contract` together, so a task-contract call
// answers route, decision_rules, hitl, task_contract in that order. The
// resolve-task projection re-orders into the legacy composite; the `resolve` arm
// emits this order verbatim.
export interface Answer {
  route?: AnswerRouteSection;
  model?: ModelSection;
  risk?: RiskSection;
  scale?: ScaleSection;
  decision_rules?: DecisionsSection | ComposedDecisionsSection;
  repair?: RepairSection;
  admit?: AdmitSection;
  breaker?: BreakerSection;
  hitl?: HitlSection;
  waves?: WavesSection;
  task_contract?: TaskContractSection;
}

export function resolve(facts: DeclaredFacts, ctx: KernelContext): Answer {
  const answer: Answer = {};
  const { prompt } = facts;
  // Both forms answer the same `route` key, so one of them would have to win
  // silently. resolve-task, the composite Wave 1(d) landed, takes a prompt and
  // nothing else — it has no path form to reconcile a path fact with — so the
  // refusal stands rather than being replaced by a composition.
  if (facts.path !== undefined && prompt !== undefined) {
    throw new KernelError('a path fact and a prompt fact cannot be declared together');
  }
  if (facts.escalate === true && prompt === undefined) {
    throw new KernelError('an escalate fact cannot be declared without a prompt fact');
  }
  // The task contract answers `decision_rules` and `hitl` out of the prompt it
  // was given, so a second fact answering either key would have to win silently
  // — the same refusal, one level up.
  if (facts.taskContract === true && facts.decisions !== undefined) {
    throw new KernelError('a task-contract fact and a decisions fact cannot be declared together');
  }
  if (facts.taskContract === true && facts.hitl !== undefined) {
    throw new KernelError('a task-contract fact and a hitl fact cannot be declared together');
  }
  // Only the task contract folds a judge fact (decision D7); accepted anywhere
  // else it would be a fact silently answered by nothing.
  if (facts.judge !== undefined && facts.taskContract !== true) {
    throw new KernelError('a judge fact cannot be declared without a task-contract fact');
  }
  // The same reason, contracts.md@rev3 §3.1: only the task contract reads it.
  if (facts.tiebreak !== undefined && facts.taskContract !== true) {
    throw new KernelError('a tiebreak fact cannot be declared without a task-contract fact');
  }
  const judge = facts.judge === undefined ? null : judgeFact(facts.judge, ctx.registries);
  const tiebreak = facts.tiebreak === undefined ? null : tiebreakFact(facts.tiebreak, ctx.registries);
  if (facts.path !== undefined) {
    // Refuse rather than fabricate: an empty path would route as the repo root
    // and answer a domain nobody asked about.
    if (facts.path === '') throw new KernelError('a declared path fact must not be empty');
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (prompt !== undefined) {
    // Same refusal for the same reason: an empty prompt matches no signal, and
    // answering "ambiguous" would report absence of a request as absence of an
    // intent.
    if (prompt === '') throw new KernelError('a declared prompt fact must not be empty');
    answer.route =
      facts.escalate === true || facts.taskContract === true
        ? { ...routeEscalate(prompt, ctx.registries), judge: judgeSummary(judge) }
        : routeByIntent(prompt, ctx.registries);
  }
  if (facts.workType !== undefined) {
    answer.model = modelSection({ workType: facts.workType }, ctx.registries);
  }
  // The same refusal the two route forms get, for the same reason: signals are
  // evidence to classify and a tier is already classified, both answer `risk`,
  // and silently preferring one would let a stale tier override fresh evidence.
  if (facts.signals !== undefined && facts.riskTier !== undefined) {
    throw new KernelError('a signals fact and a classified risk-tier fact cannot be declared together');
  }
  if (facts.signals !== undefined) {
    answer.risk = riskSection({ signals: facts.signals }, ctx.registries);
  }
  if (facts.riskTier !== undefined) {
    answer.risk = riskSection({ riskTier: facts.riskTier }, ctx.registries);
  }
  if (facts.scale !== undefined) {
    answer.scale = scaleSection(facts.scale, ctx.registries);
  }
  if (facts.decisions !== undefined) {
    answer.decision_rules = decisionsSection(facts.decisions, ctx.registries);
  }
  if (facts.repair !== undefined) {
    answer.repair = repairSection(facts.repair, ctx.registries);
  }
  if (facts.admit !== undefined) {
    answer.admit = admitSection(facts.admit, ctx.registries);
  }
  if (facts.breaker !== undefined) {
    answer.breaker = breakerSection(facts.breaker, ctx.registries);
  }
  if (facts.hitl !== undefined) {
    answer.hitl = hitlSection(facts.hitl, ctx.registries);
  }
  if (facts.waves !== undefined) {
    answer.waves = wavesSection(facts.waves, ctx.registries);
  }
  // Composed last, out of the sections above rather than beside them: the task
  // contract is the one answer that reads another section's answer.
  if (facts.taskContract === true) {
    if (prompt === undefined) {
      throw new KernelError('a task-contract fact cannot be declared without a prompt fact');
    }
    const route = answer.route;
    if (route === undefined || !('escalate' in route)) {
      throw new KernelError('a task-contract fact answered no escalate route section');
    }
    const composed = composeTaskContract({ prompt, route, judge, tiebreak }, ctx.registries);
    answer.decision_rules = composed.decision_rules;
    if (composed.hitl !== null) answer.hitl = composed.hitl;
    answer.task_contract = composed.task_contract;
  }
  return answer;
}
