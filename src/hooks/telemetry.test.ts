import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { journalRegistries } from '../journal/schema';
import { validateFile } from '../journal/exec-journal';
import { fixtureRepo, relocatedRoot, tempRoot } from '../testing/harness';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { memorySpanWriter, type MemorySpanWriter } from './span-writer';
import { closeSpan, event, openSpan, sinkForTests, spanIdFrom, telemetrySink, withSpan, type SpanFacts, type Sink } from './telemetry';

// A plausible epoch instant: parseMs holds a persisted marker to the same
// digit bar the clock is held to, so a fake clock has to be a real one.
const T0 = 1_767_225_600_000;

const AGENT: SpanFacts = { kind: 'agent', capability: 'implement', modelTier: 'build', status: 'OK' };

// ------------------------------------------------------------- the lifecycle

test('a null sink makes every call a no-op and still returns the work', () => {
  openSpan(null, 'abc');
  closeSpan(null, 'abc', AGENT);
  event(null, 'route', { intents: ['backend'] });
  assert.equal(withSpan(null, AGENT, () => ({ result: 7, status: 'OK' })), 7);
});

test('open then close writes one span carrying the elapsed duration', () => {
  const { sink, writer } = memorySink([T0, T0 + 1200]);
  openSpan(sink, 'span-1');
  closeSpan(sink, 'span-1', AGENT);
  assert.equal(writer.spans.length, 1);
  assert.deepEqual(writer.spans[0], {
    run_id: 'sess-1',
    capability_id: 'implement',
    model_tier: 'build',
    status: 'OK',
    duration_ms: 1200,
    trace_id: 'sess-1',
    span_id: 'span-1',
    span_kind: 'agent',
  });
});

test('close without open writes nothing rather than a fabricated duration', () => {
  const { sink, writer } = memorySink([T0]);
  closeSpan(sink, 'never-opened', AGENT);
  assert.equal(writer.spans.length, 0);
});

test('a clock that moved backwards is clamped to zero, never a negative duration', () => {
  const { sink, writer } = memorySink([T0, T0 - 5000]);
  openSpan(sink, 'span-2');
  closeSpan(sink, 'span-2', AGENT);
  assert.equal(writer.spans[0]?.duration_ms, 0);
});

test('an empty span id opens no marker and closes nothing', () => {
  const { sink, writer } = memorySink([T0, T0 + 10]);
  openSpan(sink, '');
  closeSpan(sink, '', AGENT);
  assert.equal(writer.markers.size, 0);
  assert.equal(writer.spans.length, 0);
});

test('a marker is closed once: a second close writes no second span', () => {
  const { sink, writer } = memorySink([T0, T0 + 5, T0 + 9]);
  openSpan(sink, 'span-3');
  closeSpan(sink, 'span-3', AGENT);
  closeSpan(sink, 'span-3', AGENT);
  assert.equal(writer.spans.length, 1);
});

test('withSpan returns the work result and records the status the work reported', () => {
  const { sink, writer } = memorySink([T0, T0 + 42]);
  const facts: SpanFacts = { kind: 'verification', capability: 'validate', modelTier: 'cheap' };
  const result = withSpan(sink, facts, () => ({ result: 'green', status: 'FAILED' }));
  assert.equal(result, 'green');
  assert.equal(writer.spans[0]?.status, 'FAILED');
  assert.equal(writer.spans[0]?.duration_ms, 42);
  assert.equal(writer.spans[0]?.span_id, undefined, 'an in-process span needs no marker id');
});

test('withSpan lets the work own its own exception and writes no span for it', () => {
  const { sink, writer } = memorySink([T0, T0 + 1]);
  assert.throws(
    () => withSpan(sink, AGENT, (): { result: number; status: 'OK' } => { throw new Error('the hook failed'); }),
    /the hook failed/,
  );
  assert.equal(writer.spans.length, 0);
});

