import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import type { IntentRow } from '../registry/intents';
import type { PackageStack } from '../registry/project-config';
import { loadRegistry } from '../registry/load';
import type { ScoringPolicy } from '../registry/policy-router';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type Registries } from './context';
import { floorOf, renderGuidance, routeByIntent, routeEscalate, type EscalateRouteSection } from './route';

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);

// The two parity tests that lived here compared renderGuidance/floorOf against
// the strings routing.json used to store. routing.json no longer stores either
// (plan Task 13, design "Route guidance" step two), so there is nothing left to
// compare to: the derivation is the only form of the fact. The stored snapshot
// survives in test/fixtures/legacy-kernel/registries, where parity.test.ts
// still holds the ported answers against the pinned bash kernel's.

test('exactly one intent carries each routed domain', () => {
  for (const d of regs.routing.domains) {
    const rows = regs.intents.intents.filter((i) => i.domain === d.id);
    assert.equal(rows.length, 1, `domain ${d.id}`);
  }
});

test('the hint is rendered last, and omitted when the row has none', () => {
  const base = { id: 'x', match: { paths: [], basenames: [] }, rules: ['a', 'b'], skills: ['s'], sample_path: null };
  assert.equal(renderGuidance({ ...base, agent: 'ag', hint: 'why' }), 'rules/a.md+b.md | skill:s | agent:ag (why)');
  assert.equal(renderGuidance({ ...base, agent: null, hint: null }), 'rules/a.md+b.md | skill:s');
});

test('a domain with no intent has no floor', () => {
  const orphan = { id: 'nope', match: { paths: [], basenames: [] }, rules: [], skills: [], agent: null, hint: null, sample_path: null };
  assert.equal(floorOf(orphan, regs), null);
});

// --- routeEscalate: the shipped registry ------------------------------------

// The fixtures are policy data, so they are LOOPED from the registry exactly as
// scripts/test-kernel.sh loops them: a fixture added to policy.json is covered
// here without touching this file, and one that stops holding turns this red
// rather than quietly dropping out of the suite.
test('every policy.router fixture resolves to its recorded escalation', () => {
  for (const fixture of regs.policy.router.fixtures) {
    const section = routeEscalate(fixture.prompt, regs);
    assert.equal(section.escalate, fixture.escalate, `escalate: ${fixture.prompt}`);
    assert.deepEqual(
      [...section.reasons].sort(),
      [...fixture.reasons].sort(),
      `reasons: ${fixture.prompt}`,
    );
    assert.deepEqual(
      [...section.intents].sort(),
      [...fixture.intents].sort(),
      `intents: ${fixture.prompt}`,
    );
  }
});

test('the answer carries cmd_route_escalate key order', () => {
  assert.deepEqual(Object.keys(routeEscalate('why does the login handler fail with a 500', regs)), [
    'escalate',
    'reasons',
    'intents',
    'suppressed',
    'agents',
    'model_tier',
    'risk_floor',
    'scale',
    'ambiguous',
    // contracts.md@rev1 §2.3: the ranking siblings trail the legacy keys (MINOR).
    'ranked',
    'margin',
    'rebound',
    'generic_only',
  ]);
});

test('a suppressible fallback drops when a more specific stack row also matches', () => {
  const section = routeEscalate(
    'add a paginated orders endpoint to the API and mirror the screen to mobile',
    regs,
  );
  assert.deepEqual([...section.intents].sort(), ['backend', 'mobile']);
  assert.deepEqual(byOf(section, 'new-feature'), 'more-specific-match');
});

test('mobile is suppressed by the store-release row that matched alongside it', () => {
  const section = routeEscalate('publish to App Store the iOS app screen', regs);
  assert.deepEqual(section.intents, ['ios-release']);
  assert.equal(byOf(section, 'mobile'), 'ios-release');
});

test('model_tier and risk_floor aggregate over the surviving intents', () => {
  const section = routeEscalate(
    'add a paginated orders endpoint to the API and mirror the screen to mobile',
    regs,
  );
  assert.notEqual(section.model_tier, null);
  assert.notEqual(section.risk_floor, null);
});

