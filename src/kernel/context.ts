import { loadRegistry } from '../registry/load';
import { loadDecisionRules, type DecisionRulesRegistry } from '../registry/decision-rules';
import { loadIntents, type IntentsRegistry } from '../registry/intents';
import { loadModels, type ModelsRegistry } from '../registry/models';
import { loadPolicy, type PolicyRegistry } from '../registry/policy';
import { loadRouting, type RoutingRegistry } from '../registry/routing';

// The risk vocabulary is defined beside the first loader that validates it
// (src/registry/intents.ts) and re-exported here, where every kernel module
// already looks for it. The policy loader imports the same name rather than
// redefining it, so the tier set has exactly one definition.
export { isRiskTier, type RiskTier } from '../registry/intents';
export type { IntentRow, IntentsRegistry } from '../registry/intents';

// The two registries typed `unknown` have no typed loader yet: a later task lands
// one each and replaces the placeholder. Keeping the keys here keeps the frozen
// Registries shape whole while the loaders arrive one at a time.
export interface Registries {
  readonly routing: RoutingRegistry;
  readonly intents: IntentsRegistry;
  readonly models: ModelsRegistry;
  readonly policy: PolicyRegistry;
  readonly decisionRules: DecisionRulesRegistry;
  readonly capabilities: unknown;
  readonly agents: unknown;
}

export interface KernelContext {
  root: string;
  registries: Registries;
}

export function lazyRegistries(root: string): Registries {
  const routing = memo(() => loadRouting(root));
  const intents = memo(() => loadIntents(root));
  const models = memo(() => loadModels(root));
  const policy = memo(() => loadPolicy(root));
  const decisionRules = memo(() => loadDecisionRules(root));
  const capabilities = memo(() => loadRegistry(root, 'capabilities.json'));
  const agents = memo(() => loadRegistry(root, 'agents.json'));
  return {
    get routing(): RoutingRegistry { return routing(); },
    get intents(): IntentsRegistry { return intents(); },
    get models(): ModelsRegistry { return models(); },
    get policy(): PolicyRegistry { return policy(); },
    get decisionRules(): DecisionRulesRegistry { return decisionRules(); },
    get capabilities(): unknown { return capabilities(); },
    get agents(): unknown { return agents(); },
  };
}

// A cell rather than a nullable value: a loader that legitimately answers
// undefined must still be called only once.
function memo<T>(make: () => T): () => T {
  let cell: { value: T } | null = null;
  return (): T => {
    if (cell === null) cell = { value: make() };
    return cell.value;
  };
}
