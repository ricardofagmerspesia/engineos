// The Check registry and the id algebra the validate harness selects through.
//
// The bash harness discovered Checks with `declare -F` over sourced family files,
// so a duplicate id meant "last sourced wins" — the failure mode behind the C31
// renumbering. Registration is explicit here: a duplicate is caught by the unit
// test that asserts Set size equals length, and a wrong id fails tsc.
import type { CheckResult } from './findings';
import type { CheckId } from './ids';
import type { CheckContext } from './lib';

export interface Check<C extends CheckId = CheckId> {
  readonly id: C;
  // The family's declared code list, registered beside the check so `finding()`
  // compiles only for a code this check can actually report.
  readonly codes: readonly string[];
  // An empty array means "nothing to print" — a skipOnce dedupe hit, not a pass.
  run(ctx: CheckContext): CheckResult[];
}

// Empty by design: the families append here one PR at a time (plan Tasks 34-41),
// and the harness ships now with an empty registry. Registration order is
// irrelevant — orderIds sorts what the harness runs and lists.
export const CHECKS: readonly Check[] = [];

// Natural id order: the numeric part numerically, then the letter suffix
// lexicographically ('' before 'b'). C2 sorts before C10, which byte order would
// not give, and C17 before C17b.
export function orderIds<T extends string>(ids: readonly T[]): T[] {
  return [...ids].sort((a, b) => {
    const left = idKey(a);
    const right = idKey(b);
    if (left.numeric !== right.numeric) return left.numeric - right.numeric;
    return byteOrder(left.suffix, right.suffix);
  });
}

// `--only` selection. A bare parent id selects its letter-suffixed sub-checks, and
// an id nothing answers to is an error rather than a silent no-op: the flat script
// ran everything on an unmatched --only, which is how a typo looked green.
export function selectIds(ids: readonly CheckId[], only: string): { selected: CheckId[]; unknown: string[] } {
  if (only === ALL) return { selected: [...ids], unknown: [] };
  const wants = only.split(/[\s,]+/).filter((want) => want !== '');
  const known = new Set<string>();
  for (const id of ids) {
    known.add(id);
    known.add(parentOf(id));
  }
  const unknown = wants.filter((want) => !known.has(want));
  const wanted = new Set(wants);
  const selected = ids.filter((id) => wanted.has(id) || wanted.has(parentOf(id)));
  return { selected: [...new Set(selected)], unknown };
}

// -------------------------------------------------------------------- internals

const ALL = 'all';

// `${i%%[a-z]*}` — everything up to the first lowercase letter. C17b -> C17.
function parentOf(id: string): string {
  const cut = id.search(/[a-z]/);
  return cut === -1 ? id : id.slice(0, cut);
}

interface IdKey {
  readonly numeric: number;
  readonly suffix: string;
}

function idKey(id: string): IdKey {
  const matched = /^[^0-9]*([0-9]+)([a-z]*)$/.exec(id);
  const digits = matched?.[1];
  // An id with no numeric part sorts as 0 and orders by its whole text, which is
  // what `sort -k1.2,1n` did with a non-numeric key.
  if (digits === undefined) return { numeric: 0, suffix: id };
  return { numeric: Number.parseInt(digits, 10), suffix: matched?.[2] ?? '' };
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
