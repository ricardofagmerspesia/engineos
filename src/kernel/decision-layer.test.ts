import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRecord } from '../lib/json';
import type { IntentRow } from '../registry/intents';
import type { RouterDecisionPolicy } from '../registry/policy-router-decision';
import type { Language, PackageStack } from '../registry/project-config';
import {
  buildDecisionInput,
  decide,
  effectiveSetting,
  resolveAuto,
  type Decision,
  type DecisionDeps,
  type DecisionInput,
  type Schedule,
} from './decision-layer';
import type { IntentMatch } from './route';

// --- fixtures ---------------------------------------------------------------

const KEY_ENV = 'TYPESAFE_API_KEY';
const KEY = 'sk-test-decision-layer-0000';
const ENDPOINT = 'https://jev.example.test/v1/systemone';
const ORDER = ['keyword', 'llm', 'jev', 'auto'];

function policy(overrides: Partial<RouterDecisionPolicy> = {}): RouterDecisionPolicy {
  return {
    modes: ['keyword', 'llm', 'jev'],
    restrictiveness: ['keyword', 'llm', 'jev', 'auto'],
    default: null,
    default_written_by: null,
    min_confidence: 0.6,
    tie_margin: 0.15,
    jev: { endpoint: ENDPOINT, model: 'jev-latest', budget_ms: 400, key_env: KEY_ENV },
    state_fields: ['prompt', 'languages', 'frameworks', 'files_named'],
    ...overrides,
  };
}

function row(id: string, stack: Language | null = null, note: string | null = null): IntentRow {
  return {
    id,
    title: `${id} work`,
    signals: [],
    rules: [],
    skills: [],
    agents: [],
    commands: [],
    mcp: [],
    model_tier: null,
    risk_floor: null,
    domain: null,
    note,
    suppressible: false,
    suppressed_by: [],
    requires_dispatch_plan: false,
    stack,
    stack_sibling: stack === null ? null : stack === 'node' ? 'backend-python' : 'backend',
    stack_frameworks: [],
    generic_signals: [],
  };
}

function match(id: string): IntentMatch {
  return {
    id,
    title: `${id} work`,
    rules: [],
    skills: [],
    skills_suppressed: [],
    agents: [],
    commands: [],
    mcp: [],
    model_tier: null,
    risk_floor: null,
    note: null,
  };
}

function pkg(dir: string, language: Language, framework: PackageStack['framework']): PackageStack {
  return { dir, language, framework, compose_service: null };
}

const INTENTS: IntentRow[] = [
  row('new-feature'),
  row('backend', 'node', 'NestJS API'),
  row('backend-python', 'python', 'FastAPI API'),
  row('frontend'),
  row('security-files'),
];

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    prompt: 'add an endpoint that lists invoices in app/api/invoices.py',
    languages: ['python'],
    frameworks: ['fastapi'],
    filesNamed: ['app/api/invoices.py'],
    candidates: [match('backend-python')],
    offered: INTENTS.filter((intent) => intent.stack !== 'node'),
    genericOnly: false,
    ...overrides,
  };
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

// A fake transport that records each call and answers with a real Response,
// so the layer parses exactly what node's fetch would hand it.
function fakeFetch(answer: () => Response | Promise<Response>): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return answer();
  };
  return { fetch: fetchImpl, calls };
}

function jevResponse(intent: Record<string, unknown>, extra: Record<string, unknown> = {}, status = 200): Response {
  return new Response(JSON.stringify({ answers: { intent, ...extra }, usage: { cost: 0.00042 } }), { status });
}

function confident(choice = 'backend-python'): Record<string, unknown> {
  return { choice, confidence: 0.9, probabilities: { [choice]: 0.9, frontend: 0.05, __none__: 0.05 } };
}

