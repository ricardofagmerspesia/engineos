// C22*: kernel-decision telemetry — the policy block, the writer's behaviour and
// the wiring in both directions. Ported from scripts/checks/70-runtime.sh's C22
// block. Events live in .git/ on developer machines and a CI clone has none by
// construction, so this family validates the registry and the plumbing, never
// the event data.
// Spec: docs/specs/2026-08-06-decision-kernel-p7-telemetry.md
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import {
  arrayOf,
  child,
  fileHas,
  fileMatches,
  jqText,
  linesWith,
  policyDocument,
  requirePolicy,
  stringsOf,
  telemetryRun,
  wholeNumber,
  withTempDir,
} from './runtime-governance-shared';

export const C22_FINDINGS = [
  'retention-days-not-a-whole-number',
  'retention-days-below-1',
  'value-pattern-missing-or-invalid',
  'events-missing-or-empty',
  'event-ids-have-duplicates',
  'keys-missing-or-empty',
  'written-by-not-an-array',
  'written-by-has-a-non-string-entry',
  'written-by-names-a-missing-file',
  'sample-keys-not-a-subset',
] as const;

export const C22B_FINDINGS = [
  'sample-did-not-round-trip',
  'unknown-event-was-not-rejected',
  'whitespace-value-was-not-rejected',
] as const;

export const C22C_FINDINGS = [
  'does-not-emit-event',
  'event-call-references-prompt-text',
  'emits-but-is-not-declared',
  'sink-references-prompt-text',
  'does-not-read-the-registry-field',
  'hardcoded-retention-literal',
  'lost-the-telemetry-source',
] as const;

declare module './codes' {
  interface CheckCodes {
    C22: (typeof C22_FINDINGS)[number];
    C22b: (typeof C22B_FINDINGS)[number];
    C22c: (typeof C22C_FINDINGS)[number];
  }
}

const TOKEN = 'telemetry';

const C22_TITLE = 'policy.json.telemetry is well-formed';
const C22B_TITLE = 'scripts/telemetry.sh round-trips every registry sample and rejects malformed data';
const C22C_TITLE =
  'telemetry wiring is complete in both directions (every declared writer emits its event, every emitting module is declared), private-copy-free and prompt-text-free';

const HOOKS_DIR = 'src/hooks';
const SINK = 'src/hooks/telemetry.ts';
const SCAFFOLDER = 'src/hooks/ensure-project-layout.ts';
// The sink and the append boundary pass the event id through as a parameter, so
// they never carry a literal call of the shape the reverse walk looks for.
const NOT_A_WRITER = new Set([SINK, 'src/hooks/span-writer.ts']);
const TELEMETRY_SOURCE = 'engineos-telemetry';

interface EventRow {
  readonly id: string;
  readonly row: Record<string, unknown>;
}

export function checkC22(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C22', C22_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const telemetry = child(policyDocument(ctx), 'telemetry');
  const findings: Finding[] = [];

  const retention = wholeNumber(telemetry?.['retention_days']);
  if (retention === undefined) findings.push(finding('C22', 'retention-days-not-a-whole-number'));
  else if (retention < 1) findings.push(finding('C22', 'retention-days-below-1'));

  const valuePattern = telemetry?.['value_pattern'];
  if (typeof valuePattern !== 'string' || valuePattern === '' || !compiles(valuePattern)) {
    findings.push(finding('C22', 'value-pattern-missing-or-invalid'));
  }

  const events = eventRows(telemetry);
  if (events.length < 1) findings.push(finding('C22', 'events-missing-or-empty'));
  if (new Set(events.map((event) => event.id)).size !== events.length) {
    findings.push(finding('C22', 'event-ids-have-duplicates'));
  }

  for (const event of events) findings.push(...eventFindings(ctx, event));
  return [result('C22', C22_TITLE, findings)];
}

export function checkC22b(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C22b', C22B_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const events = eventRows(child(policyDocument(ctx), 'telemetry'));
  const findings: Finding[] = [];

  withTempDir((dir) => {
    events.forEach((event, index) => {
      const file = join(dir, `sample-${index}.jsonl`);
      const sample = JSON.stringify(event.row['sample'] ?? null);
      const appended =
        telemetryRun(ctx, ['append', file, '--session', 'canary', '--event', event.id, '--data', sample, '--ts', '2026-08-06T00:00:00Z']) &&
        nonEmptyFile(file) &&
        telemetryRun(ctx, ['validate', file]);
      if (!appended) findings.push(finding('C22b', 'sample-did-not-round-trip', event.id));
    });

    // The two refusals. An append that SUCCEEDS here is the finding: a writer
    // that accepts an unregistered event, or a value carrying whitespace, is a
    // writer that can store prompt text.
    const negatives = join(dir, 'negatives.jsonl');
    if (telemetryRun(ctx, ['append', negatives, '--session', 'canary', '--event', 'bogus-event', '--data', '{}'])) {
      findings.push(finding('C22b', 'unknown-event-was-not-rejected'));
    }
    if (telemetryRun(ctx, ['append', negatives, '--session', 'canary', '--event', 'route', '--data', '{"intents":["two words"]}'])) {
      findings.push(finding('C22b', 'whitespace-value-was-not-rejected'));
    }
  });
  return [result('C22b', C22B_TITLE, findings)];
}

