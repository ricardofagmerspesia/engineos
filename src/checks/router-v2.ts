// Family `router-v2`: the routing replacement's registry surface (#127).
// C38 holds the intents.json v2 scoring fields to their shape, C38b the
// exemplar count, C38c the policy.json router/judge blocks plus three isolation
// boundaries (the judge's two and the root bundle's), and C38d the generated router table against CLAUDE.md
// and AGENTS.md.
//
// Every registry is read raw and then through its strict loader inside
// loadedOr: a loader refusal is a finding about the tree, never a crash of the
// validator, and the raw pass names the row the loader would only reject.
import { posix } from 'node:path';
import { isRecord } from '../lib/json';
import { routerTableRegion, renderRouterTable, ROUTER_TABLE_FILES } from '../gen/router-table';
import { parseIntents, type IntentsRegistry } from '../registry/intents';
import { parseJudge } from '../registry/policy-judge';
import { parseRouter, type RouterPolicy } from '../registry/policy-router';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { loadedOr, preconditionResult, rawJson } from './kernel-lib';
import type { CheckContext } from './lib';

export const C38_FINDINGS = ['intents-unloadable', 'version-not-v2', 'signals-dropped', 'metasyntax', 'threshold-out-of-range', 'folded-router-row'] as const;
export const C38B_FINDINGS = ['intents-unloadable', 'exemplar-count'] as const;
export const C38C_FINDINGS = [
  'router-block-malformed',
  'judge-block-malformed',
  'fixture-unknown-intent',
  'fixture-unknown-reason',
  'judge-fact-duplicate',
  'key-material',
  'judge-calls-fetch',
  'kernel-imports-judge',
  'bundle-imports-adapter',
] as const;
export const C38D_FINDINGS = ['intents-unloadable', 'markers-missing', 'markers-malformed', 'region-drift'] as const;

declare module './codes' {
  interface CheckCodes {
    C38: (typeof C38_FINDINGS)[number];
    C38b: (typeof C38B_FINDINGS)[number];
    C38c: (typeof C38C_FINDINGS)[number];
    C38d: (typeof C38D_FINDINGS)[number];
  }
}

export const ROUTER_V2_CHECKS: readonly Check[] = [
  { id: 'C38', codes: C38_FINDINGS, run: checkC38 },
  { id: 'C38b', codes: C38B_FINDINGS, run: checkC38b },
  { id: 'C38c', codes: C38C_FINDINGS, run: checkC38c },
  { id: 'C38d', codes: C38D_FINDINGS, run: checkC38d },
];

export const C38_TITLE = 'intents.json v2 scoring fields are well-formed';
export const C38B_TITLE = 'every active intent carries 3 to 10 exemplars';
export const C38C_TITLE = 'policy.json router scoring, combination, source_markers and judge blocks are well-formed';
export const C38D_TITLE = 'the CLAUDE.md and AGENTS.md router-table regions equal the generated table';

