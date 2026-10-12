import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import { loadRouterDecisionPolicy, type RouterMode } from '../registry/policy-router-decision';
import { relocatedRoot, tempRoot } from '../testing/harness';
import type { GoldenCase } from './router-golden-cases';
import { parseCases } from './router-golden-cases';
import { replaceDefault } from './router-golden-policy';
import { CASES_FILE, RESULTS_FILE, routerGoldenCommand } from './router-golden';
import { advisorCaseRouter, type CaseOutcome, type CaseRouterFactory } from './router-golden-run';

const checkout = resolveRoot({}, __dirname);
const NOW = Date.parse('2026-10-12T12:00:00Z');

const CASES = [
  { id: 'rg-001', source: 'real', repo: 'labv-assist', stack: ['python:fastapi'], prompt: 'add an endpoint that lists invoices', expect_intents: ['backend-python'], expect_escalate: false, collected_at: '2026-10-12', note: '' },
  { id: 'rg-002', source: 'real', repo: 'gest-leite', stack: ['node:nestjs'], prompt: 'add a controller for herds', expect_intents: ['backend'], expect_escalate: false, collected_at: '2026-10-12', note: '' },
  { id: 'rg-003', source: 'synthetic', repo: 'demo', stack: ['node:react'], prompt: 'build a settings page component', expect_intents: ['frontend'], expect_escalate: false, collected_at: '2026-10-12', note: '' },
];

type Table = Partial<Record<RouterMode, Record<string, string[]>>>;

// A fake router answering from a table: per mode, per case id, the intents.
function tableRouter(table: Table): CaseRouterFactory {
  return () => ({
    route: async (item: GoldenCase, mode: RouterMode): Promise<CaseOutcome> => ({
      intents: table[mode]?.[item.id] ?? [],
      fallback: false,
      escalate: false,
      latencyMs: 5,
    }),
    dispose: () => undefined,
  });
}

const ALL_RIGHT = { 'rg-001': ['backend-python'], 'rg-002': ['backend'], 'rg-003': ['frontend'] };
const ONE_MISS = { 'rg-001': ['backend-python'], 'rg-002': ['backend'], 'rg-003': ['new-feature'] };

function engineosRoot(t: TestContext, cases: unknown[] | null): string {
  const root = relocatedRoot(tempRoot(t));
  if (cases !== null) {
    mkdirSync(join(root, 'evals', 'router-golden'), { recursive: true });
    writeFileSync(join(root, CASES_FILE), cases.map((item) => JSON.stringify(item)).join('\n') + '\n');
  }
  return root;
}

