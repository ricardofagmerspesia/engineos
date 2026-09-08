import { isRecord, stringArray } from '../lib/json';
import { loadRegistry } from './load';

// hook_guidance and risk_floor are not loaded because routing.json no longer
// stores them: both are derived in src/kernel/route.ts (guidance rendered from
// rules/skills/agent/hint, the floor read from the claiming intent), so the
// registry keeps one form of each fact.
export interface RoutingDomain {
  id: string;
  match: { paths: string[]; basenames: string[] };
  rules: string[];
  skills: string[];
  agent: string | null;
  hint: string | null;
  sample_path: string | null;
}

export interface RoutingRegistry {
  precedence: string[];
  excluded: { paths: string[]; basenames: string[]; self_dirs: string[] };
  domains: RoutingDomain[];
}

export function loadRouting(root: string): RoutingRegistry {
  const raw = loadRegistry(root, 'routing.json');
  const r = isRecord(raw) ? raw : {};
  const ex = isRecord(r['excluded']) ? r['excluded'] : {};
  const domains = Array.isArray(r['domains']) ? r['domains'] : [];
  return {
    precedence: stringArray(r['precedence']),
    excluded: {
      paths: stringArray(ex['paths']),
      basenames: stringArray(ex['basenames']),
      self_dirs: stringArray(ex['self_dirs']),
    },
    domains: domains.filter(isRecord).map((d) => {
      const m = isRecord(d['match']) ? d['match'] : {};
      return {
        id: typeof d['id'] === 'string' ? d['id'] : '',
        match: { paths: stringArray(m['paths']), basenames: stringArray(m['basenames']) },
        rules: stringArray(d['rules']),
        skills: stringArray(d['skills']),
        agent: typeof d['agent'] === 'string' ? d['agent'] : null,
        hint: typeof d['hint'] === 'string' ? d['hint'] : null,
        sample_path: typeof d['sample_path'] === 'string' ? d['sample_path'] : null,
      };
    }),
  };
}
