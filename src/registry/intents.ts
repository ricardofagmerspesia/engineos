import { loadRegistry } from './load';
import { strictReader } from './strict';

// Type-level mirror of the risk vocabulary. The runtime vocabulary still comes
// from registries/policy.json (design "Kernel shape"); this only stops the three
// tiers being spelled as bare strings in every signature that carries one. It
// lives beside the loader that validates it — src/kernel/context.ts re-exports
// it — so nothing in src/registry/ has to import back out of src/kernel/.
export type RiskTier = 'low' | 'medium' | 'high';

export function isRiskTier(value: unknown): value is RiskTier {
  return value === 'low' || value === 'medium' || value === 'high';
}

// Every field cmd_route_intent projects, plus the five the kernel reads without
// projecting: `signals` (the match input), `domain` (the foreign key route.ts
// floorOf() follows from routing.json back to this row) and the three
// suppression/escalation fields route.ts routeEscalate() reads. The last three
// are deliberately absent from the route-intent answer — that projection is P2
// public surface and stays byte-identical — so the escalate composite re-reads
// them from the registry, exactly as cmd_route_escalate does.
//
// The registry's remaining bookkeeping fields — hook_mirrored,
// required_sections — have no kernel reader yet and are left unparsed.
export interface IntentRow {
  id: string;
  title: string;
  signals: string[];
  rules: string[];
  skills: string[];
  agents: string[];
  commands: string[];
  mcp: string[];
  model_tier: string | null;
  risk_floor: RiskTier | null;
  domain: string | null;
  note: string | null;
  // Registry-absent means false/empty, never null: the bash arm reads these as
  // `(.suppressible == true)`, `(.suppressed_by // [])` and
  // `(.requires_dispatch_plan == true)`, so the defaulting is part of what the
  // registry means rather than something each reader re-decides. Keeping the
  // nulls here would push that coercion to every call site — the same reason
  // `rules` and `skills` already answer [] rather than null.
  suppressible: boolean;
  suppressed_by: string[];
  requires_dispatch_plan: boolean;
}

export interface IntentsRegistry {
  version: string;
  intents: IntentRow[];
}

const reader = strictReader('intents.json');

export function loadIntents(root: string): IntentsRegistry {
  const document = reader.requireRecord(loadRegistry(root, 'intents.json'), '');
  const rows = reader.requireRows(document['intents'], '.intents');
  // An intents registry with no rows routes nothing at all, which is the same
  // silent disappearance a malformed file used to produce.
  if (rows.length === 0) reader.malformed('.intents must not be empty');
  return {
    version: reader.requireString(document['version'], '.version'),
    intents: rows.map((row, i) => {
      const path = `.intents[${i}]`;
      const id = reader.requireString(row['id'], `${path}.id`);
      // The id is what suppressed_by, the router announcement and every
      // decision rule name a row by; an empty one can be referenced by nothing.
      if (id === '') reader.malformed(`${path}.id must not be empty`);
      const signals = reader.requireStrings(row['signals'], `${path}.signals`);
      // A row with no signal can never match, so it is a registry defect rather
      // than a row the matcher simply skips.
      if (signals.length === 0) reader.malformed(`${path}.signals must not be empty`);
      return {
        id,
        title: reader.requireString(row['title'], `${path}.title`),
        signals,
        rules: reader.optionalStrings(row['rules'], `${path}.rules`),
        skills: reader.optionalStrings(row['skills'], `${path}.skills`),
        agents: reader.optionalStrings(row['agents'], `${path}.agents`),
        commands: reader.optionalStrings(row['commands'], `${path}.commands`),
        mcp: reader.optionalStrings(row['mcp'], `${path}.mcp`),
        model_tier: reader.optionalString(row['model_tier'], `${path}.model_tier`),
        risk_floor: riskFloor(row['risk_floor'], `${path}.risk_floor`),
        domain: reader.optionalString(row['domain'], `${path}.domain`),
        // jq's `{note}` answers null for a row without one, so an absent note and
        // a null note are the same answer downstream.
        note: reader.optionalString(row['note'], `${path}.note`),
        suppressible: flag(row['suppressible'], `${path}.suppressible`),
        suppressed_by: reader.optionalStrings(row['suppressed_by'], `${path}.suppressed_by`),
        requires_dispatch_plan: flag(row['requires_dispatch_plan'], `${path}.requires_dispatch_plan`),
      };
    }),
  };
}

// The registry writes a floor or omits it. A present value outside the vocabulary
// used to read as "no floor", which is the one answer a risk floor must never
// silently become.
function riskFloor(value: unknown, path: string): RiskTier | null {
  if (value === undefined || value === null) return null;
  if (isRiskTier(value)) return value;
  // Returned rather than called for its throw: `reader` is an inferred const, so
  // tsc does not apply never-returning control flow through the interface method.
  return reader.malformed(`${path} must be low, medium or high`);
}

// Absent still defaults to false (the bash arm's `== true`); a present value that
// is not a boolean is malformed rather than coerced to false, because coercing it
// answers "not suppressible" for a row whose author meant the opposite.
function flag(value: unknown, path: string): boolean {
  if (value === undefined || value === null) return false;
  return reader.requireBoolean(value, path);
}