async function run(root: string, argv: string[], caseRouter: CaseRouterFactory): Promise<{ status: number; stdout: string; stderr: string }> {
  const io = memoryIo({ env: { ENGINEOS_ROOT: root }, cwd: root });
  const command = routerGoldenCommand({ now: () => NOW, spawn: spawnSync, caseRouter });
  const status = await command(['run', ...argv], io);
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

test('run reports every policy mode and leaves the default alone without --write-default', async (t) => {
  const root = engineosRoot(t, CASES);
  const before = readFileSync(join(root, 'registries', 'policy.json'), 'utf8');
  const { status, stdout } = await run(root, [], tableRouter({ keyword: ONE_MISS, llm: ONE_MISS, jev: ALL_RIGHT }));
  assert.equal(status, 0);
  for (const mode of ['keyword', 'llm', 'jev']) assert.match(stdout, new RegExp(`${mode} intent_accuracy`));
  assert.match(stdout, /jev wins/);
  assert.match(stdout, /default unchanged \(null\)/);
  assert.equal(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'), before);
  const results = readFileSync(join(root, RESULTS_FILE), 'utf8');
  assert.match(results, /\| jev \| 1\.000 \| 1\.000 \| 5 \| 0\.000 \| 0\.000 \|/);
  assert.match(results, /\| keyword \| 0\.667 \|/);
  assert.match(results, /\| rg-003 \| keyword \| frontend \| new-feature \|/);
  assert.match(results, /Cases: 3 \(real 2, synthetic 1\)/);
  assert.ok(!results.includes('lists invoices'), 'RESULTS.md carries ids, never prompts');
});

test('--write-default writes the winner and the policy round-trips through the strict loader', async (t) => {
  const root = engineosRoot(t, CASES);
  const before = readFileSync(join(root, 'registries', 'policy.json'), 'utf8');
  const { status, stdout } = await run(root, ['--write-default'], tableRouter({ keyword: ONE_MISS, llm: ONE_MISS, jev: ALL_RIGHT }));
  assert.equal(status, 0, stdout);
  assert.match(stdout, /default written: jev/);
  const policy = loadRouterDecisionPolicy(root);
  assert.equal(policy.default, 'jev');
  assert.equal(policy.default_written_by?.date, '2026-10-12');
  assert.match(policy.default_written_by?.golden_set ?? '', /^evals\/router-golden\/cases\.jsonl sha256:[0-9a-f]{12} cases:3$/);
  assert.equal(policy.default_written_by?.scores.jev?.intent_accuracy, 1);
  assert.equal(policy.default_written_by?.scores.keyword?.intent_accuracy, 0.6667);
  // Only the two values changed: everything outside them is byte-identical.
  const after = readFileSync(join(root, 'registries', 'policy.json'), 'utf8');
  const restored = replaceDefault(after, { mode: null, writtenBy: null });
  assert.equal(restored, before);
  // A later tie retires the winner: shadow again.
  const tie = await run(root, ['--write-default'], tableRouter({ keyword: ALL_RIGHT, llm: ALL_RIGHT, jev: ALL_RIGHT }));
  assert.match(tie.stdout, /default written: null \(shadow continues\)/);
  assert.equal(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'), before);
});

test('--write-default leaves the default null on a tie and says why', async (t) => {
  const root = engineosRoot(t, CASES);
  const before = readFileSync(join(root, 'registries', 'policy.json'), 'utf8');
  const { status, stdout } = await run(root, ['--write-default'], tableRouter({ keyword: ALL_RIGHT, llm: ALL_RIGHT, jev: ONE_MISS }));
  assert.equal(status, 0);
  assert.match(stdout, /no winner — tie on intent_accuracy 1\.000 between keyword, llm/);
  assert.match(stdout, /default already null \(shadow continues\)/);
  assert.equal(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'), before);
  assert.equal(loadRouterDecisionPolicy(root).default, null);
});

test('--write-default leaves the default null when the leader is below full stack correctness', async (t) => {
  const root = engineosRoot(t, CASES);
  // jev keeps the NestJS row in a FastAPI case: accurate, but foreign-stack.
  const foreign = { ...ALL_RIGHT, 'rg-001': ['backend-python', 'backend'] };
  const { stdout } = await run(root, ['--write-default'], tableRouter({ keyword: ONE_MISS, llm: ONE_MISS, jev: foreign }));
  assert.match(stdout, /jev leads on intent_accuracy but its stack_correctness is 0\.667 < 1\.0/);
  assert.equal(loadRouterDecisionPolicy(root).default, null);
});

test('--write-default refuses to decide from a run that skipped a mode', async (t) => {
  const root = engineosRoot(t, CASES);
  const { stdout } = await run(root, ['--mode', 'jev', '--write-default'], tableRouter({ jev: ALL_RIGHT }));
  assert.match(stdout, /did not score keyword, llm/);
  assert.ok(!/ keyword intent_accuracy/.test(stdout), 'only the requested mode is scored');
  assert.equal(loadRouterDecisionPolicy(root).default, null);
});

test('run with no cases says so and exits 0', async (t) => {
  const root = engineosRoot(t, null);
  const { status, stdout } = await run(root, ['--write-default'], tableRouter({}));
  assert.equal(status, 0);
  assert.match(stdout, /router-golden run: no cases in evals\/router-golden\/cases\.jsonl/);
  assert.ok(!existsSync(join(root, RESULTS_FILE)));
});

test('run refuses a malformed or uncurated case with exit 1', async (t) => {
  const root = engineosRoot(t, [{ ...CASES[0], expect_intents: null }]);
  const { status, stderr } = await run(root, [], tableRouter({}));
  assert.equal(status, 1);
  assert.match(stderr, /expect_intents must be a non-empty list/);
});

test('run rejects an unknown mode as a usage error', async (t) => {
  const root = engineosRoot(t, CASES);
  const { status, stderr } = await run(root, ['--mode', 'gpt'], tableRouter({}));
  assert.equal(status, 2);
  assert.match(stderr, /--mode takes keyword\|llm\|jev/);
});

test('parseCases accepts a manifest-less case and refuses duplicates and bad stacks', () => {
  const ok = parseCases(JSON.stringify({ ...CASES[0], stack: [] }));
  assert.deepEqual(ok.malformed, []);
  assert.deepEqual(ok.cases[0]?.packages, []);
  const bad = parseCases([JSON.stringify(CASES[0]), JSON.stringify(CASES[0]), JSON.stringify({ ...CASES[1], stack: ['python:react'] }), 'nope'].join('\n'));
  assert.equal(bad.cases.length, 1);
  assert.equal(bad.malformed.length, 3);
});

// The real path: resolve-task then the advisor's routeDecision, per mode, in a
// throwaway FastAPI project. The network is a fake; the key is a test value.
test('advisorCaseRouter routes a case end to end in every mode, with fallbacks visible', async () => {
  const item = parseCases(JSON.stringify(CASES[0])).cases[0];
  assert.ok(item !== undefined);
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      answers: { intent: { choice: 'backend-python', confidence: 0.92, probabilities: { 'backend-python': 0.92, frontend: 0.05 } }, needs_router: { noul: 0.1 } },
    }), { status: 200 });
  };
  const withKey = advisorCaseRouter(checkout, { env: { TYPESAFE_API_KEY: 'test-key-not-real' }, fetch: fakeFetch, hasClaudeCli: () => true });
  const noKey = advisorCaseRouter(checkout, { env: {}, fetch: fakeFetch, hasClaudeCli: () => false });
  try {
    const keyword = await withKey.route(item, 'keyword');
    assert.ok(keyword.intents.includes('backend-python'));
    assert.ok(!keyword.intents.includes('backend'), 'the floor rebinds NestJS away in a FastAPI project');
    assert.equal(keyword.fallback, false);
    const jev = await withKey.route(item, 'jev');
    assert.equal(jev.intents[0], 'backend-python');
    assert.equal(jev.fallback, false);
    assert.equal(calls.length, 1);
    const llm = await withKey.route(item, 'llm');
    assert.equal(llm.fallback, false);
    assert.deepEqual(await noKey.route(item, 'jev').then((outcome) => outcome.fallback), true);
    assert.deepEqual(await noKey.route(item, 'llm').then((outcome) => outcome.fallback), true);
    assert.equal(calls.length, 1, 'no key, no call');
  } finally {
    withKey.dispose();
    noKey.dispose();
  }
  // The registry the scorer reads is the checkout's own.
  assert.ok(lazyRegistries(checkout).intents.intents.some((intent) => intent.id === 'backend-python'));
});
