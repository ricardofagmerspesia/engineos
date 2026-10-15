import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDecisionRules } from '../registry/decision-rules';
import { loadIntents } from '../registry/intents';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { judge } from './jev';
import { buildQuestionSet } from './questions';
import type { BreakerState, BreakerStore, JudgeDeps, JudgeInput, JudgeOutcome, JudgePolicy, QuestionSet } from './types';

const root = resolveRoot({}, __dirname);
const shippedPolicy: JudgePolicy = loadPolicy(root).judge;
const questions: QuestionSet = buildQuestionSet({
  intents: loadIntents(root).intents.map((row) => ({ id: row.id, active: row.active })),
  rules: loadDecisionRules(root).rules.map((rule) => ({ id: rule.id, judge_fact: rule.judge_fact })),
});

// Not credential-shaped on purpose: the value only has to be recognisable.
const API_KEY = 'test-judge-key-value';
const ENABLED_ENV: Record<string, string | undefined> = { ENGINEOS_JUDGE: 'jev', TYPESAFE_API_KEY: API_KEY };
const githubToken = (): string => 'gh' + 'p_' + 'x'.repeat(36);

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface FakeTransport {
  fetch: typeof globalThis.fetch;
  calls: FetchCall[];
}

function transport(respond: (call: FetchCall) => Promise<Response>): FakeTransport {
  const calls: FetchCall[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: FetchCall = { url: String(input), init };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

function replying(status: number, body: string): FakeTransport {
  return transport(async () => new Response(body, { status }));
}

interface MemoryBreaker {
  store: BreakerStore;
  events: string[];
}

function memoryBreaker(initial: BreakerState = { failures: 0, opened_at: null }): MemoryBreaker {
  let state: BreakerState = { ...initial };
  const events: string[] = [];
  return {
    events,
    store: {
      read(): BreakerState {
        events.push('read');
        return state;
      },
      recordFailure(now: number): void {
        events.push('failure');
        state = { failures: state.failures + 1, opened_at: now };
      },
      recordSuccess(): void {
        events.push('success');
        state = { failures: 0, opened_at: null };
      },
    },
  };
}

function input(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    text: 'add a settings page to the dashboard',
    source: 'user',
    repository: { declared_stack: ['typescript'], active_spec: false, open_change_record: false },
    session: { last_intent: null },
    ...overrides,
  };
}

// A clock that advances 7 ms per read, so latency is observable and fixed.
function steppingClock(start = 1_000_000): () => number {
  let now = start;
  return () => {
    now += 7;
    return now;
  };
}

interface DepsOptions {
  fetch?: typeof globalThis.fetch | undefined;
  env?: Record<string, string | undefined>;
  breaker?: BreakerStore;
  policy?: Partial<JudgePolicy>;
  now?: () => number;
}

function deps(options: DepsOptions): JudgeDeps {
  return {
    fetch: 'fetch' in options ? options.fetch : undefined,
    now: options.now ?? steppingClock(),
    env: options.env ?? ENABLED_ENV,
    breaker: options.breaker ?? memoryBreaker().store,
    policy: { ...shippedPolicy, ...options.policy },
    questions,
  };
}

// A schema-valid Jev answer for every question in the set.
function validResponse(primary = 'frontend'): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    if (question.type === 'choice') {
      answers[key] = { type: 'choice', choice: primary, confidence: 0.75, probabilities: { [primary]: 0.75, other: 0.25 } };
    } else if (question.type === 'noul') {
      answers[key] = { type: 'noul', noul: 0.25 };
    } else {
      const probabilities = Object.fromEntries(question.criteria.map((_, index) => [String(index), index === 0 ? 1 : 0]));
      answers[key] = { type: 'score', score: 0, legend: {}, probabilities };
    }
  }
  return { model: 'jev-1.13.0', answers, usage: { input_tokens: 321 } };
}

function bodyOf(call: FetchCall | undefined): Record<string, unknown> {
  const body = call?.init?.body;
  if (typeof body !== 'string') throw new Error('expected a string request body');
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('expected a JSON object body');
  return { ...parsed };
}

function assertSkipped(outcome: JudgeOutcome, reason: string): void {
  assert.deepEqual(outcome, { kind: 'skipped', reason });
}

test('text the user did not type is skipped before the switch, the key or the breaker are read', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));
  const breaker = memoryBreaker();

  const outcome = await judge(input({ source: 'notification' }), deps({ fetch: fake.fetch, breaker: breaker.store }));

  assertSkipped(outcome, 'not-user-input');
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(breaker.events, []);
});

