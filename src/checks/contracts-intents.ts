// Raw `registries/intents.json` access for the two contracts this family
// checks: the handoff intent's section list and the record-change intent's
// archive contract.
//
// Why not ctx.registries.intents: the typed loader (src/registry/intents.ts)
// projects the fields the kernel reads, and required_sections,
// required_fields and archive_contract are not among them — this family is
// their only reader. Reading the document here keeps the loader's projection
// honest instead of widening it for one consumer.
//
// Why every accessor answers a default rather than throwing: the bash ran jq,
// and jq on a missing row, a missing key or an unparsable file printed
// nothing, which each check then reported as its own finding. A throw here
// would turn that into a crash the harness never had.
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import type { CheckContext } from './lib';

export const INTENTS_PATH = 'registries/intents.json';

export function intentRow(ctx: CheckContext, id: string): Record<string, unknown> | undefined {
  let document: unknown;
  try {
    document = readJsonFile(join(ctx.root, INTENTS_PATH));
  } catch {
    return undefined;
  }
  if (!isRecord(document)) return undefined;
  const declared: unknown = document['intents'];
  if (!Array.isArray(declared)) return undefined;
  // Annotated rather than inferred: Array.isArray narrows unknown to any[], and
  // an `any` element would silently defeat every guard below it.
  const rows: unknown[] = declared;
  for (const row of rows) {
    if (isRecord(row) && row['id'] === id) return row;
  }
  return undefined;
}

// jq's `select(type=="string")`: a non-string element is not a section name,
// and counting it would let `[42]` satisfy "the list is not empty".
export function stringsAt(source: Record<string, unknown> | undefined, key: string): string[] {
  if (source === undefined) return [];
  const value: unknown = source[key];
  if (!Array.isArray(value)) return [];
  // Annotated rather than inferred: Array.isArray narrows unknown to any[], and
  // an `any` element would silently defeat the string guard below it.
  const items: unknown[] = value;
  return items.filter((item): item is string => typeof item === 'string');
}

export function recordAt(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (source === undefined) return undefined;
  const value: unknown = source[key];
  return isRecord(value) ? value : undefined;
}

// jq's `// empty` piped into a shell variable: an absent key and a non-string
// value both arrive as the empty string.
export function stringAt(source: Record<string, unknown> | undefined, key: string): string {
  if (source === undefined) return '';
  const value: unknown = source[key];
  return typeof value === 'string' ? value : '';
}

// The bash `case "$x" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])` glob,
// which matched the whole word — so this is anchored at both ends.
export const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// `sed -n 's/^<key>: //p' | head -1`: the first line carrying the key with its
// separating space, anywhere in the file. Deliberately not a YAML front-matter
// parser — narrowing it to the front matter would be a different check than the
// one the bash suite pins.
export function firstField(text: string, key: string): string {
  const prefix = `${key}: `;
  for (const line of text.split('\n')) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
  return '';
}

// `sed -n 's/^## //p'` — every second-level heading's text, in document order.
export function headingsOf(text: string): string[] {
  const headings: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) headings.push(line.slice(3));
  }
  return headings;
}

// `grep -qx "## $s"`: the heading must be the whole line, so a longer heading
// that merely starts with the required one does not satisfy it.
export function hasHeading(text: string, section: string): boolean {
  const wanted = `## ${section}`;
  return text.split('\n').some((line) => line === wanted);
}
