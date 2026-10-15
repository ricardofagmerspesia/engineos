import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntentRow } from '../registry/intents';
import { resolveRoot } from '../registry/paths';
import type { ScoringPolicy } from '../registry/policy-router';
import { lazyRegistries, type Registries } from './context';
import { routeByIntent, routeEscalate } from './route';

// route-intent and route-escalate over the ranking (contracts.md §2.2, §2.3):
// min_score, max_intents, top_k, the untruncated margin, the ambiguity cuts and
// the low-confidence reason. Every case builds its own intents registry and
// scoring block; shipped weights and cuts are calibration data and are never
// pinned here. Prompts use words no shipped scale signal reads, so scale stays
// quiet.

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

const ALL_REASONS = ['multi-agent-dispatch', 'unrouted-scale', 'requires-dispatch-plan', 'low-confidence'];

// --- routeByIntent ----------------------------------------------------------------

test('a candidate under min_score is ranked but not matched', () => {
  const regs = registriesWith([row('low', 'alpha', 0.5), row('high', 'beta', 2)]);
  const answer = routeByIntent('alpha beta', regs);
  assert.deepEqual(answer.matches.map((m) => m.id), ['high']);
  assert.deepEqual(answer.ranked.map((r) => r.id), ['high', 'low']);
  assert.equal(answer.margin, 0.75);
});

// Contracts rev 4 item (b): the cap trims only exemplar-assisted admissions, so
// rows whose declared signals clear min_score survive it. Trimming and the
// last-slot tie are covered in route-cap.test.ts.
test('max_intents keeps every declared-evidence match and emits them in registry order', () => {
  const regs = registriesWith([row('low', 'alpha', 1), row('mid', 'beta', 2), row('high', 'gamma', 3)], {
    scoring: { max_intents: 2 },
  });
  const answer = routeByIntent('alpha beta gamma', regs);
  assert.deepEqual(answer.matches.map((m) => m.id), ['low', 'mid', 'high']);
  assert.deepEqual(answer.ranked.map((r) => r.id), ['high', 'mid', 'low']);
});

test('max_intents does not trim tied declared-evidence matches', () => {
  const regs = registriesWith([row('first', 'alpha', 1), row('second', 'beta', 1), row('third', 'gamma', 1)], {
    scoring: { max_intents: 2 },
  });
  assert.deepEqual(routeByIntent('gamma beta alpha', regs).matches.map((m) => m.id), ['first', 'second', 'third']);
});

test('top_k truncates ranked while the margin still reads the untruncated ranking', () => {
  const regs = registriesWith([row('a', 'alpha', 3), row('b', 'beta', 2), row('c', 'gamma', 1)], {
    scoring: { top_k: 1 },
  });
  const answer = routeByIntent('alpha beta gamma', regs);
  assert.deepEqual(answer.ranked.map((r) => r.id), ['a']);
  assert.equal(answer.margin, 0.33);
  assert.deepEqual(answer.matches.map((m) => m.id), ['a', 'b', 'c']);
});

test('a prompt nothing scores answers no matches, ambiguous, an empty ranking and a null margin', () => {
  const regs = registriesWith([row('a', 'alpha', 1)]);
  assert.deepEqual(routeByIntent('nothing relevant here', regs), { matches: [], ambiguous: true, ranked: [], margin: null, rebound: [], generic_only: false });
});

test('a lone candidate has margin 1 and is not ambiguous under open cuts', () => {
  const regs = registriesWith([row('a', 'alpha', 1), row('b', 'beta', 1)]);
  const answer = routeByIntent('alpha only', regs);
  assert.equal(answer.margin, 1);
  assert.equal(answer.ambiguous, false);
});

test('top confidence under the threshold is ambiguous, at the threshold it is not', () => {
  const rows = [row('a', 'alpha', 1), row('b', 'beta', 1)];
  assert.equal(routeByIntent('alpha beta', registriesWith(rows, { scoring: { threshold: 0.6 } })).ambiguous, true);
  assert.equal(routeByIntent('alpha beta', registriesWith(rows, { scoring: { threshold: 0.5 } })).ambiguous, false);
});

test('a margin under the margin cut is ambiguous, a margin equal to it is not', () => {
  const rows = [row('a', 'alpha', 3), row('b', 'beta', 2)];
  assert.equal(routeByIntent('alpha beta', registriesWith(rows, { scoring: { margin: 0.5 } })).ambiguous, true);
  assert.equal(routeByIntent('alpha beta', registriesWith(rows, { scoring: { margin: 0.33 } })).ambiguous, false);
});

