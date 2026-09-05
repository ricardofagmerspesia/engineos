// EngineOS PostToolUse(Edit|Write|NotebookEdit): flag that there are unrecorded
// changes, for the Stop record gate (./record-verify). The record-change skill
// clears the flag. Evidence-based signal, no transcript parsing.
//
// The marker is resolved from `cwd` (same as ./record-verify, so the two always
// agree) and scoped to the session id, so a flag left by a crashed/cleared session
// never blocks a different session, and linked worktrees don't cross-talk.
//
// Port of hooks/mark-unrecorded.sh.
import { writeFileSync } from 'node:fs';
import type { HookEnvelope } from './envelope';
import { silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { gitDir } from '../lib/git';
import { globMatch } from '../lib/glob';
import { loadRouting } from '../registry/routing';

// The code-change allowlist. Shared with route-before-change so the two cannot
// drift (design "Invariants that port byte for byte"): only these extensions
// count as a change worth recording.
export const RECORDED_EXTENSIONS: readonly string[] = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'sql'];

// Hardcoded in the bash hook rather than read from routing.json's
// `excluded.paths`, and kept hardcoded here: this exclusion is generic (any
// project's .engineos/ meta tree), not a routing decision.
const ENGINEOS_META = '*/.engineos/*';

export const UNRECORDED_MARKER_PREFIX = 'ENGINEOS_UNRECORDED.';

function isRecordedExtension(file: string): boolean {
  return RECORDED_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}

// EngineOS's own meta dirs, read from registries/routing.json (.excluded.self_dirs)
// and resolved against THIS checkout's root — the same list and the same
// resolution the kernel's route-path uses, so the two cannot drift. Scoping to
// these exact paths (not any hooks/ or docs/ anywhere) is what keeps a consumer
// project's own src/hooks/ or product docs/ flagged.
function selfDirs(root: string): string[] {
  try {
    return loadRouting(root).excluded.self_dirs;
  } catch {
    // bash `jq ... 2>/dev/null`: an unreadable registry yields no exclusions and
    // the hook carries on rather than losing the flag.
    return [];
  }
}

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.file === '') return silent;
  if (!isRecordedExtension(env.file)) return silent;
  if (globMatch(ENGINEOS_META, env.file)) return silent;
  for (const dir of selfDirs(ctx.root)) {
    if (dir === '') continue;
    if (env.file.startsWith(`${ctx.root}/${dir}/`)) return silent;
  }
  if (env.cwd === '') return silent;
  const dir = gitDir(env.cwd, ctx.spawn);
  if (dir === null) return silent;
  try {
    writeFileSync(`${dir}/${UNRECORDED_MARKER_PREFIX}${env.sessionId}`, '');
  } catch {
    // bash `2>/dev/null || true`: an unwritable git dir is not the edit's problem.
  }
  return silent;
}
