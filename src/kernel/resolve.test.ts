import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type KernelContext, type RiskTier } from './context';
import { resolve } from './resolve';
import type { ClassifiedRiskSection, TierRiskSection } from './risk';
import type { IntentRouteSection, PathRouteSection } from './route';

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
  assert.deepEqual(Object.keys(a), ['domain', 'rules', 'skills', 'agent', 'risk_floor', 'hook_guidance', 'excluded']);
  assert.equal(a.domain, 'security');
});

test('a match derives risk_floor from intents.json and hook_guidance from the renderer', () => {
  const a = routePath('/tmp/app/ios/fastlane/Fastfile');
  assert.deepEqual(a, {
    domain: 'ios-release',
    rules: ['security'],
    skills: [],
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
  assert.deepEqual(routeIntent('réadd endpoint').matches, []);
});

test('an intent match carries the ten projected fields in jq key order', () => {
  const [first] = routeIntent('run a retro').matches;
  if (first === undefined) throw new Error('no intent matched a known signal');
  assert.deepEqual(Object.keys(first), [
    'id', 'title', 'rules', 'skills', 'agents', 'commands', 'mcp', 'model_tier', 'risk_floor', 'note',
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
