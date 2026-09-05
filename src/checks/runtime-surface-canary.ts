// C27b: the exec-journal writer is live — a behavioural canary against the
// running CLI, in BOTH directions. The accept half alone would pass against a
// CLI that accepts everything, and the reject half alone against one that
// accepts nothing, so each declared span kind is exercised and each malformed
// value is asserted to be refused. Every field a consumer gates on is asserted,
// not just the exit code.
//
// The bash ran `bash scripts/exec-journal.sh`; the port calls runJournal
// in-process against ctx.root, so the registries the CLI reads are the tree's
// own and a renamed vocabulary moves the canary with it.
//
// Two codes, not twenty. The bash accumulated one slug per assertion; here the
// slug is the SUBJECT and the code names the boundary that broke its contract,
// which keeps every bash slug greppable while leaving no code that only a
// source regression could produce. The direction (accepted what it must refuse,
// refused what it must accept) is part of the subject, exactly as it was in the
// bash.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { runJournal } from '../journal/cli';
import { isRecord, stringArray } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { execJournalBlock, haveExecJournalInputs } from './runtime-surface-journal';

export const C27b_FINDINGS = ['append-contract-broken', 'validate-contract-broken'] as const;

export const C27b_TITLE =
  'scripts/exec-journal.sh round-trips a full v2 span and every declared span kind, keeps a v1 line\'s shape, refuses whitespace in every field but note (run_id and agent included), refuses an over-long value, refuses a status or model_tier outside its enumeration on validate as well as on append, and still accepts a free-text note';

// The v1 field set every case starts from; each case overrides what it is about.
const BASE = [
  '--run-id', 'canary',
  '--capability-id', 'route',
  '--model-tier', 'build',
  '--status', 'OK',
  '--tokens-in', '0',
  '--tokens-out', '0',
  '--duration-ms', '1',
];

const FALLBACK_MAX_VALUE_LENGTH = 256;

// A line this CLI did not write, which is where the headless runner's spans will
// arrive from. Each carries exactly one violation of the schema.
const REJECTED_LINES: readonly { subject: string; line: string }[] = [
  {
    subject: 'validate-accepted-a-whitespace-span-field',
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"bad id","route":"good"}',
  },
  {
    subject: 'validate-accepted-a-whitespace-run_id',
    line: '{"timestamp":"t","run_id":"sess 1","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}',
  },
  // The ENUMERATED v1 fields: append gates them through the member list and
  // validate used to check the type only, so prose in status and a newline in
  // model_tier validated clean on a journal this CLI did not write.
  {
    subject: 'validate-accepted-free-text-in-status',
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"it went fine, mostly","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}',
  },
  {
    subject: 'validate-accepted-a-newline-in-model_tier',
    line: '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build\\nSECRET=leaked","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}',
  },
];

