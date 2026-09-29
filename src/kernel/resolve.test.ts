import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type KernelContext, type RiskTier } from './context';
import { resolve } from './resolve';
import type { ClassifiedRiskSection, TierRiskSection } from './risk';
import type { EscalateRouteSection, IntentRouteSection, PathRouteSection } from './route';

const root = resolveRoot(process.env, __dirname);
const ctx: KernelContext = { root, registries: lazyRegistries(root) };

// The section is one type with two forms; each helper narrows to the form its
// own declared fact answers.
function routePath(file: string): PathRouteSection {
  const section = resolve({ path: file }, ctx).route;
  if (section === undefined) throw new Error(`no route section for ${file}`);
  if (!('domain' in section)) throw new Error(`a path fact answered the intent form for ${file}`);
  return section;
}

function routeIntent(prompt: string): IntentRouteSection {
  const section = resolve({ prompt }, ctx).route;
  if (section === undefined) throw new Error(`no route section for ${prompt}`);
  if (!('matches' in section)) throw new Error(`a prompt fact answered the path form for ${prompt}`);
  return section;
}

test('every domain sample_path routes to its own domain (mirror of check C17b)', () => {
  for (const d of ctx.registries.routing.domains) {
    if (d.sample_path === null) continue;
    assert.equal(routePath(d.sample_path).domain, d.id, `sample_path ${d.sample_path}`);
  }
});

test('excluded basenames and paths answer {domain:null, excluded:true}', () => {
  assert.deepEqual(routePath('README.md'), { domain: null, excluded: true });
  assert.deepEqual(routePath('/x/.engineos/changes/a.ts'), { domain: null, excluded: true });
});

test('self_dirs exclude only this checkout, not a consumer project', () => {
  assert.deepEqual(routePath(join(root, 'hooks', 'x.ts')), { domain: null, excluded: true });
  assert.notDeepEqual(routePath('/consumer/hooks/x.ts'), { domain: null, excluded: true });
});

test('no match answers {domain:null, excluded:false}', () => {
  assert.deepEqual(routePath('/x/y/unrelated.txt'), { domain: null, excluded: false });
});

test('a match carries the domain fields in jq key order', () => {
  const a = routePath('/src/modules/auth/guard.ts');
  assert.deepEqual(Object.keys(a), [
    'domain', 'rules', 'skills', 'skills_suppressed', 'agent', 'risk_floor', 'hook_guidance', 'excluded',
  ]);
  assert.equal(a.domain, 'security');
});

test('a match derives risk_floor from intents.json and hook_guidance from the renderer', () => {
  const a = routePath('/tmp/app/ios/fastlane/Fastfile');
  assert.deepEqual(a, {
    domain: 'ios-release',
    rules: ['security'],
    skills: [],
    skills_suppressed: [],
    agent: 'ios-builder',
    risk_floor: 'high',
    hook_guidance: 'rules/security.md | agent:ios-builder (signing)',
    excluded: false,
  });
});

test('an empty facts object answers an empty Answer', () => {
  assert.deepEqual(resolve({}, ctx), {});
});

test('a declared but empty path is refused, never routed', () => {
  assert.throws(() => resolve({ path: '' }, ctx), KernelError);
});

test('every intent matches on its own first signal', () => {
  for (const intent of ctx.registries.intents.intents) {
    const [signal] = intent.signals;
    if (signal === undefined) throw new Error(`intent ${intent.id} carries no signal`);
    const ids = routeIntent(signal).matches.map((m) => m.id);
    assert.ok(ids.includes(intent.id), `signal "${signal}" did not match ${intent.id} (matched ${ids.join(', ')})`);
  }
});

test('a prompt carrying several intents matches all of them, in registry order', () => {
  const section = routeIntent('add a NestJS controller and run a retro');
  assert.deepEqual(section.matches.map((m) => m.id), ['new-feature', 'backend', 'retro']);
  assert.equal(section.ambiguous, false);
});

test('a prompt matching no signal is ambiguous, not an error', () => {
  assert.deepEqual(routeIntent('zzz qqq'), { matches: [], ambiguous: true });
});

