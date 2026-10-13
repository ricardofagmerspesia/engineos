// The one adapter between the harness and every hook body: decode the envelope,
// run the hook, render its decision. A hook body never sees stdin, never writes
// stdout and never picks an exit code — those three live here and in ./output,
// so the eight hooks are pure functions of (envelope, context) and their tests
// deepEqual a HookDecision instead of parsing JSON.
import type { AsyncCommand, ExitCode } from '../dispatch';
import type { Io } from '../io';
import { hookContext, readEnvelope, type HookEnvelope } from './envelope';
import { fail, render, silent, type HookContext, type HookDecision } from './output';
import { run as ensureProjectLayout } from './ensure-project-layout';
import { run as markUnrecorded } from './mark-unrecorded';
import { run as recordVerify } from './record-verify';
import { run as routeBeforeChange } from './route-before-change';
import { run as promptAdvisor } from './prompt-advisor';
import { run as announceAgentDispatch } from './announce-agent-dispatch';
import { run as announceAgentReturn } from './announce-agent-return';
import { run as stopVerify } from './stop-verify';
import { run as postEditCheck } from './post-edit-check';
import { run as gitWriteGuard } from './git-write-guard';

// A hook may answer after an await (the prompt advisor waits on the routing
// decision layer); every other hook answers synchronously and is rendered
// synchronously, byte for byte as before.
export type HookRun = (env: HookEnvelope, ctx: HookContext) => HookDecision | Promise<HookDecision>;

// Keys are the names hooks.json registers (`engineos hook <name>`) and the shim
// file names under hooks/. Adding a hook is one import and one row.
export const HOOKS: Readonly<Record<string, HookRun>> = {
  'ensure-project-layout': ensureProjectLayout,
  'mark-unrecorded': markUnrecorded,
  'record-verify': recordVerify,
  'route-before-change': routeBeforeChange,
  'prompt-advisor': promptAdvisor,
  'announce-agent-dispatch': announceAgentDispatch,
  'announce-agent-return': announceAgentReturn,
  'stop-verify': stopVerify,
  'post-edit-check': postEditCheck,
  'git-write-guard': gitWriteGuard,
};

export const runHook: AsyncCommand = (argv: string[], io: Io): ExitCode => runHookFrom(HOOKS, argv, io);

// The adapter over an explicit table, so a test can drive a synchronous and an
// asynchronous hook through the same path the registered ones take.
export function runHookFrom(table: Readonly<Record<string, HookRun>>, argv: string[], io: Io): ExitCode {
  const name = argv[0];
  const hook = name === undefined ? undefined : table[name];
  if (hook === undefined) return render(fail(`engineos hook: unknown hook: ${name ?? ''}\n`), io);
  const env = readEnvelope(io);
  // A payload the hook cannot read is not the hook's problem to report: the
  // bash hooks carried on with empty defaults and exited 0, and a harness that
  // sees a non-zero exit on a malformed event would surface it as OUR failure.
  if (env === null) return render(silent, io);
  const label = name ?? 'hook';
  let decision: HookDecision | Promise<HookDecision>;
  try {
    decision = hook(env, hookContext(env, io));
  } catch (e) {
    return failedSilently(label, e, io);
  }
  if (!(decision instanceof Promise)) return render(decision, io);
  return decision.then(
    (settled) => render(settled, io),
    (e: unknown) => failedSilently(label, e, io),
  );
}

// A hook body that throws (or rejects) must not become a blocked tool call or a
// broken Stop: the harness treats exit 2 as a refusal. Say what happened on
// stderr (visible in the harness log) and stay out of the way.
function failedSilently(name: string, e: unknown, io: Io): number {
  io.err(`[engineos] ${name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
  return render(silent, io);
}
