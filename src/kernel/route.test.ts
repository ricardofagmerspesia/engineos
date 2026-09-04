import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord } from '../lib/json';
import type { IntentRow } from '../registry/intents';
import { loadRegistry } from '../registry/load';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type Registries } from './context';
import { floorOf, renderGuidance, routeEscalate, type EscalateRouteSection } from './route';

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

// --- helpers -----------------------------------------------------------------

function byOf(section: EscalateRouteSection, id: string): string | null {
  return section.suppressed.find((s) => s.id === id)?.by ?? null;
}

// Fixture intents replace ONLY the intents registry: the escalation order, the
// reason vocabulary and the threshold stay the shipped ones, so a synthetic case
// still proves something about the policy the kernel actually runs on.
function escalate(prompt: string, rows: IntentRow[]): EscalateRouteSection {
  const fixture: Registries = { ...regs, intents: { intents: rows } };
  return routeEscalate(prompt, fixture);
}

function row(id: string, over: Partial<IntentRow> = {}): IntentRow {
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
    ...over,
  };
}