// A schedule that records cancellation, so a test can prove no deadline timer
// outlives the call.
function spySchedule(fireImmediately = false): { schedule: Schedule; armed: number; cancelled: number } {
  const spy = { schedule: ((callback, _ms) => {
    spy.armed += 1;
    if (fireImmediately) queueMicrotask(callback);
    return () => { spy.cancelled += 1; };
  }) satisfies Schedule, armed: 0, cancelled: 0 };
  return spy;
}

function jevDeps(fetchImpl: typeof fetch, extra: DecisionDeps = {}): DecisionDeps {
  return { fetch: fetchImpl, env: { [KEY_ENV]: KEY }, ...extra };
}

function assertKeyAbsent(decision: Decision): void {
  assert.equal(JSON.stringify(decision).includes(KEY), false);
}

function bodyOf(call: FetchCall | undefined): Record<string, unknown> {
  const raw = call?.init?.body;
  assert.equal(typeof raw, 'string');
  const parsed: unknown = JSON.parse(String(raw));
  assert.ok(isRecord(parsed));
  return parsed;
}

function field(record: unknown, key: string): unknown {
  assert.ok(isRecord(record), `expected an object holding ${key}`);
  return record[key];
}

// --- effectiveSetting -------------------------------------------------------

test('a repo cap of keyword overrides a personal jev setting', () => {
  assert.equal(effectiveSetting('jev', 'keyword', null, ORDER), 'keyword');
});

test('a personal setting more restrictive than the repo cap wins', () => {
  assert.equal(effectiveSetting('llm', 'auto', null, ORDER), 'llm');
  assert.equal(effectiveSetting('keyword', 'jev', 'jev', ORDER), 'keyword');
});

test('an invalid personal value is ignored as if unset', () => {
  assert.equal(effectiveSetting('gpt-please', undefined, 'llm', ORDER), 'llm');
  assert.equal(effectiveSetting('', 'jev', null, ORDER), 'jev');
});

test('no personal value and a null policy default means auto, capped by the repo', () => {
  assert.equal(effectiveSetting(undefined, undefined, null, ORDER), 'auto');
  assert.equal(effectiveSetting(undefined, null, null, ORDER), 'auto');
  assert.equal(effectiveSetting(undefined, 'llm', null, ORDER), 'llm');
});

test('the policy default stands in for an unset personal value', () => {
  assert.equal(effectiveSetting(undefined, undefined, 'jev', ORDER), 'jev');
});

// --- resolveAuto ------------------------------------------------------------

test('auto resolves to jev when the key is set', () => {
  assert.equal(resolveAuto('auto', { [KEY_ENV]: KEY }, KEY_ENV), 'jev');
});

test('auto without a key resolves to llm, never to keyword', () => {
  assert.equal(resolveAuto('auto', { [KEY_ENV]: '' }, KEY_ENV), 'llm');
  assert.equal(resolveAuto('auto', {}, KEY_ENV), 'llm');
  assert.equal(resolveAuto('auto', { PATH: '' }, KEY_ENV), 'llm');
});

test('an explicit mode passes through untouched', () => {
  assert.equal(resolveAuto('keyword', { [KEY_ENV]: KEY }, KEY_ENV), 'keyword');
  assert.equal(resolveAuto('jev', {}, KEY_ENV), 'jev');
});

// --- buildDecisionInput -----------------------------------------------------

test('the input carries the stack, the named files and only the offerable intents', () => {
  const built = buildDecisionInput({
    prompt: 'fix `backend/app/main.py`, see https://example.test/a/b and settings.toml. Also and/or README',
    candidates: [match('bug')],
    genericOnly: true,
    stack: { packages: [pkg('backend', 'python', 'fastapi'), pkg('web', 'node', 'react'), pkg('tools', 'python', null)], focus: null },
    intents: INTENTS,
  });
  assert.deepEqual(built.languages, ['python', 'node']);
  assert.deepEqual(built.frameworks, ['fastapi', 'react']);
  assert.deepEqual(built.filesNamed, ['backend/app/main.py', 'settings.toml', 'and/or']);
  assert.deepEqual(built.offered.map((intent) => intent.id), INTENTS.map((intent) => intent.id));
  assert.equal(built.genericOnly, true);
  assert.deepEqual(built.candidates.map((candidate) => candidate.id), ['bug']);
});

