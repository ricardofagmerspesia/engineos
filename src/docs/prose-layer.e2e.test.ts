// End-to-end port of hooks/test-docs.sh: a probe over the EngineOS PROSE layer —
// the CLAUDE.md router table, rules/, agents/, commands/ and skills/ — read
// straight off THIS checkout. Three families survive, keeping the bash suite's
// numbering:
//   1 referential integrity   3 closure   4 marker budgets
// (Family 2, hook <-> table parity, was retired: guidance lives only in
// registries/routing.json, which the validator's C6, C7, C8 and C14 checks read
// directly.)
//
// Accepted debt is declared in registries/docs-ledger.json, never hidden here.
// The bash suite sourced hooks/docs-ledger.sh for the same six lists; the JSON
// carries every one of them and is the declared source of truth, so this port
// reads it and hard-codes nothing.
//
// Nothing here spawns the CLI, and nothing here writes. The bash suite shelled
// out nowhere either — it named scripts/gen-agent-commands.sh only inside a
// failure message — so the commands/agents/ bijection is checked against the
// tree on disk exactly as bash checked it, and the checkout stays untouched.
//
// Every grep/awk is reproduced LINE BY LINE rather than over whole-file text,
// because grep never matches across a newline; POSIX [[:space:]] becomes
// [ \t\r\f\v] for the same reason. Each test collects the failures its bash
// counterpart would have printed and asserts the list is empty, so a red run
// still names every offending rule, agent, skill or marker.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile, stringArray } from '../lib/json';
import { resolveRoot } from '../registry/paths';

// The checkout this test was compiled into: build/docs/<file>.js sits two levels
// under the repo root. resolveRoot walks up to registries/routing.json for the
// same answer without hard-coding that depth, and is given an EMPTY env so an
// operator's ENGINEOS_ROOT cannot point the probe at a different tree.
const checkout = resolveRoot({}, __dirname);

// ------------------------------------------------------------------ ledger

interface ClosureException {
  from: string;
  to: string;
  reason: string;
}

interface MarkerBudget {
  phrase: string;
  maxFiles: number;
  owner: string;
}

interface DocsLedger {
  alwaysOn: string[];
  taskContractRules: string[];
  closureExceptions: ClosureException[];
  markerBudgets: MarkerBudget[];
  externalSkills: string[];
  aliasExempt: string[];
}

// Loaded as a unit, and a malformed record throws rather than narrowing a list:
// a partial read would silently drop a budget or an exemption, which turns this
// suite red for a reason that has nothing to do with the docs. Same refusal the
// bash library made when jq was missing.
function loadLedger(): DocsLedger {
  const path = join(checkout, 'registries', 'docs-ledger.json');
  const raw = readJsonFile(path);
  if (!isRecord(raw)) throw new Error(`${path} is not a JSON object`);

  const exceptions: ClosureException[] = [];
  for (const entry of asArray(raw['closure_exceptions'], path, 'closure_exceptions')) {
    if (!isRecord(entry)) throw new Error(`${path}: closure_exceptions holds a non-object entry`);
    exceptions.push({ from: requireString(entry['from'], path, 'closure_exceptions.from'), to: requireString(entry['to'], path, 'closure_exceptions.to'), reason: optionalString(entry['reason']) });
  }

  const budgets: MarkerBudget[] = [];
  for (const entry of asArray(raw['marker_budgets'], path, 'marker_budgets')) {
    if (!isRecord(entry)) throw new Error(`${path}: marker_budgets holds a non-object entry`);
    const maxFiles = entry['max_files'];
    if (typeof maxFiles !== 'number' || !Number.isFinite(maxFiles)) throw new Error(`${path}: marker_budgets.max_files is not a number`);
    budgets.push({ phrase: requireString(entry['phrase'], path, 'marker_budgets.phrase'), maxFiles, owner: requireString(entry['owner'], path, 'marker_budgets.owner') });
  }

  return {
    alwaysOn: stringArray(raw['always_on']),
    taskContractRules: stringArray(raw['task_contract_rules']),
    closureExceptions: exceptions,
    markerBudgets: budgets,
    externalSkills: stringArray(raw['external_skills']),
    aliasExempt: stringArray(raw['alias_exempt']),
  };
}

