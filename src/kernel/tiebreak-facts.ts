import { KernelError, isRecord } from '../lib/json';
import type { TiebreakPolicy } from '../registry/policy-router';
import type { Registries } from './context';
import type { RankedIntent } from './route';

// The embedding tie-break fact (contracts.md@rev3 §3.1) and the selection it
// feeds (§4.7). The kernel never imports src/judge/** (decision D5): the fact is
// the client's `scores` outcome passed through unchanged, so this module only
// checks it against the registries and the deterministic ranking. Nothing here
// reads a clock, network or env, which keeps `prompt` + a journaled fact
// replayable offline.

// intent id -> similarity in [0,1]. Sparse: an absent id is unscored, never 0.
export type TiebreakFact = Record<string, number>;

// Read key by key rather than cast. Only active intents are ever offered to the
// client, so a disabled or unknown id is a broken caller, not evidence.
export function tiebreakFact(value: unknown, regs: Registries): TiebreakFact {
  if (!isRecord(value)) throw new KernelError('resolve --facts: tiebreak must be an object');
  const active = new Set(regs.intents.intents.filter((intent) => intent.active).map((intent) => intent.id));
  const fact: TiebreakFact = {};
  for (const [id, score] of Object.entries(value)) {
    if (!active.has(id)) throw new KernelError(`resolve --facts: unknown fact tiebreak.${id}`);
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new KernelError(`resolve --facts: tiebreak.${id} must be a number in [0,1]`);
    }
    fact[id] = score;
  }
  return fact;
}

// The ranking is a pure function of prompt and registries, so a score for a
// candidate the kernel never ranked cannot come from a faithful replay.
export function refuseUnrankedTiebreak(fact: TiebreakFact, ranked: readonly RankedIntent[]): void {
  const rankedIds = new Set(ranked.map((candidate) => candidate.id));
  for (const id of Object.keys(fact)) {
    if (!rankedIds.has(id)) throw new KernelError(`resolve --facts: tiebreak.${id} is not a ranked candidate`);
  }
}

// Fewer than this many survivors leaves nothing to break (§4.7 step 1).
const MIN_SURVIVORS = 2;

// Contract §4.7 step 4 accepts a gap >= margin, but the gap is a binary
// floating-point subtraction: 0.7 - 0.6 is 0.09999999999999998, which a literal
// comparison would refuse against an authored margin of 0.1. Similarities are
// in [0,1] with far fewer meaningful digits than this, so the tolerance only
// absorbs subtraction error and never turns a real shortfall into a selection.
// min_similarity needs no tolerance: it compares an authored score with an
// authored threshold, with no arithmetic in between.
const SCORE_GAP_TOLERANCE = 1e-9;

interface ScoredSurvivor {
  id: string;
  score: number;
  rankedIndex: number;
}

// §4.7 steps 1-4. Returns the winning survivor, or null when any step fails:
// the kernel never narrows on missing evidence, so one unscored survivor (beyond
// top_k, without exemplars, or dropped by the client's limits) blocks selection.
export function tiebreakWinner(
  survivors: readonly string[],
  ranked: readonly RankedIntent[],
  fact: TiebreakFact,
  policy: TiebreakPolicy,
): string | null {
  if (survivors.length < MIN_SURVIVORS) return null;
  const scores = new Map(Object.entries(fact));
  const rankedIndexOf = new Map(ranked.map((candidate, index) => [candidate.id, index]));
  const scored: ScoredSurvivor[] = [];
  for (const id of survivors) {
    const score = scores.get(id);
    const rankedIndex = rankedIndexOf.get(id);
    if (score === undefined || rankedIndex === undefined) return null;
    scored.push({ id, score, rankedIndex });
  }
  scored.sort((a, b) => b.score - a.score || a.rankedIndex - b.rankedIndex);
  const [best, second] = scored;
  if (best === undefined || second === undefined) return null;
  if (best.score < policy.min_similarity) return null;
  if (best.score - second.score + SCORE_GAP_TOLERANCE < policy.margin) return null;
  return best.id;
}
