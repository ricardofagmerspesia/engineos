import { KernelError } from '../lib/json';
import type { KernelContext } from './context';
import { routeByIntent, routeByPath, type RouteSection } from './route';

// Declared facts, sparse by design: a section is answered iff the facts it needs
// were declared. This task declares the route section's two forms; Tasks 10-12
// add their own facts and sections to these two interfaces (design "Kernel
// shape").
export interface DeclaredFacts {
  path?: string;
  prompt?: string;
}

export interface Answer {
  route?: RouteSection;
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
  return answer;
}