test('a prompt matching no intent aggregates to null, never to a guess', () => {
  const section = routeEscalate('zzqq wibble frobnicate', regs);
  assert.deepEqual(section.intents, []);
  assert.deepEqual(section.suppressed, []);
  assert.deepEqual(section.agents, []);
  assert.equal(section.model_tier, null);
  assert.equal(section.risk_floor, null);
  assert.equal(section.ambiguous, true);
});

test('a real bug report resolves the bug intent and carries its tier', () => {
  const section = routeEscalate('why does the login handler fail with a 500', regs);
  assert.deepEqual(section.intents, ['bug']);
  assert.equal(section.model_tier, 'design');
  assert.equal(section.ambiguous, false);
});

// The threshold counts INTENTS carrying agents, not agents: dba names three leaf
// specialists and is still one intent, so it must not escalate on its own.
test('a single intent naming three leaf agents does not escalate', () => {
  const section = routeEscalate('improve query perf on the orders table', regs);
  assert.deepEqual(section.intents, ['dba']);
  assert.equal(section.escalate, false);
  assert.deepEqual(section.reasons, []);
});

test('divergent tier and floor across suppressed matches is not a trigger', () => {
  assert.equal(routeEscalate('build the ios release and upload to TestFlight', regs).escalate, false);
});

test('the scale classification travels verbatim in the answer', () => {
  assert.deepEqual(routeEscalate('modernize all services', regs).scale, {
    big_task: true,
    spec_authoring: false,
    design_work: false,
  });
});

// --- routeEscalate: suppression, on fixture intents --------------------------

test('a suppressible intent survives when nothing more specific matched', () => {
  const section = escalate('alpha', [
    row('fallback', { signals: ['alpha'], suppressible: true }),
    row('specific', { signals: ['beta'] }),
  ]);
  assert.deepEqual(section.intents, ['fallback']);
  assert.deepEqual(section.suppressed, []);
});

test('an id in suppressed_by drops the intent only when that id actually matched', () => {
  const rows = [row('low', { signals: ['alpha'], suppressed_by: ['high'] }), row('high', { signals: ['beta'] })];
  assert.deepEqual(escalate('alpha', rows).intents, ['low']);

  const both = escalate('alpha beta', rows);
  assert.deepEqual(both.intents, ['high']);
  assert.deepEqual(both.suppressed, [{ id: 'low', by: 'high' }]);
});

test('`by` names the first suppressed_by entry that matched, in the row order', () => {
  const section = escalate('alpha beta gamma', [
    row('low', { signals: ['alpha'], suppressed_by: ['second', 'first'] }),
    row('first', { signals: ['beta'] }),
    row('second', { signals: ['gamma'] }),
  ]);
  assert.deepEqual(section.suppressed, [{ id: 'low', by: 'second' }]);
});

// The property the single pass exists to guarantee: `mid` is dropped, and still
// suppresses `low`, because both tests read the RAW matched set. A transitive
// resolver would keep `low` alive and make the answer depend on drop order.
test('suppression is one pass: a dropped intent still suppresses another', () => {
  const section = escalate('alpha beta gamma', [
    row('plain', { signals: ['gamma'] }),
    row('mid', { signals: ['beta'], suppressible: true }),
    row('low', { signals: ['alpha'], suppressed_by: ['mid'] }),
  ]);
  assert.deepEqual(section.intents, ['plain']);
  assert.deepEqual(section.suppressed, [
    { id: 'mid', by: 'more-specific-match' },
    { id: 'low', by: 'mid' },
  ]);
});

test('the fallback rule reads the raw set too: an all-suppressible match keeps every row', () => {
  const section = escalate('alpha beta', [
    row('a', { signals: ['alpha'], suppressible: true }),
    row('b', { signals: ['beta'], suppressible: true }),
  ]);
  assert.deepEqual(section.intents, ['a', 'b']);
});

// --- routeEscalate: aggregation ----------------------------------------------

test('a suppressed intent contributes neither its tier nor its floor', () => {
  const section = escalate('alpha beta', [
    row('loud', { signals: ['alpha'], suppressible: true, model_tier: 'cheap', risk_floor: 'high' }),
    row('quiet', { signals: ['beta'], model_tier: 'design', risk_floor: 'low' }),
  ]);
  assert.equal(section.model_tier, 'design');
  assert.equal(section.risk_floor, 'low');
});

