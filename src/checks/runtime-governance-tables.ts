// Schema helpers for the policy tables the kernel evaluates (src/kernel/table.ts,
// src/kernel/transitions.ts). The kernel fails closed on a malformed row at
// answer time; these let C20, C24, C25 and C26 refuse the same row at validate
// time, against the vocabulary the arm exports, so a broken table never ships.
import { isRecord } from '../lib/json';
import { parseWhen, placeholdersOf, whenProblems, type Vocabulary } from '../kernel/table';

export interface RowShape {
  // The key holding the conjunction: `when` for decision tables, `guard` for
  // transition tables. Absent for rows that test no facts.
  readonly conditionKey?: 'when' | 'guard';
  readonly vocabulary?: Vocabulary;
  // Fields that must be non-empty strings.
  readonly strings: readonly string[];
  // Fields that must be booleans.
  readonly booleans?: readonly string[];
  // The slots the string fields may name; absent means "no slots".
  readonly placeholders?: readonly string[];
}

// The offending part of one row, each as a single token a finding subject can
// carry after the row's path: `action`, `reason{slot}`, `when`, `when.<fact>`.
// An empty list is a well-formed row.
export function rowProblems(row: unknown, shape: RowShape): string[] {
  if (!isRecord(row)) return ['row'];
  const problems: string[] = [];
  for (const field of shape.strings) {
    const value = row[field];
    if (typeof value !== 'string' || value === '') {
      problems.push(field);
      continue;
    }
    for (const slot of placeholdersOf(value)) {
      if (!(shape.placeholders ?? []).includes(slot)) problems.push(`${field}{${slot}}`);
    }
  }
  for (const field of shape.booleans ?? []) {
    if (typeof row[field] !== 'boolean') problems.push(field);
  }
  const key = shape.conditionKey;
  if (key === undefined) return problems;
  const when = parseWhen(row[key]);
  if (typeof when === 'string') return [...problems, key];
  const vocabulary = shape.vocabulary ?? { facts: [] };
  for (const [name, condition] of Object.entries(when)) {
    if (whenProblems({ [name]: condition }, vocabulary).length > 0) problems.push(`${key}.${name}`);
  }
  return problems;
}

// A FIRST table that is a ladder must end in a row with an empty `when`, or
// some load answers nothing and the kernel throws instead of deciding.
export function endsInCatchAll(rows: readonly unknown[]): boolean {
  const last = rows[rows.length - 1];
  if (!isRecord(last)) return false;
  const when = parseWhen(last['when']);
  return typeof when !== 'string' && Object.keys(when).length === 0;
}