test('the judge is disabled unless the pinned switch holds exactly the pinned value', async () => {
  for (const env of [{ TYPESAFE_API_KEY: API_KEY }, { ENGINEOS_JUDGE: '1', TYPESAFE_API_KEY: API_KEY }, { ENGINEOS_JUDGE: 'JEV', TYPESAFE_API_KEY: API_KEY }]) {
    const fake = replying(200, JSON.stringify(validResponse()));
    const breaker = memoryBreaker();

    const outcome = await judge(input(), deps({ fetch: fake.fetch, env, breaker: breaker.store }));

    assertSkipped(outcome, 'disabled');
    assert.equal(fake.calls.length, 0);
    assert.deepEqual(breaker.events, []);
  }
});

test('a missing or blank key is skipped as no-key without a request', async () => {
  for (const key of [undefined, '', '   ']) {
    const fake = replying(200, JSON.stringify(validResponse()));

    const outcome = await judge(input(), deps({ fetch: fake.fetch, env: { ENGINEOS_JUDGE: 'jev', TYPESAFE_API_KEY: key } }));

    assertSkipped(outcome, 'no-key');
    assert.equal(fake.calls.length, 0);
  }
});

test('a runtime without fetch is skipped as no-fetch', async () => {
  const outcome = await judge(input(), deps({ fetch: undefined }));

  assertSkipped(outcome, 'no-fetch');
});

test('an endpoint off the allowlisted origin is skipped as disabled with no transport call and no breaker read', async () => {
  const offOrigin = [
    'https://judge.example.com/v1/systemone',
    'https://api.typesafe.ai:8443/v1/systemone',
    'http://api.typesafe.ai/v1/systemone',
    'https://api.typesafe.ai.example.com/v1/systemone',
    'https://' + 'user' + ':' + 'pw' + '@' + 'api.typesafe.ai/v1/systemone',
    'not a url',
  ];
  for (const endpoint of offOrigin) {
    const fake = replying(200, JSON.stringify(validResponse()));
    const breaker = memoryBreaker();

    const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store, policy: { endpoint } }));

    assertSkipped(outcome, 'disabled');
    assert.equal(fake.calls.length, 0, endpoint);
    assert.deepEqual(breaker.events, [], endpoint);
  }
});

test('an open breaker inside its cooldown skips the call', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));
  const now = (): number => 100_000;
  const breaker = memoryBreaker({ failures: 3, opened_at: 100_000 - shippedPolicy.breaker.cooldown_ms + 1 });

  const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store, now }));

  assertSkipped(outcome, 'breaker-open');
  assert.equal(fake.calls.length, 0);
});

test('once the cooldown has elapsed one half-open probe goes out and its success closes the breaker', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));
  const now = (): number => 100_000;
  const breaker = memoryBreaker({ failures: 3, opened_at: 100_000 - shippedPolicy.breaker.cooldown_ms });

  const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store, now }));

  assert.equal(outcome.kind, 'facts');
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(breaker.events, ['read', 'success']);
});

test('a valid answer becomes facts with the reported input tokens and records a breaker success', async () => {
  const fake = replying(200, JSON.stringify(validResponse('frontend')));
  const breaker = memoryBreaker();

  const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store }));

  assert.equal(outcome.kind, 'facts');
  if (outcome.kind !== 'facts') return;
  assert.equal(outcome.tokens_in, 321);
  assert.equal(outcome.facts.source, 'jev');
  assert.equal(outcome.facts.model, 'jev-1.13.0');
  assert.deepEqual(outcome.facts.primary, { id: 'frontend', confidence: 0.75, margin: 0.5 });
  assert.equal(outcome.facts.latency_ms, 7);
  assert.deepEqual(breaker.events, ['read', 'success']);
});

test('the request is one POST to the policy endpoint that refuses redirects', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));

  await judge(input(), deps({ fetch: fake.fetch }));

  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0];
  assert.equal(call?.url, shippedPolicy.endpoint);
  assert.equal(call?.init?.method, 'POST');
  assert.equal(call?.init?.redirect, 'error');
  assert.ok(call?.init?.signal instanceof AbortSignal);
});

