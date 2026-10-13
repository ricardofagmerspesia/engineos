import { loadRegistry } from './load';
import { strictReader } from './strict';

// The routing decision layer's half of registries/policy.json
// (docs/specs/2026-10-06-routing-decision-layer-contracts.md section 1).
// Deliberately a sibling of policy.ts rather than a section of it, the way
// policy-telemetry.ts is: the kernel's risk, gate and escalation answers never
// read this block, so binding it into loadPolicy would make a malformed
// decision-layer block refuse every one of them, and would make every pinned
// policy fixture that predates the block unreadable. The decision layer and
// `init --router` read it; nothing else does.
//
// Strict like policy.ts: every field is required, and a malformed one is a
// KernelError naming the JSON path rather than a fabricated answer.

// The decision-layer vocabulary (contracts section 2) is defined beside the
// loader that validates it, the way RiskTier lives beside intents.ts: a mode is
// what actually decides, a setting is what a developer or a repo may ask for,
// and `auto` is the one setting that is not a mode.
export type RouterMode = 'keyword' | 'llm' | 'jev';
export type RouterSetting = RouterMode | 'auto';

export const ROUTER_MODES: readonly RouterMode[] = ['keyword', 'llm', 'jev'];
export const ROUTER_SETTINGS: readonly RouterSetting[] = [...ROUTER_MODES, 'auto'];

export function isRouterMode(value: unknown): value is RouterMode {
  return ROUTER_MODES.some((mode) => mode === value);
}

export function isRouterSetting(value: unknown): value is RouterSetting {
  return ROUTER_SETTINGS.some((setting) => setting === value);
}

export interface RouterModeScores {
  intent_accuracy: number;
  stack_correctness: number;
  p95_ms: number;
  fallback_rate: number;
}

// Who set `default`, and on what evidence: the golden-set run that wrote it,
// or the developer's recorded decision. A default with no provenance is an
// anonymous edit, which the loader refuses.
export interface GoldenSetProvenance {
  date: string;
  golden_set: string;
  scores: Partial<Record<RouterMode, RouterModeScores>>;
}

export interface DeveloperProvenance {
  date: string;
  decided_by: string;
  reason: string;
}

export type RouterDecisionProvenance = GoldenSetProvenance | DeveloperProvenance;

export function isGoldenSetProvenance(p: RouterDecisionProvenance): p is GoldenSetProvenance {
  return 'golden_set' in p;
}

export interface JevPolicy {
  endpoint: string;
  model: string;
  budget_ms: number;
  key_env: string;
}

export interface RouterDecisionPolicy {
  modes: RouterMode[];
  restrictiveness: RouterSetting[];
  default: RouterMode | null;
  default_written_by: RouterDecisionProvenance | null;
  min_confidence: number;
  tie_margin: number;
  jev: JevPolicy;
  state_fields: string[];
}

const { malformed, requireRecord, requireString, requireNumber, requireStrings } = strictReader('policy.json');

export function loadRouterDecisionPolicy(root: string): RouterDecisionPolicy {
  const document = requireRecord(loadRegistry(root, 'policy.json'), '');
  return routerDecisionPolicy(requireRecord(document['router_decision'], '.router_decision'));
}

