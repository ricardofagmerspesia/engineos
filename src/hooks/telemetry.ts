import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { gitDir, repoRoot } from '../lib/git';
import { fileSpanWriter, type EventData, type SpanFields, type SpanWriter } from './span-writer';
import { EXEC_JOURNAL_FIELDS } from '../journal/schema';
import { isRecord } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { clampMs } from '../lib/time';
import type { CapabilityId } from '../registry/capabilities';
import type { ModelTierId } from '../registry/models';
import type { SpanKind, SpanStatus } from '../registry/policy-exec-journal';
import type { TelemetryEventId } from '../registry/policy-telemetry';

// The span lifecycle as an interface (design "Span lifecycle").
//
// Nine bash helpers used to leave the ordering, the id derivation and the flag
// validity to the caller: the ENGINEOS_TELEMETRY=0 guard was checked in five
// places, the duration clamp appeared three times, the two announce hooks
// derived the span id twice under a comment saying the copies must match, and a
// wrong --capability-id was caught after the fact by grepping the writers
// (check C27f, deleted with this port). Here the gate, the clock, the clamp, the
// slug classes, run_id = trace_id = session and tokens = 0 live in ONE place —
// the sink — and callers pass facts. No caller names a flag, a file or a slug
// class, and a wrong capability, tier, kind or status does not compile.
//
// Bypass arrives as a parameter rather than an import: src/hooks/bypass.ts owns
// the switch, and a sink that read it directly would bind the two modules
// together for one boolean. The hook adapter passes bypassActive(...).

export type { EventData, SpanFields };

// Opaque handle: the gate is already decided, the clock and the writer are
// already bound. Callers hold it and pass it back; nothing outside this module
// reads its fields.
export interface Sink {
  readonly writer: SpanWriter;
  readonly now: () => number;
  readonly session: string;
}

// What a caller knows about a span. Everything else — who the trace belongs to,
// how long it took, what a field's character class is — the sink knows.
export interface SpanFacts {
  kind: SpanKind;
  capability: CapabilityId;
  modelTier: ModelTierId;
  status?: SpanStatus;
  fields?: SpanFields;
}

export function telemetrySink(env: HookEnvelope, ctx: HookContext, opts: { bypassed: boolean }): Sink | null {
  // Order matters: the switch is read BEFORE anything touches the repo, because
  // resolving the directory CREATES it and ENGINEOS_TELEMETRY=0 must leave no
  // trace at all. bash checked it in both span helpers for the same reason.
  if (ctx.io.env['ENGINEOS_TELEMETRY'] === '0') return null;
  if (opts.bypassed) return null;
  if (env.cwd === '') return null;
  // Telemetry is never written into a project that did not adopt EngineOS. The
  // marker is .engineos/ at the WORKING TREE root, which is neither ctx.root nor
  // dirname(gitDir): ctx.root is the EngineOS checkout the registries are read
  // from, and a worktree's git dir does not sit beside its tree. Two git calls,
  // as bash made.
  const project = repoRoot(env.cwd, ctx.spawn);
  if (project === null || !existsSync(join(project, '.engineos'))) return null;
  const git = gitDir(env.cwd, ctx.spawn);
  if (git === null || git === '') return null;
  const dir = join(git, 'engineos-telemetry');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // bash's `mkdir -p ... || true`, and then the writes fail one by one.
  }
  const session = hookSlug(env.sessionId === '' ? 'nosession' : env.sessionId);
  const now = ctx.now;
  return {
    writer: fileSpanWriter({ root: ctx.root, dir, session, timestamp: () => utcSeconds(now()) }),
    now,
    session,
  };
}

// The test seam. Binds a writer and a clock with the gate already answered
// "yes", so the lifecycle is exercised without a git repo or a filesystem.
export function sinkForTests(writer: SpanWriter, now: () => number, session: string = 'nosession'): Sink {
  return { writer, now, session };
}

// Times fn, writes one span, returns fn's own result. fn's exceptions propagate
// untouched — a hook's work is not telemetry's to swallow — and no span is
// written for a throw, because a duration without an outcome is noise. The
// write itself never throws.
export function withSpan<T>(
  sink: Sink | null,
  facts: SpanFacts,
  fn: () => { result: T; status: SpanStatus; fields?: SpanFields },
): T {
  if (sink === null) return fn().result;
  const start = sink.now();
  const outcome = fn();
  const duration = clampMs(sink.now() - start);
  const merged: SpanFacts = {
    ...facts,
    status: outcome.status,
    fields: { ...(facts.fields ?? {}), ...(outcome.fields ?? {}) },
  };
  writeSpan(sink, merged, duration, null);
  return outcome.result;
}