test('a python-only repository is never offered the node row', () => {
  const built = buildDecisionInput({
    prompt: 'add an endpoint',
    candidates: [],
    genericOnly: true,
    stack: { packages: [pkg('.', 'python', 'fastapi')], focus: null },
    intents: INTENTS,
  });
  assert.deepEqual(built.offered.map((intent) => intent.id), ['new-feature', 'backend-python', 'frontend', 'security-files']);
});

// The real registry rows carry stack_frameworks; the fixture rows above do
// not, so these two cases build the pair the way intents.json declares it.
function frameworkRow(id: 'backend' | 'backend-python'): IntentRow {
  const base = row(id, id === 'backend' ? 'node' : 'python');
  return { ...base, stack_frameworks: id === 'backend' ? ['nestjs'] : ['fastapi', 'django', 'flask'] };
}

const FRAMEWORK_INTENTS: IntentRow[] = [row('new-feature'), frameworkRow('backend'), frameworkRow('backend-python'), row('frontend')];

test('a FastAPI backend beside a React frontend is offered the python row and never the NestJS one', () => {
  const built = buildDecisionInput({
    prompt: 'add an endpoint',
    candidates: [],
    genericOnly: true,
    stack: { packages: [pkg('backend', 'python', 'fastapi'), pkg('frontend', 'node', 'react')], focus: null },
    intents: FRAMEWORK_INTENTS,
  });
  assert.deepEqual(built.offered.map((intent) => intent.id), ['new-feature', 'backend-python', 'frontend']);
});

test('a repository with both a NestJS and a FastAPI backend is offered both rows', () => {
  const built = buildDecisionInput({
    prompt: 'add an endpoint',
    candidates: [],
    genericOnly: true,
    stack: { packages: [pkg('api', 'node', 'nestjs'), pkg('ml', 'python', 'fastapi')], focus: null },
    intents: FRAMEWORK_INTENTS,
  });
  assert.deepEqual(built.offered.map((intent) => intent.id), ['new-feature', 'backend', 'backend-python', 'frontend']);
});

test('an unknown stack offers every intent and names at most ten files', () => {
  const prompt = Array.from({ length: 14 }, (_, i) => `src/file${i}.ts`).join(' ');
  const built = buildDecisionInput({ prompt, candidates: [], genericOnly: false, stack: undefined, intents: INTENTS });
  assert.deepEqual(built.languages, []);
  assert.deepEqual(built.frameworks, []);
  assert.equal(built.offered.length, INTENTS.length);
  assert.equal(built.filesNamed.length, 10);
  assert.equal(built.filesNamed[0], 'src/file0.ts');
});

// --- keyword and llm --------------------------------------------------------

test('keyword mode returns the candidates and never calls out', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  const decision = await decide(input({ candidates: [match('backend-python'), match('security-files')] }), 'keyword', 'keyword', policy({ default: null }), jevDeps(transport.fetch));
  assert.deepEqual(Object.keys(decision), ['mode', 'requested', 'intents', 'confidence', 'escalate', 'fallback_reason', 'shadow', 'latency_ms', 'cost_micros', 'escalate_reason']);
  assert.equal(decision.mode, 'keyword');
  assert.equal(decision.requested, 'keyword');
  assert.deepEqual(decision.intents, ['backend-python', 'security-files']);
  assert.equal(decision.confidence, null);
  assert.equal(decision.escalate, false);
  assert.equal(decision.fallback_reason, null);
  assert.deepEqual(decision.shadow, { keyword_intents: ['backend-python', 'security-files'], disagreement: false });
  assert.equal(decision.cost_micros, null);
  assert.equal(decision.escalate_reason, null);
  assert.equal(transport.calls.length, 0);
});

