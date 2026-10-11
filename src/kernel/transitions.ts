import { KernelError } from '../lib/json';
import { matches, requireResolvable, type TableInput, type When } from './table';

// A state machine whose edges are registry rows: leaving `from`, the first row
// whose guard holds names the next state, whether the call is allowed, and the
// prose the answer carries. The arm measures the guard facts; the table decides.
export interface Transition {
  readonly from: string;
  readonly guard: When;
  readonly to: string;
  readonly allow: boolean;
  readonly reason: string;
}

export function leaves(rows: readonly Transition[], from: string): boolean {
  return rows.some((row) => row.from === from);
}

export function step<T extends Transition>(rows: readonly T[], from: string, input: TableInput): T {
  const leaving = rows.filter((row) => row.from === from);
  requireResolvable(leaving.map((row) => row.guard), input);
  const row = leaving.find((candidate) => matches(candidate.guard, input));
  // A state with edges but none for these facts is an incomplete table, never
  // an implicit "stay where you are".
  if (row === undefined) throw new KernelError(`policy transition table has no edge leaving ${from} for these facts`);
  return row;
}

// Every state reachable from `start` by following edges, `start` included —
// what a schema check needs to prove no declared state is a dead end or an
// island.
export function reachableFrom(rows: readonly Transition[], start: string): Set<string> {
  const seen = new Set<string>([start]);
  const frontier = [start];
  for (let state = frontier.pop(); state !== undefined; state = frontier.pop()) {
    for (const row of rows) {
      if (row.from !== state || seen.has(row.to)) continue;
      seen.add(row.to);
      frontier.push(row.to);
    }
  }
  return seen;
}