// The ONE id derivation both announce hooks call. The harness's tool-use id when
// there is one; otherwise a hash of the brief, which is still joinable by
// trace_id and collapses only when the same agent is dispatched twice
// concurrently with the same description.
//
// The hashed bytes are `<type>:<description>\n`, trailing newline included:
// bash piped `jq -r` into `shasum`, and jq -r terminates its output with a
// newline that shasum then hashed. Dropping it would produce a different id from
// the bash hooks, and during the migration window a marker opened by one and
// closed by the other must match.
export function spanIdFrom(env: HookEnvelope): string {
  const payload = isRecord(env.raw) ? env.raw : {};
  const toolUseId = payload['tool_use_id'];
  if (typeof toolUseId === 'string' && toolUseId !== '') return hookSlug(toolUseId);
  const input = isRecord(payload['tool_input']) ? payload['tool_input'] : {};
  // jq's `// ""` reads null and false as absent; a non-string value made the
  // bash `+` fail outright, which this treats as absent too.
  const brief = `${orEmpty(input['subagent_type'])}:${orEmpty(input['description'])}\n`;
  return hookSlug(createHash('sha1').update(brief, 'utf8').digest('hex').slice(0, 12));
}

// Records this span's start instant where a LATER hook process can find it:
// PreToolUse and PostToolUse are separate processes, so the instant has to
// survive on disk.
export function openSpan(sink: Sink | null, id: string): void {
  if (sink === null || id === '') return;
  const started = sink.now();
  attempt(() => {
    sink.writer.openMarker(id, started);
  });
}

// Closes the span openSpan started. No marker means no span: a close without an
// open writes nothing rather than a fabricated duration.
export function closeSpan(sink: Sink | null, id: string, facts: SpanFacts): void {
  if (sink === null || id === '') return;
  // Initialised rather than declared: a variable only assigned inside a try is
  // read as possibly-unassigned after it, even when the catch returns.
  let start: number | null = null;
  try {
    start = sink.writer.closeMarker(id);
  } catch {
    return;
  }
  if (start === null) return;
  writeSpan(sink, facts, clampMs(sink.now() - start), id);
}

// One kernel-decision event. A key outside the event's declared keys
// (registries/policy.json .telemetry.events[].keys), or a value outside the
// value pattern, is REFUSED by the append boundary — which means this call
// writes nothing and returns normally. It never throws: evidence must not become
// a gate, and a hook that died because a payload was malformed would be a worse
// failure than the missing line.
export function event(sink: Sink | null, id: TelemetryEventId, data: EventData): void {
  if (sink === null) return;
  attempt(() => {
    sink.writer.appendEvent(id, data);
  });
}

// ------------------------------------------------------------------ internals

function writeSpan(sink: Sink, facts: SpanFacts, durationMs: number, spanId: string | null): void {
  const fields: SpanFields = {
    // run_id and trace_id are both the session, so every span of one session
    // joins without four call sites repeating it. Tokens are 0 because a hook
    // cannot see a subagent's usage; a caller that CAN (the headless runner)
    // passes its own through facts.fields, which is spread after these.
    run_id: sink.session,
    trace_id: sink.session,
    span_kind: facts.kind,
    tokens_in: 0,
    tokens_out: 0,
    ...(facts.fields ?? {}),
    // Named facts last: a fields entry may override the defaults above, but it
    // cannot contradict the four values the signature made the caller state.
    capability_id: facts.capability,
    model_tier: facts.modelTier,
    status: facts.status ?? 'OK',
    duration_ms: durationMs,
  };
  if (spanId !== null) fields.span_id = spanId;
  const row = sanitize(fields);
  attempt(() => {
    sink.writer.appendSpan(row);
  });
}

// hookSlug on every field the journal guards with the slug class, and on the
// enumerated ones whose members are slugs anyway. The numeric, boolean and
// free-text rows are left alone: slugging `note` would destroy the one field
// that exists to carry prose, and slugging a number is a no-op that only hides
// which rows the class actually protects. Walking the schema table also fixes
// the row order, so two spans with the same fields produce the same line.
function sanitize(fields: SpanFields): SpanFields {
  const row: SpanFields = {};
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === undefined) continue;
    row[spec.name] = spec.guard === 'slug' || spec.guard === 'enum' ? hookSlug(String(value)) : value;
  }
  return row;
}

function attempt(write: () => void): void {
  try {
    write();
  } catch {
    // Every write swallows its own errors, in one place rather than one per
    // adapter method: telemetry is evidence, and evidence must not become a gate.
  }
}

function orEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// `date -u +%Y-%m-%dT%H:%M:%SZ` — seconds, no fraction, the same stamp both
// append boundaries default to.
function utcSeconds(ms: number): string {
  // Date's own range is +/-8.64e15 ms; toISOString throws outside it, and a
  // throwing clock inside a write would defeat the point of swallowing writes.
  const at = Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : 0;
  return `${new Date(at).toISOString().slice(0, 19)}Z`;
}