test('a signal inside a longer word does not match', () => {
  // "add" is new-feature's signal; "addressed" is not a request to add anything.
  assert.deepEqual(routeIntent('the issue was addressed').matches, []);
  // Non-alphanumeric neighbours are boundaries, so these still match.
  assert.deepEqual(routeIntent('foo_add_bar').matches.map((m) => m.id), ['new-feature']);
  assert.deepEqual(routeIntent('ADD a feature').matches.map((m) => m.id), ['new-feature']);
});

test('matching is ASCII-case-insensitive and Unicode-boundary aware', () => {
  // "é" is alphanumeric to jq's [[:alnum:]], so it bounds nothing.
  assert.deepEqual(routeIntent('réadd it').matches, []);
});

test('an intent match carries the eleven projected fields in jq key order', () => {
  const [first] = routeIntent('run a retro').matches;
  if (first === undefined) throw new Error('no intent matched a known signal');
  assert.deepEqual(Object.keys(first), [
    'id', 'title', 'rules', 'skills', 'skills_suppressed', 'agents', 'commands', 'mcp',
    'model_tier', 'risk_floor', 'note',
  ]);
  assert.equal(first.id, 'retro');
  assert.equal(first.model_tier, 'design');
  assert.equal(first.risk_floor, null);
});

test('a declared but empty prompt is refused, never routed', () => {
  assert.throws(() => resolve({ prompt: '' }, ctx), KernelError);
});

test('a path fact and a prompt fact cannot be declared together', () => {
  assert.throws(() => resolve({ path: 'a.ts', prompt: 'add a thing' }, ctx), KernelError);
});

// The section modules own what each answer MEANS (model.test.ts, risk.test.ts,
// repair.test.ts). These cases own the wiring only: that a declared fact reaches
// its section, that the answer lands under the right key, and that two facts
// competing for one key are refused rather than silently resolved.

test('a work-type fact answers the model section, and nothing else', () => {
  assert.deepEqual(resolve({ workType: 'build' }, ctx), {
    model: { work: 'build', tier: 'build', model: 'opus', escalates_to: { tier: 'design', model: 'opus' } },
  });
});

test('a signals fact answers the classified form of the risk section', () => {
  const section = classified({ inputs: { reversibility: 'low', 'blast-radius': 'medium' } });
  assert.deepEqual(Object.keys(section), ['risk', 'autonomy_ceiling', 'gates', 'floors_applied']);
  assert.equal(section.risk, 'medium');
});

test('a classified risk-tier fact answers the tier form of the same section', () => {
  const section = forTier('high');
  assert.deepEqual(Object.keys(section), ['risk', 'gates', 'spec_threshold']);
  assert.equal(section.gates['validation'], 'required-plus-critic');
});

test('the two risk facts answer the same key, so declaring both is refused', () => {
  assert.throws(() => resolve({ signals: { floors: ['payments'] }, riskTier: 'low' }, ctx), KernelError);
});

test('a repair fact answers the repair section', () => {
  assert.deepEqual(resolve({ repair: { check: 'lint', attempt: 1 } }, ctx).repair, {
    check: 'lint',
    action: 'fix-same-tier',
    reason: 'first red — fix and re-run the check at the same tier',
  });
});

test('a section refusing its own fact propagates out of resolve', () => {
  assert.throws(() => resolve({ workType: 'nonsense' }, ctx), KernelError);
  assert.throws(() => resolve({ signals: {} }, ctx), KernelError);
  assert.throws(() => resolve({ repair: { check: 'lint' } }, ctx), KernelError);
});

test('facts for several sections are answered together, each under its own key', () => {
  const answer = resolve({ path: 'README.md', workType: 'mechanical', riskTier: 'low', repair: { check: 'test', attempt: 0 } }, ctx);
  assert.deepEqual(Object.keys(answer), ['route', 'model', 'risk', 'repair']);
});

// Wave 1(c)'s four sections, wired the same way and asserted the same way: the
// section modules own what each answer MEANS (admit.test.ts, breaker.test.ts,
// hitl.test.ts, waves.test.ts), and these cases own the wiring only.

test('an admit fact answers the admit section, and nothing else', () => {
  const answer = resolve({ admit: { inflight: 0, queued: 0 } }, ctx);
  assert.deepEqual(Object.keys(answer), ['admit']);
  const section = answer.admit;
  if (section === undefined) throw new Error('no admit section for an admit fact');
  assert.deepEqual(Object.keys(section), ['action', 'capacity', 'reason']);
  // The cap is read from the same registry the section reads, so
  // re-parameterising it moves this assertion instead of turning it red.
  assert.deepEqual(section, {
    action: 'dispatch',
    capacity: cap(),
    reason: `inflight 0 below cap ${cap()}`,
  });
});

