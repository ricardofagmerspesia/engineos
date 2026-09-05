// C27 and C27d: the agent-span exec journal's registry block and its prose
// mirror, ported from scripts/checks/70-runtime.sh.
//
// The C22* family checks what EngineOS DECIDED; this one checks the record of
// what HAPPENED when agents ran. Spans live in .git/ on developer machines and
// a CI clone has none by construction, so this validates the registry, the
// CLI's behaviour (C27b) and the plumbing (C27c) — never the data.
// Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 5
// ADR: docs/adr/2026-09-03-spans-extend-exec-journal.md
//
// C27a's second half is gone with the bash CLI's constants (design deviation
// 4): src/journal/schema.ts declares the field table once and resolves each
// enumerated row from the registry that owns it, so there is no second copy
// left to compare against. What remains checkable is that the registry side is
// usable at all — an empty list would make the port enumerate nothing and
// accept everything — and C27b is what proves the running CLI honours it.
import { join } from 'node:path';
import { isRecord, readJsonFile, stringArray } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckId } from './ids';
import { skipOnce, type CheckContext } from './lib';
import { runMirrors, sliceSection } from './mirror';
import { rowsOf } from './mirrors';
import { isExecutable } from './runtime-surface-fs';

export const C27_FINDINGS = [
  'block-missing',
  'home-missing',
  'home-does-not-end-in-exec-jsonl',
  'schema-missing',
  'schema-not-executable',
  'enumeration-empty',
  'written-by-empty',
  'written-by-names-a-missing-file',
  'written-by-helper-missing',
  'written-by-helper-names-a-missing-file',
  'max-value-length-not-a-positive-integer',
  'fallback-unreadable',
  'max-value-length-fallback-drift',
] as const;

export const C27d_FINDINGS = [
  'section-missing',
  'section-empty',
  'field-not-named',
  'span-kind-alternation-missing',
  'zero-is-not-free-caveat-missing',
  'status-floor-caveat-missing',
  'slug-claim-not-scoped-to-note',
  'classifies-content-reclaimed',
  'parallelism-reference-missing',
  // The mirror rows of rowsOf('C27d'); a row id is its finding code.
  'span-kind-missing',
  'journal-home-missing',
  'value-length-drift',
] as const;

export const C27_TITLE =
  'policy.json.telemetry.exec_journal is well-formed: home ends in .exec.jsonl, schema is executable, span_kinds/statuses are non-empty, max_value_length agrees with the port\'s standalone fallback, and every writer exists';

export const C27d_TITLE =
  'rules/observability.md mirrors the span schema: an Agent traces section naming the registry home, the span-kind alternation in registry order, trace_id/span_kind/cost_micros, the tokens-are-0 and status-is-a-floor caveats, and the all-but-note slug claim with its length bound';

const POLICY = 'registries/policy.json';
// The per-value length bound is DATA in the registry, and the port carries a
// fallback so it runs standalone without one. The two must agree, so the Check
// reads the source that owns the constant rather than the retired shim.
const EJ_POLICY_TS = 'src/registry/policy-exec-journal.ts';
const FALLBACK_PATTERN = /^export const MAX_VALUE_LENGTH_FALLBACK = ([0-9]+);$/m;

const OBSERVABILITY = 'rules/observability.md';
const AGENT_TRACES = '## Agent traces';
const PARALLELISM = 'rules/parallelism.md';

// The field names a consumer codes against. The section is scoped, never the
// file: `trace_id` and `provider` occur elsewhere in the rules tree, so a
// file-wide search would pass with the section deleted.
const NAMED_FIELDS = ['trace_id', 'span_kind', 'cost_micros', 'tokens_in'] as const;

// The bash guard read `[ -f "$PJ" ] && [ -x "$EJSH" ]`. The exec-journal half is
// gone on purpose: C27b's canary calls the CLI in this process, so the mode of
// scripts/exec-journal.sh is no longer an input to any check here — and the one
// place it still matters is C27's own `schema-not-executable` finding, which a
// guard on the same bit would make unreachable through its real subject. A
// guard satisfiable by the thing under test is how a negative case goes vacuous.
// The skip_once TOKEN is unchanged, so a missing policy.json is still one FAIL
// for the family rather than one per check.
export function haveExecJournalInputs(ctx: CheckContext, check: CheckId, title: string): CheckResult[] | undefined {
  if (ctx.exists(POLICY)) return undefined;
  return skipOnce(ctx, check, title, 'exec-journal');
}

// need_reg-style file presence proves nothing about the block, so its absence is
// answered explicitly before anything reads through it — a lookup through a
// missing block would answer confidently with nothing.
export function execJournalBlock(ctx: CheckContext): Record<string, unknown> | undefined {
  let raw: unknown;
  try {
    raw = readJsonFile(join(ctx.root, POLICY));
  } catch {
    return undefined;
  }
  const telemetry = isRecord(raw) ? raw['telemetry'] : undefined;
  const block = isRecord(telemetry) ? telemetry['exec_journal'] : undefined;
  return isRecord(block) ? block : undefined;
}

export function checkC27(ctx: CheckContext): CheckResult[] {
  const skipped = haveExecJournalInputs(ctx, 'C27', C27_TITLE);
  if (skipped !== undefined) return skipped;
  const block = execJournalBlock(ctx);
  if (block === undefined) return [result('C27', C27_TITLE, [finding('C27', 'block-missing', POLICY)])];
  const findings: Finding[] = [
    ...homeFindings(block['home']),
    ...schemaFindings(ctx, block['schema']),
    ...enumerationFindings(block),
    ...writerFindings(ctx, block),
    ...boundFindings(ctx, block['max_value_length']),
  ];
  return [result('C27', C27_TITLE, findings)];
}

