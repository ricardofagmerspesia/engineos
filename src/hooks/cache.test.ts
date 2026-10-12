import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Decision } from '../kernel/decision-layer';
import { tempRoot } from '../testing/harness';
import {
  advisorCacheDir,
  decisionCachePath,
  parseDecision,
  readCachedDecision,
  readCachedPackages,
  routeCachePaths,
  stackCachePath,
  writeCachedDecision,
  writeCachedPackages,
  type DecisionKey,
} from './cache';

test('the cache key is the session, the registry signature and the buster', () => {
  const paths = routeCachePaths('/r/.git', 'S1', '1712-4096', '0', 'src/orders/service.ts');
  assert.deepEqual(paths, {
    route: '/r/.git/engineos-route-cache/S1-1712-4096-0/src/orders/service.ts.route',
    output: '/r/.git/engineos-route-cache/S1-1712-4096-0/src/orders/service.ts.route.output',
  });
});

test('an operator buster changes the key, so the whole session re-routes', () => {
  const before = routeCachePaths('/r/.git', 'S1', 'sig', '0', 'a.ts');
  const after = routeCachePaths('/r/.git', 'S1', 'sig', '7', 'a.ts');
  assert.notEqual(before?.route, after?.route);
  assert.equal(after?.route, '/r/.git/engineos-route-cache/S1-sig-7/a.ts.route');
});

test('an absent buster reads as the default, not as an empty segment', () => {
  assert.equal(
    routeCachePaths('/r/.git', 'S1', 'sig', '', 'a.ts')?.route,
    '/r/.git/engineos-route-cache/S1-sig-0/a.ts.route',
  );
});

test('a session id from the harness is slugged one character at a time', () => {
  // Dots survive (they are in the slug class) but every separator is replaced,
  // so a hostile id stays one directory name and cannot traverse.
  assert.equal(
    routeCachePaths('/r/.git', '../../etc S1', 'sig', '0', 'a.ts')?.route,
    '/r/.git/engineos-route-cache/.._.._etc_S1-sig-0/a.ts.route',
  );
});

test('a path with a .. segment is never cached', () => {
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', '../outside.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/../../outside.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/..'), null);
});

test('a path with a . segment is never cached', () => {
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', './a.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/./a.ts'), null);
});

test('a dotted file name is not a dotted segment', () => {
  assert.equal(
    routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/..hidden.ts')?.route,
    '/r/.git/engineos-route-cache/S1-sig-0/src/..hidden.ts.route',
  );
});

test('no git dir and no relative path both mean no cache', () => {
  assert.equal(routeCachePaths('', 'S1', 'sig', '0', 'a.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', ''), null);
});

// ------------------------------------------------------- prompt advisor cache

const DECISION: Decision = {
  mode: 'jev',
  requested: 'auto',
  intents: ['backend-python'],
  confidence: 0.91,
  escalate: false,
  fallback_reason: null,
  shadow: { keyword_intents: ['backend-python'], disagreement: false },
  latency_ms: 120,
  cost_micros: 42,
  escalate_reason: null,
};

const KEY: DecisionKey = {
  prompt: 'add an endpoint that lists invoices',
  languages: ['python', 'node'],
  frameworks: ['fastapi', 'react'],
  focus: null,
  requested: 'auto',
  mode: 'jev',
};

test('the advisor cache sits beside the route cache, keyed by the session and the buster', () => {
  assert.equal(advisorCacheDir('/r/.git', '../x S1', ''), '/r/.git/engineos-route-cache/.._x_S1-advisor-0');
  assert.equal(advisorCacheDir('/r/.git', 'S1', '4'), '/r/.git/engineos-route-cache/S1-advisor-4');
  assert.equal(advisorCacheDir('', 'S1', ''), null);
});

test('a decision key never puts prompt text in a file name, and every part of it counts', () => {
  const path = decisionCachePath('/d', KEY);
  assert.match(path, /^\/d\/decision-[0-9a-f]{40}\.json$/);
  assert.ok(!path.includes('invoices'));
  assert.equal(decisionCachePath('/d', { ...KEY }), path);
  for (const changed of [
    { ...KEY, prompt: 'add an endpoint that lists orders' },
    { ...KEY, languages: ['python'] },
    { ...KEY, frameworks: ['django'] },
    { ...KEY, focus: 'backend' },
    { ...KEY, requested: 'jev' as const },
    { ...KEY, mode: 'llm' as const },
  ]) {
    assert.notEqual(decisionCachePath('/d', changed), path);
  }
  assert.notEqual(stackCachePath('/d', '/repo/a'), stackCachePath('/d', '/repo/b'));
});

test('a decision written to the cache reads back identical', (t) => {
  const path = join(tempRoot(t), 'nested', 'decision.json');
  writeCachedDecision(path, DECISION);
  assert.deepEqual(readCachedDecision(path), DECISION);
  // tmp + rename: no stray temp file is left beside the entry.
  assert.deepEqual(readdirSync(join(path, '..')), ['decision.json']);
});

test('a missing or garbled cache entry is a miss, never an error', (t) => {
  const dir = tempRoot(t);
  assert.equal(readCachedDecision(join(dir, 'absent.json')), null);
  const garbled = join(dir, 'garbled.json');
  writeFileSync(garbled, '{"mode": "jev"');
  assert.equal(readCachedDecision(garbled), null);
});

test('a cached decision that does not match the exact shape is ignored', () => {
  const malformed: Record<string, unknown>[] = [
    { ...DECISION, mode: 'auto' },
    { ...DECISION, requested: 'sometimes' },
    { ...DECISION, intents: 'backend-python' },
    { ...DECISION, confidence: 1.5 },
    { ...DECISION, escalate: 'no' },
    { ...DECISION, fallback_reason: 'because' },
    { ...DECISION, shadow: { keyword_intents: ['x'] } },
    { ...DECISION, latency_ms: -1 },
    { ...DECISION, cost_micros: 0.5 },
    // escalate and its reason travel together
    { ...DECISION, escalate: true, escalate_reason: null },
    { ...DECISION, escalate: false, escalate_reason: 'tie' },
    { ...DECISION, escalate: true, escalate_reason: 'whim' },
  ];
  for (const value of malformed) assert.equal(parseDecision(value), null, JSON.stringify(value));
  assert.equal(parseDecision(null), null);
});

test('a parsed decision drops keys it does not know and keeps a status fallback', () => {
  const parsed = parseDecision({ ...DECISION, mode: 'keyword', fallback_reason: 'http-429', injected: 'x' });
  assert.notEqual(parsed, null);
  assert.equal(parsed?.fallback_reason, 'http-429');
  assert.equal(Object.keys(parsed ?? {}).includes('injected'), false);
});

test('a cached package list reads back through the project-config parser', (t) => {
  const dir = tempRoot(t);
  const path = join(dir, 'stack.json');
  const packages = [
    { dir: 'backend', language: 'python' as const, framework: 'fastapi' as const, compose_service: null, python_env: 'auto' as const },
    { dir: 'frontend', language: 'node' as const, framework: 'react' as const, compose_service: null },
  ];
  writeCachedPackages(path, packages);
  assert.deepEqual(readCachedPackages(path), packages);
  writeFileSync(path, JSON.stringify({ version: 1, stack: { packages: [{ dir: 'x', language: 'cobol', framework: null, compose_service: null }] } }));
  assert.equal(readCachedPackages(path), null);
  assert.equal(readCachedPackages(join(dir, 'absent.json')), null);
});