test('the tier is max by escalation_order, not by match order', () => {
  const rows = [
    row('first', { signals: ['alpha'], model_tier: 'most-capable', risk_floor: 'medium' }),
    row('second', { signals: ['beta'], model_tier: 'build', risk_floor: 'high' }),
  ];
  const section = escalate('alpha beta', rows);
  assert.equal(section.model_tier, 'most-capable');
  assert.equal(section.risk_floor, 'high');
});

test('agents are deduplicated, keeping the order the surviving intents name them in', () => {
  const section = escalate('alpha beta', [
    row('a', { signals: ['alpha'], agents: ['one', 'two'] }),
    row('b', { signals: ['beta'], agents: ['two', 'three'] }),
  ]);
  assert.deepEqual(section.agents, ['one', 'two', 'three']);
});

// --- routeEscalate: the three reasons ----------------------------------------

test('two intents carrying agents reach the multi-agent threshold', () => {
  const min = regs.policy.router.escalate_when.multi_agent_intents_min;
  const rows = [
    row('a', { signals: ['alpha'], agents: ['one'] }),
    row('b', { signals: ['beta'], agents: ['two'] }),
  ];
  assert.equal(rows.filter((r) => r.agents.length > 0).length, min);
  const section = escalate('alpha beta', rows);
  assert.deepEqual(section.reasons, ['multi-agent-dispatch']);
  assert.equal(section.escalate, true);

  assert.deepEqual(escalate('alpha', rows).reasons, []);
});

test('requires_dispatch_plan is read from the survivors, not from the raw matches', () => {
  const rows = [
    row('sweep', { signals: ['alpha'], suppressible: true, requires_dispatch_plan: true }),
    row('plain', { signals: ['beta'] }),
  ];
  assert.deepEqual(escalate('alpha', rows).reasons, ['requires-dispatch-plan']);
  assert.deepEqual(escalate('alpha beta', rows).reasons, []);
});

// unrouted-scale asks whether the prompt routed ANYWHERE, so it reads the raw
// matched set: two intents that suppress each other into an empty surviving set
// still routed, and a scale signal must not escalate them.
test('unrouted-scale needs zero raw matches, not zero survivors', () => {
  const section = escalate('modernize all services alpha beta', [
    row('a', { signals: ['alpha'], suppressed_by: ['b'] }),
    row('b', { signals: ['beta'], suppressed_by: ['a'] }),
  ]);
  assert.deepEqual(section.intents, []);
  assert.equal(section.scale.big_task, true);
  assert.deepEqual(section.reasons, []);
  assert.equal(section.escalate, false);
});

test('a scale signal the escalate_when list does not name never escalates', () => {
  const declared = regs.policy.router.escalate_when.unrouted_scale_signals;
  assert.equal(declared.includes('spec_authoring'), false);
  // spec_authoring alone, on a prompt matching no intent.
  const section = escalate('write the spec for zzqq wibble', []);
  assert.equal(section.scale.spec_authoring, true);
  assert.equal(section.scale.big_task, false);
  assert.deepEqual(section.reasons, []);
});

test('reasons are emitted in the policy order, not in the order they were tested', () => {
  const section = escalate('alpha beta', [
    row('a', { signals: ['alpha'], agents: ['one'], requires_dispatch_plan: true }),
    row('b', { signals: ['beta'], agents: ['two'] }),
  ]);
  assert.deepEqual(section.reasons, ['multi-agent-dispatch', 'requires-dispatch-plan']);
  const policyOrder = regs.policy.router.reasons;
  assert.deepEqual(
    section.reasons,
    policyOrder.filter((r) => section.reasons.includes(r)),
  );
});

// --- routeEscalate: fail-closed ----------------------------------------------

