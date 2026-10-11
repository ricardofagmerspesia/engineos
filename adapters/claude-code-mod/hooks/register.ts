// EngineOS in-process adapter for Claude Code (opt-in: ENGINEOS_INPROCESS=1).
//
// Registers on the five classic events hooks/hooks.json uses and serves each
// matcher group's hooks from one long-lived host process (host/server.ts)
// instead of spawning `node` per hook. The route table comes from hooks.json
// itself, through the host, so both carriers register the same events. With
// the flag unset the host is never started and every hook below is a plain
// pass-through to the hooks beneath (the shell hooks then run as today).
//
// Every hook calls `next(e)`: the user's own settings hooks and other plugins'
// hooks still run, and EngineOS's answer joins theirs (classic-map.ts).
import type { EngineInterface, Register } from 'claude-code';
import type { HostEvent, WireDecision } from '../host/protocol';
import {
  HOST_SILENT_GIT_REASON,
  foldDecisions,
  hooksFor,
  looksLikeGitCommand,
  mergeOutcome,
  mergePreTool,
  preToolEnvelope,
  type Outcome,
} from './classic-map';
import { callHook, ensureHost } from './host-client';

// Per hook request. Per-call hooks keep the shell budget they replace; the
// session-boundary hooks touch the filesystem and may take longer.
const DEADLINE_MS: Readonly<Record<HostEvent, number>> = {
  SessionStart: 10_000,
  UserPromptSubmit: 2_000,
  PreToolUse: 1_500,
  PostToolUse: 1_500,
  Stop: 10_000,
};

const BASH_TOOL = 'Bash';

interface Served {
  outcome: Outcome;
  // At least one hook of the group did not answer (timeout, host gone).
  unanswered: boolean;
}

// null: nothing to serve here (flag off, host unavailable, or no route for
// this event and tool) and the event passes through untouched.
async function serve(
  $: EngineInterface,
  event: HostEvent,
  toolName: string | null,
  envelope: () => Promise<unknown>,
): Promise<Served | null> {
  const host = await ensureHost($);
  if (host.kind !== 'ready') return null;
  const names = hooksFor(host.routes, event, toolName);
  if (names.length === 0) return null;
  const payload = await envelope();
  const decisions: WireDecision[] = [];
  let unanswered = false;
  for (const name of names) {
    const answer = await callHook($, host.socket, name, payload, DEADLINE_MS[event]);
    if (answer === null) {
      unanswered = true;
      $.ui.log(`EngineOS ${name}: no answer from the in-process host`, { to: 'debug' });
      continue;
    }
    if (answer.stderr !== '') $.ui.log(answer.stderr, { to: 'debug' });
    decisions.push(answer.decision);
  }
  const outcome = foldDecisions(decisions);
  // A shell hook's systemMessage: shown to the person, never read by the model.
  for (const notice of outcome.notices) $.ui.log(notice);
  return { outcome, unanswered };
}

function commandOf(call: object): unknown {
  const fields: Record<string, unknown> = { ...call };
  return fields['command'];
}

export const register: Register = (on) => {
  // Start the host as soon as the session is ready, so the first tool call
  // does not pay the start; events that arrive earlier wait on the same start.
  on('session.start', async ($, e, next) => {
    const started = await next(e);
    void ensureHost($);
    return started;
  });

  on('classic.SessionStart', async ($, e, next) => {
    const served = await serve($, 'SessionStart', null, async () => e);
    const theirs = await next(e);
    return served === null ? theirs : mergeOutcome(theirs, served.outcome);
  });

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const served = await serve($, 'UserPromptSubmit', null, async () => e);
    const theirs = await next(e);
    return served === null ? theirs : mergeOutcome(theirs, served.outcome);
  });

  on('classic.PostToolUse', async ($, e, next) => {
    const served = await serve($, 'PostToolUse', e.tool_name, async () => e);
    const theirs = await next(e);
    return served === null ? theirs : mergeOutcome(theirs, served.outcome);
  });

  on('classic.Stop', async ($, e, next) => {
    const served = await serve($, 'Stop', null, async () => e);
    const theirs = await next(e);
    return served === null ? theirs : mergeOutcome(theirs, served.outcome);
  });

  // The one gating site: it judges before calling next, as a guard should.
  on('classic.PreToolUse', async ($, e, next) => {
    const call = { ...e };
    const served = await serve($, 'PreToolUse', call.tool, async () =>
      preToolEnvelope(call, { sessionId: await $.session.id(), cwd: await $.session.cwd() }),
    );
    const theirs = await next(e);
    if (served === null) return theirs;
    const { outcome } = served;
    if (served.unanswered && call.tool === BASH_TOOL && outcome.ask === null && outcome.block === null && looksLikeGitCommand(commandOf(call))) {
      outcome.ask = HOST_SILENT_GIT_REASON;
    }
    return mergePreTool(theirs, outcome);
  }).catch(($, e, next) => {
    if (next.called) return next(e);
    // The hook itself failed. The shell guard is silent while the host lives,
    // so a git/gh command is put to the person rather than let through unseen.
    return e.tool === BASH_TOOL && looksLikeGitCommand(commandOf(e)) ? { ask: HOST_SILENT_GIT_REASON } : next(e);
  });
};
