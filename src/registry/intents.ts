import { loadRegistry } from './load';
import { FRAMEWORK_LANGUAGE, isFramework, isLanguage, type Framework, type Language } from './project-config';
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
  // The routing floor's stack binding (docs/specs/2026-10-06-routing-decision-
  // layer-contracts.md §1). A row carrying a stack is rebound to its sibling
  // when the repository's resolved stack lacks it, so the two travel together:
  // a stack with nowhere to rebind to, or a sibling with no stack to compare,
  // is a registry defect rather than a row the kernel quietly skips. Absent
  // means stack-neutral.
  stack: Language | null;
  stack_sibling: string | null;
  // The frameworks that make a repository package count as this row's stack.
  // Empty means any package of the row's language counts. The rebind checks
  // frameworks first and falls back to the language only when neither sibling's
  // framework is present, so a React frontend never makes a repository
  // eligible for the NestJS row (routing-decision-layer contracts §2, amended).
  stack_frameworks: NonNullable<Framework>[];
  // The signals of this row that do not say which stack or concern the prompt
  // is about ("endpoint", "add"). A subset of `signals`; empty when absent.
  generic_signals: string[];
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
  const intents = rows.map((row, i) => parseRow(row, `.intents[${i}]`));
  checkSiblings(intents);
  return {
    version: reader.requireString(document['version'], '.version'),
    intents,
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
  const stackBinding = stackOf(row, path);
  const stackFrameworks = frameworksOf(row, stackBinding.stack, path);
  const genericSignals = reader.optionalStrings(row['generic_signals'], `${path}.generic_signals`);
  // A generic signal that is not a signal can never be hit, so a row naming
  // one claims a disambiguation it never performs.
  for (const signal of genericSignals) {
    if (!signals.includes(signal)) reader.malformed(`${path}.generic_signals entry ${JSON.stringify(signal)} is not one of its signals`);
  }
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
    stack: stackBinding.stack,
    stack_sibling: stackBinding.sibling,
    stack_frameworks: stackFrameworks,
    generic_signals: genericSignals,
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

interface StackBinding {
  stack: Language | null;
  sibling: string | null;
}

function stackOf(row: Record<string, unknown>, path: string): StackBinding {
  const rawStack = row['stack'];
  const sibling = reader.optionalString(row['stack_sibling'], `${path}.stack_sibling`);
  if (rawStack === undefined || rawStack === null) {
    if (sibling !== null) reader.malformed(`${path}.stack_sibling requires ${path}.stack`);
    return { stack: null, sibling: null };
  }
  if (!isLanguage(rawStack)) return reader.malformed(`${path}.stack must be node or python`);
  if (sibling === null || sibling === '') return reader.malformed(`${path}.stack requires ${path}.stack_sibling`);
  return { stack: rawStack, sibling };
}

// Each named framework must exist and belong to the row's own stack: a python
// row listing nestjs would make every NestJS repository eligible for FastAPI
// shapes, which is the leak this field exists to close.
function frameworksOf(row: Record<string, unknown>, stack: Language | null, path: string): NonNullable<Framework>[] {
  const raw = reader.optionalStrings(row['stack_frameworks'], `${path}.stack_frameworks`);
  if (raw.length === 0) return [];
  if (stack === null) return reader.malformed(`${path}.stack_frameworks requires ${path}.stack`);
  const frameworks: NonNullable<Framework>[] = [];
  for (const name of raw) {
    if (!isFramework(name)) return reader.malformed(`${path}.stack_frameworks entry ${JSON.stringify(name)} is not a known framework`);
    if (FRAMEWORK_LANGUAGE[name] !== stack) {
      return reader.malformed(`${path}.stack_frameworks entry ${JSON.stringify(name)} is a ${FRAMEWORK_LANGUAGE[name]} framework, not ${stack}`);
    }
    if (!frameworks.includes(name)) frameworks.push(name);
  }
  return frameworks;
}

// The pair is symmetric by construction: a rebind from A lands on B only when
// B's stack is the one present, and a one-way pair would rebind a prompt in one
// repository and leave the mirror-image prompt stranded in the other.
function checkSiblings(intents: readonly IntentRow[]): void {
  intents.forEach((intent, i) => siblingDefect(intent, intents, `.intents[${i}].stack_sibling`));
}

// Returns rather than branching on `reader.malformed`: the reader is an inferred
// const, so tsc does not narrow through its never-returning method.
function siblingDefect(intent: IntentRow, intents: readonly IntentRow[], path: string): void {
  if (intent.stack === null || intent.stack_sibling === null) return;
  const sibling = intents.find((other) => other.id === intent.stack_sibling);
  if (sibling === undefined) return reader.malformed(`${path} names ${intent.stack_sibling}, which is not an intent`);
  if (sibling.stack === null || sibling.stack === intent.stack) {
    return reader.malformed(`${path} names ${sibling.id}, which does not carry the other stack`);
  }
  if (sibling.stack_sibling !== intent.id) {
    return reader.malformed(`${path} names ${sibling.id}, which does not name ${intent.id} back`);
  }
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
