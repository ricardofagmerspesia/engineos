// Deterministic tier of scripts/run-evals.sh — the half that always runs and
// gates CI. It grades the eval set against evals/RUBRIC.md: valid JSONL, rules
// and agents that exist, no contradictory expectations, must_load sets closed
// under the deferral graph, no assertions on always-on rules, expect_risk values
// that respect the registry floors, and a coverage floor under which the set is
// decorative.
//
// Case schema v2 (docs/specs/2026-10-10-routing-replacement-contracts.md §8)
// adds optional expect_primary, expect_not_intents, exemplar, source and judge.
// Their shape is graded by one extra assertion that prints ONLY when some case
// carries a v2 field, so a v1 set keeps its exact output and pass count.
//
// Every printed line is byte-identical to the bash it replaces. The ok/FAIL lines
// and the exit code are public surface (docs/COMPATIBILITY.md) and CI's "Evals
// (deterministic tier)" step reads them.
//
// The jq and JSONL helpers are exported because ./live reads the same file with
// the same jq semantics; one home for what `jq -r '.id'` meant here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Io } from '../io';
import { isRecord, readJsonFile } from '../lib/json';
import { alwaysOnRules, deferralsOf } from '../lib/deferrals';

export const INTENTS = 'evals/intent-routing-cases.jsonl';
export const AGENTS = 'evals/agent-cases.jsonl';

// evals/RUBRIC.md targets 30-60 cases. Below this the set stops describing the
// router and starts decorating it.
const COVERAGE_FLOOR = 25;

const RISK_RANKS: Record<string, number> = { low: 1, medium: 2, high: 3 };

// The Choice catch-all of the judge question set: a prompt that is a project
// change but fits no active intent (contracts §8, plan §4a).
const OTHER_INTENT = 'other';
const V2_FIELDS = ['expect_primary', 'expect_not_intents', 'exemplar', 'source', 'judge'] as const;
const SOURCES: readonly string[] = ['user', 'notification'];
const JUDGE_LISTS = ['intent_above', 'intent_below', 'fact_above', 'fact_below'] as const;

interface IntentIds { active: ReadonlySet<string>; known: ReadonlySet<string> }

export interface TierCounts { pass: number; fail: number }
export interface DeterministicResult extends TierCounts { intentCount: number }

export interface Grader {
  ok(message: string): void;
  bad(message: string): void;
  counts(): TierCounts;
}

// One counter plus the two printers, so both tiers report through the same
// three-space-aligned lines and the summary can add their counts up.
export function grader(io: Io): Grader {
  let pass = 0;
  let fail = 0;
  return {
    ok(message: string): void {
      pass += 1;
      io.out(`ok   ${message}\n`);
    },
    bad(message: string): void {
      fail += 1;
      io.out(`FAIL ${message}\n`);
    },
    counts(): TierCounts {
      return { pass, fail };
    },
  };
}

export function runDeterministicTier(root: string, io: Io): DeterministicResult {
  const g = grader(io);
  io.out('== deterministic tier ==\n');

  for (const file of [INTENTS, AGENTS]) gradeJsonl(root, file, g);

  const alwaysOn = alwaysOnRules(readTextOrEmpty(join(root, 'CLAUDE.md')));
  gradeIntentCases(root, alwaysOn, g);
  gradeAgentCases(root, g);

  const intentCount = nonEmptyLines(root, INTENTS).length;
  if (intentCount >= COVERAGE_FLOOR) {
    g.ok(`intent set size ${intentCount} (RUBRIC target 30-60; floor ${COVERAGE_FLOOR})`);
  } else {
    g.bad(`intent set has only ${intentCount} cases — below the floor of ${COVERAGE_FLOOR}, the set is decorative`);
  }
  return { ...g.counts(), intentCount };
}

// ------------------------------------------------------------------- grading

function gradeJsonl(root: string, file: string, g: Grader): void {
  if (!existsSync(join(root, file))) {
    g.bad(`${file} missing`);
    return;
  }
  const lines = nonEmptyLines(root, file);
  const malformed: string[] = [];
  lines.forEach((line, index) => {
    if (parseCase(line) === undefined) malformed.push(`line${index + 1}`);
  });
  if (malformed.length === 0) g.ok(`${file} is valid JSONL (${lines.length} cases)`);
  else g.bad(`${file} has malformed lines: ${malformed.join(' ')}`);
}

