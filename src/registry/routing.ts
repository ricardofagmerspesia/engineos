import { loadRegistry } from './load';
import { strictReader } from './strict';

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
  version: string;
  precedence: string[];
  excluded: { paths: string[]; basenames: string[]; self_dirs: string[] };
  domains: RoutingDomain[];
}

const reader = strictReader('routing.json');

// STRICT, like every other loader in this directory. It used to coerce: an empty
// or malformed routing.json answered `{"domain": null, "excluded": false}` with
// exit 0, so `route-path` on an auth guard reported no domain and the security
// routing disappeared without a diagnostic. A registry the kernel cannot read is
// a refusal, never a default a gate then trusts.
export function loadRouting(root: string): RoutingRegistry {
  const document = reader.requireRecord(loadRegistry(root, 'routing.json'), '');
  const excluded = reader.requireRecord(document['excluded'], '.excluded');
  const precedence = reader.requireStrings(document['precedence'], '.precedence');
  // An empty precedence list or an empty domain map parses as JSON and routes
  // nothing. That is the same silent disappearance as a malformed file, so it
  // gets the same answer.
  if (precedence.length === 0) reader.malformed('.precedence must not be empty');
  const domains = reader.requireRows(document['domains'], '.domains');
  if (domains.length === 0) reader.malformed('.domains must not be empty');
  return {
    version: reader.requireString(document['version'], '.version'),
    precedence,
    excluded: {
      paths: reader.optionalStrings(excluded['paths'], '.excluded.paths'),
      basenames: reader.optionalStrings(excluded['basenames'], '.excluded.basenames'),
      self_dirs: reader.optionalStrings(excluded['self_dirs'], '.excluded.self_dirs'),
    },
    domains: domains.map((row, i) => {
      const path = `.domains[${i}]`;
      const match = reader.requireRecord(row['match'], `${path}.match`);
      const id = reader.requireString(row['id'], `${path}.id`);
      // The id is the foreign key intents.json `domain` follows and the value
      // `precedence` orders; an empty one silently matches neither.
      if (id === '') reader.malformed(`${path}.id must not be empty`);
      return {
        id,
        match: {
          paths: reader.optionalStrings(match['paths'], `${path}.match.paths`),
          basenames: reader.optionalStrings(match['basenames'], `${path}.match.basenames`),
        },
        rules: reader.optionalStrings(row['rules'], `${path}.rules`),
        skills: reader.optionalStrings(row['skills'], `${path}.skills`),
        agent: reader.optionalString(row['agent'], `${path}.agent`),
        hint: reader.optionalString(row['hint'], `${path}.hint`),
        sample_path: reader.optionalString(row['sample_path'], `${path}.sample_path`),
      };
    }),
  };
}
