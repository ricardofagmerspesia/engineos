import { loadAgents, type Agent } from '../registry/agents';
import { loadCapabilities, type CapabilitiesRegistry } from '../registry/capabilities';
import { loadDecisionRules, type DecisionRulesRegistry } from '../registry/decision-rules';
import { loadIntents, type IntentsRegistry } from '../registry/intents';
import { loadModels, type ModelsRegistry } from '../registry/models';
import { loadPolicy, type PolicyRegistry } from '../registry/policy';
import { loadRouting, type RoutingRegistry } from '../registry/routing';
import { readSkillState, type SkillState } from './skill-state';

// The risk vocabulary is defined beside the first loader that validates it
// (src/registry/intents.ts) and re-exported here, where every kernel module
// already looks for it. The policy loader imports the same name rather than
// redefining it, so the tier set has exactly one definition.
export { isRiskTier, type RiskTier } from '../registry/intents';
export type { IntentRow, IntentsRegistry } from '../registry/intents';

// The seven registry FILES, keyed by the name every caller uses for them. Split
// out of Registries below so a consumer that maps a name onto a file on disk
// (src/checks/mirrors.ts) can spell "registry file" in its own types instead of
// subtracting a key that is not one.
//
// Every key now resolves through its own typed loader. `agents` is the one lenient
// loader (src/registry/agents.ts documents why a throw there would cost the
// dispatch banner); the other six refuse a malformed registry.
export interface RegistryFiles {
  readonly routing: RoutingRegistry;
  readonly intents: IntentsRegistry;
  readonly models: ModelsRegistry;
  readonly policy: PolicyRegistry;
  readonly decisionRules: DecisionRulesRegistry;
  readonly capabilities: CapabilitiesRegistry;
  readonly agents: Agent[];
}

export interface Registries extends RegistryFiles {
  // Not a registry file, and carried here anyway: skill enablement is the one
  // other per-root resolution the routing answers depend on, and it rides this
  // bundle so EVERY caller that already builds a KernelContext out of
  // lazyRegistries answers with enablement applied. The alternative — a second
  // field each construction site has to remember to pass — is exactly how a
  // disabled skill would keep being recommended by whichever site forgot.
  readonly skillState: SkillState;
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
  const capabilities = memo(() => loadCapabilities(root));
  const agents = memo(() => loadAgents(root));
  // Memoized for the reason bash kept SKILL_STATE_CACHE: resolve-task reads the
  // state at three answer sites, and walking skills/ once per site would turn a
  // routing answer into N directory scans.
  const skillState = memo(() => readSkillState(root));
  return {
    get routing(): RoutingRegistry { return routing(); },
    get intents(): IntentsRegistry { return intents(); },
    get models(): ModelsRegistry { return models(); },
    get policy(): PolicyRegistry { return policy(); },
    get decisionRules(): DecisionRulesRegistry { return decisionRules(); },
    get capabilities(): CapabilitiesRegistry { return capabilities(); },
    get agents(): Agent[] { return agents(); },
    get skillState(): SkillState { return skillState(); },
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
