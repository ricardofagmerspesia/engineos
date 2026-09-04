import { isRecord, stringArray } from '../lib/json';
import { loadRegistry } from './load';

// Type-level mirror of the risk vocabulary. The runtime vocabulary still comes
// from registries/policy.json (design "Kernel shape"); this only stops the three
// tiers being spelled as bare strings in every signature that carries one. It
// lives beside the loader that validates it — src/kernel/context.ts re-exports
// it — so nothing in src/registry/ has to import back out of src/kernel/.
export type RiskTier = 'low' | 'medium' | 'high';

export function isRiskTier(value: unknown): value is RiskTier {
  return value === 'low' || value === 'medium' || value === 'high';
}

// Every field cmd_route_intent projects, plus the two the kernel reads without
// projecting: `signals` (the match input) and `domain` (the foreign key
// route.ts floorOf() follows from routing.json back to this row). The registry's
// own bookkeeping fields — hook_mirrored, suppressible, suppressed_by,
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
}

export interface IntentsRegistry {
  intents: IntentRow[];
}

export function loadIntents(root: string): IntentsRegistry {
  const raw = loadRegistry(root, 'intents.json');
  const r = isRecord(raw) ? raw : {};
  const rows: unknown[] = Array.isArray(r['intents']) ? r['intents'] : [];
  return {
    intents: rows.filter(isRecord).map((i) => ({
      id: typeof i['id'] === 'string' ? i['id'] : '',
      title: typeof i['title'] === 'string' ? i['title'] : '',
      signals: stringArray(i['signals']),
      rules: stringArray(i['rules']),
      skills: stringArray(i['skills']),
      agents: stringArray(i['agents']),
      commands: stringArray(i['commands']),
      mcp: stringArray(i['mcp']),
      model_tier: typeof i['model_tier'] === 'string' ? i['model_tier'] : null,
      risk_floor: isRiskTier(i['risk_floor']) ? i['risk_floor'] : null,
      domain: typeof i['domain'] === 'string' ? i['domain'] : null,
      // jq's `{note}` answers null for a row without one, so an absent note and
      // a null note are the same answer downstream.
      note: typeof i['note'] === 'string' ? i['note'] : null,
    })),
  };
}