export function checkC22c(ctx: CheckContext): CheckResult[] {
  const skipped = requirePolicy(ctx, 'C22c', C22C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const events = eventRows(child(policyDocument(ctx), 'telemetry'));
  const findings: Finding[] = [];

  // Forward: every module the registry names as a writer really emits the event.
  // written_by is an array, so an event with two producers gets both checked.
  for (const event of events) {
    for (const writer of stringsOf(event.row, 'written_by')) {
      const call = eventCall(event.id);
      if (!fileHas(ctx, writer, call)) {
        findings.push(finding('C22c', 'does-not-emit-event', `${writer}:${event.id}`));
      }
      // Telemetry stores registry ids, never prompt text: the leak shape is the
      // envelope's own prompt or raw payload reaching an event call.
      if (linesWith(ctx, writer, call).some((line) => /env\.prompt|env\.raw/.test(line))) {
        findings.push(finding('C22c', 'event-call-references-prompt-text', writer));
      }
    }
  }

  // Reverse: every module that emits a registered event is declared as one of
  // that event's writers. Without this half a second hook could start emitting
  // `route` and the registry — which skills/retro and usage-report.sh read to
  // know where events come from — would never say so. *.test.ts are excluded: a
  // test that names an event id asserts on it, it does not produce it.
  const modules = ctx
    .list(HOOKS_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => `${HOOKS_DIR}/${name}`)
    .filter((path) => !NOT_A_WRITER.has(path));
  for (const event of events) {
    for (const module of modules) {
      if (!fileHas(ctx, module, eventCall(event.id))) continue;
      if (!stringsOf(event.row, 'written_by').includes(module)) {
        findings.push(finding('C22c', 'emits-but-is-not-declared', `${module}:${event.id}`));
      }
    }
  }

  // The sink is the real append site, so the prompt-text ban is enforced there
  // too. It takes the whole envelope (it needs cwd and the session id), so
  // `env.prompt` appearing in it at all is the leak.
  if (fileMatches(ctx, SINK, /env\.prompt/)) findings.push(finding('C22c', 'sink-references-prompt-text', SINK));
  if (!fileHas(ctx, SCAFFOLDER, 'loadTelemetryPolicy(')) {
    findings.push(finding('C22c', 'does-not-read-the-registry-field', SCAFFOLDER));
  }
  // bash hardcoded the window as `-mtime "+90"`; the port would hardcode it as a
  // literal in the days argument of a reap call, where the registry value belongs.
  if (fileMatches(ctx, SCAFFOLDER, /(reapIfStale|reapFilesBelow)\(.*, *[0-9]+, *now\)/)) {
    findings.push(finding('C22c', 'hardcoded-retention-literal', SCAFFOLDER));
  }
  for (const reader of ['skills/retro/SKILL.md', 'scripts/usage-report.sh']) {
    if (!fileHas(ctx, reader, TELEMETRY_SOURCE)) {
      findings.push(finding('C22c', 'lost-the-telemetry-source', reader));
    }
  }
  return [result('C22c', C22C_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// A writer names its event at the sink — `event(sink, '<id>', ...)` from
// src/hooks/telemetry.ts — instead of spelling out a `--event <id>` CLI call, so
// that call shape is what both directions look for. The id is still a literal at
// the call site, which is what makes the roster checkable at all.
function eventCall(id: string): string {
  return `event(sink, '${id}'`;
}

function eventRows(telemetry: Record<string, unknown> | undefined): EventRow[] {
  const rows: EventRow[] = [];
  for (const entry of arrayOf(telemetry, 'events') ?? []) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    rows.push({ id: jqText(row['id']), row });
  }
  return rows;
}

function eventFindings(ctx: CheckContext, event: EventRow): Finding[] {
  const findings: Finding[] = [];
  const keys = arrayOf(event.row, 'keys');
  if ((keys ?? []).length < 1) findings.push(finding('C22', 'keys-missing-or-empty', event.id));

  const writtenBy = arrayOf(event.row, 'written_by');
  if (writtenBy === undefined || writtenBy.length < 1) {
    findings.push(finding('C22', 'written-by-not-an-array', event.id));
  } else {
    const writers = writtenBy.filter((item): item is string => typeof item === 'string');
    if (writers.length !== writtenBy.length) {
      findings.push(finding('C22', 'written-by-has-a-non-string-entry', event.id));
    }
    for (const writer of writers) {
      if (!ctx.exists(writer)) {
        findings.push(finding('C22', 'written-by-names-a-missing-file', `${event.id}:${writer}`));
      }
    }
  }

  // Only checkable against a declared key list; jq answered no finding when
  // `.keys` was absent, and so does this.
  const sample = event.row['sample'];
  if (keys !== undefined && typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
    const declared = new Set(keys.map(jqText));
    const extra = Object.keys(sample).filter((key) => !declared.has(key));
    if (extra.length > 0) findings.push(finding('C22', 'sample-keys-not-a-subset', event.id));
  }
  return findings;
}

// `printf x | grep -qE "$pattern"` with exit status 2 as the failure: an ERE the
// engine refuses. JavaScript's RegExp is the engine this port greps with, so it
// is the one that decides.
function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function nonEmptyFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}
