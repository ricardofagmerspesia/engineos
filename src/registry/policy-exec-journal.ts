import { loadRegistry } from './load';
import { isRecord } from '../lib/json';
import { strictReader } from './strict';

// The exec-journal half of registries/policy.json .telemetry, read on its own.
//
// It lives beside src/registry/policy.ts rather than inside it because two
// tasks of the TypeScript migration land telemetry fields in the same release:
// this one owns `.telemetry.exec_journal`, the telemetry port owns
// `.telemetry.events` and `.telemetry.value_pattern`. One file per reader keeps
// the two ports from writing the same lines.
export interface ExecJournalPolicy {
  home: string;
  max_value_length: number;
  span_kinds: string[];
  statuses: string[];
}

// scripts/exec-journal.sh carried MAX_VALUE_LEN_FALLBACK="256" so a schema
// contract still runs standalone when the registry says nothing about the
// bound. The number keeps that home here, and only this key is lenient: a
// missing `home`, `span_kinds` or `statuses` is a malformed registry, because
// the vocabularies have no second home to fall back to now that the CLI holds
// no enum literal.
export const MAX_VALUE_LENGTH_FALLBACK = 256;

export function loadExecJournalPolicy(root: string): ExecJournalPolicy {
  const r = strictReader('policy.json');
  const raw = loadRegistry(root, 'policy.json');
  const telemetry = r.requireRecord(isRecord(raw) ? raw['telemetry'] : undefined, '.telemetry');
  const block = r.requireRecord(telemetry['exec_journal'], '.telemetry.exec_journal');
  return {
    home: r.requireString(block['home'], '.telemetry.exec_journal.home'),
    // bash read this through `// empty` and then a digits-only case statement,
    // so an absent, non-numeric or zero value reached the same fallback.
    max_value_length: positiveInteger(block['max_value_length']),
    span_kinds: r.requireStrings(block['span_kinds'], '.telemetry.exec_journal.span_kinds'),
    statuses: r.requireStrings(block['statuses'], '.telemetry.exec_journal.statuses'),
  };
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return MAX_VALUE_LENGTH_FALLBACK;
  return value;
}
