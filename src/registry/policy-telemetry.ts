import { loadRegistry } from './load';
import { strictReader } from './strict';

// The telemetry CLI's half of registries/policy.json. Deliberately a sibling of
// policy.ts rather than a section of it: the kernel never reads the telemetry
// block, and the telemetry CLI never reads the kernel's, so binding them into one
// loader would make each one's refusals the other's problem.

// The kernel-decision event ids as a literal union, in registry order. The
// loaded TelemetryPolicy carries the same ids plus each event's declared keys —
// that is what the append boundary validates against; this is what a caller
// names, so an unknown event id is a compile error rather than a swallowed
// append.
//
// policy-telemetry.test.ts pins the list to .telemetry.events[].id, order included.
export const TELEMETRY_EVENT_IDS = ['route', 'decision-rules', 'verify', 'hitl'] as const;

export type TelemetryEventId = (typeof TELEMETRY_EVENT_IDS)[number];

export interface TelemetryEvent {
  id: string;
  keys: string[];
}

export interface TelemetryPolicy {
  home: string;
  retention_days: number;
  value_pattern: string;
  events: TelemetryEvent[];
}

const reader = strictReader('policy.json');

export function loadTelemetryPolicy(root: string): TelemetryPolicy {
  const document = reader.requireRecord(loadRegistry(root, 'policy.json'), '');
  const telemetry = reader.requireRecord(document['telemetry'], '.telemetry');
  return {
    home: reader.requireString(telemetry['home'], '.telemetry.home'),
    retention_days: reader.requireNumber(telemetry['retention_days'], '.telemetry.retention_days'),
    value_pattern: reader.requireString(telemetry['value_pattern'], '.telemetry.value_pattern'),
    events: reader.requireRows(telemetry['events'], '.telemetry.events').map((row, i) => ({
      id: reader.requireString(row['id'], `.telemetry.events[${i}].id`),
      keys: reader.requireStrings(row['keys'], `.telemetry.events[${i}].keys`),
    })),
  };
}
