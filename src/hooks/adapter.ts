// The adapter contract between the harness and a hook body: decode the envelope,
// run the hook, render its decision. A hook body never sees stdin, never writes
// stdout and never picks an exit code — those three live here and in ./output.
//
// Parameterised over the hook table so both entry points share it: ./cli builds
// the full table, src/hot-cli.ts the per-call one, and importing ./cli there
// would pull every hook into the hot bundle through its HOOKS map. This module
// imports only ./envelope and ./output for the same reason.
import type { MaybeAsyncCommand } from '../dispatch';
import type { Io } from '../io';
import { hookContext, readEnvelope, type HookEnvelope } from './envelope';
import { fail, render, silent, type HookContext, type HookDecision } from './output';

// A hook answers synchronously, or — the prompt advisor, which awaits the
// judge — with a promise. Synchronous hooks keep rendering in the same tick.
export type HookRun = (env: HookEnvelope, ctx: HookContext) => HookDecision | Promise<HookDecision>;
export type HookTable = Readonly<Record<string, HookRun>>;

// `unknownHint` is appended to the unknown-hook message, before its newline.
export function runHookWith(hooks: HookTable, unknownHint: string = ''): MaybeAsyncCommand {
  return (argv: string[], io: Io): number | Promise<number> => {
    const name = argv[0];
    const hook = name === undefined ? undefined : hooks[name];
    if (name === undefined || hook === undefined) {
      return render(fail(`engineos hook: unknown hook: ${name ?? ''}${unknownHint}\n`), io);
    }
    const env = readEnvelope(io);
    // A payload the hook cannot read is not the hook's problem to report: the
    // bash hooks carried on with empty defaults and exited 0, and a harness that
    // sees a non-zero exit on a malformed event would surface it as OUR failure.
    if (env === null) return render(silent, io);
    try {
      const decision = hook(env, hookContext(env, io));
      if (decision instanceof Promise) {
        return decision.then(
          (settled) => render(settled, io),
          (e: unknown) => failed(name, e, io),
        );
      }
      return render(decision, io);
    } catch (e) {
      return failed(name, e, io);
    }
  };
}

// A hook body that throws (or rejects) must not become a blocked tool call or a
// broken Stop: the harness treats exit 2 as a refusal. Say what happened on
// stderr (visible in the harness log) and stay out of the way.
function failed(name: string, e: unknown, io: Io): number {
  io.err(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
  return render(silent, io);
}
