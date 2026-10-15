// The prompt advisor with the routing decision layer, driven in process
// through runWith so the network, the CLI probe and the clock are injected.
// No case reaches the network: every case that could call Jev passes a fake
// fetch that records its calls.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, relocatedRoot, runCli, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import type { HookContext } from './output';
import { runWith } from './prompt-advisor';
import { routerNote } from './prompt-advisor-router';

const checkout = resolveRoot({}, __dirname);
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };
const KEY = 'sk-test-advisor-router-0000';
const PROMPT = 'add an endpoint that lists invoices';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function ctxWith(env: NodeJS.ProcessEnv, root: string = checkout): HookContext {
  return { io: memoryIo({ env: { ...ISOLATED, ...env } }), root, now: () => 1000, spawn: spawnSync };
}

function promptOf(prompt: string, cwd: string, sid: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: JSON.stringify({ prompt, cwd, session_id: sid }) }));
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

interface FakeTransport {
  fetch: typeof fetch;
  calls: number;
}

function jevAnswering(choice: string, confidence = 0.9): FakeTransport {
  const transport: FakeTransport = {
    calls: 0,
    fetch: async () => {
      transport.calls += 1;
      return new Response(
        JSON.stringify({
          answers: { intent: { choice, confidence, probabilities: { [choice]: confidence, __none__: 1 - confidence } } },
          usage: { cost: 0.00042 },
        }),
        { status: 200 },
      );
    },
  };
  return transport;
}

function neverCalled(): FakeTransport {
  const transport: FakeTransport = {
    calls: 0,
    fetch: async () => {
      transport.calls += 1;
      throw new Error('the network must not be reached');
    },
  };
  return transport;
}

// A FastAPI backend beside a React frontend: the shape that left every such
// repository on the NestJS row before the framework-first rebind.
function fastapiReactRepo(t: TestContext, extra: Record<string, string> = {}): string {
  return fixtureRepo(tempRoot(t), {
    files: {
      'backend/requirements.txt': 'fastapi>=0.110\n',
      'frontend/package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
      ...extra,
    },
  });
}

async function advise(env: HookEnvelope, ctx: HookContext, deps: Parameters<typeof runWith>[2]): Promise<string> {
  const decision = await runWith(env, ctx, deps);
  return decision.kind === 'context' ? decision.text : '';
}

function contractLine(text: string): string {
  return text.split('\n').find((line) => line.startsWith('[engineos] task contract')) ?? '';
}