test('a breaker fact answers the breaker section', () => {
  const section = resolve({ breaker: { state: 'closed', failures: 0 } }, ctx).breaker;
  if (section === undefined) throw new Error('no breaker section for a breaker fact');
  assert.deepEqual(Object.keys(section), ['state', 'allow', 'reason']);
  assert.equal(section.state, 'closed');
  assert.equal(section.allow, true);
});

test('a hitl fact answers the hitl section', () => {
  const section = resolve({ hitl: { riskTier: 'high', autonomy: 'A3' } }, ctx).hitl;
  if (section === undefined) throw new Error('no hitl section for a hitl fact');
  assert.deepEqual(Object.keys(section), ['required', 'reasons', 'autonomy_after', 'record_home']);
  assert.equal(section.required, true);
  assert.deepEqual(section.reasons, ['high-risk']);
  assert.equal(section.autonomy_after, 'A3');
});

test('a waves fact answers the waves section', () => {
  const units = [
    { id: 'a', files: ['a.ts'], depends_on: [] },
    { id: 'b', files: ['b.ts'], depends_on: [] },
    { id: 'c', files: ['c.ts'], depends_on: ['a', 'b'] },
  ];
  const section = resolve({ waves: { units } }, ctx).waves;
  if (section === undefined) throw new Error('no waves section for a waves fact');
  assert.deepEqual(Object.keys(section), ['waves', 'violations', 'fanout_line']);
  assert.deepEqual(section.waves, [['a', 'b'], ['c']]);
  assert.deepEqual(section.violations, []);
});

test('each Wave 1(c) section refusing its own fact propagates out of resolve', () => {
  assert.throws(() => resolve({ admit: { inflight: -1, queued: 0 } }, ctx), KernelError);
  assert.throws(() => resolve({ breaker: { state: 'bogus' } }, ctx), KernelError);
  assert.throws(() => resolve({ hitl: { riskTier: 'low', autonomy: 'A9' } }, ctx), KernelError);
  assert.throws(() => resolve({ waves: { units: 'not an array' } }, ctx), KernelError);
});

// The Answer's key order is part of its contract: a composite caller (Wave 1(d)'s
// resolve-task) reads the sections in this order, so a section wired in at the
// wrong place would be visible here rather than in a diff nobody runs.
test('every declared fact is answered under its own key, in Answer order', () => {
  const answer = resolve({
    path: 'README.md',
    workType: 'mechanical',
    riskTier: 'low',
    repair: { check: 'test', attempt: 0 },
    admit: { inflight: 0, queued: 0 },
    breaker: { state: 'closed', failures: 0 },
    hitl: { riskTier: 'low', autonomy: 'A2' },
    waves: { units: [] },
  }, ctx);
  assert.deepEqual(Object.keys(answer), ['route', 'model', 'risk', 'repair', 'admit', 'breaker', 'hitl', 'waves']);
});

function cap(): number {
  return ctx.registries.policy.parallelism.wave_concurrency_cap;
}

// The risk section is one type with two forms; each helper narrows to the form
// its own declared fact answers, the same way the two route helpers above do.
function classified(signals: unknown): ClassifiedRiskSection {
  const section = resolve({ signals }, ctx).risk;
  if (section === undefined) throw new Error('no risk section for a signals fact');
  if (!('floors_applied' in section)) throw new Error('a signals fact answered the classified-tier form');
  return section;
}

function forTier(riskTier: RiskTier): TierRiskSection {
  const section = resolve({ riskTier }, ctx).risk;
  if (section === undefined) throw new Error(`no risk section for tier ${riskTier}`);
  if (!('spec_threshold' in section)) throw new Error('a tier fact answered the classified form');
  return section;
}

// Wave 1(d)'s three sections and the composite. As above, the section modules own
// what each answer MEANS (scale.test.ts, decisions.test.ts, route.test.ts); these
// cases own the wiring — that a declared fact reaches its section, that the
// answer lands under the right key, and that the composite composes what the
// bash arm composed.

