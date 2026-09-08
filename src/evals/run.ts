// `engineos evals` — the CLI arm scripts/run-evals.sh shims over.
//
// rules/llm-apps.md forbids vibes-driven development and requires a golden set
// before iterating on any prompt or agent. EngineOS had none for its own router.
// This runs that set; the grading contract is evals/RUBRIC.md.
//
// The root comes from resolveRoot rather than an argument: the shim exports
// ENGINEOS_ROOT from where it sits, so a relocated copy grades its own evals/ and
// rules/ instead of whichever checkout the runtime lives in. Printed paths stay
// relative, as the bash's `cd "$ROOT"` made them.
//
// The bash refused to start without jq. Node replaces it, so that check is gone —
// the only line of the old output this port does not reproduce.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Command } from '../dispatch';
import type { Io } from '../io';
import { resolveRoot } from '../registry/paths';
import { runDeterministicTier } from './deterministic';
import { runLiveTier, type LiveDeps } from './live';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

export const runEvals: Command = (_argv: string[], io: Io): number => {
  const root = resolveRoot(io.env);
  const deterministic = runDeterministicTier(root, io);
  const live = runLiveTier(root, io, deterministic.intentCount, liveDeps(io.env));

  const pass = deterministic.pass + live.pass;
  const fail = deterministic.fail + live.fail;
  io.out(`\npassed ${pass}, failed ${fail}, skipped ${live.skipped}\n`);
  return fail > 0 ? EXIT_FAILURE : EXIT_OK;
};

// -------------------------------------------------------------------- helpers

function liveDeps(env: NodeJS.ProcessEnv): LiveDeps {
  return {
    env,
    hasClaude: () => onPath('claude', env),
    // stderr is discarded and a failed call answers with the empty string, as the
    // bash `$(claude -p "$inp" 2>/dev/null)` did: a case whose model call died
    // grades as a missing router line, never as a pass.
    runClaude: (prompt: string): string => {
      const result = spawnSync('claude', ['-p', prompt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return result.stdout ?? '';
    },
  };
}

// `command -v claude`, without running anything: the probe answers whether the
// live tier can grade, and executing an unknown binary to find out is a cost and
// a side effect the probe has no business having.
function onPath(name: string, env: NodeJS.ProcessEnv): boolean {
  const path = env['PATH'];
  if (path === undefined || path === '') return false;
  for (const directory of path.split(delimiter)) {
    if (directory === '') continue;
    if (isExecutable(join(directory, name))) return true;
  }
  return false;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