test('a policy.json without a router block refuses to answer', () => {
  const raw = loadRegistry(root, 'policy.json');
  if (!isRecord(raw)) throw new Error('registries/policy.json is not an object');
  const rest: Record<string, unknown> = { ...raw };
  delete rest['router'];
  const dir = mkdtempSync(join(tmpdir(), 'engineos-route-'));
  try {
    mkdirSync(join(dir, 'registries'));
    writeFileSync(join(dir, 'registries', 'policy.json'), JSON.stringify(rest), 'utf8');
    assert.throws(() => routeEscalate('add a feature', lazyRegistries(dir)), (error: unknown) => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.match(error.message, /router/);
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- stack rebind and generic_only (contracts §2) ----------------------------

test('the intent form appends rebound and generic_only after its existing keys', () => {
  assert.deepEqual(Object.keys(routeByIntent('add an endpoint', regs)), ['matches', 'ambiguous', 'ranked', 'margin', 'rebound', 'generic_only']);
});

test('no stack known leaves the keyword result untouched', () => {
  for (const languages of [undefined, []] as const) {
    const answer = routeEscalate('add an endpoint that lists invoices', regs, languages);
    assert.deepEqual(answer.intents, ['backend']);
    assert.deepEqual(answer.rebound, []);
  }
});

test('a python-only repository rebinds the node backend row to its python sibling', () => {
  const answer = routeEscalate('add an endpoint that lists invoices', regs, ['python']);
  assert.deepEqual(answer.intents, ['backend-python']);
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'language', scope: 'repo' }]);
  assert.equal(answer.generic_only, true);
});

test('a node-only repository rebinds a named python framework to the node row', () => {
  const answer = routeEscalate('build it with FastAPI', regs, ['node']);
  assert.deepEqual(answer.intents, ['backend']);
  assert.deepEqual(answer.rebound, [{ from: 'backend-python', to: 'backend', reason: 'language', scope: 'repo' }]);
  // FastAPI is a specific signal, and the sibling inherits that.
  assert.equal(answer.generic_only, false);
});

test('a mixed repository keeps the keyword result, suppression included', () => {
  const answer = routeEscalate('add a FastAPI endpoint', regs, ['node', 'python']);
  assert.deepEqual(answer.intents, ['backend-python']);
  assert.equal(byOf(answer, 'backend'), 'backend-python');
  assert.deepEqual(answer.rebound, []);
});

test('the rebind runs before suppression and dedupes onto a sibling that matched directly', () => {
  // Both rows match; in a python repo backend is replaced by backend-python,
  // which already matched, so one row survives and nothing is left to suppress.
  const answer = routeEscalate('add a FastAPI endpoint', regs, ['python']);
  assert.deepEqual(answer.intents, ['backend-python']);
  assert.deepEqual(answer.suppressed, [{ id: 'new-feature', by: 'more-specific-match' }]);
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'language', scope: 'repo' }]);
});

test('the intent form rebinds the same way and keeps registry order', () => {
  const answer = routeByIntent('add a controller for refunds', regs, ['python']);
  assert.deepEqual(answer.matches.map((m) => m.id), ['new-feature', 'backend-python']);
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'language', scope: 'repo' }]);
  assert.equal(answer.generic_only, true);
});

test('a stack-bearing match whose sibling is missing keeps the keyword result', () => {
  // Unreachable through a valid registry (the loader refuses a dangling
  // sibling); a fixture bypassing the loader proves the router never drops a
  // match on missing evidence — it leaves the keyword answer alone.
  const rows = [row('alpha', { stack: 'node', stack_sibling: 'ghost' })];
  const fixture: Registries = { ...regs, intents: { version: regs.intents.version, intents: rows } };
  const answer = routeByIntent('alpha', fixture, ['python']);
  assert.deepEqual(answer.matches.map((m) => m.id), ['alpha']);
  assert.deepEqual(answer.rebound, []);
});

// --- framework-first rebind (contracts §2, amended 2026-10-07) ----------------

const FASTAPI_BACKEND: PackageStack = { dir: 'backend', language: 'python', framework: 'fastapi', compose_service: null };
const REACT_FRONTEND: PackageStack = { dir: 'frontend', language: 'node', framework: 'react', compose_service: null };
const NEST_API: PackageStack = { dir: 'api', language: 'node', framework: 'nestjs', compose_service: null };
const PLAIN_NODE: PackageStack = { dir: '.', language: 'node', framework: null, compose_service: null };

test('a FastAPI backend beside a React frontend rebinds to the python row by framework', () => {
  const answer = routeEscalate('add an endpoint that lists invoices', regs, { packages: [FASTAPI_BACKEND, REACT_FRONTEND], focus: null });
  assert.deepEqual(answer.intents, ['backend-python']);
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'framework', scope: 'repo' }]);
});

test('the same repository opened in the frontend package still rebinds, by the repository', () => {
  const answer = routeEscalate('add an endpoint that lists invoices', regs, { packages: [FASTAPI_BACKEND, REACT_FRONTEND], focus: REACT_FRONTEND });
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'framework', scope: 'repo' }]);
});

