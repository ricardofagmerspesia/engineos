import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowGate, parseWorkflowGateFacts, requireHostValidation, validationScopeRevision, type WorkflowGateFacts } from './gates';

function finalFacts(): WorkflowGateFacts {
  return {taskId: 'task', scopeRevision: 'scope', sourceRevision: 'source', phase: 'final', integrated: true,
    preview: {choice: 'declined', scopeRevision: 'scope'},
    completion: {scopeRevision: 'scope', sourceRevision: 'source', requiredTicketIds: ['implementation'], tickets: [{id: 'implementation', state: 'integrated'}], unfinishedCorrections: false},
    validation: {requestedAtPhase: 'final', decision: 'approved', scopeRevision: 'scope', sourceRevision: 'source', checks: ['typecheck']}};
}
test('absent, malformed or unknown facts never admit production or checks', () => {
  for (const value of [undefined, {}, {userApproved: true}, {taskId: 'a'.repeat(257)}, {integrated: 'true'}]) {
    const result = evaluateWorkflowGate(value);
    assert.equal(result.productionAllowed, false);
    assert.equal(result.validationAllowed, false);
    assert.ok(result.reasons.length > 0);
  }
});
test('preview decline permits production but final validation requires separate consent', () => {
  const facts = finalFacts();
  assert.equal(evaluateWorkflowGate(facts).validationAllowed, true);
  for (const decision of ['pending', 'declined'] as const) {
    const result = evaluateWorkflowGate({...facts, validation: {...facts.validation, decision}});
    assert.equal(result.productionAllowed, true);
    assert.equal(result.validationAllowed, false);
  }
});
test('selected preview admits only exact approved artifact and current scope', () => {
  const facts = finalFacts();
  const preview = {choice: 'selected' as const, scopeRevision: 'scope', artifactRevision: 'v2', approvedArtifactRevision: 'v2'};
  assert.equal(evaluateWorkflowGate({...facts, preview}).productionAllowed, true);
  for (const patch of [{approvedArtifactRevision: 'v1'}, {approvedArtifactRevision: undefined}, {scopeRevision: 'old'}, {choice: 'pending' as const}]) {
    assert.equal(evaluateWorkflowGate({...facts, preview: {...preview, ...patch}}).productionAllowed, false);
  }
});
test('checks deny nonfinal, unintegrated, stale source/scope and absent exact commands', () => {
  const facts = finalFacts();
  for (const patch of [{phase: 'implementation' as const}, {phase: 'planning' as const}, {integrated: false},
    {validation: {...facts.validation, sourceRevision: 'old'}}, {validation: {...facts.validation, scopeRevision: 'old'}},
    {validation: {...facts.validation, checks: []}}, {validation: undefined}]) {
    assert.equal(evaluateWorkflowGate({...facts, ...patch}).validationAllowed, false);
  }
});
test('fact parser rejects duplicate checks, unknown nested fields and invalid tokens', () => {
  for (const facts of [{validation: {checks: ['test', 'test']}}, {preview: {choice: 'yes'}}, {preview: {approved: true}},
    {taskId: 'not an id'}, {validation: {checks: Array.from({length: 65}, (_, i) => `check${i}`)}}]) {
    assert.throws(() => parseWorkflowGateFacts(facts));
  }
});
test('host validation binds task, exact files, source and complete command consent', () => {
  const files = ['src/b.ts', 'src/a.ts'];
  const scopeRevision = validationScopeRevision(files);
  const facts = {...finalFacts(), scopeRevision, preview: {choice: 'declined' as const, scopeRevision},
    completion: {...finalFacts().completion!, scopeRevision},
    validation: {requestedAtPhase: 'final' as const, decision: 'approved' as const, scopeRevision, sourceRevision: 'source', checks: ['lint', 'typecheck']}};
  const approved = {facts, files, taskId: 'task', scopeRevision, sourceRevision: 'source', checks: ['typecheck', 'lint']};
  assert.equal(requireHostValidation(approved).taskId, 'task');
  for (const patch of [{files: ['src/a.ts']}, {taskId: 'other'}, {sourceRevision: 'old'}, {checks: ['typecheck']}, {scopeRevision: 'old'}]) {
    assert.throws(() => requireHostValidation({...approved, ...patch}));
  }
  assert.throws(() => requireHostValidation(undefined));
});
test('exact-file fingerprints are order stable and reject noncanonical or duplicate paths', () => {
  assert.equal(validationScopeRevision(['src/a.ts', 'src/b.ts']), validationScopeRevision(['src/b.ts', 'src/a.ts']));
  for (const files of [[], ['../a.ts'], ['/a.ts'], ['src//a.ts'], ['src/./a.ts'], ['a.ts', 'a.ts'], ['src/a b.ts']]) {
    assert.throws(() => validationScopeRevision(files));
  }
});