test('the key travels only in the Authorization header, never in the body', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));

  await judge(input(), deps({ fetch: fake.fetch }));

  const call = fake.calls[0];
  const headers = new Headers(call?.init?.headers);
  assert.equal(headers.get('authorization'), `Bearer ${API_KEY}`);
  assert.equal(headers.get('content-type'), 'application/json');
  const raw = call?.init?.body;
  assert.equal(typeof raw, 'string');
  assert.ok(typeof raw === 'string' && !raw.includes(API_KEY));
});

test('the body carries exactly model, state and questions, with the prompt redacted', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));
  const text = `deploy with ${githubToken()} please`;

  await judge(input({ text }), deps({ fetch: fake.fetch, env: { ...ENABLED_ENV, UNRELATED_SECRET: 'env-value-never-sent' } }));

  const body = bodyOf(fake.calls[0]);
  assert.deepEqual(Object.keys(body), ['model', 'state', 'questions']);
  assert.equal(body['model'], shippedPolicy.model);
  assert.deepEqual(body['questions'], questions);
  assert.deepEqual(body['state'], {
    request: { text: 'deploy with <redacted:github-token> please', source: 'user' },
    repository: { declared_stack: ['typescript'], active_spec: false, open_change_record: false },
    session: { last_intent: null },
  });
  const raw = fake.calls[0]?.init?.body;
  assert.ok(typeof raw === 'string' && !raw.includes('env-value-never-sent'));
});

test('HTTP statuses map onto the closed failure vocabulary and each one counts against the breaker', async () => {
  const cases: [number, string][] = [
    [429, 'http-429'],
    [400, 'http-4xx'],
    [404, 'http-4xx'],
    [500, 'http-5xx'],
    [503, 'http-5xx'],
    [529, 'http-5xx'],
    [302, 'invalid-response'],
  ];
  for (const [status, reason] of cases) {
    const breaker = memoryBreaker();

    const outcome = await judge(input(), deps({ fetch: replying(status, '{}').fetch, breaker: breaker.store }));

    assert.deepEqual(outcome, { kind: 'failed', reason }, String(status));
    assert.deepEqual(breaker.events, ['read', 'failure'], String(status));
  }
});

test('a rejecting transport fails as network and its error text never leaves the module', async () => {
  const breaker = memoryBreaker();
  const fake = transport(async () => {
    throw new Error(`connect failed with ${API_KEY}`);
  });

  const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'network' });
  assert.ok(!JSON.stringify(outcome).includes(API_KEY));
  assert.deepEqual(breaker.events, ['read', 'failure']);
});

test('a body that is not JSON fails as invalid-response', async () => {
  const outcome = await judge(input(), deps({ fetch: replying(200, 'not json').fetch }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'invalid-response' });
});

test('JSON that fails the answer schema fails as invalid-response and counts against the breaker', async () => {
  const breaker = memoryBreaker();
  const response = validResponse();
  response['answers'] = {};

  const outcome = await judge(input(), deps({ fetch: replying(200, JSON.stringify(response)).fetch, breaker: breaker.store }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'invalid-response' });
  assert.deepEqual(breaker.events, ['read', 'failure']);
});

test('a transport that ignores the abort signal and never settles still fails as timeout at the deadline', async () => {
  const breaker = memoryBreaker();
  const fake = transport(() => new Promise<Response>(() => undefined));
  const started = Date.now();

  const outcome = await judge(input(), deps({ fetch: fake.fetch, breaker: breaker.store, policy: { timeout_ms: 30 } }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'timeout' });
  assert.deepEqual(breaker.events, ['read', 'failure']);
  assert.ok(Date.now() - started < 5_000);
});

test('a cooperative transport that rejects on abort fails as timeout, not network', async () => {
  const fake = transport(
    (call) =>
      new Promise<Response>((_, reject) => {
        call.init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );

  const outcome = await judge(input(), deps({ fetch: fake.fetch, policy: { timeout_ms: 30 } }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'timeout' });
});

test('a state that cannot fit even with empty text fails as oversize-state before any request, without touching the breaker', async () => {
  const fake = replying(200, JSON.stringify(validResponse()));
  const breaker = memoryBreaker();
  const crowded = input({ repository: { declared_stack: Array.from({ length: 40 }, (_, i) => `stack-${i}`), active_spec: true, open_change_record: true } });

  const outcome = await judge(crowded, deps({ fetch: fake.fetch, breaker: breaker.store, policy: { max_state_bytes: 200 } }));

  assert.deepEqual(outcome, { kind: 'failed', reason: 'oversize-state' });
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(breaker.events, ['read']);
});
