import { KernelError } from '../lib/json';
import { admitSection, type AdmitFacts, type AdmitSection } from './admit';
import { breakerSection, type BreakerFacts, type BreakerSection } from './breaker';
import type { KernelContext, RiskTier } from './context';
import { hitlSection, type HitlFacts, type HitlSection } from './hitl';
import { modelSection, type ModelSection } from './model';
import { repairSection, type RepairFacts, type RepairSection } from './repair';
import { riskSection, type RiskSection } from './risk';
import { routeByIntent, routeByPath, type RouteSection } from './route';
import { wavesSection, type WavesFacts, type WavesSection } from './waves';

// Declared facts, sparse by design: a section is answered iff the facts it needs
// were declared. This task declares the route section's two forms, the model
// section, the risk section's two forms and the repair, admit, breaker, hitl and
// waves sections; Task 12 adds its own facts and sections to these two
// interfaces (design "Kernel shape").
//
// A multi-field fact travels as the section's own facts type under the section's
// own key (`repair`, `admit`, `breaker`, `hitl`, `waves`), so the fact key and
// the answer key are the same word and a section owns the shape of its input.
// `signals` and `riskTier` are the exception, and the reason is visible in the
// pair: they are two FORMS of one section's input, so neither can be named after
// the key they both answer.
export interface DeclaredFacts {
  path?: string;
  prompt?: string;
  workType?: string;
  // The PARSED --signals payload. Reading the flag's string is the CLI's job;
  // the risk section owns what a well-formed payload is.
  signals?: unknown;
  riskTier?: RiskTier;
  repair?: RepairFacts;
  admit?: AdmitFacts;
  breaker?: BreakerFacts;
  hitl?: HitlFacts;
  waves?: WavesFacts;
}

export interface Answer {
  route?: RouteSection;
  model?: ModelSection;
  risk?: RiskSection;
  repair?: RepairSection;
  admit?: AdmitSection;
  breaker?: BreakerSection;
  hitl?: HitlSection;
  waves?: WavesSection;
}

export function resolve(facts: DeclaredFacts, ctx: KernelContext): Answer {
  const answer: Answer = {};
  // Both forms answer the same `route` key, so one of them would have to win
  // silently. Wave 1(d)'s resolve-task composite is where a prompt and a path
  // are reconciled into one answer; until it lands, declaring both is refused.
  if (facts.path !== undefined && facts.prompt !== undefined) {
    throw new KernelError('a path fact and a prompt fact cannot be declared together');
  }
  if (facts.path !== undefined) {
    // Refuse rather than fabricate: an empty path would route as the repo root
    // and answer a domain nobody asked about.
    if (facts.path === '') throw new KernelError('a declared path fact must not be empty');
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (facts.prompt !== undefined) {
    // Same refusal for the same reason: an empty prompt matches no signal, and
    // answering "ambiguous" would report absence of a request as absence of an
    // intent.
    if (facts.prompt === '') throw new KernelError('a declared prompt fact must not be empty');
    answer.route = routeByIntent(facts.prompt, ctx.registries);
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
  return answer;
}
