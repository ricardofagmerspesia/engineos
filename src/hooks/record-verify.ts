// EngineOS Stop gate: if there are unrecorded changes for THIS session (flag set by
// ./mark-unrecorded on code edits, cleared by the record-change skill), block ONCE
// asking for the change to be recorded. Evidence-based — relies on the flag file,
// not transcript text. Never loops (stop_hook_active guard).
//
// Marker is resolved from `cwd` and the session id, identically to
// ./mark-unrecorded, so the two halves always target the same file.
//
// Port of hooks/record-verify.sh.
import { existsSync } from 'node:fs';
import type { HookEnvelope } from './envelope';
import { block, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { UNRECORDED_MARKER_PREFIX } from './mark-unrecorded';
import { gitDir } from '../lib/git';

// The suffix of the escape-hatch marker; `.deferred` is versioned surface the
// blocked message tells the operator to create by hand.
const DEFERRED_SUFFIX = '.deferred';

// Verbatim from the bash hook's jq program: the operator is told the exact
// `touch` that silences the gate, so declining to record is one command.
export function recordGateReason(deferMarker: string): string {
  return (
    'EngineOS gate: code changed but the change was not recorded. Run the record-change skill — mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag. To defer recording for this session instead, create the marker: touch ' +
    `"${deferMarker}"`
  );
}

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  // already blocked once this stop cycle -> let it through
  if (env.stopHookActive) return silent;
  if (env.cwd === '') return silent;
  const dir = gitDir(env.cwd, ctx.spawn);
  if (dir === null) return silent;
  const marker = `${dir}/${UNRECORDED_MARKER_PREFIX}${env.sessionId}`;
  if (!existsSync(marker)) return silent;
  // Escape hatch: an explicit defer marker silences the gate for this session
  // without deleting the debt flag, so declining to record is a one-touch action
  // instead of a manual rm inside .git. Reaped with the flags after 7 days.
  const deferred = `${marker}${DEFERRED_SUFFIX}`;
  if (existsSync(deferred)) return silent;
  return block(recordGateReason(deferred));
}