test('llm mode keeps the candidates and escalates a specific floor result not at all', async () => {
  const decision = await decide(input(), 'llm', 'auto', policy(), {});
  assert.equal(decision.mode, 'llm');
  assert.equal(decision.requested, 'auto');
  assert.deepEqual(decision.intents, ['backend-python']);
  assert.equal(decision.confidence, null);
  assert.equal(decision.escalate, false);
});

test('llm mode escalates a generic-only floor result to the router agent', async () => {
  const decision = await decide(input({ genericOnly: true }), 'llm', 'llm', policy(), {});
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'generic-only');
});

test('llm mode escalates when the floor matched nothing', async () => {
  const decision = await decide(input({ candidates: [] }), 'llm', 'llm', policy(), {});
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'no-match');
  assert.deepEqual(decision.intents, []);
});

test('llm mode needs nothing on the machine: an empty PATH and no key still decide as llm', async () => {
  const decision = await decide(input({ genericOnly: true }), 'llm', 'llm', policy(), { env: { PATH: '' } });
  assert.equal(decision.mode, 'llm');
  assert.equal(decision.fallback_reason, null);
  assert.equal(decision.escalate, true);
});

// --- jev: the request -------------------------------------------------------

test('jev sends one POST with the bearer key, the policy model, the state fields and the offered criteria', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  const schedule = spySchedule();
  const given = input();
  const decision = await decide(given, 'jev', 'jev', policy(), jevDeps(transport.fetch, { schedule: schedule.schedule }));

  assert.equal(transport.calls.length, 1);
  const call = transport.calls[0];
  assert.equal(call?.url, ENDPOINT);
  assert.equal(call?.init?.method, 'POST');
  assert.ok(call?.init?.signal instanceof AbortSignal);
  const headers = call?.init?.headers;
  assert.ok(isRecord(headers));
  assert.equal(headers['Authorization'], `Bearer ${KEY}`);
  assert.equal(headers['Content-Type'], 'application/json');

  const body = bodyOf(call);
  assert.equal(body['model'], 'jev-latest');
  assert.deepEqual(body['state'], {
    prompt: given.prompt,
    languages: ['python'],
    frameworks: ['fastapi'],
    files_named: ['app/api/invoices.py'],
  });
  const intentQuestion = field(body['questions'], 'intent');
  assert.equal(field(intentQuestion, 'type'), 'choice');
  assert.equal(typeof field(intentQuestion, 'instructions'), 'string');
  const criteria = field(intentQuestion, 'criteria');
  assert.ok(isRecord(criteria));
  assert.deepEqual(Object.keys(criteria), [...given.offered.map((intent) => intent.id), '__none__']);
  assert.equal(criteria['backend-python'], 'backend-python work. FastAPI API');
  assert.equal(criteria['frontend'], 'frontend work');
  assert.equal(field(field(body['questions'], 'needs_router'), 'type'), 'noul');

  assert.equal(decision.mode, 'jev');
  assert.deepEqual(decision.intents, ['backend-python']);
  assert.equal(decision.confidence, 0.9);
  assert.equal(decision.escalate, false);
  assert.equal(decision.fallback_reason, null);
  assert.equal(decision.cost_micros, 420);
  assert.equal(schedule.armed, 1);
  assert.equal(schedule.cancelled, 1);
  assertKeyAbsent(decision);
});

test('only the policy state fields leave the machine', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  await decide(input(), 'jev', 'jev', policy({ state_fields: ['prompt', 'project_claude_head'] }), jevDeps(transport.fetch));
  const state = field(bodyOf(transport.calls[0]), 'state');
  assert.ok(isRecord(state));
  assert.deepEqual(Object.keys(state), ['prompt']);
});

// --- jev: the answer --------------------------------------------------------

test('jev keeps the floor specific extras beside its choice', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  const decision = await decide(
    input({ candidates: [match('backend-python'), match('security-files')] }),
    'jev', 'jev', policy(), jevDeps(transport.fetch),
  );
  assert.deepEqual(decision.intents, ['backend-python', 'security-files']);
});

