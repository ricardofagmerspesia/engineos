import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, type CombineOutput } from './combine';
import type { Registries } from './context';
import { decisionsSection } from './decisions';
import { AMBIGUOUS_PAIR_SCORING, foldRegistries, jev } from './fold-fixture.test';
import type { JudgeFact, JudgeMode } from './judge-facts';
import { routeEscalate } from './route';
import type { TiebreakFact } from './tiebreak-facts';

// The combination policy (contracts.md §4): deterministic gates win, a judge
// fact only adds decision matches and only raises risk, it replaces the lexical
// intent set only in authoritative mode, and an embedding tie-break may only
// narrow an ambiguous deterministic route (§4.7). All registries and policy
// values are fixtures (fold-fixture.test.ts); prompt words map one-to-one to
// fixture intents and rules.

// --- deterministic branch -------------------------------------------------------

test('without a judge fact the answer is the deterministic route repackaged', () => {
  const regs = foldRegistries();
  const route = routeEscalate('beta gamma', regs);
  const decisions = decisionsSection({ prompt: 'beta gamma' }, regs);
  assert.deepEqual(combineFor('beta gamma', regs, null), {
    intents: route.intents,
    ranked: route.ranked,
    ambiguous: route.ambiguous,
    decisionMatches: decisions.matches,
    judgeAdded: [],
    anyHigh: false,
    riskProposal: null,
    judgeSummary: { source: 'fallback', reason: 'no-judge-fact', model: null },
    escalateReasons: route.reasons,
    suppressed: route.suppressed,
    agents: route.agents,
    modelTier: route.model_tier,
    riskFloor: route.risk_floor,
    tiebreakWinner: null,
  });
  assert.deepEqual(route.intents, ['web', 'api']);
});

test('a matched high-risk rule raises the deterministic floor to high', () => {
  const output = combineFor('gamma omega', foldRegistries(), null);
  assert.equal(routeEscalate('gamma omega', foldRegistries()).risk_floor, 'medium');
  assert.equal(output.anyHigh, true);
  assert.equal(output.riskFloor, 'high');
});

test('a fallback fact is summarised and changes nothing else', () => {
  const regs = foldRegistries();
  const fallback: JudgeFact = { source: 'fallback', reason: 'timeout' };
  const output = combineFor('beta gamma', regs, fallback);
  assert.deepEqual(output.judgeSummary, { source: 'fallback', reason: 'timeout', model: null });
  assert.equal(output.riskProposal, null);
  assert.deepEqual(output.intents, ['web', 'api']);
  assert.deepEqual(output.judgeAdded, []);
});

const UNFOLDED_MODES: readonly JudgeMode[] = ['shadow', 'advisory'];

for (const mode of UNFOLDED_MODES) {
  test(`in ${mode} mode a jev fact folds nothing but its risk proposal is reported`, () => {
    const regs = foldRegistries({ mode });
    const fact = jev({
      intents: { docs: 0.95 },
      rules: { handles_sensitive_data: 0.99 },
      scale: 2,
      risk: { reversibility: 0, blast_radius: 0, data_sensitivity: 2, contract_surface: 0, spend: 0 },
    });
    const output = combineFor('beta', regs, fact);
    assert.deepEqual(output.intents, ['web']);
    assert.deepEqual(output.judgeAdded, []);
    assert.equal(output.anyHigh, false);
    assert.equal(output.riskFloor, 'low');
    assert.equal(output.riskProposal, 'high');
    assert.deepEqual(output.judgeSummary, { source: 'jev', reason: null, model: 'fixture-model' });
  });
}

// --- authoritative fold: intents ------------------------------------------------------

test('an authoritative jev fact replaces the lexical intents with the qualifying ones', () => {
  const output = combineFor('beta', foldRegistries(), jev({ intents: { docs: 0.8 } }));
  assert.deepEqual(output.intents, ['docs']);
  assert.deepEqual(output.agents, []);
  assert.deepEqual(output.suppressed, []);
  assert.equal(output.ambiguous, false);
});

