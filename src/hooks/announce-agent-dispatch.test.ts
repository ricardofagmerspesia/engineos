import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { readEnvelope, type HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, relocatedRoot, tempRoot } from '../testing/harness';
import { run, subagentType, UNNAMED_AGENT } from './announce-agent-dispatch';

// A path that is no git repository, so bypass and telemetry both answer "no"
// without a fixture: this hook's contract is that the banner never depends on
// either of them.
const OUTSIDE_A_REPO = '/nonexistent/engineos-announce';

// The machine-wide flag points at a path that does not exist, so the operator's
// own ~/.claude/engineos.bypass can never silence a case here.
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// The instruction the model is told to obey, byte for byte. Written out rather
// than imported so a reworded banner fails here instead of agreeing with itself.
const INSTRUCTION =
  ' — per rules/subagents.md, before any other output for this turn, emit a green diff-fenced line: `+ [agent] <alias>(<type>) | model: <tier> | mode: AUDIT|IMPLEMENT | scope: <files>`. One line per agent, its own fenced diff block, blank line above and below. Do not narrate this in prose instead.';

test('the banner names the agent and its brief, verbatim', () => {
  const env = envelopeOf({ tool_input: { subagent_type: 'backend-coordinator', description: 'scope src/orders' } });
  assert.deepEqual(run(env, contextFor()), {
    kind: 'context',
    event: 'PreToolUse',
    text: `[subagent-announce] dispatching agent(type=backend-coordinator, desc="scope src/orders")${INSTRUCTION}`,
  });
});

test('a dispatch with no description carries no desc part', () => {
  const env = envelopeOf({ tool_input: { subagent_type: 'qa-tester' } });
  assert.deepEqual(run(env, contextFor()), {
    kind: 'context',
    event: 'PreToolUse',
    text: `[subagent-announce] dispatching agent(type=qa-tester)${INSTRUCTION}`,
  });
});

test('agentType is the second name, general-purpose the last', () => {
  assert.equal(subagentType(envelopeOf({ tool_input: { agentType: 'critic' } })), 'critic');
  assert.equal(subagentType(envelopeOf({ tool_input: { subagent_type: 'critic', agentType: 'qa-tester' } })), 'critic');
  assert.equal(subagentType(envelopeOf({ tool_input: {} })), UNNAMED_AGENT);
  assert.equal(subagentType(envelopeOf({})), UNNAMED_AGENT);
  // jq's `//` skips null and false; a non-string value is treated the same way.
  assert.equal(subagentType(envelopeOf({ tool_input: { subagent_type: null, agentType: 'critic' } })), 'critic');
  assert.equal(subagentType(envelopeOf({ tool_input: { subagent_type: 7 } })), UNNAMED_AGENT);
});

test('a payload that is not an object still announces a dispatch', () => {
  assert.deepEqual(run(envelopeOf('not an object'), contextFor()), {
    kind: 'context',
    event: 'PreToolUse',
    text: `[subagent-announce] dispatching agent(type=${UNNAMED_AGENT})${INSTRUCTION}`,
  });
});

test('a bypassed session announces nothing', () => {
  const env = envelopeOf({ tool_input: { subagent_type: 'backend-coordinator' } });
  const ctx = contextFor({ ...ISOLATED, ENGINEOS_BYPASS: '1' });
  assert.deepEqual(run(env, ctx), { kind: 'silent' });
});

test('the decoded harness payload feeds the banner', () => {
  const io = memoryIo({ stdin: JSON.stringify({ cwd: OUTSIDE_A_REPO, session_id: 'sess', tool_name: 'Task', tool_input: { subagent_type: 'elias', description: 'mirror the cart screen' } }) });
  const decoded = readEnvelope(io);
  if (decoded === null) throw new Error('the fixture payload did not decode');
  assert.deepEqual(run(decoded, contextFor()), {
    kind: 'context',
    event: 'PreToolUse',
    text: `[subagent-announce] dispatching agent(type=elias, desc="mirror the cart screen")${INSTRUCTION}`,
  });
});

// The banner is this hook's job and must not depend on telemetry succeeding —
// the reason bash printed it FIRST and the reason the openSpan call sits in a
// try here. A repository that never adopted EngineOS is the real-world case:
// the sink refuses, nothing is written, and the dispatch is still announced.
// ./announce-agent-return.test.ts owns the span the adopted case produces.
test('a dispatch into a repository that never adopted EngineOS still announces', (t) => {
  const base = tempRoot(t);
  const repo = fixtureRepo(base);
  const ctx: HookContext = {
    io: memoryIo({ env: ISOLATED, cwd: repo }),
    root: relocatedRoot(base),
    now: () => Date.UTC(2026, 0, 1),
    spawn: spawnSync,
  };
  const env: HookEnvelope = { ...envelopeOf({ tool_use_id: 'toolu_1', tool_input: { subagent_type: 'qa-tester' } }), cwd: repo };
  assert.deepEqual(run(env, ctx), {
    kind: 'context',
    event: 'PreToolUse',
    text: `[subagent-announce] dispatching agent(type=qa-tester)${INSTRUCTION}`,
  });
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

function envelopeOf(raw: unknown): HookEnvelope {
  return { cwd: OUTSIDE_A_REPO, sessionId: 'sess', prompt: '', file: '', tool: 'Task', transcriptPath: '', stopHookActive: false, raw };
}

function contextFor(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: resolveRoot({}, __dirname), now: () => 1000, spawn: spawnSync };
}