test('a scale fact answers the scale section, and nothing else', () => {
  const answer = resolve({ scale: { prompt: 'implement all the endpoints across the codebase' } }, ctx);
  assert.deepEqual(Object.keys(answer), ['scale']);
  assert.deepEqual(answer.scale, { big_task: true, spec_authoring: false, design_work: false });
});

test('a decisions fact answers the decision-rules section under its legacy key', () => {
  const answer = resolve({ decisions: { prompt: "let's write a friendly test" } }, ctx);
  assert.deepEqual(Object.keys(answer), ['decision_rules']);
  assert.deepEqual(answer.decision_rules, { matches: [], any_high: false });
});

test('a decisions match carries the five fields in jq key order', () => {
  const section = resolve({ decisions: { prompt: 'drop the users table in production' } }, ctx).decision_rules;
  if (section === undefined) throw new Error('no decision-rules section for a decisions fact');
  const [first] = section.matches;
  if (first === undefined) throw new Error('a destructive prompt matched no rule');
  assert.deepEqual(Object.keys(first), ['id', 'require', 'prefer', 'gate', 'risk']);
  assert.equal(section.any_high, true);
});

test('the escalate modifier selects the escalate form of the route section', () => {
  const section = escalateRoute('add a paginated orders endpoint to the API and mirror the screen to mobile');
  assert.deepEqual(Object.keys(section), [
    'escalate', 'reasons', 'intents', 'suppressed', 'agents', 'model_tier', 'risk_floor', 'scale', 'ambiguous',
  ]);
  assert.deepEqual(section.intents, ['backend', 'mobile']);
  assert.deepEqual(section.suppressed, [{ id: 'new-feature', by: 'more-specific-match' }]);
});

test('without the modifier the same prompt still answers the intent form', () => {
  const section = routeIntent('add a paginated orders endpoint to the API and mirror the screen to mobile');
  assert.deepEqual(Object.keys(section), ['matches', 'ambiguous']);
});

test('a modifier without a prompt fact is refused rather than ignored', () => {
  assert.throws(() => resolve({ escalate: true }, ctx), KernelError);
  assert.throws(() => resolve({ taskContract: true }, ctx), KernelError);
});

test('a task-contract fact answers route, decision_rules and task_contract together', () => {
  const answer = resolve({ prompt: 'add a paginated orders endpoint and mirror the screen to mobile', taskContract: true }, ctx);
  assert.deepEqual(Object.keys(answer), ['route', 'decision_rules', 'task_contract']);
  const contract = answer.task_contract;
  if (contract === undefined) throw new Error('no task contract for a task-contract fact');
  assert.deepEqual(Object.keys(contract), [
    'substantive', 'intents', 'escalates', 'escalation_reasons', 'suppressed', 'agents', 'rules',
    'policy_rules', 'skills', 'skills_suppressed', 'commands', 'mcp', 'model_tier', 'risk_floor',
    'autonomy_ceiling_at_floor',
    'scale', 'decision_rules', 'required', 'gates', 'preferences',
  ]);
  // "endpoint" is a backend signal (registries/intents.json 1.4.0), so the
  // prompt names both stacks and the contract carries both coordinators.
  assert.deepEqual(contract.intents, ['backend', 'mobile']);
  assert.deepEqual(contract.agents, ['backend-coordinator', 'mobile-coordinator']);
  assert.ok(contract.required.includes('design-doc'));
  // policy_rules is jq's `unique`, which sorts as well as de-duplicates.
  assert.deepEqual(contract.policy_rules, ['gates', 'models', 'parallelism', 'risk-autonomy', 'subagents', 'verification']);
});

// The distinction the composite exists to keep: a floor is an INPUT to
// classification, so it never folds hitl in on its own.
test('a floor-only prompt carries the floor and answers no hitl section', () => {
  const answer = resolve({ prompt: 'add a paginated orders endpoint and mirror the screen to mobile', taskContract: true }, ctx);
  assert.equal(answer.hitl, undefined);
  assert.equal(answer.task_contract?.risk_floor, 'medium');
  assert.equal(answer.task_contract?.autonomy_ceiling_at_floor, 'A3');
});

