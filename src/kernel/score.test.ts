import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntentRow, Phrase } from '../registry/intents';
import { resolveRoot } from '../registry/paths';
import type { ScoringPolicy } from '../registry/policy-router';
import type { RoutingRegistry } from '../registry/routing';
import { lazyRegistries, type Registries } from './context';
import { boundedContains, marginOf, scoreIntents, tokenize, type RankedIntent } from './score';

// The Tier 1 scored classifier (contracts.md §9). Every case below scores a
// fixture intents registry under a fixture scoring policy: the shipped weights
// and cuts are being calibrated (T13), so nothing here pins a shipped number.
// Only the last block reads the shipped registry, and only for invariants that
// hold for any calibration.

const root = resolveRoot(process.env, __dirname);
const shipped = lazyRegistries(root);

const SCORING: ScoringPolicy = {
  min_score: 1,
  threshold: 0,
  margin: 0,
  top_k: 5,
  max_intents: 8,
  bm25_weight: 0.9,
  path_weight: 1,
};

// One routing domain claiming NestJS controllers by basename, and markdown
// excluded, so the path feature has one hit and one exclusion to work with.
const ROUTING: RoutingRegistry = {
  version: 'fixture',
  precedence: ['api-domain'],
  excluded: { paths: [], basenames: ['*.md'], self_dirs: [] },
  domains: [
    {
      id: 'api-domain',
      match: { paths: [], basenames: ['*.controller.ts'] },
      rules: [],
      skills: [],
      agent: null,
      hint: null,
      sample_path: null,
    },
  ],
};

// --- phrases ------------------------------------------------------------------

test('a matched phrase adds its weight and names itself in the features', () => {
  const regs = registriesWith([intent('api', { phrases: [phrase('add endpoint', 2), phrase('controller', 1.5)] })]);
  assert.deepEqual(scoreIntents('Please add endpoint for the controller', regs), [
    { id: 'api', score: 3.5, confidence: 1, features: ['+2 "add endpoint"', '+1.5 "controller"'] },
  ]);
});

test('a phrase inside a longer word does not match, a non-alphanumeric neighbour does', () => {
  const regs = registriesWith([intent('new', { phrases: [phrase('add', 1)] })]);
  assert.deepEqual(scoreIntents('the issue was addressed', regs), []);
  assert.deepEqual(ids(scoreIntents('foo_add_bar', regs)), ['new']);
  assert.deepEqual(ids(scoreIntents('add-on please', regs)), ['new']);
});

test('phrase matching folds ASCII case only, and a non-ASCII letter is not a boundary', () => {
  const regs = registriesWith([intent('api', { phrases: [phrase('API', 1)] })]);
  assert.deepEqual(ids(scoreIntents('wire the api', regs)), ['api']);
  assert.deepEqual(scoreIntents('wire the éapi', regs), []);
});

test('scores are rounded to two decimals, and features print at most two decimals', () => {
  const regs = registriesWith([intent('colours', { phrases: [phrase('red', 0.333), phrase('blue', 0.333)] })]);
  assert.deepEqual(scoreIntents('red and blue', regs), [
    { id: 'colours', score: 0.67, confidence: 1, features: ['+0.33 "red"', '+0.33 "blue"'] },
  ]);
});

// --- verb-object pair -----------------------------------------------------------

test('a verb-object pair fires once when a verb stem and an object stem are both present', () => {
  const regs = registriesWith([
    intent('api', { verb_object: { verbs: ['add', 'wire up'], objects: ['endpoint', 'route'], weight: 0.5 } }),
  ]);
  // "adding" stems to "add" and "endpoints" to "endpoint".
  assert.deepEqual(scoreIntents('adding two endpoints', regs), [
    { id: 'api', score: 0.5, confidence: 1, features: ['+0.5 pair add+endpoint'] },
  ]);
  // Several verbs and objects present still add the weight once, labelled by the
  // first verb and the first object in registry order.
  assert.deepEqual(scoreIntents('add the endpoint and wire up the route', regs), [
    { id: 'api', score: 0.5, confidence: 1, features: ['+0.5 pair add+endpoint'] },
  ]);
});

test('a verb without an object, or a multi-word verb missing one of its words, does not fire', () => {
  const regs = registriesWith([
    intent('api', { verb_object: { verbs: ['wire up'], objects: ['route'], weight: 0.5 } }),
  ]);
  assert.deepEqual(scoreIntents('wire the route', regs), []);
  assert.deepEqual(scoreIntents('wire up everything', regs), []);
  assert.deepEqual(ids(scoreIntents('wire up the route', regs)), ['api']);
});

// --- negatives ------------------------------------------------------------------

test('a matched negative subtracts its weight and is reported with a minus sign', () => {
  const regs = registriesWith([
    intent('deploy', { phrases: [phrase('deploy', 1)], negative: [phrase('deploy notes', 0.4)] }),
  ]);
  assert.deepEqual(scoreIntents('write the deploy notes', regs), [
    { id: 'deploy', score: 0.6, confidence: 1, features: ['+1 "deploy"', '-0.4 "deploy notes"'] },
  ]);
});

