// The opt-in embedding tie-break consultation for an ambiguous deterministic
// route (contracts.md@rev3 §10.6). Split out of ./prompt-judge so each
// consultation is its own module; ./prompt-judge decides when it runs.
import { resolve } from '../kernel';
import type { KernelContext } from '../kernel/context';
import { nodeTiebreakDeps, tiebreak, tiebreakEnabled, type TiebreakCandidate } from '../judge/tiebreak';
import type { HookContext } from './output';

// The kernel's `tiebreak` fact (contracts §3.1): intent id -> similarity.
export type TiebreakScores = Record<string, number>;

// §10.6 steps 2-4. Scores only for an ambiguous route with at least two
// survivors, candidates drawn from route.ranked so every key is a ranked id the
// kernel accepts; any other outcome, or any throw, passes no fact.
export async function consultTiebreak(prompt: string, ctx: HookContext, kernel: KernelContext): Promise<TiebreakScores | null> {
  if (!tiebreakEnabled(ctx.io.env)) return null;
  try {
    // The same pure ranking the task contract reports, without a span: the
    // router span belongs to the one resolution the advisor publishes.
    const { route } = resolve({ prompt, escalate: true }, kernel);
    if (route === undefined || !('escalate' in route) || !route.ambiguous || route.intents.length < 2) return null;
    const regs = kernel.registries;
    const exemplars = new Map(regs.intents.intents.map((row): [string, readonly string[]] => [row.id, row.exemplars]));
    const candidates: TiebreakCandidate[] = route.ranked.map((ranked) => ({ id: ranked.id, exemplars: exemplars.get(ranked.id) ?? [] }));
    const redaction = regs.policy.judge.redaction.patterns;
    const outcome = await tiebreak({ text: prompt, ambiguous: true, candidates }, nodeTiebreakDeps(ctx.io.env, redaction));
    return outcome.kind === 'scores' ? outcome.scores : null;
  } catch {
    // Fail open by design: the deterministic answer stands without a fact. The
    // TiebreakScores | null outcome has no field for why, and the route event's
    // shape is frozen (contracts §6.4), so the reason is not recorded.
    return null;
  }
}