function gradeIntentCases(root: string, alwaysOn: readonly string[], g: Grader): void {
  const badRisk: string[] = [];
  const badFields: string[] = [];
  const badRule: string[] = [];
  const badBoth: string[] = [];
  const badAlwaysOn: string[] = [];
  const badClosed: string[] = [];
  const badV2: string[] = [];
  let carriesV2 = false;
  const floors = riskFloors(root);
  const intentIds = registryIntentIds(root);

  for (const line of nonEmptyLines(root, INTENTS)) {
    const parsed = parseCase(line);
    const id = jqStringOr(parsed, 'id', '');
    if (V2_FIELDS.some((key) => present(parsed, key))) {
      carriesV2 = true;
      badV2.push(...v2Problems(parsed, id, intentIds));
    }
    const input = jqStringOr(parsed, 'input', '');
    const notes = jqStringOr(parsed, 'notes', '');
    if (id === '' || input === '' || notes === '') badFields.push(id === '' ? '<no-id>' : id);

    const mustLoad = jqWords(parsed, 'must_load');
    const mustNotLoad = jqWords(parsed, 'must_not_load');

    for (const rule of [...mustLoad, ...mustNotLoad]) {
      if (!existsSync(join(root, 'rules', `${rule}.md`))) badRule.push(`${id}->${rule}`);
    }
    for (const rule of mustLoad) {
      if (alwaysOn.includes(rule)) badAlwaysOn.push(`${id}->must_load:${rule}`);
      if (mustNotLoad.includes(rule)) badBoth.push(`${id}->${rule}`);
      for (const deferral of deferralsOf(root, rule, alwaysOn)) {
        if (!mustLoad.includes(deferral)) badClosed.push(`${id}(${rule}-defers-to-${deferral})`);
      }
    }
    for (const rule of mustNotLoad) {
      if (alwaysOn.includes(rule)) badAlwaysOn.push(`${id}->must_not_load:${rule}`);
    }

    // expect_risk is optional, but when present it must name a real tier and must
    // not contradict the floor registries/routing.json sets for an expected
    // domain. One of the two would be wrong, and the argument belongs at
    // authoring time rather than in production.
    const expectRisk = jqStringOr(parsed, 'expect_risk', '');
    if (expectRisk === '') continue;
    if (rankOf(expectRisk) === 0) badRisk.push(`${id}(tier='${expectRisk}')`);
    for (const domain of jqWords(parsed, 'expect_intents')) {
      const floor = floors.get(domain) ?? '';
      if (floor === '') continue;
      if (rankOf(expectRisk) < rankOf(floor)) {
        badRisk.push(`${id}(expects '${expectRisk}' but domain '${domain}' floors at '${floor}')`);
      }
    }
  }

  report(g, badRisk, 'expect_risk values are valid and respect registry risk floors', 'risk expectation problems');
  report(g, badFields, 'every intent case has id, input and notes', 'cases missing required fields');
  report(g, badRule, 'every asserted rule exists in rules/', 'cases naming nonexistent rules');
  report(g, badBoth, 'no rule is both required and forbidden in the same case', 'contradictory expectations');
  report(g, badAlwaysOn, 'no case asserts on an always-on rule (they are implicit)', 'always-on rules asserted');
  report(g, badClosed, 'every must_load set is closed under rule deferrals', 'unclosed must_load sets');
  if (carriesV2) report(g, badV2, 'v2 case fields are well-formed and name active intents', 'v2 field problems');
}

// ------------------------------------------------------------ case schema v2

