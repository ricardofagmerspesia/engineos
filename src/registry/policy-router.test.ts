import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import { parseRouter } from './policy-router';
import { resolveRoot } from './paths';

const root = resolveRoot({}, __dirname);

function shippedRouter(): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'registries', 'policy.json'), 'utf8'));
  if (!isRecord(raw) || !isRecord(raw['router'])) throw new Error('registries/policy.json carries no router block');
  return raw['router'];
}

function child(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`router block ${key} is not an object`);
  return value;
}

function refusedWith(breakIt: (router: Record<string, unknown>) => void, detail: string): void {
  const router = shippedRouter();
  breakIt(router);
  assert.throws(
    () => parseRouter(router),
    (error: unknown) => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, `registries/policy.json: ${detail}`);
      return true;
    },
  );
}

test('the shipped router block loads its tie-break, scoring, combination and markers', () => {
  const router = parseRouter(shippedRouter());

  assert.ok(router.tiebreak.min_similarity > 0 && router.tiebreak.min_similarity <= 1);
  assert.ok(router.tiebreak.margin > 0 && router.tiebreak.margin <= 1);
  assert.equal(router.combination.judge, 'add-only');
  assert.ok(router.source_markers.notification.includes('<task-notification>'));
  assert.ok(router.source_markers.tool_result.length > 0);
  assert.deepEqual(router.source_markers.hook_echo, ['[engineos]']);
  assert.ok(Number.isInteger(router.scoring.top_k) && router.scoring.top_k >= 1);
});

test('a missing tiebreak block is refused', () => {
  refusedWith((router) => { delete router['tiebreak']; }, '.router.tiebreak must be an object');
});

// Zero is refused for both: a zero floor lets any score win and a zero margin
// lets an exact tie decide.
for (const key of ['min_similarity', 'margin']) {
  test(`a zero tiebreak ${key} is refused`, () => {
    refusedWith((router) => { child(router, 'tiebreak')[key] = 0; }, `.router.tiebreak.${key} must be greater than 0 and at most 1`);
  });

  test(`a negative or above-one tiebreak ${key} is refused`, () => {
    refusedWith((router) => { child(router, 'tiebreak')[key] = -0.2; }, `.router.tiebreak.${key} must be greater than 0 and at most 1`);
    refusedWith((router) => { child(router, 'tiebreak')[key] = 1.0001; }, `.router.tiebreak.${key} must be greater than 0 and at most 1`);
  });

  test(`a non-numeric tiebreak ${key} is refused`, () => {
    refusedWith((router) => { child(router, 'tiebreak')[key] = '0.5'; }, `.router.tiebreak.${key} must be a number`);
  });
}

test('tiebreak bounds of exactly 1 and just above 0 are accepted', () => {
  const router = shippedRouter();
  child(router, 'tiebreak')['min_similarity'] = 1;
  child(router, 'tiebreak')['margin'] = 0.001;

  assert.deepEqual(parseRouter(router).tiebreak, { min_similarity: 1, margin: 0.001 });
});

test('a combination the code does not implement is refused', () => {
  refusedWith((router) => { child(router, 'combination')['gates'] = 'judge-wins'; }, '.router.combination.gates must be deterministic-wins');
  refusedWith((router) => { child(router, 'combination')['judge'] = 'authoritative'; }, '.router.combination.judge must be add-only');
  refusedWith((router) => { child(router, 'combination')['intents'] = 'primary-only'; }, '.router.combination.intents must be noul-then-primary');
  refusedWith((router) => { child(router, 'combination')['escalate_on_doubt'] = false; }, '.router.combination.escalate_on_doubt must be true');
});

test('an empty marker list or a blank marker is refused', () => {
  refusedWith((router) => { child(router, 'source_markers')['notification'] = []; }, '.router.source_markers.notification must not be empty');
  refusedWith((router) => { child(router, 'source_markers')['hook_echo'] = ['[engineos]', '  ']; }, '.router.source_markers.hook_echo[1] must not be blank');
});

test('scoring values outside their ranges are refused', () => {
  refusedWith((router) => { child(router, 'scoring')['min_score'] = -1; }, '.router.scoring.min_score must be at least 0');
  refusedWith((router) => { child(router, 'scoring')['threshold'] = 1.5; }, '.router.scoring.threshold must be between 0 and 1');
  refusedWith((router) => { child(router, 'scoring')['margin'] = -0.1; }, '.router.scoring.margin must be between 0 and 1');
  refusedWith((router) => { child(router, 'scoring')['top_k'] = 0; }, '.router.scoring.top_k must be a positive integer');
  refusedWith((router) => { child(router, 'scoring')['max_intents'] = 2.5; }, '.router.scoring.max_intents must be a positive integer');
  refusedWith((router) => { child(router, 'scoring')['bm25_weight'] = -0.5; }, '.router.scoring.bm25_weight must be at least 0');
  refusedWith((router) => { child(router, 'scoring')['path_weight'] = -1; }, '.router.scoring.path_weight must be at least 0');
});
