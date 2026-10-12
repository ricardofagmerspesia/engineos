import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { routerNote } from '../hooks/prompt-advisor-router';
import { CANDIDATES_FILE, parseRouterNote, shadowOf } from './router-golden-collect';
import { joinSpan, type Turn } from './router-golden-transcript';
import { routerGoldenCommand } from './router-golden';
import { advisorCaseRouter } from './router-golden-run';
import { spawnSync } from 'node:child_process';

const SESSION = 'sess-1111';
const LOST = 'sess-2222';
const PROMPT = 'add an endpoint that lists invoices for ACME-CLIENT';
const NOW = Date.parse('2026-10-12T12:00:00Z');

function span(at: string, sid: string, fields: Record<string, unknown>): string {
  return `${JSON.stringify({ timestamp: at, run_id: sid, capability_id: 'route', agent: null, model_tier: 'cheap', status: 'OK', tokens_in: null, tokens_out: null, duration_ms: 12, trace_id: sid, span_kind: 'router', ...fields })}\n`;
}

function userLine(at: string, content: unknown, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ type: 'user', timestamp: at, sessionId: SESSION, isSidechain: false, message: { role: 'user', content }, ...extra })}\n`;
}

const JEV_NOTE = 'req=auto conf=0.91 esc=0 fb=- kw=backend,new-feature dis=1';

interface Fixture { root: string; repo: string; home: string }

function fixture(t: TestContext): Fixture {
  const base = tempRoot(t);
  const repo = fixtureRepo(base, { files: { 'pyproject.toml': '[project]\nname = "x"\ndependencies = ["fastapi"]\n' } });
  const root = join(base, 'engineos');
  mkdirSync(root);
  const home = join(base, 'home');
  const projects = join(home, '.claude', 'projects', '-Users-x-Documents');
  mkdirSync(projects, { recursive: true });
  writeFileSync(join(projects, `${SESSION}.jsonl`), [
    userLine('2026-10-07T10:00:00.500Z', PROMPT, { origin: { kind: 'human' } }),
    // A tool result is a user line but never a turn.
    userLine('2026-10-07T10:00:00.700Z', [{ type: 'tool_result', content: 'x' }]),
    userLine('2026-10-07T10:05:00.100Z', [{ type: 'text', text: PROMPT }]),
    userLine('2026-10-07T10:10:00.200Z', 'subagent report body', { origin: { kind: 'peer' }, isMeta: true }),
    'not json\n',
  ].join(''));
  const journal = join(repo, '.git', 'engineos-telemetry');
  mkdirSync(journal, { recursive: true });
  writeFileSync(join(journal, `${SESSION}.exec.jsonl`), [
    // joined: the span's printed second floors a write that came after the turn
    span('2026-10-07T10:00:00Z', SESSION, { provider: 'jev', model: 'jev-latest', note: JEV_NOTE, route: 'backend-python' }),
    // same prompt again: a duplicate by prompt+repo
    span('2026-10-07T10:05:00Z', SESSION, { provider: 'keyword', model: 'keyword', note: 'req=auto conf=- esc=0 fb=- kw=backend dis=0', route: 'backend' }),
    // lands on a subagent hand-back: non-human
    span('2026-10-07T10:10:00Z', SESSION, { provider: 'keyword', model: 'keyword', note: 'req=auto conf=- esc=0 fb=- kw=llm dis=0', route: 'llm' }),
    // no decision layer ran (non-substantive, or pre-wave-2)
    span('2026-10-07T10:11:00Z', SESSION, { note: null, route: 'none' }),
    // far from every turn
    span('2026-10-07T11:30:00Z', SESSION, { provider: 'keyword', model: 'keyword', note: 'req=auto conf=- esc=0 fb=- kw=- dis=0', route: 'none' }),
    // session with no transcript anywhere
    span('2026-10-07T10:00:00Z', LOST, { provider: 'llm', model: 'router-agent', note: 'req=auto conf=- esc=1 fb=- kw=backend dis=0', route: 'backend' }),
    // an agent span is not a router span
    `${JSON.stringify({ timestamp: '2026-10-07T10:00:01Z', span_kind: 'agent', trace_id: SESSION })}\n`,
  ].join(''));
  return { root, repo, home };
}

const command = routerGoldenCommand({ now: () => NOW, spawn: spawnSync, caseRouter: advisorCaseRouter });

async function runCollect(f: Fixture, argv: string[]): Promise<{ status: number; stdout: string }> {
  const io = memoryIo({ env: { HOME: f.home, ENGINEOS_ROOT: f.root }, cwd: f.repo });
  const status = await command(['collect', ...argv], io);
  return { status, stdout: io.stdout.join('') };
}

function candidates(root: string): Record<string, unknown>[] {
  return readFileSync(join(root, CANDIDATES_FILE), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('collect joins router spans to human prompts and counts every other outcome', async (t) => {
  const f = fixture(t);
  const { status, stdout } = await runCollect(f, []);
  assert.equal(status, 0);
  assert.match(stdout, /spans read 6, no decision 1, joined 2, unjoined 2 \(no transcript 1, no turn 1\), non-human 1, duplicates 1, appended 1, disagreements 1/);
  assert.ok(!stdout.includes('ACME-CLIENT'), 'the summary never prints prompt text');
  assert.ok(!stdout.includes('subagent report body'));
  const lines = candidates(f.root);
  assert.equal(lines.length, 1);
  const line = lines[0] ?? {};
  assert.equal(line['prompt'], PROMPT);
  assert.equal(line['source'], 'real');
  assert.equal(line['expect_intents'], null);
  assert.equal(line['collected_at'], '2026-10-12');
  assert.deepEqual(line['stack'], ['python:fastapi']);
  assert.deepEqual(line['frameworks'], ['fastapi']);
  assert.match(String(line['repo']), /^repo-/);
  assert.deepEqual(line['shadow'], {
    mode: 'jev', intents: ['backend-python'], keyword_intents: ['backend', 'new-feature'], disagreement: true, confidence: 0.91, escalate: false,
  });
});

test('collect never appends a candidate twice across runs', async (t) => {
  const f = fixture(t);
  await runCollect(f, [f.repo]);
  const second = await runCollect(f, [f.repo]);
  assert.match(second.stdout, /duplicates 2, appended 0/);
  assert.equal(candidates(f.root).length, 1);
});

test('collect reports a repository with no journal without failing', async (t) => {
  const f = fixture(t);
  const bare = fixtureRepo(tempRoot(t));
  const { status, stdout } = await runCollect(f, [bare]);
  assert.equal(status, 0);
  assert.match(stdout, /no telemetry journal/);
  assert.match(stdout, /0 candidate\(s\) appended/);
});

test('parseRouterNote reads exactly what the advisor writes', () => {
  const note = routerNote({ requested: 'auto', confidence: 0.5, escalate: true, fallback: 'timeout', keyword: ['backend', 'dba'], disagreement: null });
  assert.deepEqual(parseRouterNote(note), {
    requested: 'auto', confidence: 0.5, escalate: true, fallback: 'timeout', keyword: ['backend', 'dba'], disagreement: null,
  });
  assert.deepEqual(parseRouterNote(routerNote({ requested: 'keyword', confidence: null, escalate: false, fallback: null, keyword: [], disagreement: false }))?.keyword, []);
  assert.equal(parseRouterNote(null), null);
  assert.equal(parseRouterNote('req=auto conf=x esc=0 fb=- kw=- dis=0'), null);
  assert.equal(parseRouterNote('req=auto'), null);
});

test('shadowOf keeps the keyword set unless the modes disagreed', () => {
  const agree = parseRouterNote('req=auto conf=- esc=0 fb=- kw=backend,dba dis=0');
  assert.ok(agree !== null);
  assert.deepEqual(shadowOf('llm', 'backend', agree).intents, ['backend', 'dba']);
  const differ = parseRouterNote('req=auto conf=0.80 esc=0 fb=- kw=backend dis=1');
  assert.ok(differ !== null);
  assert.deepEqual(shadowOf('jev', 'frontend', differ).intents, ['frontend']);
});

test('joinSpan takes the latest turn inside the span second and the window', () => {
  const at = Date.parse('2026-10-07T10:00:00Z');
  const turns: Turn[] = [
    { at: at - 30_000, kind: 'human', text: 'older' },
    { at: at + 400, kind: 'human', text: 'this one' },
    { at: at + 1500, kind: 'human', text: 'after the span' },
  ];
  assert.deepEqual(joinSpan(turns, at), { kind: 'joined', text: 'this one' });
  assert.deepEqual(joinSpan(turns.slice(0, 1), at), { kind: 'joined', text: 'older' });
  assert.deepEqual(joinSpan([{ at: at - 120_000, kind: 'human', text: 'too old' }], at), { kind: 'no-turn' });
  assert.deepEqual(joinSpan([{ at, kind: 'non-human', text: 'x' }], at), { kind: 'non-human' });
  assert.deepEqual(joinSpan(null, at), { kind: 'no-transcript' });
});
