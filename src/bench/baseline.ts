import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { hostId, type HostMetadata } from './host';
import type { LifecycleReport } from './lifecycle';

// Injected so a test drives the whole ladder without touching a disk, matching
// the seam BenchDeps already establishes for spawning.
export interface BaselineIo {
  read: (path: string) => string | null;
  write: (path: string, text: string) => void;
}

export interface Regression {
  scenario: string;
  reason: 'slower' | 'no-baseline';
  currentP50Ms: number;
  baselineP50Ms: number | null;
}

export function baselinePath(root: string, meta: HostMetadata): string {
  return join(root, 'docs', 'perf', 'baselines', `${hostId(meta)}.json`);
}

export function writeBaseline(io: BaselineIo, root: string, report: LifecycleReport): string {
  const path = baselinePath(root, report.host);
  io.write(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

// The single sanctioned read path for a recorded baseline (program plan R4).
// A consumer that cannot import it resolves the file with baselinePath rather
// than globbing docs/perf/baselines, so every reader shares one hostId
// derivation.
export function readBaseline(io: BaselineIo, root: string, meta: HostMetadata): LifecycleReport | null {
  const text = io.read(baselinePath(root, meta));
  if (text === null) return null;
  try {
    // The file is written by this module, so a parse failure means it was
    // hand-edited or truncated. Refusing beats silently measuring against a
    // half-read baseline and reporting green.
    return JSON.parse(text) as LifecycleReport;
  } catch {
    throw new KernelError(`${baselinePath(root, meta)} is not valid JSON — re-record it with 'engineos bench baseline --write'`);
  }
}

// Relative FIRST: the spec's targets are ratios against the baseline recorded on
// the same host, so a slower CI box does not fail a change that made nothing
// slower. But a ratio alone cannot judge a spawn-bound measurement — at a ~63ms
// p50, the 10% band is 6ms, and process scheduling moves a p50 further than that
// between two runs of identical code. So a regression must ALSO clear floorMs in
// absolute terms. The floor is what makes the gate mean something: below it the
// instrument cannot tell a change from the machine, and a gate that fires on
// noise trains everyone to ignore it.
export function compare(
  current: LifecycleReport,
  baseline: LifecycleReport,
  tolerance: number,
  floorMs: number,
): Regression[] {
  const previous = new Map(baseline.scenarios.map((entry) => [entry.scenario, entry.p50Ms]));
  const found: Regression[] = [];
  for (const scenario of current.scenarios) {
    const before = previous.get(scenario.scenario);
    if (before === undefined) {
      found.push({ scenario: scenario.scenario, reason: 'no-baseline', currentP50Ms: scenario.p50Ms, baselineP50Ms: null });
      continue;
    }
    if (scenario.p50Ms > before * (1 + tolerance) && scenario.p50Ms - before > floorMs) {
      found.push({ scenario: scenario.scenario, reason: 'slower', currentP50Ms: scenario.p50Ms, baselineP50Ms: before });
    }
  }
  return found;
}