function asArray(value: unknown, path: string, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: ${field} is not an array`);
  return value;
}

function requireString(value: unknown, path: string, field: string): string {
  if (typeof value !== 'string') throw new Error(`${path}: ${field} is not a string`);
  return value;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const LEDGER = loadLedger();

// ------------------------------------------------------------- file access

const textCache = new Map<string, string>();

// An unreadable file reads as empty, which is how every `grep ... 2>/dev/null`
// in the bash suite behaved.
function fileText(relativePath: string): string {
  const cached = textCache.get(relativePath);
  if (cached !== undefined) return cached;
  let text: string;
  try {
    text = readFileSync(join(checkout, relativePath), 'utf8');
  } catch {
    text = '';
  }
  textCache.set(relativePath, text);
  return text;
}

function isDirectory(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

// A bash `<dir>/*<suffix>` glob: no dotfiles (a leading `.` is never matched by
// `*`), returned as repo-relative paths.
function globFiles(relativeDir: string, suffix: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(checkout, relativeDir));
  } catch {
    return [];
  }
  return names
    .filter((name) => !name.startsWith('.') && name.endsWith(suffix))
    .sort(byCodeUnit)
    .map((name) => `${relativeDir}/${name}`);
}

// A bash `<dir>/*/` glob: directory names only, symlinks to directories included
// (the trailing slash makes the shell stat the target).
function globDirNames(relativeDir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(checkout, relativeDir));
  } catch {
    return [];
  }
  return names.filter((name) => !name.startsWith('.') && isDirectory(join(checkout, relativeDir, name))).sort(byCodeUnit);
}

// `find <dir> -type f -name '*.md'`: recursive, dotfiles included, symlinks
// neither followed nor counted as files.
function findMarkdownFiles(relativeDir: string): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(checkout, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(child);
    }
  };
  walk(relativeDir);
  return found;
}

function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(byCodeUnit);
}

// ------------------------------------------------------------ grep helpers

// `grep -oE`, scoped to one line at a time so a pattern can never span a newline
// the way a whole-text regex would.
function matchesIn(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const line of text.split('\n')) {
    // match[0] is always present for a successful match; the guard is what
    // noUncheckedIndexedAccess asks for, not a real branch.
    for (const match of line.matchAll(pattern)) {
      const whole = match[0];
      if (whole !== undefined) found.push(whole);
    }
  }
  return found;
}

function matchesAcross(relativePaths: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const path of relativePaths) found.push(...matchesIn(fileText(path), pattern));
  return found;
}

// `grep -lF -- <phrase> <files>`. Every phrase this suite searches for is
// newline-free, so a whole-text substring test is exactly grep's per-line one.
function filesContaining(relativePaths: string[], phrase: string): string[] {
  return relativePaths.filter((path) => fileText(path).includes(phrase));
}

// --------------------------------------------------------------- inventories

const RULES = globFiles('rules', '.md').map((path) => stemOf(path));
const AGENT_FILES = globFiles('agents', '.md');
const SKILLS = globDirNames('skills');

const NAME_LINE = /^name:[ \t\r\f\v]*/;

// `grep -h '^name:' agents/*.md`: every line-anchored declaration in every agent
// file, not just the frontmatter one.
const AGENTS = AGENT_FILES.flatMap((path) =>
  fileText(path)
    .split('\n')
    .filter((line) => line.startsWith('name:'))
    .map((line) => line.replace(NAME_LINE, '')),
);

interface AliasPair {
  alias: string;
  agent: string;
}

const ALIAS_DECLARATION = /Alias[a-z]*:[^.]*/g;

// One "<alias> <agent>" pair per declared alias. `[^.]*` stops at the sentence's
// period, which is what bounds the alias list inside a description line.
const ALIAS_PAIRS: AliasPair[] = AGENT_FILES.flatMap((path) => {
  const text = fileText(path);
  const nameLine = text.split('\n').find((line) => line.startsWith('name:'));
  const agent = nameLine === undefined ? '' : nameLine.replace(NAME_LINE, '');
  return matchesIn(text, ALIAS_DECLARATION)
    .map((declaration) => declaration.replace(/^Alias[a-z]*:[ \t\r\f\v]*/, ''))
    .flatMap((list) => list.split(','))
    .map((alias) => alias.replace(/^[ \t\r\f\v]+/, '').replace(/[ \t\r\f\v]+$/, ''))
    .filter((alias) => alias !== '')
    .map((alias) => ({ alias, agent }));
});

// The prose corpus — what a reader or an agent actually consumes.
const CORPUS = ['CLAUDE.md', ...['rules', 'agents', 'commands', 'skills', 'templates'].flatMap((dir) => findMarkdownFiles(dir)).sort(byCodeUnit)];

// The reference scan adds the executable layer: a hook or generator naming an
// agent or skill makes it reachable just as a doc does. Resolved from disk on
// every run, so a deleted script leaves the set on its own.
const REFSCAN = [...CORPUS, ...globFiles('hooks', '.sh'), ...globFiles('scripts', '.sh'), ...globFiles('registries', '.json')];

function stemOf(relativePath: string): string {
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.endsWith('.md') ? base.slice(0, -'.md'.length) : base;
}

// ------------------------------------------- family 1: referential integrity

// Match .mdc too, then drop it: the Cursor mirror ships rules/*.mdc, and an
// unanchored .md pattern reads those as missing EngineOS rules.
const RULE_REFERENCE = /rules\/[a-z-]+\.mdc?/g;

test('family 1: every referenced rules/<name>.md is on disk', () => {
  const referenced = uniqueSorted(
    matchesAcross(CORPUS, RULE_REFERENCE)
      .filter((match) => !match.endsWith('.mdc'))
      .map((match) => match.slice('rules/'.length, -'.md'.length)),
  );
  const failures = referenced.filter((stem) => !RULES.includes(stem)).map((stem) => `rules/${stem}.md is referenced but not on disk`);
  assert.deepEqual(failures, []);
});

// Backticked references only: plain prose is ambiguous ("per-specialist" looks
// like an agent and is not one). Backticks are the convention; trusting only
// them is what enforces it.
const AGENT_REFERENCE = /`[a-z][a-z-]*-(?:coordinator|reviewer|writer|tester|analyst|builder|consolidator|specialist)`/g;

test('family 1: every referenced `<agent>` is declared by an agents/*.md', () => {
  const referenced = uniqueSorted(matchesAcross(CORPUS, AGENT_REFERENCE).map(stripBackticks));
  const failures = referenced.filter((agent) => !AGENTS.includes(agent)).map((agent) => `agent \`${agent}\` is referenced but no agents/*.md declares it`);
  assert.deepEqual(failures, []);
});

const SKILL_REFERENCE = /(?:skills?[ \t\r\f\v]+`[a-z-]+`|`[a-z-]+`[ \t\r\f\v]+skill)/g;
const BACKTICKED_WORD = /`[a-z-]+`/g;

test('family 1: every referenced skill has a skills/<name>/ directory', () => {
  const referenced = uniqueSorted(matchesAcross(CORPUS, SKILL_REFERENCE).flatMap((match) => matchesIn(match, BACKTICKED_WORD)).map(stripBackticks));
  const failures = referenced
    .filter((skill) => !LEDGER.externalSkills.includes(skill))
    .filter((skill) => !SKILLS.includes(skill))
    .map((skill) => `skill \`${skill}\` is referenced but skills/${skill}/ does not exist`);
  assert.deepEqual(failures, []);
});

// Orphans. commands/agents/** is generated from the roster, so counting it as a
// reference would make this check vacuous.
const GENERATED_AGENT_SURFACE = /^(?:agents\/|commands\/agents\/)/;

test('family 1: every agent is named somewhere outside its own generated surface', () => {
  const failures = AGENTS.filter((agent) => filesContaining(REFSCAN, agent).filter((path) => !GENERATED_AGENT_SURFACE.test(path)).length === 0).map(
    (agent) => `agent ${agent} exists but is named nowhere — unreachable`,
  );
  assert.deepEqual(failures, []);
});

test('family 1: every skill is named somewhere outside its own directory', () => {
  const failures = SKILLS.filter((skill) => filesContaining(REFSCAN, skill).filter((path) => !path.startsWith(`skills/${skill}/`)).length === 0).map(
    (skill) => `skill ${skill} exists but is named nowhere — unreachable`,
  );
  assert.deepEqual(failures, []);
});

test('family 1: no alias is claimed by two agents', () => {
  const seen = new Map<string, number>();
  for (const pair of ALIAS_PAIRS) seen.set(pair.alias, (seen.get(pair.alias) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([alias]) => alias).sort(byCodeUnit);
  const failures: string[] = duplicates.length === 0 ? [] : [`alias collision: ${duplicates.join(' ')}`];
  assert.deepEqual(failures, []);
});

test('family 1: every agent declares an alias or is in the ledger exemption', () => {
  const failures = AGENTS.filter((agent) => !LEDGER.aliasExempt.includes(agent))
    .filter((agent) => !ALIAS_PAIRS.some((pair) => pair.agent === agent))
    .map((agent) => `agent ${agent} declares no alias and is not in ENGINEOS_ALIAS_EXEMPT`);
  assert.deepEqual(failures, []);
});

// commands/agents/ is a bijection with agents + aliases.
const EXPECTED_COMMANDS = uniqueSorted([...AGENTS, ...ALIAS_PAIRS.map((pair) => pair.alias)].filter((name) => name !== ''));
const ACTUAL_COMMANDS = uniqueSorted(globFiles('commands/agents', '.md').map((path) => stemOf(path)));

test('family 1: commands/agents has an entry for every agent name and alias', () => {
  const failures = EXPECTED_COMMANDS.filter((name) => !ACTUAL_COMMANDS.includes(name)).map((name) => `no commands/agents/${name}.md — run scripts/gen-agent-commands.sh`);
  assert.deepEqual(failures, []);
});

test('family 1: every commands/agents entry maps to an agent name or alias', () => {
  const failures = ACTUAL_COMMANDS.filter((name) => !EXPECTED_COMMANDS.includes(name)).map((name) => `commands/agents/${name}.md maps to no agent name or alias`);
  assert.deepEqual(failures, []);
});

function stripBackticks(value: string): string {
  return value.split('`').join('');
}

// -------------------------------------------------- family 3: router closure

const RULE_LINK = /rules\/[a-z-]+\.md/g;

// The rules/<stem>.md files this rule points at, itself excluded.
function xrefs(stem: string): string[] {
  return uniqueSorted(matchesIn(fileText(`rules/${stem}.md`), RULE_LINK).map((match) => match.slice('rules/'.length, -'.md'.length))).filter((other) => other !== stem);
}

function isExcepted(from: string, to: string): boolean {
  return LEDGER.closureExceptions.some((entry) => entry.from === from && entry.to === to);
}

function isAlwaysOn(stem: string): boolean {
  return LEDGER.alwaysOn.includes(stem);
}

function isGloballyAvailable(stem: string): boolean {
  return isAlwaysOn(stem) || LEDGER.taskContractRules.includes(stem);
}

// Router rows: drop the intent cell and the trailing bar, keep the load cell
// (which may itself contain escaped pipes).
function routerRowLoadCells(): string[] {
  const cells: string[] = [];
  for (const line of fileText('CLAUDE.md').split('\n')) {
    if (!line.startsWith('| ')) continue;
    cells.push(line.replace(/^\|[^|]*\|/, '').replace(/\|[ \t\r\f\v]*$/, ''));
  }
  return cells;
}

// Always-on files are in context for every row, so an unexcepted outward pointer
// is a gap in every row at once. Checked first and separately for that reason.
test('family 3: no always-on rule points at a non-always-on rule without an exception', () => {
  const failures: string[] = [];
  for (const from of LEDGER.alwaysOn) {
    for (const to of xrefs(from)) {
      if (isAlwaysOn(to)) continue;
      if (isExcepted(from, to)) continue;
      failures.push(`closure: always-on rules/${from}.md points at non-always-on rules/${to}.md with no declared exception`);
    }
  }
  assert.deepEqual(failures, []);
});

test('family 3: every rule a router row loads has its own pointers loaded too', () => {
  const needed = new Set<string>();
  for (const loadCell of routerRowLoadCells()) {
    const loaded = uniqueSorted(matchesIn(loadCell, RULE_LINK).map((match) => match.slice('rules/'.length, -'.md'.length)));
    if (loaded.length === 0) continue;
    for (const from of loaded) {
      if (isGloballyAvailable(from)) continue;
      for (const to of xrefs(from)) {
        if (isGloballyAvailable(to)) continue;
        if (loaded.includes(to)) continue;
        needed.add(`${from}|${to}`);
      }
    }
  }
  const failures: string[] = [];
  for (const pair of [...needed].sort(byCodeUnit)) {
    const from = pair.slice(0, pair.indexOf('|'));
    const to = pair.slice(pair.indexOf('|') + 1);
    if (isExcepted(from, to)) continue;
    failures.push(`closure: a row loads rules/${from}.md, which points at rules/${to}.md — neither always-on, nor loaded in the same row, nor a declared exception`);
  }
  assert.deepEqual(failures, []);
});

// A stale exception is a lie about the corpus: fail it.
test('family 3: every declared closure exception carries a reason and is still real', () => {
  const failures: string[] = [];
  for (const entry of LEDGER.closureExceptions) {
    if (entry.from === '') continue;
    if (entry.reason === '') {
      failures.push(`closure exception ${entry.from}|${entry.to} carries no reason`);
      continue;
    }
    if (xrefs(entry.from).includes(entry.to)) continue;
    failures.push(`stale closure exception ${entry.from}|${entry.to} — rules/${entry.from}.md no longer points at rules/${entry.to}.md; delete the ledger line`);
  }
  assert.deepEqual(failures, []);
});

// -------------------------------------------------- family 4: marker budgets

test('family 4: no marker exceeds its single-source-of-truth budget', (t: TestContext) => {
  const failures: string[] = [];
  for (const budget of LEDGER.markerBudgets) {
    if (budget.phrase === '') continue;
    const count = filesContaining(CORPUS, budget.phrase).length;
    if (count > budget.maxFiles) {
      failures.push(`marker '${budget.phrase}' is in ${count} files, budget ${budget.maxFiles} — new duplication, put it back in one place`);
      continue;
    }
    // The ratchet: coming in under budget passes and says so, because the number
    // is now loose and should be tightened.
    if (count < budget.maxFiles) t.diagnostic(`marker '${budget.phrase}' is down to ${count} files (budget ${budget.maxFiles}) — tighten the budget`);
  }
  assert.deepEqual(failures, []);
});

test('family 4: every marker is still present in its declared owner file', () => {
  const failures: string[] = [];
  for (const budget of LEDGER.markerBudgets) {
    if (budget.phrase === '') continue;
    if (budget.owner === '-') continue;
    if (fileText(budget.owner).includes(budget.phrase)) continue;
    failures.push(`marker '${budget.phrase}' is missing from its declared owner ${budget.owner}`);
  }
  assert.deepEqual(failures, []);
});