test('fields override the sink defaults, and the named facts override fields', () => {
  const { sink, writer } = memorySink([T0, T0 + 3]);
  // The headless runner is the caller that CAN see token usage and passes its
  // own; nothing may override the four values the signature made it state.
  const facts: SpanFacts = {
    kind: 'model',
    capability: 'implement',
    modelTier: 'design',
    status: 'OK',
    fields: { tokens_in: 120, tokens_out: 8, status: 'DEGRADED', provider: 'anthropic' },
  };
  withSpan(sink, facts, () => ({ result: null, status: 'OK' }));
  const span = writer.spans[0];
  assert.equal(span?.tokens_in, 120);
  assert.equal(span?.tokens_out, 8);
  assert.equal(span?.provider, 'anthropic');
  assert.equal(span?.status, 'OK');
});

test('every slug-class field is narrowed by the sink, not by its caller', () => {
  const { sink, writer } = memorySink([T0, T0 + 1], 'sess one');
  openSpan(sink, 'span-4');
  closeSpan(sink, 'span-4', { ...AGENT, fields: { agent: 'qa tester\nx', route: 'a b' } });
  const span = writer.spans[0];
  assert.equal(span?.run_id, 'sess-one');
  assert.equal(span?.trace_id, 'sess-one');
  assert.equal(span?.agent, 'qa-tester-x');
  assert.equal(span?.route, 'a-b');
});

test('a writer that throws never breaks the hook it was recording', () => {
  const writer = memorySpanWriter();
  const broken = {
    ...writer,
    appendSpan(): void { throw new Error('disk full'); },
    appendEvent(): void { throw new Error('disk full'); },
    closeMarker(): number { throw new Error('disk full'); },
  };
  const sink = sinkForTests(broken, () => T0, 'sess-1');
  openSpan(sink, 'span-5');
  closeSpan(sink, 'span-5', AGENT);
  event(sink, 'route', { intents: ['backend'] });
  withSpan(sink, AGENT, () => ({ result: 'done', status: 'OK' }));
});

// ------------------------------------------------------------- the id derivation

test('spanIdFrom uses the harness tool-use id when there is one', () => {
  assert.equal(spanIdFrom(envelope({ raw: { tool_use_id: 'toolu_01ABC' } })), 'toolu_01ABC');
});

test('spanIdFrom slugs a tool-use id rather than trusting the harness', () => {
  assert.equal(spanIdFrom(envelope({ raw: { tool_use_id: 'toolu 01\nx' } })), 'toolu-01-x');
});

test('without a tool-use id the brief is hashed exactly as the bash pipeline hashed it', () => {
  // `jq -r ... | shasum | cut -c1-12`, and jq -r terminates its output with a
  // newline that shasum then hashes. These two values were taken from that
  // pipeline: a marker opened by the bash hook must close under this one.
  assert.equal(
    spanIdFrom(envelope({ raw: { tool_input: { subagent_type: 'qa-tester', description: 'run the suite' } } })),
    '669236cfea5b',
  );
  assert.equal(spanIdFrom(envelope({ raw: { tool_input: {} } })), '026968384959');
});

test('an empty tool-use id falls through to the hashed brief', () => {
  const raw = { tool_use_id: '', tool_input: { subagent_type: 'qa-tester', description: 'run the suite' } };
  assert.equal(spanIdFrom(envelope({ raw })), '669236cfea5b');
});

test('a payload that is not an object still yields an id rather than throwing', () => {
  assert.equal(spanIdFrom(envelope({ raw: 'not an object' })), '026968384959');
});

// ------------------------------------------------------------- the opt-in gate

test('an adopted repo gets a sink, and one event appends exactly one line', (t) => {
  const { ctx, env, repo } = project(t);
  const sink = telemetrySink(env, ctx, { bypassed: false });
  assert.notEqual(sink, null);
  event(sink, 'route', { intents: ['backend'] });
  const file = join(repo, '.git', 'engineos-telemetry', 'libt1.jsonl');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const row: unknown = JSON.parse(lines[0] ?? '');
  assert.deepEqual(row, { ts: '2026-01-01T00:00:00Z', session_id: 'libt1', event: 'route', data: { intents: ['backend'] } });
});