// Every field of the block is a gate input for the decision layer (which mode
// may run, when it is trusted, when it falls back), so each is checked for
// shape AND for membership: a mode outside the vocabulary, an order that drops
// a mode, or a default nobody measured would each let the layer answer from a
// file that says something else.
function routerDecisionPolicy(block: Record<string, unknown>): RouterDecisionPolicy {
  const at = '.router_decision';
  const modes = requireStrings(block['modes'], `${at}.modes`).map((mode, i) => {
    if (!isRouterMode(mode)) refuse(`${at}.modes[${i}] must be one of ${ROUTER_MODES.join('|')}`);
    return mode;
  });
  if (modes.length === 0) refuse(`${at}.modes must not be empty`);
  if (new Set(modes).size !== modes.length) refuse(`${at}.modes must not repeat a mode`);

  const restrictiveness = requireStrings(block['restrictiveness'], `${at}.restrictiveness`).map((setting, i) => {
    if (!isRouterSetting(setting)) refuse(`${at}.restrictiveness[${i}] must be one of ${ROUTER_SETTINGS.join('|')}`);
    return setting;
  });
  const expectedOrder: RouterSetting[] = [...modes, 'auto'];
  const isPermutation =
    restrictiveness.length === expectedOrder.length &&
    new Set(restrictiveness).size === restrictiveness.length &&
    expectedOrder.every((setting) => restrictiveness.includes(setting));
  if (!isPermutation) refuse(`${at}.restrictiveness must order every mode plus auto exactly once`);

  // Both keys are required even while null: an absent `default` and a
  // deliberate shadow are different statements, and only the second is one the
  // golden-set run can overwrite.
  const rawDefault = block['default'];
  let defaultMode: RouterMode | null = null;
  if (rawDefault !== null) {
    if (!isRouterMode(rawDefault) || !modes.includes(rawDefault)) {
      refuse(`${at}.default must be null or one of ${modes.join('|')}`);
    }
    defaultMode = rawDefault;
  }

  const rawProvenance = block['default_written_by'];
  if (rawProvenance === undefined) refuse(`${at}.default_written_by must be null or an object`);
  const provenance = rawProvenance === null
    ? null
    : routerDecisionProvenance(requireRecord(rawProvenance, `${at}.default_written_by`), modes, `${at}.default_written_by`);
  if (defaultMode !== null && provenance === null) {
    refuse(`${at}.default needs provenance: default_written_by must record the golden-set run (golden_set, scores) or the developer decision (decided_by, reason)`);
  }
  if (defaultMode === null && provenance !== null) {
    refuse(`${at}.default_written_by records a decision that set no default`);
  }
  if (defaultMode !== null && provenance !== null && isGoldenSetProvenance(provenance) && provenance.scores[defaultMode] === undefined) {
    refuse(`${at}.default_written_by.scores must score the default mode "${defaultMode}"`);
  }

  const jev = requireRecord(block['jev'], `${at}.jev`);
  const budget = requireNumber(jev['budget_ms'], `${at}.jev.budget_ms`);
  if (!Number.isInteger(budget) || budget <= 0) refuse(`${at}.jev.budget_ms must be a positive integer`);

  const stateFields = requireStrings(block['state_fields'], `${at}.state_fields`);
  if (stateFields.length === 0) refuse(`${at}.state_fields must not be empty`);
  stateFields.forEach((field, i) => {
    if (field === '') refuse(`${at}.state_fields[${i}] must not be empty`);
  });
  if (new Set(stateFields).size !== stateFields.length) refuse(`${at}.state_fields must not repeat a field`);

  return {
    modes,
    restrictiveness,
    default: defaultMode,
    default_written_by: provenance,
    min_confidence: requireUnitInterval(block['min_confidence'], `${at}.min_confidence`),
    tie_margin: requireUnitInterval(block['tie_margin'], `${at}.tie_margin`),
    jev: {
      endpoint: requireNonEmpty(jev['endpoint'], `${at}.jev.endpoint`),
      model: requireNonEmpty(jev['model'], `${at}.jev.model`),
      budget_ms: budget,
      key_env: requireNonEmpty(jev['key_env'], `${at}.jev.key_env`),
    },
    state_fields: stateFields,
  };
}

function routerDecisionProvenance(
  row: Record<string, unknown>,
  modes: readonly RouterMode[],
  at: string,
): RouterDecisionProvenance {
  // A developer decision names who and why; a golden-set run names the set and
  // its scores. The two never mix: a row with both is refused as ambiguous.
  if ('decided_by' in row || 'reason' in row) {
    if ('golden_set' in row || 'scores' in row) refuse(`${at} mixes a developer decision with a golden-set run`);
    return {
      date: requireNonEmpty(row['date'], `${at}.date`),
      decided_by: requireNonEmpty(row['decided_by'], `${at}.decided_by`),
      reason: requireNonEmpty(row['reason'], `${at}.reason`),
    };
  }
  const scoresRow = requireRecord(row['scores'], `${at}.scores`);
  const scores: Partial<Record<RouterMode, RouterModeScores>> = {};
  for (const [mode, value] of Object.entries(scoresRow)) {
    if (!isRouterMode(mode) || !modes.includes(mode)) {
      refuse(`${at}.scores has a key "${mode}" that is not one of ${modes.join('|')}`);
    }
    const score = requireRecord(value, `${at}.scores.${mode}`);
    const p95 = requireNumber(score['p95_ms'], `${at}.scores.${mode}.p95_ms`);
    if (p95 < 0) refuse(`${at}.scores.${mode}.p95_ms must not be negative`);
    scores[mode] = {
      intent_accuracy: requireUnitInterval(score['intent_accuracy'], `${at}.scores.${mode}.intent_accuracy`),
      stack_correctness: requireUnitInterval(score['stack_correctness'], `${at}.scores.${mode}.stack_correctness`),
      p95_ms: p95,
      fallback_rate: requireUnitInterval(score['fallback_rate'], `${at}.scores.${mode}.fallback_rate`),
    };
  }
  return {
    date: requireNonEmpty(row['date'], `${at}.date`),
    golden_set: requireNonEmpty(row['golden_set'], `${at}.golden_set`),
    scores,
  };
}

function requireUnitInterval(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number < 0 || number > 1) refuse(`${path} must be between 0 and 1`);
  return number;
}

// A declared function, not the destructured `malformed`: a `never` call only
// narrows the caller's control flow when the callee is a declared function.
function refuse(what: string): never {
  return malformed(what);
}

function requireNonEmpty(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (text === '') refuse(`${path} must not be empty`);
  return text;
}