test('jev drops a generic-only floor guess in favour of its choice', async () => {
  const transport = fakeFetch(() => jevResponse(confident('backend-python')));
  const decision = await decide(input({ genericOnly: true, candidates: [match('new-feature')] }), 'jev', 'auto', policy(), jevDeps(transport.fetch));
  assert.deepEqual(decision.intents, ['backend-python']);
  assert.equal(decision.requested, 'auto');
  assert.deepEqual(decision.shadow, { keyword_intents: ['new-feature'], disagreement: true });
});

test('jev below min_confidence escalates', async () => {
  const transport = fakeFetch(() => jevResponse({ choice: 'backend-python', confidence: 0.5, probabilities: { 'backend-python': 0.8, frontend: 0.2 } }));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.equal(decision.mode, 'jev');
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'low-confidence');
  assert.equal(decision.confidence, 0.5);
});

test('jev with the top two inside tie_margin escalates', async () => {
  const transport = fakeFetch(() => jevResponse({ choice: 'backend-python', confidence: 0.9, probabilities: { 'backend-python': 0.48, 'new-feature': 0.4, frontend: 0.12 } }));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'tie');
});

test('jev saying the request needs the router escalates', async () => {
  const transport = fakeFetch(() => jevResponse(confident(), { needs_router: { noul: 0.5 } }));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'needs-router');
});

test('jev answering __none__ keeps the keyword intents and escalates', async () => {
  const transport = fakeFetch(() => jevResponse({ choice: '__none__', confidence: 0.8, probabilities: { __none__: 0.8, frontend: 0.2 } }));
  const decision = await decide(input({ candidates: [match('new-feature')] }), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.equal(decision.mode, 'jev');
  assert.deepEqual(decision.intents, ['new-feature']);
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'no-match');
  assert.deepEqual(decision.shadow, { keyword_intents: ['new-feature'], disagreement: false });
});

test('shadow stays on under a written default, so the golden set keeps collecting', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  const measured = policy({
    default: 'jev',
    default_written_by: { date: '2026-10-20', golden_set: 'evals/router-golden/cases.jsonl', scores: {} },
  });
  const decision = await decide(input(), 'jev', 'jev', measured, jevDeps(transport.fetch));
  assert.deepEqual(decision.shadow, { keyword_intents: ['backend-python'], disagreement: false });
});

// --- jev: failures ----------------------------------------------------------

test('jev without a key falls back to llm with no-key and never calls out', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  for (const env of [{}, { [KEY_ENV]: '' }]) {
    const decision = await decide(input(), 'jev', 'jev', policy(), { fetch: transport.fetch, env });
    assert.equal(decision.mode, 'llm');
    assert.equal(decision.fallback_reason, 'no-key');
    assert.deepEqual(decision.intents, ['backend-python']);
    assert.equal(decision.escalate, false);
  }
  assert.equal(transport.calls.length, 0);
});

test('a jev fallback keeps the llm escalation rule: a generic-only floor still goes to the router agent', async () => {
  const decision = await decide(input({ genericOnly: true }), 'jev', 'auto', policy(), { env: {} });
  assert.equal(decision.mode, 'llm');
  assert.equal(decision.fallback_reason, 'no-key');
  assert.equal(decision.escalate, true);
  assert.equal(decision.escalate_reason, 'generic-only');
});

test('no failure path ever lands on the keyword floor', async () => {
  const failures: Array<typeof fetch> = [
    () => Promise.resolve(new Response('no', { status: 529 })),
    () => Promise.resolve(new Response('{"answers": ', { status: 200 })),
    () => Promise.reject(new TypeError('fetch failed')),
  ];
  for (const failing of failures) {
    const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(failing));
    assert.equal(decision.mode, 'llm');
    assert.notEqual(decision.fallback_reason, null);
  }
});