test('final admission requires the entire integrated ticket set and an actual final prompt', () => {
  const facts = finalFacts();
  const completion = facts.completion!;
  for (const patch of [
    {completion: undefined},
    {completion: {...completion, sourceRevision: 'old'}},
    {completion: {...completion, scopeRevision: 'old'}},
    {completion: {...completion, unfinishedCorrections: true}},
    {completion: {...completion, requiredTicketIds: ['implementation', 'missing']}},
    {completion: {...completion, tickets: [{id: 'other', state: 'integrated' as const}]}},
    {validation: {...facts.validation, requestedAtPhase: undefined}},
  ]) assert.equal(evaluateWorkflowGate({...facts, ...patch}).validationAllowed, false);
  for (const state of ['planned', 'ready', 'running', 'returned', 'blocked', 'failed', 'cancelled'] as const) {
    assert.equal(evaluateWorkflowGate({...facts, completion: {...completion, tickets: [{id: 'implementation', state}]}}).validationAllowed, false);
  }
});
test('simple direct admission needs a current explicit choice, even when preview is declined', () => {
  const facts = finalFacts();
  const execution = {complexity: 'small' as const, riskTier: 'low' as const, reversible: true, files: ['notes.md'], domains: ['docs'], unitCount: 1, newFeature: true, securitySensitive: false, requiredAgents: [], designRequired: false, scopeRevision: 'scope', specChoiceScopeRevision: 'scope', specChoice: 'direct' as const};
  assert.equal(evaluateWorkflowGate({...facts, execution, preview: undefined}).validationAllowed, true);
  for (const patch of [{specChoice: 'pending' as const}, {specChoice: undefined}, {specChoiceScopeRevision: 'old'}, {scopeRevision: 'old'}]) {
    assert.equal(evaluateWorkflowGate({...facts, execution: {...execution, ...patch}}).productionAllowed, false);
  }
  assert.equal(evaluateWorkflowGate({...facts, execution: {...execution, specChoice: 'spec'}, preview: undefined}).productionAllowed, false);
});

test('final validation waits for sealed planning even when the admitted frontier is integrated', () => {
  const facts = finalFacts();
  const open = {...facts, completion: {...facts.completion!, planningOpen: true}};
  assert.equal(evaluateWorkflowGate(open).productionAllowed, true);
  assert.equal(evaluateWorkflowGate(open).validationAllowed, false);
  assert.equal(evaluateWorkflowGate({...facts, completion: {...facts.completion!, planningOpen: false}}).validationAllowed, true);
  assert.equal(evaluateWorkflowGate(facts).validationAllowed, true);
});

test('completion planning flag rejects nonboolean attestations rather than granting final admission', () => {
  const facts = finalFacts();
  for (const planningOpen of ['false', 0, null, {}]) {
    const malformed = {...facts, completion: {...facts.completion!, planningOpen}};
    assert.throws(() => parseWorkflowGateFacts(malformed), /planningOpen/);
    assert.equal(evaluateWorkflowGate(malformed).validationAllowed, false);
  }
});
