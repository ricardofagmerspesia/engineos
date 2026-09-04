import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { loadModels, type ModelsRegistry } from '../registry/models';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type Registries } from './context';
import { modelSection } from './model';

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);

// The three assertions scripts/test-kernel.sh made of `run model --work adr`.
test('adr answers the most-capable tier and escalates nowhere', () => {
  const section = modelSection({ workType: 'adr' }, regs);
  assert.equal(section.work, 'adr');
  assert.equal(section.tier, 'most-capable');
  assert.equal(section.model, 'fable');
  assert.equal(section.escalates_to, null);
});

test('build answers the build tier and escalates to design', () => {
  const section = modelSection({ workType: 'build' }, regs);
  assert.equal(section.tier, 'build');
  assert.equal(section.model, 'opus');
  assert.equal(section.escalates_to?.tier, 'design');
  // Both tiers bind to the same model today; the escalation target's model is
  // read from its own row, so a rebinding of either shows up here.
  assert.equal(section.escalates_to?.model, 'opus');
});

test('an unknown work type is refused with the bash message', () => {
  assert.equal(
    refusal(() => modelSection({ workType: 'nonsense' }, regs)),
    'unknown work type: nonsense (see registries/models.json work_types)',
  );
});

test('the section keeps cmd_model key order', () => {
  assert.deepEqual(Object.keys(modelSection({ workType: 'build' }, regs)), [
    'work',
    'tier',
    'model',
    'escalates_to',
  ]);
});

// The tier, the model name and the escalation target are registry facts. This
// asserts the section restates none of them: every shipped work type answers
// exactly what its rows say.
test('every shipped work type answers its own registry rows', () => {
  const models = loadModels(root);
  for (const work of models.work_types) {
    const tier = models.tiers.find((t) => t.id === work.tier);
    if (tier === undefined) throw new Error(`work type ${work.id} names an undefined tier`);
    const next = models.tiers.find((t) => t.id === tier.escalates_to);
    const section = modelSection({ workType: work.id }, regs);
    assert.deepEqual(
      section,
      {
        work: work.id,
        tier: tier.id,
        model: tier.model,
        escalates_to: next === undefined ? null : { tier: next.id, model: next.model },
      },
      `work type ${work.id}`,
    );
  }
});

test('a work type naming an undefined tier is refused, not answered empty', () => {
  const broken: ModelsRegistry = {
    version: '1.0.0',
    tiers: [{ id: 'build', model: 'opus', escalates_to: null }],
    escalation_order: ['build'],
    work_types: [{ id: 'ghost', title: 'Ghost work', tier: 'nowhere' }],
  };
  assert.equal(
    refusal(() => modelSection({ workType: 'ghost' }, withModels(broken))),
    'registries/models.json: work type ghost names an undefined tier: nowhere',
  );
});

test('a tier escalating to an undefined tier is refused', () => {
  const broken: ModelsRegistry = {
    version: '1.0.0',
    tiers: [{ id: 'build', model: 'opus', escalates_to: 'nowhere' }],
    escalation_order: ['build'],
    work_types: [{ id: 'build', title: 'Writing code', tier: 'build' }],
  };
  assert.equal(
    refusal(() => modelSection({ workType: 'build' }, withModels(broken))),
    'registries/models.json: tier build names an undefined tier: nowhere',
  );
});

// Substitutes one registry without loading the other six: the getters stay lazy,
// so a fixture for the model section never reaches for policy.json.
function withModels(models: ModelsRegistry): Registries {
  return {
    get routing() { return regs.routing; },
    get intents() { return regs.intents; },
    models,
    get policy() { return regs.policy; },
    get decisionRules() { return regs.decisionRules; },
    get capabilities() { return regs.capabilities; },
    get agents() { return regs.agents; },
  };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    if (e instanceof KernelError) return e.message;
    throw e;
  }
  throw new Error('expected a KernelError, the section answered');
}
