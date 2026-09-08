// Live tier of scripts/run-evals.sh — opt-in model grading of the intent set.
//
// The contract under test is the router announcement CLAUDE.md mandates. Without
// ENGINEOS_EVAL_LIVE=1, or without the `claude` CLI, the tier reports SKIPPED with
// a count. It is never reported as passed: a golden set that silently grades
// nothing is worse than no set at all, because it produces a green line.
//
// The model call is injected rather than taken: a test must be able to grade a
// canned transcript, and the suite must never spend money or need a login.
import type { Io } from '../io';
import { INTENTS, grader, jqLength, jqString, jqWords, nonEmptyLines, parseCase, type TierCounts } from './deterministic';

export interface LiveDeps {
  env: NodeJS.ProcessEnv;
  hasClaude: () => boolean;
  runClaude: (prompt: string) => string;
}

export interface LiveResult extends TierCounts { skipped: number }

const ROUTER_MARKER = '[router]';

export function runLiveTier(root: string, io: Io, intentCount: number, deps: LiveDeps): LiveResult {
  const g = grader(io);
  io.out('\n== live tier ==\n');

  if (deps.env['ENGINEOS_EVAL_LIVE'] !== '1') {
    io.out(`SKIP ${intentCount} intent cases — set ENGINEOS_EVAL_LIVE=1 to grade against a live model\n`);
    return { ...g.counts(), skipped: intentCount };
  }
  if (!deps.hasClaude()) {
    io.out(`SKIP ${intentCount} intent cases — ENGINEOS_EVAL_LIVE=1 but the 'claude' CLI is not on PATH\n`);
    return { ...g.counts(), skipped: intentCount };
  }

  for (const line of nonEmptyLines(root, INTENTS)) {
    const parsed = parseCase(line);
    const id = jqString(parsed, 'id');
    const mustLoad = jqWords(parsed, 'must_load');
    const mustNotLoad = jqWords(parsed, 'must_not_load');
    const router = routerLine(deps.runClaude(jqString(parsed, 'input')));

    if (jqLength(parsed, 'expect_intents') === 0) {
      // Pure question: routing exemption. Emitting a router line is over-routing.
      if (router === '') g.ok(`${id} (no routing expected)`);
      else g.bad(`${id} over-routed a pure question: ${router}`);
      continue;
    }
    if (router === '') {
      g.bad(`${id} emitted no [router] line`);
      continue;
    }

    const problems: string[] = [];
    for (const rule of mustLoad) if (!router.includes(rule)) problems.push(`missing:${rule}`);
    for (const rule of mustNotLoad) if (router.includes(rule)) problems.push(`forbidden:${rule}`);
    if (problems.length === 0) g.ok(id);
    else g.bad(`${id} — ${problems.join(' ')} | got: ${router}`);
  }
  return { ...g.counts(), skipped: 0 };
}

// NOT anchored to line-start: the model often wraps the announcement in a
// markdown code span ("`[router] intent=...`"), which a '^\[router\]' anchor
// misses even though the announcement is correctly present. Found by actually
// running the live tier once — see the change record.
function routerLine(output: string): string {
  return output.split('\n').find((line) => line.includes(ROUTER_MARKER)) ?? '';
}
