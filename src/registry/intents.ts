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
// required_sections, deprecated — have no kernel reader yet and are left
// unparsed. `enabled` is read only to answer `active`.
//
// The v2 scoring fields (contracts.md@rev2 §1.2) follow. `phrases` is always
// populated: declared, or derived from `signals` at weight 1 so a v1 row scores
// on exactly the prompts its signals fire on.
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
  // `enabled !== false`: an absent flag is active, as every v1 row is. The
  // judge is asked only about active rows (src/judge/questions.ts) and only an
  // active row may qualify from a judge fact (src/kernel/combine.ts).
  active: boolean;
  phrases: Phrase[];
  // Kernel-internal: whether the row declared `phrases` itself. Only such rows
  // take the path feature (src/kernel/score.ts), which keeps a v1 registry
  // routing exactly as the any-match router did (§1.5).
  phrases_declared: boolean;
  verb_object: VerbObject | null;
  negative: Phrase[];
  exemplars: string[];
  threshold: number | null;
  router_row: RouterRow | null;
}

export interface Phrase {
  text: string;
  weight: number;
}

export interface VerbObject {
  verbs: string[];
  objects: string[];
  weight: number;
}

export interface RouterRow {
  intent: string;
  load: string;
}

export interface IntentsRegistry {
  version: string;
  intents: IntentRow[];
}

const reader = strictReader('intents.json');

export function loadIntents(root: string): IntentsRegistry {
  return parseIntents(loadRegistry(root, 'intents.json'));
}

// Split from loadIntents so a fixture document (test/fixtures/intents-v2/) is
// parsed by the same refusals without a registries/ directory around it.
export function parseIntents(raw: unknown): IntentsRegistry {
  const document = reader.requireRecord(raw, '');
  const rows = reader.requireRows(document['intents'], '.intents');
  // An intents registry with no rows routes nothing at all, which is the same
  // silent disappearance a malformed file used to produce.
  if (rows.length === 0) reader.malformed('.intents must not be empty');
  return {
    version: reader.requireString(document['version'], '.version'),
    intents: rows.map((row, i) => parseRow(row, `.intents[${i}]`)),
  };
}

function parseRow(row: Record<string, unknown>, path: string): IntentRow {
  const id = reader.requireString(row['id'], `${path}.id`);
  // The id is what suppressed_by, the router announcement and every
  // decision rule name a row by; an empty one can be referenced by nothing.
  if (id === '') reader.malformed(`${path}.id must not be empty`);
  const declared = phraseList(row['phrases'], `${path}.phrases`);
  const hasPhrases = declared.length > 0;
  // Declared phrases make signals optional (§1.2); without them signals stay
  // the required match input, refused exactly as before.
  const signals = hasPhrases
    ? reader.optionalStrings(row['signals'], `${path}.signals`)
    : reader.requireStrings(row['signals'], `${path}.signals`);
  // Only explicitly inactive deprecated compatibility entries may have no
  // signals. Active rows still refuse accidental silent disappearance.
  if (signals.length === 0 && !hasPhrases && !(row['enabled'] === false && row['deprecated'] === true)) reader.malformed(`${path}.signals must not be empty`);
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
    active: row['enabled'] === undefined || row['enabled'] === null || reader.requireBoolean(row['enabled'], `${path}.enabled`),
    phrases: hasPhrases ? declared : signals.map((text) => ({ text, weight: 1 })),
    phrases_declared: hasPhrases,
    verb_object: verbObject(row['verb_object'], `${path}.verb_object`),
    negative: phraseList(row['negative'], `${path}.negative`),
    exemplars: nonBlankStrings(row['exemplars'], `${path}.exemplars`, false),
    threshold: judgeCut(row['threshold'], `${path}.threshold`),
    router_row: routerRow(row['router_row'], `${path}.router_row`),
  };
}

// Absent or null reads as []; an empty array is allowed and, for `phrases`,
// leaves `signals` as the match input.
function phraseList(value: unknown, path: string): Phrase[] {
  if (value === undefined || value === null) return [];
  return reader.requireRows(value, path).map((item, i) => ({
    text: nonBlank(item['text'], `${path}[${i}].text`),
    weight: positiveWeight(item['weight'], `${path}[${i}].weight`),
  }));
}

function verbObject(value: unknown, path: string): VerbObject | null {
  if (value === undefined || value === null) return null;
  const row = reader.requireRecord(value, path);
  return {
    verbs: nonBlankStrings(row['verbs'], `${path}.verbs`, true),
    objects: nonBlankStrings(row['objects'], `${path}.objects`, true),
    weight: positiveWeight(row['weight'], `${path}.weight`),
  };
}

function routerRow(value: unknown, path: string): RouterRow | null {
  if (value === undefined || value === null) return null;
  const row = reader.requireRecord(value, path);
  return { intent: nonBlank(row['intent'], `${path}.intent`), load: nonBlank(row['load'], `${path}.load`) };
}

// A blank phrase or exemplar would match at every boundary or add an empty
// document, so whitespace-only text is refused along with the empty string.
function nonBlank(value: unknown, path: string): string {
  const text = reader.requireString(value, path);
  if (text.trim() === '') reader.malformed(`${path} must not be empty`);
  return text;
}

function nonBlankStrings(value: unknown, path: string, required: boolean): string[] {
  if (!required && (value === undefined || value === null)) return [];
  const items = reader.requireStrings(value, path).map((text, i) => nonBlank(text, `${path}[${i}]`));
  if (required && items.length === 0) reader.malformed(`${path} must not be empty`);
  return items;
}

// A zero or negative weight would invert or erase a feature silently; a
// negative phrase subtracts its (positive) weight instead.
function positiveWeight(value: unknown, path: string): number {
  const weight = reader.requireNumber(value, path);
  if (weight <= 0) reader.malformed(`${path} must be greater than 0`);
  return weight;
}

// The Jev noul cut for `intent.<id>`. Zero is refused with the rest of
// [0,1]'s outside: an intent the judge never scored reads as probability 0, so a
// zero cut would qualify it on every prompt (T06; contracts rev3 queue).
function judgeCut(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  const number = reader.requireNumber(value, path);
  if (number <= 0 || number > 1) reader.malformed(`${path} must be greater than 0 and at most 1`);
  return number;
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
