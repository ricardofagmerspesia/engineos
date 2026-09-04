import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries } from './context';
import { riskSection, type RiskFacts } from './risk';

const regs = lazyRegistries(resolveRoot({}, __dirname));

// --- classification (the --signals form of cmd_risk) -----------------------

test('max aggregation takes the highest input tier, never an average', () => {
  const section = classified({ inputs: { reversibility: 'low', 'blast-radius': 'medium' } });
  assert.equal(section.risk, 'medium');
  assert.equal(section.autonomy_ceiling, 'A3');
  assert.deepEqual(section.floors_applied, []);
});

test('low beside high is high, not the middle of the two', () => {
  assert.equal(classified({ inputs: { reversibility: 'low', spend: 'high' } }).risk, 'high');
});

test('a recognized floor forces high over all-low inputs', () => {
  const section = classified({
    inputs: {
      reversibility: 'low',
      'blast-radius': 'low',
      'data-sensitivity': 'low',
      'contract-surface': 'low',
      spend: 'low',
    },
    floors: ['payments'],
  });
  assert.equal(section.risk, 'high');
  assert.deepEqual(section.floors_applied, ['payments']);
});

test('a floor with no inputs is still answerable', () => {
  const section = classified({ floors: ['destructive-ddl-dml'] });
  assert.equal(section.risk, 'high');
  assert.equal(section.gates['validation'], 'required-plus-critic');
});

test('the classified section carries the gates of its tier', () => {
  assert.deepEqual(classified({ inputs: { reversibility: 'low' } }).gates, {
    discovery: 'skip',
    design: 'skip',
    implementation: 'required',
    validation: 'required',
    release: 'n/a-unless-ships',
  });
});

test('an empty payload is an error, not low risk', () => {
  const message =
    'risk --signals needs a non-empty inputs{} or floors[] — an empty payload is not low risk, it is no evidence';
  assert.throws(() => riskSection({ signals: {} }, regs), kernelError(message));
  assert.throws(() => riskSection({ signals: { inputs: {} } }, regs), kernelError(message));
  assert.throws(() => riskSection({ signals: { inputs: {}, floors: [] } }, regs), kernelError(message));
});

test('an unknown input id is refused rather than ignored', () => {
  assert.throws(
    () => riskSection({ signals: { inputs: { 'bogus-input': 'low' } } }, regs),
    kernelError('unknown risk input(s): bogus-input'),
  );
});

test('an unknown floor is refused rather than ignored', () => {
  assert.throws(
    () => riskSection({ signals: { inputs: { reversibility: 'low' }, floors: ['bogus-floor'] } }, regs),
    kernelError('unknown floor(s): bogus-floor'),
  );
});

test('a tier value outside low|medium|high is refused', () => {
  assert.throws(
    () => riskSection({ signals: { inputs: { reversibility: 'banana' } } }, regs),
    kernelError('invalid tier value on input(s): reversibility'),
  );
});

test('a payload that is not an object is refused', () => {
  assert.throws(
    () => riskSection({ signals: [] }, regs),
    kernelError('risk --signals must be a JSON object with inputs{} and/or floors[]'),
  );
});

// The aggregation function is registry data. A policy naming one the kernel
// cannot perform must fail loudly — silently falling back to max would make the
// registry field decorative, and a silent mean would downgrade mixed signals.
test('an aggregation with no implementation is refused, never defaulted to max', () => {
  const dir = policyRootWith('mean');
  try {
    assert.throws(
      () => riskSection({ signals: { inputs: { reversibility: 'high' } } }, lazyRegistries(dir)),
      kernelError('unsupported risk aggregation: mean (registries/policy.json .risk.aggregation)'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- already-classified tier (the --risk form, projected as `gates`) --------

test('a classified tier answers with its gates and the spec threshold', () => {
  const section = riskSection({ riskTier: 'high' }, regs);
  assert.deepEqual(Object.keys(section), ['risk', 'gates', 'spec_threshold']);
  if (!('spec_threshold' in section)) throw new Error('expected the tier form of the section');
  assert.equal(section.risk, 'high');
  assert.equal(section.gates['validation'], 'required-plus-critic');
  assert.equal(section.gates['release'], 'required-plus-human-approval');
  assert.deepEqual(section.spec_threshold, { files_greater_than: 2, or_any_new_feature: true });
});

test('the tier form and the classified form agree on the gates of a tier', () => {
  const byTier = riskSection({ riskTier: 'medium' }, regs);
  assert.deepEqual(byTier.gates, classified({ inputs: { 'blast-radius': 'medium' } }).gates);
});

test('a tier outside low|medium|high is refused', () => {
  // The guard exists for a tier that arrives from parsed JSON, where the static
  // type says nothing about the value; JSON.parse is how one really reaches it.
  const rogue: RiskFacts = JSON.parse('{"riskTier":"banana"}');
  assert.throws(() => riskSection(rogue, regs), kernelError('gates requires --risk low|medium|high'));
});

test('declaring neither fact is an error, not an answer', () => {
  assert.throws(
    () => riskSection({}, regs),
    kernelError('risk section requires signals or a classified risk tier'),
  );
});

function classified(signals: unknown): { risk: string; autonomy_ceiling: string; gates: Record<string, string>; floors_applied: string[] } {
  const section = riskSection({ signals }, regs);
  if (!('floors_applied' in section)) throw new Error('expected the classified form of the section');
  assert.deepEqual(Object.keys(section), ['risk', 'autonomy_ceiling', 'gates', 'floors_applied']);
  return section;
}

function policyRootWith(aggregation: string): string {
  const source = regs.policy;
  const dir = mkdtempSync(join(tmpdir(), 'engineos-risk-'));
  mkdirSync(join(dir, 'registries'));
  const policy = {
    version: source.version,
    risk: { aggregation, inputs: source.risk.inputs, high_floors: source.risk.high_floors },
    repair: source.repair,
    autonomy: source.autonomy,
    retry: source.retry,
    gates: source.gates,
    parallelism: source.parallelism,
    breaker: source.breaker,
    hitl: source.hitl,
  };
  writeFileSync(join(dir, 'registries', 'policy.json'), JSON.stringify(policy), 'utf8');
  return dir;
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
