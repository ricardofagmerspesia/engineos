// Template-and-registry contracts: the handoff template (C19*) and the change
// record (C21*). Both follow the same discipline — the required-section list is
// registry data, the template is the checked surface, the prose is the checked
// mirror.
//
// Ported from scripts/checks/60-contracts.sh. What moved and what stayed:
// the template and prose mirrors are MIRRORS rows (src/checks/mirrors.ts), so
// this file holds only what a registry-to-document row cannot express — the
// reverse "every ## heading is declared" assertions of C19b and C21b (section
// names carry spaces, which the reverse capture class stops at), the
// registry-to-registry well-formedness of C19/C21, the archive walk of C21c
// (src/checks/contracts-archive.ts) and C21e's changes/README.md canary.
//
// Specs: docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md,
//        docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md
import { archiveContract, auditArchive, compilePattern } from './contracts-archive';
import {
  INTENTS_PATH,
  ISO_DATE,
  headingsOf,
  intentRow,
  recordAt,
  stringAt,
  stringsAt,
} from './contracts-intents';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { skipOnce, type CheckContext } from './lib';
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';

export const C19_FINDINGS = [
  'required-sections-missing-or-empty',
  'required-fields-missing-or-empty',
  'note-carries-the-section-list',
] as const;

export const C19b_FINDINGS = [
  'template-missing-section',
  'template-missing-field',
  'template-section-not-declared',
] as const;

export const C19c_FINDINGS = [
  'router-row-missing',
  'claude-row-missing-section',
  'claude-row-missing-field',
] as const;

export const C21_FINDINGS = [
  'required-sections-missing-or-empty',
  'required-fields-missing-or-empty',
  'domains-missing-or-empty',
  'domains-has-duplicates',
  'date-field-not-a-date',
  'spec-exempt-pattern-missing-or-invalid',
  'instance-section-not-required',
] as const;

export const C21b_FINDINGS = [
  'template-missing-section',
  'template-missing-field',
  'template-section-not-declared',
] as const;

export const C21c_FINDINGS = [
  'status-not-done',
  'completed-missing-or-malformed',
  'name-drifts-from-filename',
  'domain-not-in-enum',
  'filed-at-wrong-path',
  'unresolved-checklist-item',
  'missing-section',
  'spec-field-missing-or-empty',
  'spec-file-missing-or-empty',
  'spec-not-under-prefix',
] as const;

export const C21e_FINDINGS = [
  'skill-missing-domain',
  'archive-readme-missing-domain',
  'template-missing-domain',
  'changes-readme-regrew-inline-schema-copy',
] as const;

declare module './codes' {
  interface CheckCodes {
    C19: (typeof C19_FINDINGS)[number];
    C19b: (typeof C19b_FINDINGS)[number];
    C19c: (typeof C19c_FINDINGS)[number];
    C21: (typeof C21_FINDINGS)[number];
    C21b: (typeof C21b_FINDINGS)[number];
    C21c: (typeof C21c_FINDINGS)[number];
    C21e: (typeof C21e_FINDINGS)[number];
  }
}

const HANDOFF_TEMPLATE = 'templates/handoff.md';
const CHANGE_TEMPLATE = '.engineos/changes/_template.md';
const CHANGES_README = '.engineos/changes/README.md';

// ------------------------------------------------------------------ C19: handoff

function checkC19(ctx: CheckContext): CheckResult[] {
  const title = 'handoff intent carries required_sections/required_fields as data';
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, 'C19', title, 'handoff');
  const row = intentRow(ctx, 'handoff');
  const found: Finding[] = [];
  if (stringsAt(row, 'required_sections').length === 0) found.push(finding('C19', 'required-sections-missing-or-empty'));
  if (stringsAt(row, 'required_fields').length === 0) found.push(finding('C19', 'required-fields-missing-or-empty'));
  // The contract is data, and the prose list stays dead: a note that restates
  // the sections is a second home for them, which is what drifts.
  if (/required sections:/i.test(stringAt(row, 'note'))) found.push(finding('C19', 'note-carries-the-section-list'));
  return [result('C19', title, found)];
}

