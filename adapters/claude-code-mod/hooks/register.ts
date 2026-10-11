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
  GIT_WRITE_GUARD,
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
// rules/git.md: only this exact value turns the git-write guard off, and the
// fallback below stands in for that guard, so it honours the same switch.
const GIT_WRITES_ENV = 'ENGINEOS_GIT_WRITES';
const GIT_WRITES_AUTO = 'auto';

// off: the flag is unset and the event passes through untouched.
// unserved: the flag is set but the host is not ready, or has no route for this
// event and tool; nothing EngineOS-side answered.
// served: the host answered; `answered` names the hooks that replied in time.
type ServeResult =
  | { kind: 'off' }
  | { kind: 'unserved' }
  | { kind: 'served'; outcome: Outcome; answered: ReadonlySet<string> };

async function serve(
  $: EngineInterface,
  event: HostEvent,
  toolName: string | null,
  envelope: () => Promise<unknown>,
): Promise<ServeResult> {
  const host = await ensureHost($);
  if (host.kind === 'off') return { kind: 'off' };
  if (host.kind !== 'ready') return { kind: 'unserved' };
  const names = hooksFor(host.routes, event, toolName);
  if (names.length === 0) return { kind: 'unserved' };
  const payload = await envelope();
  const decisions: WireDecision[] = [];
  const answered = new Set<string>();
  for (const name of names) {
    const answer = await callHook($, host.socket, name, payload, DEADLINE_MS[event]);
    if (answer === null) {
      $.ui.log(`EngineOS ${name}: no answer from the in-process host`, { to: 'debug' });
      continue;
    }
    answered.add(name);
    if (answer.stderr !== '') $.ui.log(answer.stderr, { to: 'debug' });
    decisions.push(answer.decision);
  }
  const outcome = foldDecisions(decisions);
  // A shell hook's systemMessage: shown to the person, never read by the model.
  for (const notice of outcome.notices) $.ui.log(notice);
  return { kind: 'served', outcome, answered };
}

function commandOf(call: object): unknown {
  const fields: Record<string, unknown> = { ...call };
  return fields['command'];
}

// With the flag on, a Bash call the git-write guard did not answer for — host
// down, host still starting, no Bash route, or the request timed out — is put
// to the person when it may name git or gh, rather than let through unseen.
async function needsGitFallback($: EngineInterface, result: ServeResult, call: { tool: string }): Promise<boolean> {
  if (result.kind === 'off' || call.tool !== BASH_TOOL) return false;
  if (result.kind === 'served') {
    if (result.answered.has(GIT_WRITE_GUARD)) return false;
    if (result.outcome.ask !== null || result.outcome.block !== null) return false;
  }
  if (!looksLikeGitCommand(commandOf(call))) return false;
  return (await $.env.get(GIT_WRITES_ENV)) !== GIT_WRITES_AUTO;
}

function servedOutcome(result: ServeResult): Outcome | null {
  return result.kind === 'served' ? result.outcome : null;
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
    const ours = servedOutcome(await serve($, 'SessionStart', null, async () => e));
    const theirs = await next(e);
    return ours === null ? theirs : mergeOutcome(theirs, ours);
  });

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const ours = servedOutcome(await serve($, 'UserPromptSubmit', null, async () => e));
    const theirs = await next(e);
    return ours === null ? theirs : mergeOutcome(theirs, ours);
  });

  on('classic.PostToolUse', async ($, e, next) => {
    const ours = servedOutcome(await serve($, 'PostToolUse', e.tool_name, async () => e));
    const theirs = await next(e);
    return ours === null ? theirs : mergeOutcome(theirs, ours);
  });

  on('classic.Stop', async ($, e, next) => {
    const ours = servedOutcome(await serve($, 'Stop', null, async () => e));
    const theirs = await next(e);
    return ours === null ? theirs : mergeOutcome(theirs, ours);
  });

  // The one gating site: it judges before calling next, as a guard should.
  on('classic.PreToolUse', async ($, e, next) => {
    const call = { ...e };
    const result = await serve($, 'PreToolUse', call.tool, async () =>
      preToolEnvelope(call, { sessionId: await $.session.id(), cwd: await $.session.cwd() }),
    );
    const theirs = await next(e);
    if (result.kind === 'off') return theirs;
    const outcome = servedOutcome(result) ?? foldDecisions([]);
    if (await needsGitFallback($, result, call)) outcome.ask = HOST_SILENT_GIT_REASON;
    return mergePreTool(theirs, outcome);
  }).catch(($, e, next) => {
    if (next.called) return next(e);
    // The hook itself failed, so nothing EngineOS-side judged this call: a
    // command that may name git or gh is put to the person rather than let through.
    return e.tool === BASH_TOOL && looksLikeGitCommand(commandOf(e)) ? { ask: HOST_SILENT_GIT_REASON } : next(e);
  });
};