test('qualifying intents are ordered by probability, ties by registry order, and capped at max_intents', () => {
  const regs = foldRegistries({ scoring: { max_intents: 2 } });
  const output = combineFor('zeta', regs, jev({ intents: { docs: 0.9, web: 0.7, api: 0.7 } }));
  assert.deepEqual(output.intents, ['docs', 'web']);
});

test('a row threshold overrides intent_default for that row', () => {
  const regs = foldRegistries();
  assert.deepEqual(combineFor('zeta', regs, jev({ intents: { tuned: 0.85 } })).intents, []);
  assert.deepEqual(combineFor('zeta', regs, jev({ intents: { tuned: 0.9 } })).intents, ['tuned']);
});

test('intent_default is inclusive', () => {
  const regs = foldRegistries();
  assert.deepEqual(combineFor('zeta', regs, jev({ intents: { web: 0.5 } })).intents, ['web']);
  assert.deepEqual(combineFor('zeta', regs, jev({ intents: { web: 0.49 } })).intents, []);
});

test('an inactive intent never qualifies, however probable', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ intents: { retired: 0.99 } }));
  assert.deepEqual(output.intents, []);
});

test('with nothing qualifying, a confident primary is chosen', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ primary: { id: 'api', confidence: 0.7, margin: 0.5 } }));
  assert.deepEqual(output.intents, ['api']);
  assert.equal(output.ambiguous, false);
});

test('a confident primary of other routes to no intent without doubt', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ primary: { id: 'other', confidence: 0.9, margin: 0.9 } }));
  assert.deepEqual(output.intents, []);
  assert.equal(output.ambiguous, false);
  assert.ok(!output.escalateReasons.includes('low-confidence'));
});

test('an unconfident primary routes to no intent, ambiguous, with low-confidence', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ primary: { id: 'api', confidence: 0.5, margin: 0.5 } }));
  assert.deepEqual(output.intents, []);
  assert.equal(output.ambiguous, true);
  assert.deepEqual(output.escalateReasons, ['low-confidence']);
});

test('a deterministic high-floor survivor is kept after the judge choice', () => {
  const output = combineFor('gamma delta', foldRegistries(), jev({ intents: { web: 0.9 } }));
  assert.deepEqual(output.intents, ['web', 'guard']);
  assert.deepEqual(output.agents, ['web-agent', 'guard-agent']);
  assert.equal(output.riskFloor, 'high');
});

test('a kept high-floor survivor is never suppressed by what the judge chose', () => {
  const regs = foldRegistries({ intents: { guard: { suppressible: true, suppressed_by: ['web'] } } });
  assert.deepEqual(routeEscalate('delta', regs).intents, ['guard']);
  const output = combineFor('delta', regs, jev({ intents: { web: 0.9 } }));
  assert.deepEqual(output.intents, ['web', 'guard']);
  assert.deepEqual(output.suppressed, []);
});

test('a medium-floor survivor the judge did not choose is dropped, and the floor stays medium', () => {
  // Current contract: only high-floor survivors are protected (§4.1 rule 1);
  // the deterministic floor itself is never lowered.
  const output = combineFor('gamma', foldRegistries(), jev({ intents: { web: 0.9 } }));
  assert.deepEqual(output.intents, ['web']);
  assert.deepEqual(output.suppressed, []);
  assert.equal(output.riskFloor, 'medium');
});

test('the fold never lowers the model tier', () => {
  const output = combineFor('gamma', foldRegistries(), jev({ intents: { docs: 0.9 } }));
  assert.deepEqual(output.intents, ['docs']);
  assert.equal(output.modelTier, 'design');
});

test('the fold raises the model tier and floor when the chosen intents need more', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ intents: { api: 0.9 } }));
  assert.equal(output.modelTier, 'design');
  assert.equal(output.riskFloor, 'medium');
});

test('a suppressible intent the judge chose beside a specific one is suppressed in the fold', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ intents: { 'new-feature': 0.9, web: 0.9 } }));
  assert.deepEqual(output.intents, ['web']);
  assert.deepEqual(output.suppressed, [{ id: 'new-feature', by: 'more-specific-match' }]);
});

