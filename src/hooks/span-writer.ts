import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendLine } from '../journal/exec-journal';
import { appendEvent as appendTelemetryEvent } from '../journal/telemetry';
import { EXEC_JOURNAL_FIELDS, journalRegistries, type SpanFields } from '../journal/schema';
import { hookPathSlug } from '../lib/slug';
import { parseMs } from '../lib/time';
import type { TelemetryEventId } from '../registry/policy-telemetry';

// The storage half of the span lifecycle: two adapters behind one interface, so
// telemetry.ts can own the gate, the clock, the clamp and the slug classes
// without also owning a filesystem. This is the seam the bash helpers never had
// — hook_span called scripts/exec-journal.sh directly, which is why the lifecycle
// could only be tested by creating a git repo.
//
// Neither adapter catches its own errors. The sink wraps every call in one
// place (telemetry.ts `attempt`), so "a write never breaks a hook" is a single
// guarantee rather than one per method per adapter.

// What a kernel-decision event carries. The values the telemetry append boundary
// accepts are exactly these: booleans, numbers, strings and string arrays
// matching registries/policy.json telemetry.value_pattern. Deliberately wider
// than Record<string, string>: the `route` event's own payload is a boolean and
// three arrays of ids.
export type EventData = Record<string, string | number | boolean | readonly string[]>;

export type { SpanFields };

export interface SpanWriter {
  appendSpan(fields: SpanFields): void;
  appendEvent(id: TelemetryEventId, data: EventData): void;
  openMarker(id: string, ms: number): void;
  // The span's START instant, or null when there is no marker to close. The
  // DURATION is the sink's to compute: it owns the clock and the clamp, and a
  // writer that subtracted for it would own a second copy of both.
  closeMarker(id: string): number | null;
}

export interface FileWriterOptions {
  // The EngineOS root, for the registries the journal validates against.
  root: string;
  // <gitdir>/engineos-telemetry, already created by the sink's gate.
  dir: string;
  // Already slugged by the sink; used for run_id/trace_id and both file names.
  session: string;
  // UTC seconds, from the sink's clock, for both append boundaries' timestamps.
  timestamp: () => string;
}

export function fileSpanWriter(opts: FileWriterOptions): SpanWriter {
  const regs = journalRegistries(opts.root);
  // A file name is a PATH COMPONENT, so it takes the narrower class: the session
  // id arrives from the harness, and a value of "../../x" would otherwise write
  // outside the telemetry directory. hook_span narrowed the exec journal's name
  // this way; the events file kept the raw id in bash, which is the hole this
  // port closes (a slug-safe session id names the same file either way).
  const name = hookPathSlug(opts.session) ?? 'nosession';
  const journalFile = join(opts.dir, `${name}.exec.jsonl`);
  const eventsFile = join(opts.dir, `${name}.jsonl`);
  const markers = join(opts.dir, 'spans');
  return {
    appendSpan(fields: SpanFields): void {
      appendLine(opts.root, journalFile, [journalFile, ...toArgv(fields)], opts.timestamp, regs);
    },
    appendEvent(id: TelemetryEventId, data: EventData): void {
      appendTelemetryEvent(
        opts.root,
        eventsFile,
        { session: opts.session, event: id, data: JSON.stringify(data) },
        opts.timestamp,
      );
    },
    openMarker(id: string, ms: number): void {
      const marker = markerPath(markers, id);
      if (marker === null) return;
      mkdirSync(markers, { recursive: true });
      writeFileSync(marker, String(ms));
    },
    closeMarker(id: string): number | null {
      const marker = markerPath(markers, id);
      if (marker === null) return null;
      const text = readMarker(marker);
      if (text === null) return null;
      // Consumed whether or not it parses, so a corrupt marker cannot pin a span
      // id open for the rest of the session.
      rmSync(marker, { force: true });
      return parseMs(text);
    },
  };
}

export interface MemorySpanWriter extends SpanWriter {
  readonly spans: SpanFields[];
  readonly events: { id: TelemetryEventId; data: EventData }[];
  readonly markers: Map<string, number>;
}

// The test adapter. Records instead of writing, and keeps its markers in a Map
// keyed by the id the sink handed it — narrowed the same way the file adapter
// narrows it, so a test asserting on marker names sees what a file would.
export function memorySpanWriter(): MemorySpanWriter {
  const spans: SpanFields[] = [];
  const events: { id: TelemetryEventId; data: EventData }[] = [];
  const markers = new Map<string, number>();
  return {
    spans,
    events,
    markers,
    appendSpan(fields: SpanFields): void {
      spans.push({ ...fields });
    },
    appendEvent(id: TelemetryEventId, data: EventData): void {
      events.push({ id, data });
    },
    openMarker(id: string, ms: number): void {
      const name = hookPathSlug(id);
      if (name === null) return;
      markers.set(name, ms);
    },
    closeMarker(id: string): number | null {
      const name = hookPathSlug(id);
      if (name === null) return null;
      const start = markers.get(name);
      if (start === undefined) return null;
      markers.delete(name);
      return start;
    },
  };
}

// ------------------------------------------------------------------ internals

// The schema table is the flag list. Walking it rather than naming flags keeps
// this file free of the field-name restatement src/journal/schema.ts exists to
// end, and fixes argv order at table order so two spans with the same fields
// produce the same command line.
function toArgv(fields: SpanFields): string[] {
  const argv: string[] = [];
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === undefined) continue;
    argv.push(spec.flag, String(value));
  }
  return argv;
}

// No marker is the ordinary case, not a failure: a close without an open (bypass
// toggled mid-turn, the hook installed mid-session, the directory reaped) writes
// nothing rather than a fabricated duration.
function readMarker(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function markerPath(dir: string, id: string): string | null {
  const name = hookPathSlug(id);
  return name === null ? null : join(dir, name);
}