test('the package holding the working directory decides before the repository', () => {
  // A repository with both backends keeps the keyword result from its root...
  const both = [FASTAPI_BACKEND, NEST_API];
  assert.deepEqual(routeEscalate('add an endpoint', regs, { packages: both, focus: null }).intents, ['backend']);
  // ...but opened inside the FastAPI package, that package decides.
  const inside = routeEscalate('add an endpoint', regs, { packages: both, focus: FASTAPI_BACKEND });
  assert.deepEqual(inside.intents, ['backend-python']);
  assert.deepEqual(inside.rebound, [{ from: 'backend', to: 'backend-python', reason: 'framework', scope: 'package' }]);
});

test('a NestJS api beside plain node packages keeps the node row', () => {
  const answer = routeEscalate('add an endpoint', regs, { packages: [PLAIN_NODE, NEST_API], focus: PLAIN_NODE });
  assert.deepEqual(answer.intents, ['backend']);
  assert.deepEqual(answer.rebound, []);
});

test('with no backend framework anywhere, the language decides', () => {
  const plainPython: PackageStack = { dir: '.', language: 'python', framework: null, compose_service: null };
  const answer = routeEscalate('add an endpoint', regs, { packages: [plainPython], focus: null });
  assert.deepEqual(answer.rebound, [{ from: 'backend', to: 'backend-python', reason: 'language', scope: 'repo' }]);
});

test('a React-only repository keeps the node row: a frontend is node by language', () => {
  const answer = routeEscalate('add an endpoint', regs, { packages: [REACT_FRONTEND], focus: null });
  assert.deepEqual(answer.intents, ['backend']);
  assert.deepEqual(answer.rebound, []);
});

test('generic_only is true only when every surviving match hit generic signals alone', () => {
  assert.equal(routeEscalate('add an endpoint', regs).generic_only, true);
  assert.equal(routeEscalate('add a NestJS endpoint', regs).generic_only, false);
  // No match at all is unrouted, not generic.
  assert.equal(routeEscalate('hello there', regs).generic_only, false);
  // The intent form has no suppression: new-feature ("add") and backend
  // ("endpoint") both survive, and both hit generic signals only.
  assert.equal(routeByIntent('add an endpoint', regs).generic_only, true);
  // The escalate form reads survivors only: backend-python suppresses backend,
  // so the specific "FastAPI" hit decides.
  assert.equal(routeEscalate('add a FastAPI endpoint', regs).generic_only, false);
});

// --- helpers -----------------------------------------------------------------

function byOf(section: EscalateRouteSection, id: string): string | null {
  return section.suppressed.find((s) => s.id === id)?.by ?? null;
}

// Fixture intents replace the intents registry: the escalation order, the
// reason vocabulary and the multi-agent threshold stay the shipped ones, so a
// synthetic case still proves something about the policy the kernel actually
// runs on. router.scoring is pinned to the v1-equivalence values of
// contracts.md@rev1 §1.5 (every weight-1 phrase matches, nothing is ambiguous
// among real matches) because the shipped scoring block is a calibration knob:
// these cases are about suppression and aggregation, not about where T13 puts
// the cuts.
const V1_EQUIVALENT_SCORING: ScoringPolicy = {
  min_score: 1,
  threshold: 0,
  margin: 0,
  top_k: 5,
  max_intents: 8,
  bm25_weight: 0.9,
  path_weight: 1,
};

function escalate(prompt: string, rows: IntentRow[]): EscalateRouteSection {
  const fixture: Registries = {
    ...regs,
    intents: { version: regs.intents.version, intents: rows },
    policy: { ...regs.policy, router: { ...regs.policy.router, scoring: V1_EQUIVALENT_SCORING } },
  };
  return routeEscalate(prompt, fixture);
}

// A v1-shaped row as the intents loader answers it: `phrases` derived from
// `signals` at weight 1 (contracts.md@rev2 §1.2), so the scorer matches the
// row on exactly the prompts its signals fire on.
function row(id: string, over: Partial<IntentRow> = {}): IntentRow {
  const signals = over.signals ?? [id];
  return {
    id,
    title: id,
    signals,
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
    phrases: signals.map((text) => ({ text, weight: 1 })),
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
