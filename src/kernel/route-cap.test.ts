import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntentRow } from '../registry/intents';
import type { ScoringPolicy } from '../registry/policy-router';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type KernelContext, type Registries, type RiskTier } from './context';
import { resolve } from './resolve';
import { routeByIntent, routeEscalate } from './route';

// router.scoring.max_intents must never cut what the any-match router routed
// (contracts §1.5) nor a high-floor intent (the critic's W1 finding: a prompt
// firing more than eight intents lost security-files and fell to floor medium).

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);

// The shipped calibration numbers, pinned so a later recalibration cannot turn
// these cases into tests of a different cut.
const SCORING: ScoringPolicy = {
  min_score: 1,
  threshold: 0,
  margin: 0,
  top_k: 5,
  max_intents: 8,
  bm25_weight: 0.9,
  path_weight: 1,
};

function withRows(rows: IntentRow[]): Registries {
  return {
    ...regs,
    intents: { version: regs.intents.version, intents: rows },
    policy: { ...regs.policy, router: { ...regs.policy.router, scoring: SCORING } },
  };
}

// A v1-shaped row: one weight-1 phrase per signal, so the declared evidence
// alone clears min_score whenever a signal fires.
function declaredRow(id: string, riskFloor: RiskTier | null = null): IntentRow {
  return baseRow(id, { phrases: [{ text: id, weight: 1 }], risk_floor: riskFloor });
}

// A row whose phrase alone stays below min_score and whose one-word exemplar
// lifts it over: admitted only with exemplar similarity, so the cap may trim it.
// Every such exemplar is one distinct word, so each scores the same similarity
// (0.9 after normalization) and the phrase weight alone orders them.
function exemplarRow(id: string, weight: number, riskFloor: RiskTier | null = null): IntentRow {
  return baseRow(id, { phrases: [{ text: id, weight }], exemplars: [id], risk_floor: riskFloor });
}

function baseRow(id: string, over: Partial<IntentRow>): IntentRow {
  return {
    id,
    title: id,
    signals: [id],
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
    phrases: [],
    phrases_declared: false,
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

function matchedIds(prompt: string, rows: IntentRow[]): string[] {
  return routeByIntent(prompt, withRows(rows)).matches.map((match) => match.id);
}

const DECLARED_WORDS = ['amber', 'birch', 'cedar', 'delta', 'ember', 'fjord', 'grove', 'heath', 'indigo', 'juniper'];

test('a v1 registry keeps every firing intent past max_intents: the cap never binds without exemplars', () => {
  const rows = DECLARED_WORDS.map((word) => declaredRow(word));
  assert.ok(rows.length > SCORING.max_intents);
  assert.deepEqual(matchedIds(DECLARED_WORDS.join(' '), rows), DECLARED_WORDS);
});

test('a high-floor intent ranked below the cap is kept and the floor stays high', () => {
  // Nine declared rows tie at score 1; the high-floor row ties with them (0.1
  // phrase + 0.9 exemplar) but sits last in registry order, where the plain
  // top-8 slice used to drop it.
  const declared = DECLARED_WORDS.slice(0, 9).map((word) => declaredRow(word));
  const rows = [...declared, exemplarRow('kestrel', 0.1, 'high')];
  const prompt = [...DECLARED_WORDS.slice(0, 9), 'kestrel'].join(' ');

  assert.deepEqual(matchedIds(prompt, rows), rows.map((row) => row.id));
  const section = routeEscalate(prompt, withRows(rows));
  assert.ok(section.intents.includes('kestrel'));
  assert.equal(section.risk_floor, 'high');
});

test('exemplar-assisted intents past the remaining slots are trimmed, lowest score first', () => {
  const north = declaredRow('north');
  const south = declaredRow('south');
  // Registry order deliberately differs from score order.
  const assisted = [
    exemplarRow('lark', 0.3),
    exemplarRow('moss', 0.5),
    exemplarRow('nettle', 0.4),
    exemplarRow('oak', 0.6),
    exemplarRow('pine', 0.35),
    exemplarRow('quince', 0.45),
    exemplarRow('rowan', 0.55),
    exemplarRow('sage', 0.25),
    exemplarRow('thyme', 0.65),
  ];
  const rows = [north, ...assisted, south];
  const prompt = rows.map((row) => row.id).join(' ');

  // Two exempt rows leave six slots: the six highest assisted scores survive,
  // and the answer is emitted in registry order.
  assert.deepEqual(matchedIds(prompt, rows), ['north', 'moss', 'nettle', 'oak', 'quince', 'rowan', 'thyme', 'south']);
});

test('an exact score tie at the last slot is broken by registry order', () => {
  const declared = DECLARED_WORDS.slice(0, 7).map((word) => declaredRow(word));
  const rows = [...declared, exemplarRow('lark', 0.4), exemplarRow('moss', 0.4)];
  const prompt = rows.map((row) => row.id).join(' ');
  assert.deepEqual(matchedIds(prompt, rows), [...DECLARED_WORDS.slice(0, 7), 'lark']);
});

test("the critic's over-cap prompt resolves security-files, floor high, with security-reviewer", () => {
  const ctx: KernelContext = { root, registries: regs };
  const prompt =
    'as part of the big rename across all packages, add a NestJS endpoint and controller, a React component page, ' +
    'a React Native screen, a Mastra agent with a RAG prompt, clean up the tech debt, write release notes, ' +
    'record an ADR, run a retro, and the auth check';
  const answer = resolve({ prompt, taskContract: true }, ctx);
  const contract = answer.task_contract;
  assert.ok(contract !== undefined);
  assert.ok(contract.intents.includes('security-files'));
  assert.equal(contract.risk_floor, 'high');
  assert.ok(contract.agents.includes('security-reviewer'));
  // Base 0b2e442 any-match routed these nine; none may be lost to the cap.
  for (const id of ['big-sweep', 'backend', 'frontend', 'mobile', 'llm', 'security-files', 'refactor', 'release-notes', 'retro']) {
    assert.ok(contract.intents.includes(id), id);
  }
});
