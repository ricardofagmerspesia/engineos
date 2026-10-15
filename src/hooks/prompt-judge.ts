// The prompt advisor's semantic half: consult the opt-in Jev judge for one user
// prompt and turn its outcome into the fact the kernel folds, plus the span
// outcome and the judge event's data (contracts.md@rev3 §10.5); and consult the
// opt-in embedding tie-break for an ambiguous deterministic route (§10.6).
//
// Split out of ./prompt-advisor so each file stays one concern. The telemetry
// CALLS stay in the advisor — contracts §6.4 names it as the judge event's
// writer, and it owns the sink — so this module only answers what to record.
// This entry decides when each consultation runs; the consultations live in
// ./prompt-judge-consult and ./prompt-judge-tiebreak, the repository facts in
// ./prompt-judge-facts and the judge event's shape in ./prompt-judge-telemetry.
import type { Registries } from '../kernel';
import type { KernelContext } from '../kernel/context';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { consultJudge, type Consultation } from './prompt-judge-consult';
import { consultTiebreak, type TiebreakScores } from './prompt-judge-tiebreak';

export { NOT_USER_INPUT, type Consultation } from './prompt-judge-consult';
export { judgeEventData } from './prompt-judge-telemetry';
export type { TiebreakScores } from './prompt-judge-tiebreak';

export interface Semantics {
  consultation: Consultation;
  tiebreak: TiebreakScores | null;   // null: no scores to pass, the deterministic answer stands
}

// Both opt-in consultations for one prompt. The deterministic route does not
// depend on the judge, so the tie-break runs beside it inside the same budget
// (its own 150 ms deadline under the judge's guard). The one exception is an
// enabled authoritative judge: its `jev` fact folds, and the kernel ignores a
// tie-break on the fold, so the client is consulted only after the judge
// answered something else (§10.6 step 2).
export async function consultSemantics(env: HookEnvelope, ctx: HookContext, kernel: KernelContext): Promise<Semantics> {
  const regs = kernel.registries;
  if (judgeMayFold(ctx, regs)) {
    const consultation = await consultJudge(env, ctx, regs);
    const scores = folds(consultation) ? null : await consultTiebreak(env.prompt, ctx, kernel);
    return { consultation, tiebreak: scores };
  }
  const [consultation, scores] = await Promise.all([consultJudge(env, ctx, regs), consultTiebreak(env.prompt, ctx, kernel)]);
  return { consultation, tiebreak: scores };
}

// ------------------------------------------------------------------ internals

// An unreadable judge block declares no `jev` fact, so nothing can fold.
function judgeMayFold(ctx: HookContext, regs: Registries): boolean {
  try {
    const policy = regs.policy.judge;
    return policy.mode === 'authoritative' && ctx.io.env[policy.enabled_env] === policy.enabled_value;
  } catch {
    return false;
  }
}

function folds(consultation: Consultation): boolean {
  const { fact, policy } = consultation;
  return fact !== null && fact.source === 'jev' && policy !== null && policy.mode === 'authoritative';
}