test('a score pulled to zero or below by a negative drops the candidate', () => {
  const cancelled = registriesWith([
    intent('deploy', { phrases: [phrase('deploy', 1)], negative: [phrase('deploy notes', 1)] }),
  ]);
  assert.deepEqual(scoreIntents('write the deploy notes', cancelled), []);
  const below = registriesWith([
    intent('deploy', { phrases: [phrase('deploy', 1)], negative: [phrase('deploy notes', 3)] }),
  ]);
  assert.deepEqual(scoreIntents('write the deploy notes', below), []);
});

// --- path -----------------------------------------------------------------------

test('a path token routing to the row domain adds path_weight once, wrapping punctuation stripped', () => {
  const regs = registriesWith([intent('api', { phrases: [phrase('endpoint', 1)], domain: 'api-domain' })], {
    routing: ROUTING,
  });
  assert.deepEqual(scoreIntents('fix `src/orders/orders.controller.ts`, please', regs), [
    { id: 'api', score: 1, confidence: 1, features: ['+1 path src/orders/orders.controller.ts'] },
  ]);
});

test('only a row that declares its own phrases takes the path feature (v1 equivalence)', () => {
  const regs = registriesWith(
    [intent('legacy', { phrases: [phrase('legacy', 1)], phrases_declared: false, domain: 'api-domain' })],
    { routing: ROUTING },
  );
  assert.deepEqual(scoreIntents('fix src/orders/orders.controller.ts', regs), []);
});

test('an excluded path token and a zero path_weight add nothing', () => {
  const row = intent('api', { phrases: [phrase('endpoint', 1)], domain: 'api-domain' });
  assert.deepEqual(scoreIntents('see docs/orders.controller.md', registriesWith([row], { routing: ROUTING })), []);
  const weightless = registriesWith([row], { routing: ROUTING, scoring: { path_weight: 0 } });
  assert.deepEqual(scoreIntents('fix src/orders/orders.controller.ts', weightless), []);
});

// --- exemplars (BM25) -------------------------------------------------------------

test('the best exemplar match contributes exactly bm25_weight, rows without exemplars nothing', () => {
  const regs = registriesWith([
    intent('invoices', { exemplars: ['export invoices to csv', 'download the invoice csv file'] }),
    intent('accounts', { exemplars: ['reset a user password by email'] }),
    intent('plain', { phrases: [phrase('zzzz', 1)] }),
  ]);
  assert.deepEqual(scoreIntents('csv export of invoices', regs), [
    { id: 'invoices', score: 0.9, confidence: 1, features: ['+0.9 exemplar'] },
  ]);
});

test('exemplar similarity is normalised by the best row, so a weaker row scores strictly less', () => {
  const regs = registriesWith([
    intent('invoices', { exemplars: ['export invoices to csv', 'download the invoice csv file'] }),
    intent('accounts', { exemplars: ['reset a user password by email'] }),
  ]);
  const ranked = scoreIntents('reset the password and export csv', regs);
  assert.equal(ranked.length, 2);
  const [best, other] = ranked;
  if (best === undefined || other === undefined) throw new Error('expected two exemplar candidates');
  assert.equal(best.score, SCORING.bm25_weight);
  assert.ok(other.score > 0 && other.score < best.score, `weaker row scored ${other.score}`);
});

test('a zero bm25_weight turns the exemplar feature off', () => {
  const regs = registriesWith([intent('invoices', { exemplars: ['export invoices to csv'] })], {
    scoring: { bm25_weight: 0 },
  });
  assert.deepEqual(scoreIntents('csv export of invoices', regs), []);
});

// --- ranking ----------------------------------------------------------------------

test('candidates are ordered by score, ties by registry order, with confidence over the total', () => {
  const regs = registriesWith([
    intent('first', { phrases: [phrase('one', 1)] }),
    intent('second', { phrases: [phrase('two', 2)] }),
    intent('third', { phrases: [phrase('three', 1)] }),
  ]);
  assert.deepEqual(
    scoreIntents('one two three', regs).map(({ id, score, confidence }) => ({ id, score, confidence })),
    [
      { id: 'second', score: 2, confidence: 0.5 },
      { id: 'first', score: 1, confidence: 0.25 },
      { id: 'third', score: 1, confidence: 0.25 },
    ],
  );
});

test('scoring is deterministic and carries no state between prompts', () => {
  const regs = registriesWith([
    intent('api', { phrases: [phrase('endpoint', 1)], exemplars: ['add a paginated orders endpoint'] }),
    intent('web', { phrases: [phrase('page', 1)], exemplars: ['build the invoices page'] }),
  ]);
  const first = scoreIntents('add an endpoint and a page', regs);
  scoreIntents('something unrelated about orders', regs);
  assert.deepEqual(scoreIntents('add an endpoint and a page', regs), first);
});

