import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries } from './context';
import { asciiDowncase, compilePromptRegex, scaleSection, type ScaleSection } from './scale';

const regs = lazyRegistries(resolveRoot({}, __dirname));

// --- the scripts/test-kernel.sh "scale" block -------------------------------

test('an action verb beside a scale word is a big task', () => {
  assert.equal(classify('implement all the endpoints across the codebase').big_task, true);
});

test('asking for a spec is spec authoring', () => {
  assert.equal(classify('write a spec for the payment flow').spec_authoring, true);
});

test('a neutral prompt classifies as nothing at all', () => {
  assert.deepEqual(classify('what time is it'), {
    big_task: false,
    spec_authoring: false,
    design_work: false,
  });
});

test('a weak design signal without an action verb is not design work', () => {
  assert.equal(classify('the button design looks good').design_work, false);
});

// --- the rest of the classification -----------------------------------------

test('a strong design signal stands alone, without an action verb', () => {
  assert.equal(classify('should we use kafka or rabbitmq').design_work, true);
  assert.equal(classify('decompose this into tasks').design_work, true);
});

test('a weak design signal counts once an action verb is present', () => {
  assert.equal(classify('redesign the architecture').design_work, true);
});

test('a scale word without an action verb is not a big task', () => {
  assert.equal(classify('why do all the services log differently').big_task, false);
});

test('the section keeps cmd_scale key order', () => {
  assert.deepEqual(Object.keys(classify('implement all the endpoints across the codebase')), [
    'big_task',
    'spec_authoring',
    'design_work',
  ]);
});

test('classification is case-insensitive, as ascii_downcase made it', () => {
  assert.equal(classify('IMPLEMENT ALL THE ENDPOINTS ACROSS THE CODEBASE').big_task, true);
});

// --- the router fixtures ----------------------------------------------------
// policy.json .router.fixtures[] is the registry's own escalation corpus; a new
// fixture is covered here automatically, as it is in scripts/test-kernel.sh.

test('every router fixture prompt classifies without an error', () => {
  for (const fixture of regs.policy.router.fixtures) {
    const section = classify(fixture.prompt);
    for (const value of Object.values(section)) assert.equal(typeof value, 'boolean');
  }
});

test('a fixture escalating on unrouted scale really carries a scale signal', () => {
  const unrouted = regs.policy.router.escalate_when.unrouted_scale_signals;
  const fixtures = regs.policy.router.fixtures.filter((f) => f.reasons.includes('unrouted-scale'));
  assert.ok(fixtures.length > 0, 'no fixture exercises the unrouted-scale reason');
  for (const fixture of fixtures) {
    const section = classify(fixture.prompt);
    const hit = unrouted.some((signal) => signalOf(section, signal));
    assert.ok(hit, `fixture "${fixture.prompt}" escalates on scale but classifies as none`);
  }
});

test('the sweep fixtures classify as big tasks and the local ones do not', () => {
  assert.equal(classify('migrate all services to the new logging format across all packages').big_task, true);
  assert.equal(classify('modernize all services').big_task, true);
  assert.equal(classify('build the ios release and upload to TestFlight').big_task, false);
  assert.equal(classify('why does the login handler fail with a 500').big_task, false);
});

// --- the shared prompt-matching helpers -------------------------------------

test('a signal that will not compile is a KernelError, never a silent non-match', () => {
  assert.throws(
    () => compilePromptRegex('\\b(unclosed', 'registries/policy.json: .parallelism.prompt_signals.action'),
    (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(
        error.message,
        'registries/policy.json: .parallelism.prompt_signals.action is not a valid regex: \\b(unclosed',
      );
      return true;
    },
  );
});

test('ascii_downcase lowercases A-Z and leaves the rest of Unicode alone', () => {
  assert.equal(asciiDowncase('DROP TABLE Users'), 'drop table users');
  // U+212A KELVIN SIGN: String.toLowerCase() would fold it to "k" and match an
  // ASCII-only signal the bash kernel never matched.
  assert.equal(asciiDowncase('K'), 'K');
});

function classify(prompt: string): ScaleSection {
  return scaleSection({ prompt }, regs);
}

// The registry names its scale signals as strings; this is the one place that
// turns such a name back into a field of the section.
function signalOf(section: ScaleSection, name: string): boolean {
  if (name === 'big_task') return section.big_task;
  if (name === 'spec_authoring') return section.spec_authoring;
  if (name === 'design_work') return section.design_work;
  throw new Error(`policy.json names an unrouted scale signal this section has no field for: ${name}`);
}