export function checkC27d(ctx: CheckContext): CheckResult[] {
  const skipped = haveExecJournalInputs(ctx, 'C27d', C27d_TITLE);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [...sectionFindings(ctx), ...runMirrors(rowsOf('C27d'), ctx)];
  // rules/parallelism.md's breaker section forward-references this section as
  // the source of its consecutive-failure count; the reference goes live with
  // the section and must not be left dangling in either direction.
  if (!(ctx.readText(PARALLELISM) ?? '').includes('Agent traces')) {
    findings.push(finding('C27d', 'parallelism-reference-missing', PARALLELISM));
  }
  return [result('C27d', C27d_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function homeFindings(home: unknown): Finding[] {
  if (typeof home !== 'string' || home === '') return [finding('C27', 'home-missing')];
  if (!home.endsWith('.exec.jsonl')) return [finding('C27', 'home-does-not-end-in-exec-jsonl', home)];
  return [];
}

function schemaFindings(ctx: CheckContext, schema: unknown): Finding[] {
  if (typeof schema !== 'string' || schema === '') return [finding('C27', 'schema-missing')];
  if (!isExecutable(ctx.root, schema)) return [finding('C27', 'schema-not-executable', schema)];
  return [];
}

function enumerationFindings(block: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  for (const field of ['span_kinds', 'statuses'] as const) {
    if (stringArray(block[field]).length < 1) findings.push(finding('C27', 'enumeration-empty', field));
  }
  return findings;
}

function writerFindings(ctx: CheckContext, block: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  const writers = stringArray(block['written_by']);
  if (writers.length < 1) findings.push(finding('C27', 'written-by-empty'));
  for (const writer of writers) {
    if (!ctx.exists(writer)) findings.push(finding('C27', 'written-by-names-a-missing-file', writer));
  }
  const helper = block['written_by_helper'];
  if (typeof helper !== 'string' || helper === '') findings.push(finding('C27', 'written-by-helper-missing'));
  else if (!ctx.exists(helper)) findings.push(finding('C27', 'written-by-helper-names-a-missing-file', helper));
  return findings;
}

function boundFindings(ctx: CheckContext, bound: unknown): Finding[] {
  if (typeof bound !== 'number' || !Number.isInteger(bound) || bound <= 0) {
    return [finding('C27', 'max-value-length-not-a-positive-integer', bound === undefined ? 'missing' : String(bound))];
  }
  const source = ctx.readText(EJ_POLICY_TS);
  const declared = source === undefined ? null : FALLBACK_PATTERN.exec(source)?.[1] ?? null;
  if (declared === null) return [finding('C27', 'fallback-unreadable', EJ_POLICY_TS)];
  if (declared !== String(bound)) {
    return [finding('C27', 'max-value-length-fallback-drift', `registry:${bound}-source:${declared}`)];
  }
  return [];
}

function sectionFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(OBSERVABILITY);
  const section = text === undefined ? undefined : sliceSection(text, AGENT_TRACES);
  if (section === undefined) return [finding('C27d', 'section-missing', AGENT_TRACES)];
  if (section.trim() === '') return [finding('C27d', 'section-empty', AGENT_TRACES)];
  const findings: Finding[] = [];
  for (const term of NAMED_FIELDS) {
    if (!section.includes(term)) findings.push(finding('C27d', 'field-not-named', term));
  }
  findings.push(...alternationFindings(ctx, section));
  findings.push(...caveatFindings(section));
  return findings;
}

// The per-kind loop is the `span-kind-missing` mirror row's job. What stays here
// is the alternation LINE, built from the registry and asserted as one ordered
// string: the per-kind form is substring-satisfiable — with the line deleted
// outright it fails only on `coordinator`, because `model` matches `model_tier`
// and tool/agent/router/verification each match another bullet.
function alternationFindings(ctx: CheckContext, section: string): Finding[] {
  const kinds = stringArray(execJournalBlock(ctx)?.['span_kinds']);
  // An empty list is C27's finding; asserting an empty alternation here would
  // match every section and report nothing.
  if (kinds.length === 0) return [];
  const alternation = `\`${kinds.join(' | ')}\``;
  if (section.includes(alternation)) return [];
  return [finding('C27d', 'span-kind-alternation-missing', kinds.join('-'))];
}

// The caveats are literals rather than mirror rows because each is a CLAIM the
// section must keep, with no registry side to derive it from. Every one of them
// records a misreading this schema has actually caused:
//   - `0 as free`: the dispatch hooks cannot see a subagent's usage, so a
//     consumer reading those zeros as real spend is wrong.
//   - `FLOOR`: the hooks read only structural sources, so a structured response
//     with no error flag records OK and a breaker count built on this field
//     would see essentially no failures.
//   - `every field EXCEPT \`note\``: the broad claim ("no free-text field at
//     all") was false while run_id, capability_id and agent admitted one.
//   - `does not classify the content`: the guard bounds shape and size; the hook
//     boundary sanitizes rather than rejects, so a value's characters still
//     transit dash-joined. The first attempt at this section said a PII value
//     "cannot be written through those", which one probe refuted.
function caveatFindings(section: string): Finding[] {
  const findings: Finding[] = [];
  if (!section.includes('0 as free')) findings.push(finding('C27d', 'zero-is-not-free-caveat-missing'));
  if (!section.includes('FLOOR')) findings.push(finding('C27d', 'status-floor-caveat-missing'));
  if (!section.includes('every field EXCEPT `note`')) findings.push(finding('C27d', 'slug-claim-not-scoped-to-note'));
  if (!section.includes('does not classify the content')) findings.push(finding('C27d', 'classifies-content-reclaimed'));
  return findings;
}