function checkC19b(ctx: CheckContext): CheckResult[] {
  const sectionTitle = 'handoff template carries every registry-required section';
  const fieldTitle = 'handoff template carries every registry-required field line';
  const reverseTitle = 'every handoff template section is declared in the registry';
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, 'C19b', sectionTitle, 'handoff');
  const groups = groupByCode(runMirrors(rowsOf('C19b'), ctx));
  const sections = take(groups, 'template-missing-section');
  const fields = take(groups, 'template-missing-field');
  return [
    result('C19b', sectionTitle, [...sections, ...drain(groups)]),
    result('C19b', fieldTitle, fields),
    result('C19b', reverseTitle, undeclaredHeadings('C19b', ctx, HANDOFF_TEMPLATE, 'handoff')),
  ];
}

function checkC19c(ctx: CheckContext): CheckResult[] {
  const title = 'CLAUDE.md handoff row mirrors every required section and field';
  if (!hasHandoffInputs(ctx)) return skipOnce(ctx, 'C19c', title, 'handoff');
  // The bash extracted the router row before comparing and reported its absence
  // as one defect. Without the short-circuit, a deleted row reads as every
  // required name missing, which buries the actual failure.
  if (!hasRouterRow(ctx.readText('CLAUDE.md') ?? '', HANDOFF_TEMPLATE)) {
    return [result('C19c', title, [finding('C19c', 'router-row-missing', 'CLAUDE.md')])];
  }
  return [result('C19c', title, runMirrors(rowsOf('C19c'), ctx))];
}

// ------------------------------------------------------------- C21: change record

function checkC21(ctx: CheckContext): CheckResult[] {
  const title = 'record-change intent carries the change-record contract as data';
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, 'C21', title, 'change-record');
  const row = intentRow(ctx, 'record-change');
  const contract = recordAt(row, 'archive_contract');
  const since = recordAt(contract, 'instance_sections_since');
  const sections = stringsAt(row, 'required_sections');
  const domains = stringsAt(contract, 'domains');
  const found: Finding[] = [];
  if (sections.length === 0) found.push(finding('C21', 'required-sections-missing-or-empty'));
  if (stringsAt(row, 'required_fields').length === 0) found.push(finding('C21', 'required-fields-missing-or-empty'));
  if (domains.length === 0) found.push(finding('C21', 'domains-missing-or-empty'));
  if (new Set(domains).size !== domains.length) found.push(finding('C21', 'domains-has-duplicates'));
  const dated: readonly (readonly [string, string])[] = [
    ['grandfathered_before', stringAt(contract, 'grandfathered_before')],
    ['instance_sections_since.date', stringAt(since, 'date')],
  ];
  for (const [field, value] of dated) {
    if (!ISO_DATE.test(value)) found.push(finding('C21', 'date-field-not-a-date', field));
  }
  if (compilePattern(stringAt(contract, 'spec_exempt_pattern')) === undefined) {
    found.push(finding('C21', 'spec-exempt-pattern-missing-or-invalid'));
  }
  // Both instance lists draw from required_sections, so C21b's template check
  // covers them; a section declared only here would never reach the template.
  const declared = new Set(sections);
  for (const section of [...stringsAt(contract, 'instance_sections'), ...stringsAt(since, 'sections')]) {
    if (!declared.has(section)) found.push(finding('C21', 'instance-section-not-required', section));
  }
  return [result('C21', title, found)];
}

function checkC21b(ctx: CheckContext): CheckResult[] {
  const sectionTitle = 'change template carries every registry-required section';
  const fieldTitle = 'change template carries every registry-required field line';
  const reverseTitle = 'every change template section is declared in the registry';
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, 'C21b', sectionTitle, 'change-record');
  const groups = groupByCode(runMirrors(rowsOf('C21b'), ctx));
  const sections = take(groups, 'template-missing-section');
  const fields = take(groups, 'template-missing-field');
  return [
    result('C21b', sectionTitle, [...sections, ...drain(groups)]),
    result('C21b', fieldTitle, fields),
    result('C21b', reverseTitle, undeclaredHeadings('C21b', ctx, CHANGE_TEMPLATE, 'record-change')),
  ];
}