test('no .engineos/ means no telemetry is written into the repo', (t) => {
  const { ctx, env, repo } = project(t, { adopted: false });
  assert.equal(telemetrySink(env, ctx, { bypassed: false }), null);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('ENGINEOS_TELEMETRY=0 suppresses the sink before anything touches the repo', (t) => {
  const { ctx, env, repo } = project(t, { env: { ENGINEOS_TELEMETRY: '0' } });
  assert.equal(telemetrySink(env, ctx, { bypassed: false }), null);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('a bypassed session writes no spans', (t) => {
  const { ctx, env, repo } = project(t);
  assert.equal(telemetrySink(env, ctx, { bypassed: true }), null);
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('a payload with no cwd yields no sink, and the calls that follow still return', (t) => {
  const { ctx, env } = project(t);
  const sink = telemetrySink({ ...env, cwd: '' }, ctx, { bypassed: false });
  assert.equal(sink, null);
  event(sink, 'route', { intents: ['backend'] });
  openSpan(sink, 'span-6');
  closeSpan(sink, 'span-6', AGENT);
});

test('an event key the registry never declared writes nothing at all', (t) => {
  const { ctx, env, repo } = project(t);
  const sink = telemetrySink(env, ctx, { bypassed: false });
  event(sink, 'route', { prompt: 'the user typed this' });
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry', 'libt1.jsonl')), false);
});

test('a file-backed span lands in the session exec journal and validates', (t) => {
  const { ctx, env, repo } = project(t);
  const sink = telemetrySink(env, ctx, { bypassed: false });
  openSpan(sink, 'toolu_01ABC');
  closeSpan(sink, 'toolu_01ABC', AGENT);
  const file = join(repo, '.git', 'engineos-telemetry', 'libt1.exec.jsonl');
  const result = validateFile(ctx.root, file, journalRegistries(ctx.root));
  assert.deepEqual(result, { lines: 1, bad: [] });
  const row: unknown = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row, {
    timestamp: '2026-01-01T00:00:00Z',
    run_id: 'libt1',
    capability_id: 'implement',
    agent: null,
    model_tier: 'build',
    status: 'OK',
    tokens_in: null,
    tokens_out: null,
    duration_ms: 0,
    note: null,
    trace_id: 'libt1',
    span_id: 'toolu_01ABC',
    span_kind: 'agent',
  });
});

// ------------------------------------------------------------------ fixtures

function memorySink(instants: number[], session = 'sess-1'): { sink: Sink; writer: MemorySpanWriter } {
  const writer = memorySpanWriter();
  const ticks = [...instants];
  // Falls back to the last instant rather than undefined, so a case that reads
  // the clock one extra time fails on the assertion it meant to make.
  let last = ticks[ticks.length - 1] ?? 0;
  const now = (): number => {
    const next = ticks.shift();
    if (next !== undefined) last = next;
    return last;
  };
  return { sink: sinkForTests(writer, now, session), writer };
}

function envelope(opts: { raw: unknown; cwd?: string; sessionId?: string }): HookEnvelope {
  return {
    cwd: opts.cwd ?? '/tmp',
    sessionId: opts.sessionId ?? 'libt1',
    prompt: '',
    file: '',
    tool: '',
    transcriptPath: '',
    stopHookActive: false,
    raw: opts.raw,
  };
}

function project(
  t: TestContext,
  opts: { adopted?: boolean; env?: Record<string, string> } = {},
): { ctx: HookContext; env: HookEnvelope; repo: string } {
  const base = tempRoot(t);
  const repo = fixtureRepo(base);
  if (opts.adopted !== false) mkdirSync(join(repo, '.engineos'), { recursive: true });
  const ctx: HookContext = {
    io: memoryIo({ env: opts.env ?? {}, cwd: repo }),
    root: relocatedRoot(base),
    now: () => Date.UTC(2026, 0, 1),
    spawn: spawnSync,
  };
  return { ctx, env: envelope({ raw: {}, cwd: repo, sessionId: 'libt1' }), repo };
}