// Shape and reference checks for the contracts §8 fields. expect_intents itself
// stays unchecked against the registry: v1 cases name router-table rows by
// labels (sweep, critic, api-qa) that are not intent ids, and rewriting them is
// the golden-set author's call, not the grader's.
function v2Problems(parsed: unknown, id: string, ids: IntentIds): string[] {
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

// Read RAW, like riskFloors: the grader judges the registry as written, and an
// unreadable registry leaves every intent reference unresolved (and failing)
// instead of aborting the tier. Active means not `enabled: false`, the flag that
// takes the deprecated backend-python row out of the judge's Choice.
function registryIntentIds(root: string): IntentIds {
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

function gradeAgentCases(root: string, g: Grader): void {
  const badAgent: string[] = [];
  const badLists: string[] = [];
  for (const line of nonEmptyLines(root, AGENTS)) {
    const parsed = parseCase(line);
    const id = jqStringOr(parsed, 'id', '');
    const agent = jqStringOr(parsed, 'agent', '');
    if (agent !== 'any' && !existsSync(join(root, 'agents', `${agent}.md`))) badAgent.push(`${id}->${agent}`);
    if (jqLength(parsed, 'must') === 0 || jqLength(parsed, 'must_not') === 0) badLists.push(id);
  }
  report(g, badAgent, 'every agent case names an existing agent', 'cases naming nonexistent agents');
  report(g, badLists, 'every agent case has both must and must_not items', 'cases with an empty must/must_not list');
}

// The bash accumulated problems into a space-prefixed string and interpolated it
// straight after the colon, which is why the FAIL line reads "<prefix>: a b".
function report(g: Grader, problems: readonly string[], okMessage: string, failPrefix: string): void {
  if (problems.length === 0) g.ok(okMessage);
  else g.bad(`${failPrefix}: ${problems.join(' ')}`);
}

function rankOf(tier: string): number {
  return RISK_RANKS[tier] ?? 0;
}

// registries/routing.json is read RAW rather than through loadRouting, which drops
// risk_floor because the kernel derives it elsewhere. The bash compared against
// whatever the registry literally carries, and a domain without the key skips the
// comparison — as every domain does today.
function riskFloors(root: string): Map<string, string> {
  const floors = new Map<string, string>();
  let raw: unknown;
  try {
    raw = readJsonFile(join(root, 'registries', 'routing.json'));
  } catch {
    return floors;
  }
  const record = isRecord(raw) ? raw : {};
  const domains = Array.isArray(record['domains']) ? record['domains'] : [];
  for (const domain of domains.filter(isRecord)) {
    const id = domain['id'];
    // First entry wins. jq printed every match and the bash then compared a
    // multi-line string, which no registry with unique domain ids ever produced.
    if (typeof id !== 'string' || floors.has(id)) continue;
    floors.set(id, jqStringOr(domain, 'risk_floor', ''));
  }
  return floors;
}

// ------------------------------------------------------ JSONL and jq semantics

// A file's non-empty lines. A missing file yields none, which is what the bash
// `while read < "$file"` loop did when its redirect failed.
export function nonEmptyLines(root: string, file: string): string[] {
  return readTextOrEmpty(join(root, file))
    .split('\n')
    .filter((line) => line !== '');
}

export function parseCase(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

// `jq -r '.<key> // ""'`: a missing key, null and false all yield the fallback.
export function jqStringOr(value: unknown, key: string, fallback: string): string {
  const field = fieldOf(value, key);
  if (field === undefined || field === null || field === false) return fallback;
  return jqText(field);
}

// `jq -r '.<key>'` with no fallback, which prints the four letters of null for a
// missing key. Only the live tier relies on that.
export function jqString(value: unknown, key: string): string {
  return jqText(fieldOf(value, key));
}

// `jq -r '.<key>[]?'` (one line per element, nothing when the field is not an
// array), then the shell's word splitting of the result.
export function jqWords(value: unknown, key: string): string[] {
  const field = fieldOf(value, key);
  if (!Array.isArray(field)) return [];
  const elements: unknown[] = field;
  return elements.flatMap((element) => jqText(element).split(/\s+/).filter((word) => word !== ''));
}

// `jq -r '.<key> | length'`. A boolean is jq's one error case; the bash then
// compared an empty string with -gt and got a false, which 0 reproduces.
export function jqLength(value: unknown, key: string): number {
  const field = fieldOf(value, key);
  if (field === undefined || field === null) return 0;
  if (Array.isArray(field)) return field.length;
  if (typeof field === 'string') return field.length;
  if (typeof field === 'number') return Math.abs(field);
  if (isRecord(field)) return Object.keys(field).length;
  return 0;
}

function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function jqText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? 'null';
}

function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}