const INTENTS_JSON = 'registries/intents.json';
const POLICY_JSON = 'registries/policy.json';
const RULES_JSON = 'registries/decision-rules.json';
const EXEMPLARS_MIN = 3;
const EXEMPLARS_MAX = 10;
// C16's ban on signals, extended to every text the scorer matches (§1.2).
const METASYNTAX = /\b[XYN]\b|>|≥/;
// Rows the generator folds into a partner's table row; a router_row here would
// be silently ignored.
const FOLDED: readonly string[] = ['android-release'];
const FETCH_CALL = /\bfetch\s*\(/;
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/;
// The root runtime: the loader scripts/build.mjs writes, and the bundle it
// requires. Absent files are skipped (a checkout that has not been built).
const ROOT_LOADER = 'dist/engineos.cjs';
const ROOT_BUNDLE = 'dist/runtime/engineos.cjs';
// esbuild heads every bundled module with a `// <path>` line, and a module left
// external is a require of its path. Neither pattern's source spells a path
// with a bare slash after the directory name, so this file, bundled into the
// root runtime itself, cannot match its own regex literals.
const BUNDLED_FOREIGN_MODULE = /^\/\/ (?:adapters|tools\/embedding-daemon)\//;
const REQUIRED_FOREIGN_MODULE = /\brequire\(\s*["'][^"']*\b(?:adapters|tools\/embedding-daemon)\//;

export function checkC38(ctx: CheckContext): CheckResult[] {
  const raw = rawJson(ctx, INTENTS_JSON);
  if (raw === undefined) return [preconditionResult('C38', C38_TITLE, INTENTS_JSON)];
  const findings: Finding[] = [];
  const version = typeof raw['version'] === 'string' ? raw['version'] : '';
  if (!version.startsWith('2.')) findings.push(finding('C38', 'version-not-v2', version || 'absent'));
  const rows = Array.isArray(raw['intents']) ? raw['intents'].filter(isRecord) : [];
  for (const row of rows) {
    const id = typeof row['id'] === 'string' ? row['id'] : '?';
    const active = row['enabled'] !== false;
    // signals stay on every active row through the 1.x window (§1.3).
    if (active && !(Array.isArray(row['signals']) && row['signals'].length > 0)) findings.push(finding('C38', 'signals-dropped', id));
    for (const text of [...phraseTexts(row['phrases']), ...phraseTexts(row['negative'])]) {
      if (METASYNTAX.test(text)) findings.push(finding('C38', 'metasyntax', `${id}:${text}`));
    }
    const threshold = row['threshold'];
    if (threshold !== undefined && threshold !== null && !(typeof threshold === 'number' && threshold > 0 && threshold <= 1)) {
      findings.push(finding('C38', 'threshold-out-of-range', id));
    }
    if (FOLDED.includes(id) && row['router_row'] !== undefined && row['router_row'] !== null) findings.push(finding('C38', 'folded-router-row', id));
  }
  if (loadedOr(() => parseIntents(raw)) === undefined) findings.push(finding('C38', 'intents-unloadable', INTENTS_JSON));
  return [result('C38', C38_TITLE, findings)];
}

export function checkC38b(ctx: CheckContext): CheckResult[] {
  const intents = loadIntentsOr(ctx);
  if (intents === undefined) return [result('C38b', C38B_TITLE, [finding('C38b', 'intents-unloadable', INTENTS_JSON)])];
  const findings = intents.intents
    .filter((row) => row.active && (row.exemplars.length < EXEMPLARS_MIN || row.exemplars.length > EXEMPLARS_MAX))
    .map((row) => finding('C38b', 'exemplar-count', `${row.id}:${row.exemplars.length}`));
  return [result('C38b', C38B_TITLE, findings)];
}

export function checkC38c(ctx: CheckContext): CheckResult[] {
  const policy = rawJson(ctx, POLICY_JSON);
  if (policy === undefined) return [preconditionResult('C38c', C38C_TITLE, POLICY_JSON)];
  const findings: Finding[] = [];
  const breaker = isRecord(policy['breaker']) ? policy['breaker'] : {};
  const scopes = Array.isArray(breaker['scopes']) ? breaker['scopes'].filter((s): s is string => typeof s === 'string') : [];
  const router = loadedOr(() => parseRouter(policy['router']));
  if (router === undefined) findings.push(finding('C38c', 'router-block-malformed', '.router'));
  else findings.push(...fixtureFindings(router, loadIntentsOr(ctx)));
  if (loadedOr(() => parseJudge(policy['judge'], scopes)) === undefined) findings.push(finding('C38c', 'judge-block-malformed', '.judge'));
  findings.push(...judgeFactFindings(ctx), ...keyMaterialFindings(ctx, policy), ...isolationFindings(ctx), ...bundleFindings(ctx));
  return [result('C38c', C38C_TITLE, findings)];
}

export function checkC38d(ctx: CheckContext): CheckResult[] {
  const intents = loadIntentsOr(ctx);
  if (intents === undefined) return [result('C38d', C38D_TITLE, [finding('C38d', 'intents-unloadable', INTENTS_JSON)])];
  const table = renderRouterTable(intents);
  const findings: Finding[] = [];
  for (const file of ROUTER_TABLE_FILES) {
    const text = ctx.readText(file);
    if (text === undefined) return [preconditionResult('C38d', C38D_TITLE, file)];
    const region = routerTableRegion(text);
    if (region.kind === 'missing') findings.push(finding('C38d', 'markers-missing', file));
    else if (region.kind === 'malformed') findings.push(finding('C38d', 'markers-malformed', file));
    else if (!sameLines(region.lines, table)) findings.push(finding('C38d', 'region-drift', `${file}:${firstDifference(region.lines, table)}`));
  }
  return [result('C38d', C38D_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function loadIntentsOr(ctx: CheckContext): IntentsRegistry | undefined {
  const raw = rawJson(ctx, INTENTS_JSON);
  return raw === undefined ? undefined : loadedOr(() => parseIntents(raw));
}

function phraseTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => item['text']).filter((text): text is string => typeof text === 'string');
}

// C18e runs the fixtures through the kernel; this proves they name only what
// exists, so a renamed intent or reason fails here with its name rather than as
// an opaque mismatch there.
function fixtureFindings(router: RouterPolicy, intents: IntentsRegistry | undefined): Finding[] {
  const ids = new Set((intents?.intents ?? []).filter((row) => row.active).map((row) => row.id));
  const findings: Finding[] = [];
  router.fixtures.forEach((fixture, index) => {
    if (intents !== undefined) {
      for (const id of fixture.intents) if (!ids.has(id)) findings.push(finding('C38c', 'fixture-unknown-intent', `${index}:${id}`));
    }
    for (const reason of fixture.reasons) {
      if (!router.reasons.includes(reason)) findings.push(finding('C38c', 'fixture-unknown-reason', `${index}:${reason}`));
    }
  });
  return findings;
}

// Each judge fact is one question (fact.<name>); two rules sharing one would
// let a single answer add both.
function judgeFactFindings(ctx: CheckContext): Finding[] {
  const list = rawJson(ctx, RULES_JSON)?.['rules'];
  const rows = Array.isArray(list) ? list.filter(isRecord) : [];
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const row of rows) {
    const fact = row['judge_fact'];
    if (typeof fact !== 'string') continue;
    if (seen.has(fact)) findings.push(finding('C38c', 'judge-fact-duplicate', fact));
    seen.add(fact);
  }
  return findings;
}

// No registry carries key material: every registries/*.json is scanned with the
// judge's own redaction patterns, the set install.sh refuses to ship.
function keyMaterialFindings(ctx: CheckContext, policy: Record<string, unknown>): Finding[] {
  const judge = isRecord(policy['judge']) ? policy['judge'] : {};
  const redaction = isRecord(judge['redaction']) ? judge['redaction'] : {};
  const patterns = (Array.isArray(redaction['patterns']) ? redaction['patterns'] : []).filter(isRecord).flatMap((row) => {
    const source = row['pattern'];
    const compiled = typeof source === 'string' ? compile(source) : undefined;
    return compiled === undefined ? [] : [{ kind: String(row['kind']), compiled }];
  });
  const findings: Finding[] = [];
  for (const name of ctx.list('registries').filter((entry) => entry.endsWith('.json'))) {
    const text = ctx.readText(`registries/${name}`) ?? '';
    for (const pattern of patterns) {
      if (pattern.compiled.test(text)) findings.push(finding('C38c', 'key-material', `registries/${name}:${pattern.kind}`));
    }
  }
  return findings;
}

// An uncompilable pattern is judge-block-malformed already; here it is skipped.
function compile(source: string): RegExp | undefined {
  try {
    return new RegExp(source);
  } catch {
    return undefined;
  }
}

// The judge client never reaches the network itself (the hook injects the
// transport), and the kernel never imports src/judge (D5): import statements
// only, so a comment naming the module is not a finding.
function isolationFindings(ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(ctx, 'src/judge')) {
    codeLines(ctx.readText(file) ?? '').forEach((line, index) => {
      if (FETCH_CALL.test(line)) findings.push(finding('C38c', 'judge-calls-fetch', `${file}:${index + 1}`));
    });
  }
  for (const file of sourceFiles(ctx, 'src/kernel')) {
    codeLines(ctx.readText(file) ?? '').forEach((line, index) => {
      const specifier = IMPORT_SPECIFIER.exec(line)?.[1];
      if (specifier === undefined || !specifier.startsWith('.')) return;
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      if (target === 'src/judge' || target.startsWith('src/judge/')) findings.push(finding('C38c', 'kernel-imports-judge', `${file}:${index + 1}`));
    });
  }
  return findings;
}

// The opt-in in-process host and the embedding daemon ship as their own entry
// and package (T12); every user who never opts in loads dist/engineos.cjs, so
// neither may reach it. Skipped when the root loader is absent.
function bundleFindings(ctx: CheckContext): Finding[] {
  if (ctx.readText(ROOT_LOADER) === undefined) return [];
  const findings: Finding[] = [];
  for (const file of [ROOT_LOADER, ROOT_BUNDLE]) {
    (ctx.readText(file) ?? '').split('\n').forEach((line, index) => {
      if (BUNDLED_FOREIGN_MODULE.test(line) || REQUIRED_FOREIGN_MODULE.test(line)) {
        findings.push(finding('C38c', 'bundle-imports-adapter', `${file}:${index + 1}`));
      }
    });
  }
  return findings;
}

// Non-test .ts files under dir, recursively; a name that reads as no file is
// listed as a directory.
function sourceFiles(ctx: CheckContext, dir: string): string[] {
  return ctx.list(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (name.endsWith('.ts')) return name.endsWith('.test.ts') ? [] : [path];
    return ctx.readText(path) === undefined ? sourceFiles(ctx, path) : [];
  });
}

// Line comments and block-comment continuation lines carry prose, not code.
function codeLines(text: string): string[] {
  return text.split('\n').map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line));
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

// 1-based line within the region, so the finding points at the first stale row.
function firstDifference(left: readonly string[], right: readonly string[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return index + 1;
  return length;
}
