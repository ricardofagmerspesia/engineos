// Case schema v2 (docs/specs/2026-10-10-routing-replacement-contracts.md §8):
// the optional expect_primary, expect_not_intents, exemplar, source and judge
// fields of an intent case, and the shape and reference checks ./deterministic
// prints as one extra assertion when some case carries a v2 field.
//
// A leaf module on purpose: ./deterministic imports it, so it imports nothing
// back. The two field helpers at the bottom are therefore local copies of
// ./deterministic's, rendering values byte-identically.
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';

// The Choice catch-all of the judge question set: a prompt that is a project
// change but fits no active intent (contracts §8, plan §4a).
const OTHER_INTENT = 'other';
const V2_FIELDS = ['expect_primary', 'expect_not_intents', 'exemplar', 'source', 'judge'] as const;
const SOURCES: readonly string[] = ['user', 'notification'];
const JUDGE_LISTS = ['intent_above', 'intent_below', 'fact_above', 'fact_below'] as const;

export interface IntentIds { active: ReadonlySet<string>; known: ReadonlySet<string> }

export function carriesV2Field(parsed: unknown): boolean {
  return V2_FIELDS.some((key) => present(parsed, key));
}

// Shape and reference checks for the contracts §8 fields. expect_intents itself
// stays unchecked against the registry: v1 cases name router-table rows by
// labels (sweep, critic, api-qa) that are not intent ids, and rewriting them is
// the golden-set author's call, not the grader's.
export function v2Problems(parsed: unknown, id: string, ids: IntentIds): string[] {
  const problems: string[] = [];
  const expectIntents = fieldOf(parsed, 'expect_intents');
  const primary = fieldOf(parsed, 'expect_primary');
  const notIntents = fieldOf(parsed, 'expect_not_intents');
  const exemplar = fieldOf(parsed, 'exemplar');
  const source = fieldOf(parsed, 'source');
  const judge = fieldOf(parsed, 'judge');
  const notification = source === 'notification';

  if (present(parsed, 'expect_primary')) {
    if (!namesPrimary(primary, ids)) problems.push(`${id}(expect_primary='${jqText(primary)}' is not an active intent or '${OTHER_INTENT}')`);
    if (notification) problems.push(`${id}(notification case expects no route but sets expect_primary)`);
  }

  if (present(parsed, 'expect_not_intents')) {
    const listed = strictStrings(notIntents);
    if (listed === undefined) problems.push(`${id}(expect_not_intents must be an array of strings)`);
    for (const intent of listed ?? []) {
      if (!ids.known.has(intent)) problems.push(`${id}(expect_not_intents names unknown intent '${intent}')`);
      if (intent === primary) problems.push(`${id}(expect_primary '${intent}' is also in expect_not_intents)`);
      if (Array.isArray(expectIntents) && expectIntents.includes(intent)) problems.push(`${id}('${intent}' is both expected and forbidden)`);
    }
  }

  if (present(parsed, 'exemplar')) {
    const seeded = strictStrings(expectIntents);
    if (exemplar !== true) problems.push(`${id}(exemplar must be true when present)`);
    else if (seeded === undefined || seeded.length !== 1) problems.push(`${id}(exemplar case needs exactly one expect_intents entry)`);
    else {
      const [intent = ''] = seeded;
      if (!ids.active.has(intent)) problems.push(`${id}(exemplar seeds '${intent}', which is not an active intent)`);
      if (typeof primary === 'string' && primary !== intent) problems.push(`${id}(exemplar seeds '${intent}' but expect_primary is '${primary}')`);
    }
    if (notification) problems.push(`${id}(a notification case cannot seed exemplars)`);
  }

  if (present(parsed, 'source')) {
    if (typeof source !== 'string' || !SOURCES.includes(source)) problems.push(`${id}(source='${jqText(source)}' is not user or notification)`);
    if (notification && Array.isArray(expectIntents) && expectIntents.length > 0) problems.push(`${id}(notification case expects no route but lists expect_intents)`);
  }

  if (present(parsed, 'judge')) {
    problems.push(...judgeProblems(judge, id, ids));
    if (notification) problems.push(`${id}(notification case sends no judge request but sets judge)`);
  }
  return problems;
}

// Read RAW, like riskFloors: the grader judges the registry as written, and an
// unreadable registry leaves every intent reference unresolved (and failing)
// instead of aborting the tier. Active means not `enabled: false`, the flag that
// takes the deprecated backend-python row out of the judge's Choice.
export function registryIntentIds(root: string): IntentIds {
  const active = new Set<string>();
  const known = new Set<string>();
  let raw: unknown;
  try {
    raw = readJsonFile(join(root, 'registries', 'intents.json'));
  } catch {
    return { active, known };
  }
  const rows = isRecord(raw) && Array.isArray(raw['intents']) ? raw['intents'] : [];
  for (const row of rows.filter(isRecord)) {
    const id = row['id'];
    if (typeof id !== 'string' || id === '') continue;
    known.add(id);
    if (row['enabled'] !== false) active.add(id);
  }
  return { active, known };
}

// ------------------------------------------------------------------ internals

// judge is graded by the shadow tier (T13); here only its shape is checked, plus
// the one contradiction a shape can carry: the same key both above and below.
function judgeProblems(judge: unknown, id: string, ids: IntentIds): string[] {
  if (!isRecord(judge)) return [`${id}(judge must be an object)`];
  const problems: string[] = [];
  if (present(judge, 'primary') && !namesPrimary(judge['primary'], ids)) {
    problems.push(`${id}(judge.primary='${jqText(judge['primary'])}' is not an active intent or '${OTHER_INTENT}')`);
  }
  const lists = new Map<string, readonly string[]>();
  for (const key of JUDGE_LISTS) {
    if (!present(judge, key)) continue;
    const listed = strictStrings(judge[key]);
    if (listed === undefined || listed.some((entry) => entry === '')) problems.push(`${id}(judge.${key} must be an array of non-empty strings)`);
    else lists.set(key, listed);
  }
  for (const [above, below] of [['intent_above', 'intent_below'], ['fact_above', 'fact_below']] as const) {
    const lower = lists.get(below) ?? [];
    for (const entry of lists.get(above) ?? []) {
      if (lower.includes(entry)) problems.push(`${id}(judge lists '${entry}' in both ${above} and ${below})`);
    }
  }
  if (present(judge, 'design_work_above')) {
    const cut = judge['design_work_above'];
    if (typeof cut !== 'number' || !Number.isFinite(cut) || cut < 0 || cut > 1) {
      problems.push(`${id}(judge.design_work_above must be a number in [0, 1])`);
    }
  }
  return problems;
}

function namesPrimary(value: unknown, ids: IntentIds): boolean {
  return typeof value === 'string' && (value === OTHER_INTENT || ids.active.has(value));
}

// null reads as absent, matching the `// ""` fallback every v1 field uses.
function present(value: unknown, key: string): boolean {
  const field = fieldOf(value, key);
  return field !== undefined && field !== null;
}

// The array itself when every element is a string; undefined otherwise. No word
// splitting: v2 fields have no bash ancestor whose jq semantics need preserving.
function strictStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const elements: unknown[] = value;
  const strings = elements.filter((element): element is string => typeof element === 'string');
  return strings.length === elements.length ? strings : undefined;
}

// Same as ./deterministic's fieldOf and jqText; see the header for why copied.
function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function jqText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? 'null';
}
