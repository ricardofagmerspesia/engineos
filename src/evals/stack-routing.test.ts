import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { KernelError } from '../lib/json';
import { detectPackages } from '../kernel/stack';
import type { Answer } from '../kernel/resolve';
import { resolveRoot } from '../registry/paths';
import type { Language } from '../registry/project-config';
import { tempRoot } from '../testing/harness';
import { grader } from './deterministic';
import { gradeStackRouting, kernelStackRouter, parseCaseStack, type StackRouter, type StackRouterFactory, type CasePackage } from './stack-routing';

const checkout = resolveRoot({}, __dirname);

// A grading root carrying only what the grader reads: intents.json, with the
// backend pair declaring their stacks.
function gradingRoot(t: TestContext): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'registries'));
  writeFileSync(join(root, 'registries', 'intents.json'), JSON.stringify({
    intents: [
      { id: 'backend', stack: 'node' },
      { id: 'backend-python', stack: 'python' },
      { id: 'new-feature' },
    ],
  }));
  return root;
}

function fakeRouter(route: StackRouter): { factory: StackRouterFactory; disposed: () => boolean } {
  let disposed = false;
  return {
    factory: () => ({ route, dispose: () => { disposed = true; } }),
    disposed: () => disposed,
  };
}

function grade(root: string, cases: unknown[], factory: StackRouterFactory): string {
  const io = memoryIo();
  gradeStackRouting(root, cases, grader(io), factory);
  return io.stdout.join('');
}

const PY_CASE = { id: 'py-1', input: 'add an endpoint', expect_intents: ['backend-python'], stack: ['python'] };
const PY: CasePackage = { language: 'python', framework: null };
const NODE: CasePackage = { language: 'node', framework: null };

test('parseCaseStack separates untagged, tagged and malformed stacks', () => {
  assert.deepEqual(parseCaseStack(undefined), { kind: 'untagged' });
  assert.deepEqual(parseCaseStack(['python']), { kind: 'tagged', languages: ['python'], packages: [PY] });
  assert.deepEqual(parseCaseStack(['python', 'node']), { kind: 'tagged', languages: ['python', 'node'], packages: [PY, NODE] });
  assert.deepEqual(parseCaseStack(['python:fastapi', 'node:react']), {
    kind: 'tagged',
    languages: ['python', 'node'],
    packages: [{ language: 'python', framework: 'fastapi' }, { language: 'node', framework: 'react' }],
  });
  // Two node packages with different frameworks are two packages, not a duplicate.
  assert.equal(parseCaseStack(['node:nestjs', 'node:react']).kind, 'tagged');
  for (const bad of [null, 'python', [], ['ruby'], ['node', 'node'], [1], ['python:react'], ['node:rails'], ['python:fastapi:x']]) {
    assert.deepEqual(parseCaseStack(bad), { kind: 'malformed' }, JSON.stringify(bad));
  }
});

test('a set with no stack-tagged case prints nothing and never builds a router', (t) => {
  let built = false;
  const out = grade(gradingRoot(t), [{ id: 'a', input: 'x' }], () => {
    built = true;
    return { route: () => [], dispose: () => undefined };
  });
  assert.equal(out, '');
  assert.equal(built, false);
});

test('a case whose expected intents survive under its stack passes, and the router is disposed', (t) => {
  const seen: (readonly CasePackage[])[] = [];
  const router = fakeRouter((_prompt, packages) => {
    seen.push(packages);
    return ['backend-python'];
  });
  const out = grade(gradingRoot(t), [PY_CASE], router.factory);
  assert.equal(out, [
    'ok   every stack field lists python/node packages, optionally :framework, each at most once',
    'ok   every stack-tagged case routes to its expect_intents under its stack (1 cases)',
    '',
  ].join('\n'));
  assert.deepEqual(seen, [[PY]]);
  assert.equal(router.disposed(), true);
});

test('a missing expected intent and a foreign-stack intent are both named, with what routed', (t) => {
  const router = fakeRouter(() => ['backend', 'new-feature']);
  const out = grade(gradingRoot(t), [PY_CASE], router.factory);
  assert.ok(out.includes('FAIL stack-tagged cases misrouted: py-1(missing backend-python; foreign-stack backend; got backend,new-feature)\n'), out);
});

test('a mixed-stack case accepts an intent of either stack', (t) => {
  const router = fakeRouter(() => ['backend']);
  const out = grade(gradingRoot(t), [{ id: 'mix', input: 'add a controller', expect_intents: ['backend'], stack: ['python', 'node'] }], router.factory);
  assert.ok(out.includes('ok   every stack-tagged case routes to its expect_intents under its stack (1 cases)\n'), out);
});

test('a malformed stack field is reported and that case is not routed', (t) => {
  const routed: string[] = [];
  const router = fakeRouter((prompt) => {
    routed.push(prompt);
    return [];
  });
  const out = grade(gradingRoot(t), [{ id: 'bad', input: 'x', expect_intents: [], stack: ['ruby'] }], router.factory);
  assert.ok(out.includes('FAIL cases with a malformed stack field: bad\n'), out);
  assert.ok(out.includes('ok   every stack-tagged case routes to its expect_intents under its stack (0 cases)\n'), out);
  assert.deepEqual(routed, []);
});

test('a kernel refusal grades as a misroute naming the refusal, never as a crash', (t) => {
  const router = fakeRouter(() => { throw new KernelError('registries/intents.json: broken'); });
  const out = grade(gradingRoot(t), [PY_CASE], router.factory);
  assert.ok(out.includes('FAIL stack-tagged cases misrouted: py-1(kernel refused: registries/intents.json: broken)\n'), out);
});

test('the kernel router resolves with a project that holds exactly the declared stack, one per stack', () => {
  const roots: string[] = [];
  const handle = kernelStackRouter(checkout, (_facts, ctx): Answer => {
    assert.equal(ctx.root, checkout);
    roots.push(ctx.project ?? '');
    return {};
  });
  const detected = (packages: readonly CasePackage[]): string[] => {
    handle.route('add an endpoint', packages);
    const root = roots[roots.length - 1] ?? '';
    return detectPackages(root).map((pkg) => `${pkg.language}/${pkg.framework ?? '-'}`).sort();
  };
  assert.deepEqual(detected([PY]), ['python/-']);
  assert.deepEqual(detected([NODE]), ['node/-']);
  assert.deepEqual(detected([NODE, PY]), ['node/-', 'python/-']);
  // A named framework lands in the manifest, so the kernel detects it.
  assert.deepEqual(
    detected([{ language: 'python', framework: 'fastapi' }, { language: 'node', framework: 'react' }]),
    ['node/react', 'python/fastapi'],
  );
  handle.route('fix the service', [PY]);
  assert.equal(new Set(roots).size, 4);
  handle.dispose();
  for (const root of roots) assert.equal(existsSync(root), false, root);
});

test('the kernel router answers the task contract intents of the real registries', () => {
  const handle = kernelStackRouter(checkout);
  try {
    assert.ok(handle.route('add a controller for refunds', [NODE]).includes('backend'));
    // The repository shape most FastAPI services have: a React frontend beside
    // the backend does not make the NestJS row eligible.
    const fastapiWithReact = handle.route('add a controller for refunds', [
      { language: 'python', framework: 'fastapi' },
      { language: 'node', framework: 'react' },
    ]);
    assert.ok(fastapiWithReact.includes('backend-python'), fastapiWithReact.join(','));
    assert.ok(!fastapiWithReact.includes('backend'), fastapiWithReact.join(','));
  } finally {
    handle.dispose();
  }
});