for (const status of [429, 529, 500]) {
  test(`jev answering HTTP ${status} falls back with http-${status}`, async () => {
    const transport = fakeFetch(() => new Response(`upstream says no, key ${KEY}`, { status }));
    const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
    assert.equal(decision.mode, 'llm');
    assert.equal(decision.fallback_reason, `http-${status}`);
    assert.equal(decision.escalate, false);
    assert.deepEqual(decision.intents, ['backend-python']);
    assertKeyAbsent(decision);
  });
}

const BAD_ANSWERS: Array<[string, () => Response]> = [
  ['malformed JSON', () => new Response('{"answers": ', { status: 200 })],
  ['no answers object', () => new Response(JSON.stringify({ result: 'backend-python' }), { status: 200 })],
  ['a choice outside the offered intents', () => jevResponse(confident('backend'))],
  ['a confidence above one', () => jevResponse({ choice: 'backend-python', confidence: 1.4, probabilities: { 'backend-python': 1 } })],
  ['a missing probabilities record', () => jevResponse({ choice: 'backend-python', confidence: 0.9 })],
  ['a non-numeric probability', () => jevResponse({ choice: 'backend-python', confidence: 0.9, probabilities: { 'backend-python': 'high' } })],
  ['a malformed needs_router', () => jevResponse(confident(), { needs_router: { noul: 'yes' } })],
];

for (const [name, answer] of BAD_ANSWERS) {
  test(`jev returning ${name} falls back with bad-answer`, async () => {
    const transport = fakeFetch(answer);
    const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
    assert.equal(decision.mode, 'llm');
    assert.equal(decision.fallback_reason, 'bad-answer');
    assert.deepEqual(decision.intents, ['backend-python']);
    assertKeyAbsent(decision);
  });
}

test('jev that never answers within the budget falls back with timeout', async () => {
  // Never resolves and ignores the abort signal: the deadline must still win,
  // and the real timer must be cleared so it cannot hold the process open.
  const hanging: typeof fetch = () => new Promise<Response>(() => undefined);
  const decision = await decide(input(), 'jev', 'jev', policy({ jev: { endpoint: ENDPOINT, model: 'jev-latest', budget_ms: 5, key_env: KEY_ENV } }), jevDeps(hanging));
  assert.equal(decision.mode, 'llm');
  assert.equal(decision.fallback_reason, 'timeout');
  assertKeyAbsent(decision);
});

test('an aborted fetch is a timeout and the deadline is disarmed', async () => {
  const schedule = spySchedule(true);
  const abortable: typeof fetch = (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(abortable, { schedule: schedule.schedule }));
  assert.equal(decision.fallback_reason, 'timeout');
  assert.equal(schedule.cancelled, 1);
});

test('a rejected fetch falls back with network', async () => {
  const schedule = spySchedule();
  const failing: typeof fetch = () => Promise.reject(new TypeError(`fetch failed for ${KEY}`));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(failing, { schedule: schedule.schedule }));
  assert.equal(decision.mode, 'llm');
  assert.equal(decision.fallback_reason, 'network');
  assert.equal(schedule.cancelled, 1);
  assertKeyAbsent(decision);
});

// --- shadow and latency -----------------------------------------------------

test('shadow reports no disagreement when jev agrees with the floor', async () => {
  const transport = fakeFetch(() => jevResponse(confident()));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.deepEqual(decision.shadow, { keyword_intents: ['backend-python'], disagreement: false });
});

test('shadow reports a disagreement when jev picks another intent', async () => {
  const transport = fakeFetch(() => jevResponse(confident('frontend')));
  const decision = await decide(input(), 'jev', 'jev', policy(), jevDeps(transport.fetch));
  assert.deepEqual(decision.intents, ['frontend', 'backend-python']);
  assert.deepEqual(decision.shadow, { keyword_intents: ['backend-python'], disagreement: true });
});

test('latency is measured on the injected clock', async () => {
  const ticks = [1000, 1037.4];
  const decision = await decide(input(), 'keyword', 'keyword', policy(), { now: () => ticks.shift() ?? 0 });
  assert.equal(decision.latency_ms, 37);
});