// --- authoritative fold: decision rules -------------------------------------------------

test('a judge rule fact adds its rule at the rule threshold, not below', () => {
  const regs = foldRegistries();
  const below = combineFor('beta', regs, jev({ intents: { web: 0.9 }, rules: { large_change: 0.69 } }));
  assert.deepEqual(below.judgeAdded, []);
  const at = combineFor('beta', regs, jev({ intents: { web: 0.9 }, rules: { large_change: 0.7 } }));
  assert.deepEqual(at.judgeAdded, ['rule-large-change']);
  assert.deepEqual(at.decisionMatches.map((m) => m.id), ['rule-large-change']);
});

test('a rule without its own threshold uses rule_default, and a judge-added high rule raises anyHigh', () => {
  const regs = foldRegistries();
  const below = combineFor('beta', regs, jev({ intents: { web: 0.9 }, rules: { handles_sensitive_data: 0.49 } }));
  assert.deepEqual(below.judgeAdded, []);
  assert.equal(below.anyHigh, false);
  const at = combineFor('beta', regs, jev({ intents: { web: 0.9 }, rules: { handles_sensitive_data: 0.5 } }));
  assert.deepEqual(at.judgeAdded, ['rule-sensitive']);
  assert.equal(at.anyHigh, true);
  assert.equal(at.riskFloor, 'high');
});

test('a rule the keywords already matched is never added twice', () => {
  const output = combineFor('beta omega', foldRegistries(), jev({ intents: { web: 0.9 }, rules: { handles_sensitive_data: 0.9 } }));
  assert.deepEqual(output.judgeAdded, []);
  assert.deepEqual(output.decisionMatches.map((m) => m.id), ['rule-sensitive']);
});

test('keyword matches come first, then judge-added rules in priority order', () => {
  const fact = jev({ intents: { web: 0.9 }, rules: { handles_sensitive_data: 0.9, multi_agent_system: 0.9 } });
  const output = combineFor('beta kappa', foldRegistries(), fact);
  assert.deepEqual(output.decisionMatches.map((m) => m.id), ['rule-large-change', 'rule-sensitive', 'rule-multi-agent-design']);
  assert.deepEqual(output.judgeAdded, ['rule-sensitive', 'rule-multi-agent-design']);
});

test('the fan-out rule is added at judged scale 2 only', () => {
  const regs = foldRegistries();
  assert.deepEqual(combineFor('beta', regs, jev({ intents: { web: 0.9 }, scale: 2 })).judgeAdded, ['rule-fanout']);
  assert.deepEqual(combineFor('beta', regs, jev({ intents: { web: 0.9 }, scale: 1 })).judgeAdded, []);
});

test('the spec-threshold rule reads the folded set before suppression', () => {
  const output = combineFor('zeta', foldRegistries(), jev({ intents: { 'new-feature': 0.9, web: 0.9 } }));
  assert.deepEqual(output.intents, ['web']);
  assert.deepEqual(output.judgeAdded, ['rule-spec-threshold']);
});

test('the change-record rule is never synthesized from a judge fact', () => {
  const fact = jev({
    intents: { 'new-feature': 1, web: 1 },
    rules: { handles_sensitive_data: 1, large_change: 1, multi_agent_system: 1 },
    scale: 2,
    design_work: 1,
  });
  const output = combineFor('beta', foldRegistries(), fact);
  assert.ok(!output.judgeAdded.includes('rule-change-record'), output.judgeAdded.join(','));
});

// --- authoritative fold: risk ----------------------------------------------------------------

test('a low risk proposal never lowers the floor', () => {
  const output = combineFor('gamma', foldRegistries(), jev({ intents: { api: 0.9 } }));
  assert.equal(output.riskProposal, 'low');
  assert.equal(output.riskFloor, 'medium');
});

