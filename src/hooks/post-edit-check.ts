// Legacy per-edit entrypoint retained for compatibility, advisory only.
// Rewiring this hook cannot run lint/typecheck, runner probes or package scripts.
// Actual verification belongs to the final integrated, explicitly host-approved
// ladder in ./stop-verify; cwd/adoption/environment flags never supply consent.
import type { HookEnvelope } from './envelope';
import { message, silent, type HookContext, type HookDecision } from './output';
import type { SpawnSyncLike } from './runner';

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  return verify(env, ctx, ctx.spawn);
}

// Signature preserved for callers; the injected spawner is deliberately unused.
export function verify(env: HookEnvelope, _ctx: HookContext, _spawn: SpawnSyncLike): HookDecision {
  if (env.file === '' || env.cwd === '') return silent;
  return message('[engineos] Per-edit verification is disabled; request final validation approval after integration. No checks ran.');
}
