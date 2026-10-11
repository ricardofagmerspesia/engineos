import { resolveRoot } from '../registry/paths';
import { loadPolicy, type InfraPattern } from '../registry/policy';
import type { RunnerKind } from './runner';

// The Validation gate's central question — is this failure the code's fault or
// the tooling's — stated once, as one table.
//
// It used to be encoded four times in three languages: stop-verify.sh exited
// silently below node 18, lib-runner.sh carried a "target was never there"
// regex per adapter, and kernel.sh `repair --situation infra` answered a
// question no hook ever asked it. Consumers render the verdict and never
// re-judge: the Stop gate blocks only on `red`.

// Pinned to registries/policy.json .repair.by_situation[].situation by unit
// test — the kernel's repair arm is what answers for each member, so the two
// lists cannot drift.
export const SITUATIONS = ['red', 'infra', 'flaky'] as const;
export type Situation = (typeof SITUATIONS)[number];

export type InfraReason = 'node-too-old' | 'runner-missing' | 'target-absent' | 'timeout';

export type Evidence =
  | { kind: 'environment'; nodeMajor: number } // after runnerEnv's PATH fix
  | { kind: 'runner'; found: boolean }
  | {
      kind: 'run';
      runner: RunnerKind;
      target: string;
      code: number;
      output: string;
      timedOut: boolean;
    };

export type Verdict = { situation: 'red' } | { situation: 'infra'; reason: InfraReason };

// Below this major, ESLint 9 and vitest cannot start at all (no structuredClone),
// so every check they drive fails for a reason no code edit can fix.
const NODE_FLOOR = 18;

// Every runner, so the C20 schema check can demand an infra_patterns row for
// each: typed over the whole RunnerKind, the compiler refuses a runner added
// without an entry here.
export const RUNNER_KINDS: Readonly<Record<RunnerKind, true>> = { nx: true, 'npm-family': true, python: true };

// The reasons a registry infra pattern may render. The python row renders
// `runner-missing`, never a stale target: a Python target has no script to go
// stale — hasTarget read pyproject.toml — but the TOOL can be missing from the
// environment that was found (design §A1.4).
export const INFRA_PATTERN_REASONS = ['target-absent', 'runner-missing'] as const;

// One row per situation, in order. Null means there is nothing to judge: a green
// run, a node new enough, a runner that was found. The "target was never there"
// patterns are registries/policy.json .repair.infra_patterns, read only when a
// nonzero run needs them; a caller already holding the registry passes them in.
export function classify(evidence: Evidence, infraPatterns?: readonly InfraPattern[]): Verdict | null {
  switch (evidence.kind) {
    case 'environment':
      return evidence.nodeMajor < NODE_FLOOR ? { situation: 'infra', reason: 'node-too-old' } : null;
    case 'runner':
      return evidence.found ? null : { situation: 'infra', reason: 'runner-missing' };
    case 'run': {
      // A target killed by its budget could not report on the code, so it is a
      // tooling gap and consumes no fix attempt (design deviation 7).
      if (evidence.timedOut) return { situation: 'infra', reason: 'timeout' };
      if (evidence.code === 0) return null;
      // hasTarget already said yes, so this is a last-resort guard against a
      // stale probe: an Nx cache answering for a target that has gone, or a
      // jq-free script probe matching the word elsewhere in package.json.
      const row = (infraPatterns ?? registryPatterns()).find((entry) => entry.runner === evidence.runner);
      if (row !== undefined && infraRegExp(row.pattern, evidence.target).test(evidence.output)) {
        return { situation: 'infra', reason: row.reason };
      }
      return { situation: 'red' };
    }
  }
}

const loadedPatterns = new Map<string, readonly InfraPattern[]>();

function registryPatterns(): readonly InfraPattern[] {
  const root = resolveRoot(process.env);
  const cached = loadedPatterns.get(root);
  if (cached !== undefined) return cached;
  const patterns = loadPolicy(root).repair.infra_patterns;
  loadedPatterns.set(root, patterns);
  return patterns;
}

// `<t>` is the target name, which the package-manager runners quote in their own
// "no such script" wording. Each pattern is anchored to its runner's phrasing so
// a missing binary or a genuinely failing check matches nothing and stays red.
export function infraRegExp(pattern: string, target: string): RegExp {
  return new RegExp(pattern.split('<t>').join(escapeRegExp(target)), 'i');
}

// The bash interpolated the target into an ERE unescaped. A target name is a
// package.json key and can carry regex metacharacters, so escape it: an
// over-broad pattern here would read a genuine red as a missing target.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
