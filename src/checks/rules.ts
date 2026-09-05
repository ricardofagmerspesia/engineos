// Checks on the constitution and the rule corpus: the runtime this validator
// needs, the always-on imports, cross-reference resolution, and the two closure
// invariants CLAUDE.md states in prose. Ported from scripts/checks/10-rules.sh.
import { MIN_NODE_MAJOR, currentMajor } from '../node-guard';
import { TASK_CONTRACT_RULES, alwaysOnRules, ruleNames } from '../lib/deferrals';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { deferralsOf, type CheckContext } from './lib';

// ---------------------------------------------------------------- C1: runtime
// The bash check asked for jq. Nothing in the shipped product reads JSON with jq
// any more — every hook, installer and generator is a shim over dist/engineos.cjs
// — so the tooling this family gates on is the runtime all of them share, and
// this validator with them.
export const C1_FINDINGS = ['node-too-old'] as const;

// ------------------------------------------------- C2: always-on imports exist
export const C2_FINDINGS = ['no-always-on-imports', 'rule-missing'] as const;

// ---------------------------------- C3: every rules/X.md reference resolves
export const C3_FINDINGS = ['dangling-reference'] as const;

// ------------------------------------------------------ C5: router row closure
export const C5_FINDINGS = ['row-not-closed'] as const;

// ------------------------- C5b: always-on files reference only always-on rules
export const C5b_FINDINGS = ['route-loaded-reference'] as const;

declare module './codes' {
  interface CheckCodes {
    C1: (typeof C1_FINDINGS)[number];
    C2: (typeof C2_FINDINGS)[number];
    C3: (typeof C3_FINDINGS)[number];
    C5: (typeof C5_FINDINGS)[number];
    C5b: (typeof C5b_FINDINGS)[number];
  }
}

const C1_TITLE = `node >= ${MIN_NODE_MAJOR} present (the runtime every entry point, hook and this validator runs on)`;
const C2_TITLE = 'always-on imports resolve';
const C3_TITLE = 'all rules/*.md cross-references resolve';
const C5_TITLE = 'router load lists are closed';
const C5B_TITLE = 'always-on rules reference only always-on rules';

const CLAUDE_MD = 'CLAUDE.md';

// The version arrives as a parameter rather than being read from the process, so
// the decision is testable: a check that can only observe the interpreter running
// it cannot be exercised for the branch that matters.
export function checkC1(nodeVersion: string = process.versions.node): CheckResult[] {
  const major = currentMajor(nodeVersion);
  const findings: Finding[] =
    major >= MIN_NODE_MAJOR ? [] : [finding('C1', 'node-too-old', String(major))];
  return [result('C1', C1_TITLE, findings)];
}

export function checkC2(ctx: CheckContext): CheckResult[] {
  const alwaysOn = alwaysOnRules(ctx.readText(CLAUDE_MD) ?? '');
  if (alwaysOn.length === 0) {
    return [result('C2', C2_TITLE, [finding('C2', 'no-always-on-imports')])];
  }
  const findings = alwaysOn
    .filter((rule) => !ctx.exists(`rules/${rule}.md`))
    .map((rule) => finding('C2', 'rule-missing', rule));
  return [result('C2', C2_TITLE, findings)];
}

// One Check over both halves of the old C3/C4 pair: the loop below walks every
// prose surface and every reference in it, and emits a single verdict.
export function checkC3(ctx: CheckContext): CheckResult[] {
  const findings: Finding[] = [];
  for (const file of proseSurfaces(ctx)) {
    const text = ctx.readText(file);
    if (text === undefined) continue;
    for (const reference of ruleReferencesIn(text)) {
      if (ctx.exists(reference)) continue;
      findings.push(finding('C3', 'dangling-reference', `${file}->${reference}`));
    }
  }
  return [result('C3', C3_TITLE, findings)];
}

// The deferral graph itself is src/lib/deferrals.ts.
export function checkC5(ctx: CheckContext): CheckResult[] {
  const text = ctx.readText(CLAUDE_MD) ?? '';
  const alwaysOn = alwaysOnRules(text);
  // One rule's deferrals are re-asked once per router row that loads it, and each
  // answer re-reads the whole corpus; the cache keeps a run linear in the corpus.
  const cached = new Map<string, string[]>();
  const deferrals = (rule: string): string[] => {
    const known = cached.get(rule);
    if (known !== undefined) return known;
    const computed = deferralsOf(ctx, rule);
    cached.set(rule, computed);
    return computed;
  };

  const findings: Finding[] = [];
  let row = 0;
  for (const line of text.split('\n')) {
    if (!isTableRow(line)) continue;
    if (line.includes('---')) continue;
    if (line.includes('| Load |') || line.includes('Intent (signals)')) continue;
    const loaded = ruleNamesIn(line);
    if (loaded.length === 0) continue;
    row += 1;
    for (const rule of loaded) {
      // A rule every turn already carries, or that the task contract supplies, is
      // not something a row has to name.
      if (alwaysOn.includes(rule)) continue;
      if (TASK_CONTRACT_RULES.includes(rule)) continue;
      for (const deferral of deferrals(rule)) {
        if (loaded.includes(deferral)) continue;
        findings.push(finding('C5', 'row-not-closed', `row${row}:${rule}->${deferral}`));
      }
    }
  }
  return [result('C5', C5_TITLE, findings)];
}