function spans(repo: string, sid: string): Record<string, unknown>[] {
  return readFileSync(join(repo, '.git', 'engineos-telemetry', `${sid}.exec.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error(`not a JSON object: ${line}`);
      return parsed;
    });
}

test('unset means the policy default (jev); without a key it degrades to llm out loud, rebinds to the FastAPI row and hands a generic prompt to the router agent', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const text = await advise(promptOf(PROMPT, repo, 'r1'), ctxWith({ PATH: '' }), { fetch: neverCalled().fetch });
  const line = contractLine(text);
  assert.match(line, /intents=backend-python /);
  assert.match(line, /rules=backend-python,architecture,data,testing,observability /);
  assert.match(line, /skills=python-patterns /);
  assert.match(line, / router=llm rebound=backend->backend-python\(framework\/repo\) — load these/);
  assert.ok(text.includes('[engineos] router: llm (jev unavailable: no-key)'), text);
  assert.ok(text.includes('[engineos] router: llm could not decide (generic-only)'), text);
  assert.ok(text.includes('these candidates before any write: backend-python.'), text);
});

test('the package holding the working directory decides the rebind first', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const text = await advise(promptOf(PROMPT, join(repo, 'backend'), 'r1b'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }), {});
  assert.match(contractLine(text), /rebound=backend->backend-python\(framework\/package\)/);
});

test('a NestJS repository keeps the node row with no rebind', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fixtureRepo(tempRoot(t), { files: { 'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }) } });
  const text = await advise(promptOf(PROMPT, repo, 'r2'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }), {});
  const line = contractLine(text);
  assert.match(line, /intents=backend /);
  assert.ok(!line.includes('rebound='), line);
});

test('keyword mode names itself and never hands off', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const text = await advise(promptOf(PROMPT, repo, 'r3'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }), {});
  assert.match(contractLine(text), / router=keyword rebound=/);
  assert.ok(!text.includes('could not decide'), text);
  assert.ok(!text.includes('[engineos] router:'), text);
});

test('jev without its key falls back to llm out loud, keeps the handoff, and never calls out', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const transport = neverCalled();
  const text = await advise(promptOf(PROMPT, repo, 'r4'), ctxWith({ ENGINEOS_ROUTER: 'jev' }), { fetch: transport.fetch });
  assert.ok(text.includes('[engineos] router: llm (jev unavailable: no-key)'), text);
  assert.match(contractLine(text), / router=llm /);
  assert.ok(text.includes('[engineos] router: llm could not decide (generic-only)'), text);
  assert.equal(transport.calls, 0);
});

test('a repo cap of keyword lowers a personal jev and says so', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const config = {
    version: 1,
    stack: { packages: [{ dir: 'backend', language: 'python', framework: 'fastapi', compose_service: null }] },
    router: { mode: 'keyword' },
  };
  const repo = fastapiReactRepo(t, { '.engineos/config.json': JSON.stringify(config) });
  const transport = neverCalled();
  const text = await advise(promptOf(PROMPT, repo, 'r5'), ctxWith({ ENGINEOS_ROUTER: 'jev', TYPESAFE_API_KEY: KEY }), { fetch: transport.fetch });
  assert.ok(text.includes('[engineos] router: keyword (jev unavailable: repo-cap)'), text);
  assert.match(contractLine(text), / router=keyword /);
  assert.equal(transport.calls, 0);
});

test('when jev chooses another intent the contract follows its rows and keeps the kernel gates', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const keyword = contractLine(await advise(promptOf(PROMPT, repo, 'r6k'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }), {}));
  const text = await advise(promptOf(PROMPT, repo, 'r6'), ctxWith({ ENGINEOS_ROUTER: 'jev', TYPESAFE_API_KEY: KEY }), { fetch: jevAnswering('frontend').fetch });
  const line = contractLine(text);
  assert.match(line, /intents=frontend agents=frontend-coordinator rules=frontend,architecture,testing /);
  assert.match(line, /skills=react-patterns /);
  assert.match(line, / router=jev\/0\.90 /);
  // The model picks an intent, never a gate: policy rules and the floor stay.
  const policyRules = /policy_rules=(\S+)/;
  const floor = /risk_floor=(\S+)/;
  assert.equal(policyRules.exec(line)?.[1], policyRules.exec(keyword)?.[1]);
  assert.equal(floor.exec(line)?.[1], floor.exec(keyword)?.[1]);
  assert.ok(!text.includes('could not decide'), text);
});

test('a resubmitted prompt is answered from the session cache, and the span says so', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  const transport = jevAnswering('backend-python');
  const env = { ENGINEOS_ROUTER: 'jev', TYPESAFE_API_KEY: KEY };
  const first = await advise(promptOf(PROMPT, repo, 'cache1'), ctxWith(env), { fetch: transport.fetch });
  const second = await advise(promptOf(PROMPT, repo, 'cache1'), ctxWith(env), { fetch: transport.fetch });
  assert.equal(transport.calls, 1);
  assert.equal(second, first);
  const written = spans(repo, 'cache1');
  assert.equal(written.length, 2);
  assert.equal(written[0]?.['cache_hit'], false);
  assert.equal(written[1]?.['cache_hit'], true);
  // Another session pays for its own call.
  await advise(promptOf(PROMPT, repo, 'cache2'), ctxWith(env), { fetch: transport.fetch });
  assert.equal(transport.calls, 2);
});

test('the router span carries the mode, the model, the cost and an id-only note', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  await advise(promptOf(`${PROMPT} zqxjkw`, repo, 'span1'), ctxWith({ ENGINEOS_ROUTER: 'jev', TYPESAFE_API_KEY: KEY }), { fetch: jevAnswering('frontend').fetch });
  const file = join(repo, '.git', 'engineos-telemetry', 'span1.exec.jsonl');
  const span = spans(repo, 'span1')[0] ?? {};
  assert.equal(span['span_kind'], 'router');
  assert.equal(span['provider'], 'jev');
  assert.equal(span['model'], 'jev-latest');
  assert.equal(span['cost_micros'], 420);
  assert.equal(span['cache_hit'], false);
  assert.equal(span['route'], 'frontend');
  assert.equal(span['note'], 'req=jev conf=0.90 esc=0 fb=- kw=backend-python dis=1');
  assert.ok(!readFileSync(file, 'utf8').includes('zqxjkw'));
  assert.ok(!readFileSync(file, 'utf8').includes(KEY));
  assert.equal(runCli(['journal', 'validate', file]).status, 0);
});

test('a failing decision path renders the kernel contract with an error fallback', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const broken = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['router_decision'];
    },
  });
  const text = await advise(promptOf(PROMPT, repo, 'err1'), ctxWith({}, broken), {});
  assert.ok(text.includes('[engineos] router: llm (auto unavailable: error)'), text);
  assert.match(contractLine(text), /intents=backend-python .* router=llm rebound=/);
  assert.ok(text.includes('[engineos] router: llm could not decide (generic-only)'), text);
});

test('a failing decision path under an explicit keyword setting stays keyword', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const config = {
    version: 1,
    stack: { packages: [{ dir: 'backend', language: 'python', framework: 'fastapi', compose_service: null }] },
    router: { mode: 'keyword' },
  };
  const capped = fastapiReactRepo(t, { '.engineos/config.json': JSON.stringify(config) });
  const broken = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      delete policy['router_decision'];
    },
  });
  // Policy loading fails before the repo cap is read, so the setting the error
  // reports is the personal one; an explicit keyword personal setting holds.
  const text = await advise(promptOf(PROMPT, capped, 'err2'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }, broken), {});
  assert.ok(text.includes('[engineos] router: keyword (keyword unavailable: error)'), text);
  assert.match(contractLine(text), / router=keyword rebound=/);
  assert.ok(!text.includes('could not decide'), text);
});

test('a pure question never reaches the decision layer', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const transport = neverCalled();
  const text = await advise(promptOf('what does this function return?', repo, 'q1'), ctxWith({ ENGINEOS_ROUTER: 'jev', TYPESAFE_API_KEY: KEY }), { fetch: transport.fetch });
  assert.equal(text, '');
  assert.equal(transport.calls, 0);
});

test('an empty cwd never resolves a project, so nothing is rebound', async () => {
  const text = await advise(promptOf(PROMPT, '', 'nocwd'), ctxWith({ ENGINEOS_ROUTER: 'keyword' }), {});
  assert.ok(!contractLine(text).includes('rebound='));
});

test('a cached stack is reused and a garbled one is recomputed', async (t) => {
  if (!hasGit()) return t.skip('git is not installed');
  const repo = fastapiReactRepo(t);
  const env = { ENGINEOS_ROUTER: 'keyword' };
  const first = await advise(promptOf(PROMPT, repo, 'stack1'), ctxWith(env), {});
  const dir = join(repo, '.git', 'engineos-route-cache', 'stack1-advisor-0');
  const cached = spawnSync('ls', [dir], { encoding: 'utf8' }).stdout.split('\n').find((name) => name.startsWith('stack-'));
  assert.notEqual(cached, undefined);
  writeFileSync(join(dir, cached ?? ''), '{ not json');
  assert.equal(await advise(promptOf(PROMPT, repo, 'stack1'), ctxWith(env), {}), first);
});

test('the note is cut inside the journal value cap by trimming the keyword list', () => {
  const keyword = Array.from({ length: 60 }, (_, i) => `intent-number-${i}`);
  const note = routerNote({ requested: 'auto', confidence: 0.5, escalate: true, fallback: null, keyword, disagreement: true });
  assert.ok(note.length <= 256, String(note.length));
  assert.ok(note.startsWith('req=auto conf=0.50 esc=1 fb=- kw=intent-number-0,'));
  assert.ok(note.endsWith(' dis=1'));
  assert.equal(routerNote({ requested: 'keyword', confidence: null, escalate: false, fallback: 'error', keyword: [], disagreement: null }), 'req=keyword conf=- esc=0 fb=error kw=- dis=-');
});
