import { KernelError } from '../lib/json';
import type { HostMetadata } from './host';

// The four phases a task's wall-clock divides into. Reporting one total hides
// which half is slow, which is the failure the existing five-budget bench has:
// it measures kernel internals and says nothing about a completed task.
export type LifecyclePhase = 'routing' | 'execution' | 'integration' | 'verification';

// `null` means NOT OBSERVED, and is the only honest value where the measuring
// process cannot see the number. A zero here would read as "free", which is the
// exact defect this schema exists to remove from the agent spans.
export interface LifecycleSample {
  scenario: string;
  phase: LifecyclePhase;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  cacheHit: boolean | null;
  retries: number;
}

export interface ScenarioResult {
  scenario: string;
  p50Ms: number;
  p95Ms: number;
  dispatches: number;
  contextBytes: number;
  samples: LifecycleSample[];
}

export interface LifecycleReport {
  host: HostMetadata;
  scenarios: ScenarioResult[];
}

// Nearest-rank, which needs no interpolation and therefore always returns a
// value that was actually measured. With few samples an interpolated p95 is a
// number no run produced, and a budget asserted against it is asserted against
// a fiction.
export function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) throw new KernelError('a percentile has no samples to rank');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  const clamped = Math.min(Math.max(index, 0), sorted.length - 1);
  const value = sorted[clamped];
  // noUncheckedIndexedAccess: the clamp guarantees the index is in range, but
  // the type does not, and an assertion here would be the `as` the rules forbid.
  if (value === undefined) throw new KernelError('a percentile index fell outside its own series');
  return value;
}

export function summarize(
  scenario: string,
  samples: readonly LifecycleSample[],
  contextBytes: number,
  dispatches: number,
): ScenarioResult {
  const durations = samples.map((entry) => entry.durationMs);
  return {
    scenario,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    dispatches,
    contextBytes,
    samples: samples.map((entry) => ({ ...entry })),
  };
}