test('features carry registry phrases and path tokens, never other prompt text', () => {
  const regs = registriesWith([
    intent('api', { phrases: [phrase('endpoint', 1)], exemplars: ['add a paginated orders endpoint'] }),
  ]);
  const features = scoreIntents('add an endpoint for customer zebrafinch orders', regs).flatMap((c) => c.features);
  assert.ok(features.length > 0);
  for (const feature of features) assert.ok(!feature.includes('zebrafinch'), feature);
});

// --- margin, tokenizer, boundaries ------------------------------------------------

test('marginOf is null without candidates, 1 for one, and the relative top-two gap otherwise', () => {
  assert.equal(marginOf([]), null);
  assert.equal(marginOf([ranked('a', 2)]), 1);
  assert.equal(marginOf([ranked('a', 4), ranked('b', 3)]), 0.25);
  assert.equal(marginOf([ranked('a', 3), ranked('b', 1), ranked('c', 1)]), 0.67);
});

test('tokenize lowercases ASCII, splits on non-alphanumerics, drops stopwords and stems lightly', () => {
  assert.deepEqual(tokenize('Adding the Users, and BUGS! class'), ['add', 'user', 'bug', 'class']);
  // Short words keep their endings: the stemmer needs a stem left behind.
  assert.deepEqual(tokenize('ping bus'), ['ping', 'bus']);
  assert.deepEqual(tokenize('the a of'), []);
});

test('boundedContains needs both edges against a boundary, and an empty needle matches nothing', () => {
  assert.equal(boundedContains('add', 'add'), true);
  assert.equal(boundedContains('xadd', 'add'), false);
  assert.equal(boundedContains('addition then add', 'add'), true);
  assert.equal(boundedContains('anything', ''), false);
});

// --- shipped registry: calibration-independent invariants ---------------------------

test('every active shipped intent scores on its own first phrase', () => {
  for (const row of shipped.intents.intents) {
    if (!row.active) continue;
    const [first] = row.phrases;
    if (first === undefined) throw new Error(`active intent ${row.id} carries no phrase`);
    assert.ok(ids(scoreIntents(first.text, shipped)).includes(row.id), `"${first.text}" did not score ${row.id}`);
  }
});

test('the shipped ranking is ordered by score with ties in registry order', () => {
  const order = new Map<string, number>(shipped.intents.intents.map((row, index): [string, number] => [row.id, index]));
  const prompts = shipped.intents.intents.flatMap((row) => (row.active ? row.exemplars.slice(0, 1) : []));
  for (const prompt of prompts) {
    const candidates = scoreIntents(prompt, shipped);
    for (let i = 1; i < candidates.length; i += 1) {
      const previous = candidates[i - 1];
      const current = candidates[i];
      if (previous === undefined || current === undefined) continue;
      assert.ok(previous.score >= current.score, `score order for "${prompt}"`);
      if (previous.score === current.score) {
        assert.ok((order.get(previous.id) ?? -1) < (order.get(current.id) ?? -1), `tie order for "${prompt}"`);
      }
    }
    for (const candidate of candidates) {
      assert.ok(candidate.score > 0 && candidate.confidence >= 0 && candidate.confidence <= 1, `bounds for "${prompt}"`);
    }
  }
});

// --- helpers -------------------------------------------------------------------------

function ids(candidates: readonly RankedIntent[]): string[] {
  return candidates.map((candidate) => candidate.id);
}

function ranked(id: string, score: number): RankedIntent {
  return { id, score, confidence: 0, features: [] };
}

function phrase(text: string, weight: number): Phrase {
  return { text, weight };
}

interface FixtureOptions {
  scoring?: Partial<ScoringPolicy>;
  routing?: RoutingRegistry;
}

// Replaces the intents registry and the scoring block; the routing registry is
// a fixture whenever a case reads the path feature.
function registriesWith(rows: IntentRow[], options: FixtureOptions = {}): Registries {
  return {
    ...shipped,
    intents: { version: 'fixture', intents: rows },
    routing: options.routing ?? ROUTING,
    policy: {
      ...shipped.policy,
      router: { ...shipped.policy.router, scoring: { ...SCORING, ...options.scoring } },
    },
  };
}

// An intent row as the loader answers a v2 row that declares its phrases.
function intent(id: string, over: Partial<IntentRow> = {}): IntentRow {
  const phrases = over.phrases ?? [];
  return {
    id,
    title: id,
    signals: phrases.map((entry) => entry.text),
    rules: [],
    skills: [],
    agents: [],
    commands: [],
    mcp: [],
    model_tier: null,
    risk_floor: null,
    domain: null,
    note: null,
    suppressible: false,
    suppressed_by: [],
    requires_dispatch_plan: false,
    active: true,
    phrases,
    phrases_declared: phrases.length > 0,
    verb_object: null,
    negative: [],
    exemplars: [],
    threshold: null,
    router_row: null,
    ...over,
  };
}
