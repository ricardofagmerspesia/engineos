// Test-only fixtures for the runtime-governance family: the JSON mutations its
// cases apply to a checkout copy. Never bundled — only *.test.ts imports this.
//
// The bash cases mutated registries with `python3 -c "import json; ..."`; these
// are the same edits, expressed against the copy's own file so a malformed
// result fails the test that wrote it rather than the check under test.
import { isRecord } from '../lib/json';
import { editFile } from './testing';

export const POLICY = 'registries/policy.json';

export function editJson(root: string, relativePath: string, mutate: (doc: Record<string, unknown>) => void): void {
  editFile(root, relativePath, (text) => {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error(`${relativePath} is not a JSON object`);
    mutate(parsed);
    return JSON.stringify(parsed, null, 2);
  });
}

// The three policy blocks this family mutates are all one level down, so the
// cases read as "edit .repair" rather than as two lines of narrowing each.
export function editPolicyBlock(root: string, block: string, mutate: (value: Record<string, unknown>) => void): void {
  editJson(root, POLICY, (doc) => {
    mutate(recordAt(doc, block));
  });
}

export function recordAt(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = doc[key];
  if (!isRecord(value)) throw new Error(`${key} is not an object`);
  return value;
}

export function arrayAt(doc: Record<string, unknown>, key: string): unknown[] {
  const value = doc[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

export function stringsAt(doc: Record<string, unknown>, key: string): string[] {
  return arrayAt(doc, key).map((item) => {
    if (typeof item !== 'string') throw new Error(`${key} carries a non-string entry`);
    return item;
  });
}

export function rowById(rows: readonly unknown[], id: string): Record<string, unknown> {
  return rowWhere(rows, 'id', id);
}

// repair.by_situation rows are keyed by `situation`, not `id`.
export function rowWhere(rows: readonly unknown[], key: string, value: string): Record<string, unknown> {
  for (const row of rows) if (isRecord(row) && row[key] === value) return row;
  throw new Error(`no row with ${key} ${value}`);
}

// `sed -i` of one literal, asserting the literal was there: a mutation that
// silently matched nothing would leave a case asserting on an untouched tree.
export function replaceOnce(text: string, needle: string | RegExp, replacement: string): string {
  const next = text.replace(needle, replacement);
  if (next === text) throw new Error(`mutation matched nothing: ${String(needle)}`);
  return next;
}
