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
import { editContext, underSelfDir } from './edit-context';
import { globMatch } from '../lib/glob';
import { hookPathSlug } from '../lib/slug';

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

// Every exit below is `silent`; the marker write is the hook's only effect. So
// the order is cheapest first — the pure checks, then the one git process
// (./edit-context answers the bypass marker and the git dir from it), then the
// self_dirs exclusion — without changing when the marker is written.
export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (env.file === '') return silent;
  if (!isRecordedExtension(env.file)) return silent;
  if (globMatch(ENGINEOS_META, env.file)) return silent;
  if (env.cwd === '') return silent;
  const edit = editContext(env.cwd, ctx);
  if (edit.status === 'bypassed') return silent;
  // EngineOS's own meta dirs (routing.json `.excluded.self_dirs`) resolved
  // against THIS checkout's root — the same list and resolution the kernel's
  // route-path uses. Scoping to these exact paths (not any hooks/ or docs/
  // anywhere) is what keeps a consumer project's own src/hooks/ or docs/ flagged.
  if (underSelfDir(env, edit.gitDir, ctx)) return silent;
  const dir = edit.gitDir;
  if (dir === null) return silent;
  // The session id is harness-supplied and here it NAMES A FILE, so it takes the
  // path class rather than the constant prefix as its only containment — a value
  // of "../../x" would otherwise write outside the git dir. ../lib/slug narrows
  // the same field for the telemetry file names (src/hooks/span-writer.ts), and
  // ./record-verify derives the marker identically or the gate stops firing.
  const sid = hookPathSlug(env.sessionId);
  if (sid === null) return silent;
  try {
    writeFileSync(`${dir}/${UNRECORDED_MARKER_PREFIX}${sid}`, '');
  } catch {
    // bash `2>/dev/null || true`: an unwritable git dir is not the edit's problem.
  }
  return silent;
}
