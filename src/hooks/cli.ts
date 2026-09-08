// The one adapter between the harness and every hook body: decode the envelope,
// run the hook, render its decision. A hook body never sees stdin, never writes
// stdout and never picks an exit code — those three live here and in ./output,
// so the eight hooks are pure functions of (envelope, context) and their tests
// deepEqual a HookDecision instead of parsing JSON.
import type { Command } from '../dispatch';
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

export type HookRun = (env: HookEnvelope, ctx: HookContext) => HookDecision;

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
};

export const runHook: Command = (argv: string[], io: Io): number => {
  const name = argv[0];
  const hook = name === undefined ? undefined : HOOKS[name];
  if (hook === undefined) return render(fail(`engineos hook: unknown hook: ${name ?? ''}\n`), io);
  const env = readEnvelope(io);
  // A payload the hook cannot read is not the hook's problem to report: the
  // bash hooks carried on with empty defaults and exited 0, and a harness that
  // sees a non-zero exit on a malformed event would surface it as OUR failure.
  if (env === null) return render(silent, io);
  try {
    return render(hook(env, hookContext(env, io)), io);
  } catch (e) {
    // A hook body that throws must not become a blocked tool call or a broken
    // Stop: the harness treats exit 2 as a refusal. Say what happened on stderr
    // (visible in the harness log) and stay out of the way.
    io.err(`[engineos] ${name ?? 'hook'} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return render(silent, io);
  }
};