test('a matched high rule raises the floor and folds the hitl section in', () => {
  const answer = resolve({ prompt: 'deploy the billing service to production', taskContract: true }, ctx);
  assert.deepEqual(Object.keys(answer), ['route', 'decision_rules', 'hitl', 'task_contract']);
  assert.equal(answer.task_contract?.risk_floor, 'high');
  assert.deepEqual(answer.hitl, {
    required: true,
    reasons: ['high-risk'],
    // The autonomy hitl is asked about is the ceiling at the raised floor, so
    // adequate evidence leaves it where the registry puts it.
    autonomy_after: ctx.registries.policy.autonomy.ceiling_by_risk.high,
    record_home: ctx.registries.policy.hitl.record_home,
  });
});

// The topology fold: rule-multi-agent-design carries no risk tier, so the floor
// stays what the intents set (agent-system/llm: medium) and the ONLY reason is
// the approval the topology owes — a floor alone still announces nothing.
test('a multi-agent prompt folds the topology-approval reason in at the floor it carries', () => {
  const answer = resolve(
    { prompt: 'design a supervisor agent that coordinates the DSL and narrator agents', taskContract: true },
    ctx,
  );
  const contract = answer.task_contract;
  assert.ok(contract?.intents.includes('agent-system'), `agent-system in ${String(contract?.intents)}`);
  assert.ok(contract?.decision_rules.includes('rule-multi-agent-design'));
  assert.equal(contract?.risk_floor, 'medium');
  assert.deepEqual(answer.hitl, {
    required: true,
    reasons: ['topology-approval'],
    autonomy_after: ctx.registries.policy.autonomy.ceiling_by_risk.medium,
    record_home: ctx.registries.policy.hitl.record_home,
  });
});

test('a LangGraph prompt with no supervisor word folds the same reason', () => {
  const answer = resolve({ prompt: 'wire the LangGraph state machine for the order pipeline', taskContract: true }, ctx);
  assert.deepEqual(answer.hitl?.reasons, ['topology-approval']);
});

// The fold needs a ceiling to ask about, which needs a floor, which needs an
// intent: every phrase the rule's signals recognise must also land an intent, or
// a matched rule would silently announce nothing. Held here rather than assumed.
test('every rule-multi-agent-design signal phrase lands an intent, so the fold is never dropped', () => {
  const phrases = [
    'build a multi-agent pipeline',
    'two agents that hand off to each other',
    'agents which coordinate the ingest',
    'add a supervisor agent for the workers',
    'sketch the agent topology',
    'orchestrate the three research agents',
    'use langgraph for the flow',
    'expose it over a2a',
    'agent-to-agent messaging for the planner',
  ];
  for (const prompt of phrases) {
    const answer = resolve({ prompt, taskContract: true }, ctx);
    assert.ok(answer.task_contract?.decision_rules.includes('rule-multi-agent-design'), `rule matches: ${prompt}`);
    assert.notEqual(answer.task_contract?.risk_floor, null, `a floor for: ${prompt}`);
    assert.ok(answer.hitl?.reasons.includes('topology-approval'), `topology-approval for: ${prompt}`);
  }
});

test('a prompt requesting no work is not substantive and loads no policy rules', () => {
  const contract = resolve({ prompt: 'the weather is nice today', taskContract: true }, ctx).task_contract;
  assert.equal(contract?.substantive, false);
  assert.deepEqual(contract?.policy_rules, []);
});

test('an unrouted action is substantive through the registry action expression', () => {
  const contract = resolve({ prompt: 'update the prose in this document', taskContract: true }, ctx).task_contract;
  assert.equal(contract?.substantive, true);
  assert.deepEqual(contract?.intents, []);
  assert.deepEqual(contract?.policy_rules, ['gates', 'models', 'parallelism', 'risk-autonomy', 'verification']);
});

// Two facts answering one key are refused rather than resolved, the same rule the
// two route forms and the two risk forms already follow.
test('a task-contract fact refuses the two facts that would answer its own keys', () => {
  const prompt = 'deploy the billing service to production';
  assert.throws(() => resolve({ prompt, taskContract: true, decisions: { prompt } }, ctx), KernelError);
  assert.throws(() => resolve({ prompt, taskContract: true, hitl: { riskTier: 'low', autonomy: 'A2' } }, ctx), KernelError);
});

function escalateRoute(prompt: string): EscalateRouteSection {
  const section = resolve({ prompt, escalate: true }, ctx).route;
  if (section === undefined) throw new Error(`no route section for ${prompt}`);
  if (!('escalate' in section)) throw new Error(`the escalate modifier answered another form for ${prompt}`);
  return section;
}