// CLAUDE.md: "Always-on files ... may point only at other always-on files, at repo
// templates, or at registries/*.json." Enforced here rather than trusted.
//
// This deliberately does NOT reuse deferralsOf: that graph also prunes the task
// contract rules, because a router row need not name what resolve-task already
// supplies. The rule for an always-on FILE is stricter — it names only always-on
// files — so gates, models, parallelism, risk-autonomy and verification are
// violations here even though they are invisible to the closure graph.
export function checkC5b(ctx: CheckContext): CheckResult[] {
  const alwaysOn = alwaysOnRules(ctx.readText(CLAUDE_MD) ?? '');
  const corpus = ruleNames(ctx.root);
  const findings: Finding[] = [];
  for (const host of alwaysOn) {
    // The bash grepped a path that may not exist and let grep fail; a missing
    // always-on file is C2's finding, not this one's.
    const text = ctx.readText(`rules/${host}.md`);
    if (text === undefined) continue;
    for (const named of corpus) {
      if (named === host) continue;
      if (alwaysOn.includes(named)) continue;
      if (!text.includes(`${named}.md`)) continue;
      findings.push(finding('C5b', 'route-loaded-reference', `${host}->${named}`));
    }
  }
  return [result('C5b', C5B_TITLE, findings)];
}

export const RULES_CHECKS: readonly Check[] = [
  { id: 'C1', codes: C1_FINDINGS, run: () => checkC1() },
  { id: 'C2', codes: C2_FINDINGS, run: checkC2 },
  { id: 'C3', codes: C3_FINDINGS, run: checkC3 },
  { id: 'C5', codes: C5_FINDINGS, run: checkC5 },
  { id: 'C5b', codes: C5b_FINDINGS, run: checkC5b },
];

// -------------------------------------------------------------------- internals

const RULE_REFERENCE = /rules\/[a-z0-9-]+\.md/g;
const MD = '.md';

// The bash glob list, in order: CLAUDE.md, rules/*.md, agents/*.md,
// skills/*/SKILL.md, skills/*/references/*.md, commands/*.md. The two skills
// globs are separate passes because bash expanded them that way, and the order
// findings come out in follows from it.
function proseSurfaces(ctx: CheckContext): string[] {
  const skills = visibleEntries(ctx, 'skills');
  return [
    CLAUDE_MD,
    ...markdownIn(ctx, 'rules'),
    ...markdownIn(ctx, 'agents'),
    ...skills.map((skill) => `skills/${skill}/SKILL.md`),
    ...skills.flatMap((skill) => markdownIn(ctx, `skills/${skill}/references`)),
    ...markdownIn(ctx, 'commands'),
  ].filter((path) => ctx.exists(path));
}

// A glob's `*` never matches a leading dot, so a dotfile beside the corpus is not
// a prose surface.
function visibleEntries(ctx: CheckContext, dir: string): string[] {
  return ctx.list(dir).filter((name) => !name.startsWith('.'));
}

function markdownIn(ctx: CheckContext, dir: string): string[] {
  return visibleEntries(ctx, dir)
    .filter((name) => name.endsWith(MD))
    .map((name) => `${dir}/${name}`);
}

// grep -oE 'rules/[a-z0-9-]+\.md' | sort -u — byte-sorted and deduplicated.
function ruleReferencesIn(text: string): string[] {
  return unique(text.match(RULE_REFERENCE) ?? []);
}

// The same matches with the directory and extension stripped, so a row's load
// list reads as rule names.
function ruleNamesIn(line: string): string[] {
  return unique(
    (line.match(RULE_REFERENCE) ?? []).map((reference) =>
      reference.slice('rules/'.length, reference.length - MD.length),
    ),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(byteOrder);
}

// A markdown table row: a leading pipe with at least one more pipe after it,
// which is the bash pattern `'|'*'|'*`.
function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.indexOf('|', 1) !== -1;
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