test('ranked candidates with no match over min_score are still ambiguous', () => {
  const regs = registriesWith([row('low', 'alpha', 0.5)]);
  const answer = routeByIntent('alpha', regs);
  assert.deepEqual(answer.matches, []);
  assert.equal(answer.ambiguous, true);
  assert.deepEqual(answer.ranked.map((r) => r.id), ['low']);
  assert.equal(answer.margin, 1);
});

test('the route-intent answer keeps its key order with the ranking siblings last', () => {
  const answer = routeByIntent('alpha', registriesWith([row('a', 'alpha', 1)]));
  assert.deepEqual(Object.keys(answer), ['matches', 'ambiguous', 'ranked', 'margin', 'rebound', 'generic_only']);
});

// --- routeEscalate ----------------------------------------------------------------

test('weak top confidence adds low-confidence after the other reasons, in policy order', () => {
  const regs = registriesWith([agentRow('web', 'beta'), agentRow('api', 'gamma')], { scoring: { threshold: 0.6 } });
  const answer = routeEscalate('beta gamma', regs);
  assert.equal(answer.escalate, true);
  assert.deepEqual(answer.reasons, ['multi-agent-dispatch', 'low-confidence']);
});

test('a narrow margin alone adds low-confidence', () => {
  const regs = registriesWith([agentRow('web', 'beta', 3), row('docs', 'gamma', 2)], { scoring: { margin: 0.5 } });
  assert.deepEqual(routeEscalate('beta gamma', regs).reasons, ['low-confidence']);
});

test('zero candidates never emit low-confidence, however strict the cuts', () => {
  const regs = registriesWith([agentRow('web', 'beta')], { scoring: { threshold: 1, margin: 1 } });
  const answer = routeEscalate('nothing relevant here', regs);
  assert.equal(answer.escalate, false);
  assert.deepEqual(answer.reasons, []);
});

test('low-confidence is not emitted when the policy does not declare it', () => {
  const regs = registriesWith([agentRow('web', 'beta'), agentRow('api', 'gamma')], {
    scoring: { threshold: 0.6 },
    reasons: ['multi-agent-dispatch', 'unrouted-scale', 'requires-dispatch-plan'],
  });
  assert.deepEqual(routeEscalate('beta gamma', regs).reasons, ['multi-agent-dispatch']);
});

test('suppression edits intents but passes the ranking through unchanged', () => {
  const regs = registriesWith([row('generic', 'alpha', 1, { suppressible: true }), row('specific', 'beta', 1)]);
  const answer = routeEscalate('alpha beta', regs);
  assert.deepEqual(answer.intents, ['specific']);
  assert.deepEqual(answer.suppressed, [{ id: 'generic', by: 'more-specific-match' }]);
  assert.deepEqual(answer.ranked.map((r) => r.id), ['generic', 'specific']);
  assert.equal(answer.margin, routeByIntent('alpha beta', regs).margin);
});

test('the route-escalate answer keeps its key order with the ranking siblings last', () => {
  const answer = routeEscalate('alpha', registriesWith([row('a', 'alpha', 1)]));
  assert.deepEqual(Object.keys(answer), [
    'escalate',
    'reasons',
    'intents',
    'suppressed',
    'agents',
    'model_tier',
    'risk_floor',
    'scale',
    'ambiguous',
    'ranked',
    'margin',
    'rebound',
    'generic_only',
  ]);
});

// --- helpers -------------------------------------------------------------------------

interface FixtureOptions {
  scoring?: Partial<ScoringPolicy>;
  reasons?: string[];
}

function registriesWith(rows: IntentRow[], options: FixtureOptions = {}): Registries {
  return {
    ...shipped,
    intents: { version: 'fixture', intents: rows },
    policy: {
      ...shipped.policy,
      router: {
        ...shipped.policy.router,
        reasons: options.reasons ?? ALL_REASONS,
        escalate_when: { multi_agent_intents_min: 2, unrouted_scale_signals: ['big_task', 'design_work'] },
        scoring: { ...SCORING, ...options.scoring },
      },
    },
  };
}

function agentRow(id: string, text: string, weight = 1): IntentRow {
  return row(id, text, weight, { agents: [`${id}-agent`] });
}

function row(id: string, text: string, weight: number, over: Partial<IntentRow> = {}): IntentRow {
  return {
    id,
    title: id,
    signals: [text],
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
    phrases: [{ text, weight }],
    phrases_declared: true,
    verb_object: null,
    negative: [],
    exemplars: [],
    threshold: null,
    router_row: null,
    stack: null,
    stack_sibling: null,
    stack_frameworks: [],
    generic_signals: [],
    ...over,
  };
}