test('a risk proposal raises a null floor and a lower floor', () => {
  const fromNull = combineFor('zeta', foldRegistries(), jev({ intents: { docs: 0.9 } }));
  assert.equal(routeEscalate('zeta', foldRegistries()).risk_floor, null);
  assert.equal(fromNull.riskFloor, 'low');
  const raised = combineFor('beta', foldRegistries(), jev({
    intents: { web: 0.9 },
    risk: { reversibility: 1, blast_radius: 0, data_sensitivity: 0, contract_surface: 2, spend: 0 },
  }));
  assert.equal(raised.riskProposal, 'high');
  assert.equal(raised.riskFloor, 'high');
  assert.equal(raised.anyHigh, false);
});

// --- authoritative fold: escalation reasons (§16.4) --------------------------------------------

test('(a) a fold to two agent intents adds multi-agent-dispatch', () => {
  const regs = foldRegistries();
  assert.deepEqual(routeEscalate('beta', regs).reasons, []);
  assert.deepEqual(combineFor('beta', regs, jev({ intents: { web: 0.9, api: 0.9 } })).escalateReasons, ['multi-agent-dispatch']);
});

test('(b) a fold to one intent keeps the deterministic multi-agent-dispatch', () => {
  const regs = foldRegistries();
  assert.deepEqual(routeEscalate('beta gamma', regs).reasons, ['multi-agent-dispatch']);
  const output = combineFor('beta gamma', regs, jev({ intents: { web: 0.9 } }));
  assert.deepEqual(output.intents, ['web']);
  assert.deepEqual(output.escalateReasons, ['multi-agent-dispatch']);
});

test('(c) a fold to an intent that requires a dispatch plan adds requires-dispatch-plan', () => {
  const output = combineFor('beta', foldRegistries(), jev({ intents: { sweep: 0.9 } }));
  assert.deepEqual(output.escalateReasons, ['requires-dispatch-plan']);
});

test('(d) folded reasons follow policy order, with doubt last', () => {
  const fact = jev({ intents: { web: 0.9, api: 0.9, sweep: 0.9 }, primary: { id: 'web', confidence: 0.9, margin: 0.1 } });
  assert.deepEqual(combineFor('beta', foldRegistries(), fact).escalateReasons, [
    'multi-agent-dispatch',
    'requires-dispatch-plan',
    'low-confidence',
  ]);
});

test('a primary margin under the judge margin adds low-confidence', () => {
  const fact = jev({ intents: { web: 0.9 }, primary: { id: 'web', confidence: 0.9, margin: 0.19 } });
  assert.deepEqual(combineFor('beta', foldRegistries(), fact).escalateReasons, ['low-confidence']);
  const steady = jev({ intents: { web: 0.9 }, primary: { id: 'web', confidence: 0.9, margin: 0.2 } });
  assert.deepEqual(combineFor('beta', foldRegistries(), steady).escalateReasons, []);
});

test('unrouted-scale is kept when the route had it and never added by the fold', () => {
  const regs = foldRegistries();
  assert.deepEqual(routeEscalate('modernize all services', regs).reasons, ['unrouted-scale']);
  assert.deepEqual(
    combineFor('modernize all services', regs, jev({ intents: { docs: 0.9 } })).escalateReasons,
    ['unrouted-scale'],
  );
  // A big task that routed is not unrouted, even when the fold leaves no intent.
  assert.deepEqual(routeEscalate('modernize all services zeta', regs).reasons, []);
  assert.deepEqual(combineFor('modernize all services zeta', regs, jev()).escalateReasons, []);
});

test('the fold ignores a tiebreak fact', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  assert.equal(routeEscalate('beta gamma', regs).ambiguous, true);
  const output = combineFor('beta gamma', regs, jev({ intents: { docs: 0.9 } }), { web: 0.9, api: 0.1 });
  assert.equal(output.tiebreakWinner, null);
  assert.deepEqual(output.intents, ['docs']);
});

// --- tie-break narrowing (§4.7) ---------------------------------------------------------------

