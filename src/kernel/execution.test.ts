import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionSection, parseExecutionFacts, type ExecutionFacts } from './execution';
import { lazyRegistries } from './context';
import { resolveRoot } from '../registry/paths';
import { resolve } from './resolve';
import { runKernel } from './cli';
import { runInProcess } from '../testing/harness';

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);
function facts(patch: Partial<ExecutionFacts> = {}): ExecutionFacts {
  return {complexity: 'small', riskTier: 'low', reversible: true, files: ['notes.md'], domains: ['docs'], unitCount: 1, newFeature: false, securitySensitive: false, requiredAgents: [], designRequired: false, scopeRevision: 'scope', specChoiceScopeRevision: 'scope', specChoice: 'direct', ...patch};
}

test('known atomic low risk work takes direct lane with policy budget', () => {
  const result = executionSection(facts(), regs);
  assert.equal(result.mode, 'direct');
  assert.deepEqual(result.taskBudget, {min: 1, max: 3});
});
test('missing scope remains unresolved instead of assuming direct eligibility', () => {
  assert.equal(executionSection({}, regs).mode, 'unresolved');
});
for (const [name, patch] of [
  ['security-sensitive', {securitySensitive: true}], ['high-risk', {riskTier: 'high'}],
  ['design-required', {designRequired: true}],
  ['independent reviewer', {requiredAgents: ['critic']}], ['irreversible', {reversible: false}],
] satisfies [string, Partial<ExecutionFacts>][]) {
  test(`${name} atomic work cannot take direct lane`, () => assert.equal(executionSection(facts(patch), regs).mode, 'delegate'));
}
test('independent units use parallel lane even below recommended minimum', () => {
  assert.equal(executionSection(facts({complexity: 'medium', unitCount: 2}), regs).mode, 'parallel');
});
test('task budget overflow requires a substantive rationale', () => {
  assert.equal(executionSection(facts({unitCount: 4, budgetRationale: '  '}), regs).mode, 'unresolved');
  assert.equal(executionSection(facts({unitCount: 4, budgetRationale: 'four independent deliveries'}), regs).mode, 'parallel');
});
test('rejects malformed scope, counts and unknown execution fields', () => {
  for (const invalid of [
  {files: ['../outside.ts']}, {files: ['/tmp/source.ts']}, {files: ['src/*.ts']},
  {files: ['src/a.ts', 'src/a.ts']}, {domains: []}, {unitCount: 1.5}, {unitCount: 0}, {complexity: 'tiny'}, {extra: true},
]) assert.throws(() => parseExecutionFacts(invalid));
});
test('classified high risk cannot be overridden by execution low risk', () => {
  assert.throws(() => resolve({riskTier: 'high', execution: facts()}, {root, registries: regs}), /conflicts/);
});
test('security path routing defeats a false sensitivity declaration', () => {
  assert.notEqual(resolve({execution: facts({files: ['src/auth/session.ts']})}, {root, registries: regs}).execution?.mode, 'direct');
});
test('legacy resolve output omits execution when facts are not supplied', () => {
  assert.equal(Object.hasOwn(resolve({riskTier: 'low'}, {root, registries: regs}), 'execution'), false);
});
test('kernel CLI accepts execution facts and rejects unknown fields', () => {
  const good = runInProcess(runKernel, ['execution', '--facts', JSON.stringify(facts())], {env: {ENGINEOS_ROOT: root}});
  assert.equal(good.status, 0);
  assert.equal(JSON.parse(good.stdout).mode, 'direct');
  assert.equal(runInProcess(runKernel, ['resolve', '--facts', '{"execution":{"unknown":true}}'], {env: {ENGINEOS_ROOT: root}}).status, 1);
});

test('task contract design decision prevents direct execution despite low risk declaration', () => {
  const answer = resolve({prompt: 'design a multi-agent supervisor topology', taskContract: true, execution: facts()}, {root, registries: regs});
  assert.notEqual(answer.execution?.mode, 'direct');
  assert.deepEqual(answer.task_contract?.execution, answer.execution);
});

test('simple tasks await a current clickable choice before spec creation or direct implementation', () => {
  const missing = facts(); delete missing.specChoice;
  for (const candidate of [missing, facts({specChoice: 'pending'}), facts({specChoiceScopeRevision: 'old'})]) {
    const section = executionSection(candidate, regs);
    assert.equal(section.mode, 'unresolved');
    assert.ok(section.reasons.includes('spec-choice-required'));
    assert.deepEqual(section.planning?.choices, ['Implement directly', 'Create a lightweight spec']);
  }
  const spec = executionSection(facts({specChoice: 'spec'}), regs);
  assert.equal(spec.mode, 'delegate'); assert.equal(spec.planning?.previewRequired, true);
  assert.equal(executionSection(facts({newFeature: true}), regs).mode, 'direct');
});
test('direct/spec choice cannot override file count, multiple domains or mandatory design', () => {
  for (const patch of [{files: ['a.md', 'b.md', 'c.md']}, {domains: ['docs', 'backend']}, {designRequired: true}]) {
    assert.notEqual(executionSection(facts(patch), regs).mode, 'direct');
  }
});
test('resolved simple contracts omit automatic spec skills while selected spec restores them', () => {
  const request = {prompt: 'add a short note', taskContract: true, execution: facts({newFeature: true})};
  const direct = resolve(request, {root, registries: regs});
  assert.equal(direct.execution?.mode, 'direct');
  assert.ok(!direct.task_contract?.skills.includes('engineos-spec'));
  assert.ok(!direct.task_contract?.required.includes('design-doc'));
  const spec = resolve({...request, execution: facts({newFeature: true, specChoice: 'spec'})}, {root, registries: regs});
  assert.ok(spec.task_contract?.skills.includes('engineos-spec'));
  assert.ok(spec.task_contract?.required.includes('design-doc'));
});