function checkC21c(ctx: CheckContext): CheckResult[] {
  const wellFormedTitle = 'every checked-era archived change record is a well-formed done claim';
  const specTitle = "every checked-era archived record's spec link resolves (or is an explicit n/a exemption)";
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, 'C21c', wellFormedTitle, 'change-record');
  const audit = auditArchive(ctx, archiveContract(ctx));
  return [
    result('C21c', wellFormedTitle, audit.wellFormed),
    result('C21c', specTitle, audit.specLinks),
  ];
}

function checkC21e(ctx: CheckContext): CheckResult[] {
  const title = 'change-record prose mirrors agree with the registry';
  if (!hasChangeRecordInputs(ctx)) return skipOnce(ctx, 'C21e', title, 'change-record');
  const found: Finding[] = [...runMirrors(rowsOf('C21e'), ctx)];
  // The killed duplicate stays dead: changes/README.md once carried an inline
  // copy of the record schema, and a front-matter line on its own is what a
  // regrown copy looks like.
  const readme = (ctx.readText(CHANGES_README) ?? '').split('\n');
  if (readme.some((line) => line === 'status: active')) {
    found.push(finding('C21e', 'changes-readme-regrew-inline-schema-copy', CHANGES_README));
  }
  return [result('C21e', title, found)];
}

// ------------------------------------------------------------------ internals

function hasHandoffInputs(ctx: CheckContext): boolean {
  return ctx.exists(INTENTS_PATH) && ctx.exists(HANDOFF_TEMPLATE);
}

function hasChangeRecordInputs(ctx: CheckContext): boolean {
  return ctx.exists(INTENTS_PATH) && ctx.exists(CHANGE_TEMPLATE);
}

function hasRouterRow(text: string, target: string): boolean {
  return text.split('\n').some((line) => line.startsWith('|') && line.includes(target));
}

// The reverse direction of the template mirror, which stays code: section names
// are multi-word, and the mirror runner's reverse capture class stops at a
// space, so a reversed row would match nothing and pass vacuously.
function undeclaredHeadings(
  check: 'C19b' | 'C21b',
  ctx: CheckContext,
  template: string,
  intent: string,
): Finding[] {
  const declared = new Set(stringsAt(intentRow(ctx, intent), 'required_sections'));
  return headingsOf(ctx.readText(template) ?? '')
    .filter((heading) => !declared.has(heading))
    .map((heading) => finding(check, 'template-section-not-declared', heading));
}

// One runMirrors call feeds several bash `ok` lines, so the findings are split
// back by row id — which is the finding code. `drain` keeps a row nobody
// claimed visible rather than dropping it on the floor.
function groupByCode(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const entry of findings) {
    const bucket = groups.get(entry.code);
    if (bucket === undefined) groups.set(entry.code, [entry]);
    else bucket.push(entry);
  }
  return groups;
}

function take(groups: Map<string, Finding[]>, code: string): Finding[] {
  const bucket = groups.get(code) ?? [];
  groups.delete(code);
  return bucket;
}

function drain(groups: Map<string, Finding[]>): Finding[] {
  return [...groups.values()].flat();
}

export const CONTRACTS_CHECKS: readonly Check[] = [
  { id: 'C19', codes: C19_FINDINGS, run: checkC19 },
  { id: 'C19b', codes: C19b_FINDINGS, run: checkC19b },
  { id: 'C19c', codes: C19c_FINDINGS, run: checkC19c },
  { id: 'C21', codes: C21_FINDINGS, run: checkC21 },
  { id: 'C21b', codes: C21b_FINDINGS, run: checkC21b },
  { id: 'C21c', codes: C21c_FINDINGS, run: checkC21c },
  { id: 'C21e', codes: C21e_FINDINGS, run: checkC21e },
];