test('a tie-break winner narrows an ambiguous route and the dropped survivor names it', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  const route = routeEscalate('beta gamma', regs);
  assert.equal(route.ambiguous, true);
  const output = combineFor('beta gamma', regs, null, { web: 0.9, api: 0.5 });
  assert.equal(output.tiebreakWinner, 'web');
  assert.deepEqual(output.intents, ['web']);
  assert.deepEqual(output.suppressed, [{ id: 'api', by: 'web' }]);
  assert.deepEqual(output.agents, ['web-agent']);
  assert.equal(output.ambiguous, false);
  // Never lowered: api carried the design tier and the medium floor.
  assert.equal(output.modelTier, 'design');
  assert.equal(output.riskFloor, 'medium');
  // Reasons are the route's, unchanged, so the doubt stays visible.
  assert.deepEqual(output.escalateReasons, route.reasons);
  assert.deepEqual(output.ranked, route.ranked);
});

test('a lower-tier winner never lowers the tier or the floor', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  const output = combineFor('gamma zeta', regs, null, { api: 0.2, docs: 0.9 });
  assert.equal(output.tiebreakWinner, 'docs');
  assert.deepEqual(output.intents, ['docs']);
  assert.equal(output.modelTier, 'design');
  assert.equal(output.riskFloor, 'medium');
});

test('narrowing keeps every high-floor survivor beside the winner', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  const output = combineFor('beta gamma delta', regs, null, { web: 0.9, api: 0.5, guard: 0.3 });
  assert.equal(output.tiebreakWinner, 'web');
  assert.deepEqual(output.intents, ['web', 'guard']);
  assert.deepEqual(output.suppressed, [{ id: 'api', by: 'web' }]);
  assert.equal(output.riskFloor, 'high');
});

test('a single survivor leaves nothing to break', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  const route = routeEscalate('alpha beta', regs);
  assert.deepEqual(route.intents, ['web']);
  assert.equal(route.ambiguous, true);
  const output = combineFor('alpha beta', regs, null, { web: 0.9, 'new-feature': 0.1 });
  assert.equal(output.tiebreakWinner, null);
  assert.equal(output.ambiguous, true);
});

test('a ranked candidate that is not a survivor is never selected', () => {
  const regs = foldRegistries({ scoring: AMBIGUOUS_PAIR_SCORING });
  const route = routeEscalate('alpha beta gamma', regs);
  assert.deepEqual(route.intents, ['web', 'api']);
  assert.ok(route.ranked.some((candidate) => candidate.id === 'new-feature'));
  const output = combineFor('alpha beta gamma', regs, null, { 'new-feature': 0.99, web: 0.9, api: 0.5 });
  assert.equal(output.tiebreakWinner, 'web');
  assert.ok(!output.intents.includes('new-feature'));
});

test('selection applies on the deterministic branch of a shadow jev fact', () => {
  const regs = foldRegistries({ mode: 'shadow', scoring: AMBIGUOUS_PAIR_SCORING });
  const output = combineFor('beta gamma', regs, jev({ intents: { docs: 0.9 } }), { web: 0.9, api: 0.5 });
  assert.equal(output.tiebreakWinner, 'web');
  assert.deepEqual(output.intents, ['web']);
});

test('the tiebreak fact is inert when the route is not ambiguous', () => {
  const regs = foldRegistries();
  assert.equal(routeEscalate('beta gamma', regs).ambiguous, false);
  const output = combineFor('beta gamma', regs, null, { web: 0.9, api: 0.1 });
  assert.equal(output.tiebreakWinner, null);
  assert.deepEqual(output.intents, ['web', 'api']);
});

// --- helpers -----------------------------------------------------------------------------------

function combineFor(prompt: string, regs: Registries, judge: JudgeFact | null, tiebreak?: TiebreakFact): CombineOutput {
  const route = routeEscalate(prompt, regs);
  return combine({
    route,
    decisions: decisionsSection({ prompt }, regs),
    scale: route.scale,
    judge,
    mode: regs.policy.judge.mode,
    regs,
    ...(tiebreak === undefined ? {} : { tiebreak }),
  });
}