export function checkC27b(ctx: CheckContext): CheckResult[] {
  const skipped = haveExecJournalInputs(ctx, 'C27b', C27b_TITLE);
  if (skipped !== undefined) return skipped;
  // A private directory outside the tree: the canary writes journals, and a
  // Check must never leave a file in the repository it is validating.
  const workspace = mkdtempSync(join(tmpdir(), 'engineos-c27b-'));
  try {
    const findings: Finding[] = [...appendFindings(ctx, workspace), ...validateFindings(ctx, workspace)];
    return [result('C27b', C27b_TITLE, findings)];
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ internals

function appendFindings(ctx: CheckContext, workspace: string): Finding[] {
  const findings: Finding[] = [];
  const spans = join(workspace, 'spans.exec.jsonl');
  findings.push(...fullSpanFindings(ctx, spans));
  // Every span kind the registry declares, read from the registry so a renamed
  // kind moves this canary with it.
  for (const kind of declaredList(ctx, 'span_kinds')) {
    if (!append(ctx, spans, ['--span-kind', kind])) {
      findings.push(broke('append', `declared-span-kind-rejected:${kind}`));
    }
  }
  findings.push(...v1ShapeFindings(ctx, join(workspace, 'v1.exec.jsonl')));
  findings.push(...refusalFindings(ctx, spans));
  return findings;
}

// Accept: one line with every v2 field set, then read each one back. The
// round-trip is asserted field by field because an exit code says only that the
// CLI did not object.
function fullSpanFindings(ctx: CheckContext, spans: string): Finding[] {
  const accepted = append(ctx, spans, [
    '--status', 'FAILED', '--duration-ms', '900',
    '--trace-id', 'canary-session', '--span-id', 'tu-1', '--parent-span-id', 'tu-0',
    '--span-kind', 'tool', '--tool', 'mcp.postgres', '--provider', 'anthropic',
    '--model', 'claude-opus-5', '--cost-micros', '1200', '--retry-attempt', '1',
    '--cache-hit', 'false', '--route', 'dba', '--risk', 'medium',
  ]);
  if (!accepted) return [broke('append', 'full-v2-line-was-rejected')];
  const findings: Finding[] = [];
  if (!validate(ctx, spans)) findings.push(broke('append', 'full-v2-line-did-not-validate'));
  const written = lastRecord(spans);
  const expected: Record<string, unknown> = {
    trace_id: 'canary-session', span_id: 'tu-1', parent_span_id: 'tu-0',
    span_kind: 'tool', tool: 'mcp.postgres', provider: 'anthropic',
    model: 'claude-opus-5', cost_micros: 1200, retry_attempt: 1,
    cache_hit: false, route: 'dba', risk: 'medium', status: 'FAILED',
  };
  if (!roundTrips(written, expected)) findings.push(broke('append', 'full-v2-line-did-not-round-trip'));
  return findings;
}

// A missing line is a failed round-trip, not an absent one: `undefined` here
// means the CLI reported success and wrote nothing readable back.
function roundTrips(written: Record<string, unknown> | undefined, expected: Record<string, unknown>): boolean {
  if (written === undefined) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (written[key] !== value) return false;
  }
  return true;
}

// Accept: a v1 line, carrying no v2 key at all. Backward compatibility is the
// contract, and a v2 field emitted as an explicit null would still validate, so
// the SHAPE is asserted and not only the exit code.
function v1ShapeFindings(ctx: CheckContext, file: string): Finding[] {
  if (!append(ctx, file, [])) return [broke('append', 'v1-line-was-rejected')];
  const written = lastRecord(file);
  const v2Keys = ['span_kind', 'trace_id', 'cost_micros'];
  if (written !== undefined && v2Keys.some((key) => key in written)) {
    return [broke('append', 'a-v1-line-now-carries-v2-keys')];
  }
  return [];
}

// Reject: the outcomes that must NOT be accepted. The whitespace case is the
// invariant the whole schema exists for — no span field admits a space, so
// prompt text and PII cannot reach disk through one. The v1 IDENTIFIER fields
// are here too: they used to admit a space and pass validate while three prose
// homes said no field did.
function refusalFindings(ctx: CheckContext, spans: string): Finding[] {
  const findings: Finding[] = [];
  // The bound is read from the registry so the canary moves with the number
  // rather than pinning a literal.
  const bound = declaredBound(ctx);
  const long = 'a'.repeat(bound + 1);
  const mustRefuse: readonly { subject: string; args: string[] }[] = [
    { subject: 'whitespace-trace_id-was-not-rejected', args: ['--trace-id', 'has space'] },
    { subject: 'newline-trace_id-was-not-rejected', args: ['--trace-id', 'clean\nthen arbitrary text'] },
    { subject: 'unknown-span_kind-was-not-rejected', args: ['--span-kind', 'bogus-kind'] },
    { subject: 'unknown-risk-was-not-rejected', args: ['--risk', 'critical'] },
    { subject: 'fractional-cost_micros-was-not-rejected', args: ['--cost-micros', '1.5'] },
    { subject: 'non-boolean-cache_hit-was-not-rejected', args: ['--cache-hit', 'yes'] },
    { subject: 'whitespace-run_id-was-not-rejected', args: ['--run-id', 'has space'] },
    { subject: 'whitespace-capability_id-was-not-rejected', args: ['--capability-id', 'has space'] },
    { subject: 'newline-agent-was-not-rejected', args: ['--agent', 'agent\nSECRET=leaked prompt text'] },
    { subject: 'over-long-trace_id-was-not-rejected', args: ['--trace-id', long] },
    { subject: 'over-long-note-was-not-rejected', args: ['--note', long] },
  ];
  for (const { subject, args } of mustRefuse) {
    if (append(ctx, spans, args)) findings.push(broke('append', subject));
  }
  // note is the one documented free-text field, and a guard that rejected
  // everything would satisfy every reject case above.
  if (!append(ctx, spans, ['--note', 'a human annotation, with spaces'])) {
    findings.push(broke('append', 'free-text-note-was-rejected'));
  }
  return findings;
}

function validateFindings(ctx: CheckContext, workspace: string): Finding[] {
  const findings: Finding[] = [];
  const file = join(workspace, 'foreign.exec.jsonl');
  for (const { subject, line } of REJECTED_LINES) {
    writeFileSync(file, `${line}\n`);
    if (validate(ctx, file)) findings.push(broke('validate', subject));
  }
  // Every status the registry declares still validates, so the rejects above
  // cannot be satisfied by a guard that refuses everything.
  for (const status of declaredList(ctx, 'statuses')) {
    writeFileSync(file, `${v1Line(JSON.stringify(status), 'null')}\n`);
    if (!validate(ctx, file)) findings.push(broke('validate', `validate-rejected-a-declared-status:${status}`));
  }
  // ... and a note carrying text is valid, by design.
  writeFileSync(file, `${v1Line('"OK"', '"a human annotation, with spaces"')}\n`);
  if (!validate(ctx, file)) findings.push(broke('validate', 'validate-rejected-a-free-text-note'));
  return findings;
}

function v1Line(status: string, note: string): string {
  return `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":${status},"tokens_in":0,"tokens_out":0,"duration_ms":1,"note":${note}}`;
}

function append(ctx: CheckContext, file: string, extra: readonly string[]): boolean {
  return runCli(ctx, ['append', file, ...BASE, ...extra]);
}

function validate(ctx: CheckContext, file: string): boolean {
  return runCli(ctx, ['validate', file]);
}

// ENGINEOS_ROOT points the CLI at the tree under validation, so the vocabularies
// it enforces are the ones this run is checking rather than the checkout the
// validator happens to run from.
function runCli(ctx: CheckContext, argv: string[]): boolean {
  const io = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  return runJournal(argv, io) === 0;
}

function lastRecord(file: string): Record<string, unknown> | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const lines = text.split('\n').filter((line) => line !== '');
  const last = lines[lines.length - 1];
  if (last === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(last);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function declaredList(ctx: CheckContext, field: 'span_kinds' | 'statuses'): string[] {
  return stringArray(execJournalBlock(ctx)?.[field]);
}

function declaredBound(ctx: CheckContext): number {
  const declared = execJournalBlock(ctx)?.['max_value_length'];
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared <= 0) return FALLBACK_MAX_VALUE_LENGTH;
  return declared;
}

function broke(boundary: 'append' | 'validate', subject: string): Finding {
  return boundary === 'append'
    ? finding('C27b', 'append-contract-broken', subject)
    : finding('C27b', 'validate-contract-broken', subject);
}
