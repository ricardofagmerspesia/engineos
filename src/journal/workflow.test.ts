import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendWorkflowEvent, loadWorkflowEvents, parseWorkflowEvents, parseWorkflowText, WORKFLOW_INPUT_LIMIT_BYTES } from './workflow';
import { tempRoot } from '../testing/harness';
import type { WorkflowEvent } from '../workflow/contracts';

function event(kind: WorkflowEvent['kind'], sequence: number): WorkflowEvent {
  return {version: 1, runId: 'run', kind, sequence, timestampMs: sequence};
}
test('JSON and JSONL inputs preserve strict event ordering', () => {
  const events = [event('run-started', 0), event('run-completed', 1)];
  assert.deepEqual(parseWorkflowText(JSON.stringify(events)), events);
  assert.deepEqual(parseWorkflowText(events.map(item => JSON.stringify(item)).join('\n')), events);
  assert.throws(() => parseWorkflowEvents([events[0], {...events[1], sequence: 0}]), /ordering/);
});
test('bounded input rejects oversized payload and unknown fields', () => {
  assert.throws(() => parseWorkflowText(' '.repeat(WORKFLOW_INPUT_LIMIT_BYTES + 1)), /size/);
  assert.throws(() => parseWorkflowEvents([{...event('run-started', 0), prompt: 'secret'}]), /event/);
  assert.throws(() => parseWorkflowEvents([event('run-started', 0), {...event('model-usage', 1), costMicros: -1}]), /costMicros/);
});
test('append persists a valid ordered local journal and rejects cursor replay', (t) => {
  const path = join(tempRoot(t), 'workflow.jsonl');
  appendWorkflowEvent(path, event('run-started', 0));
  appendWorkflowEvent(path, event('run-completed', 1));
  assert.equal(loadWorkflowEvents(path).length, 2);
  assert.throws(() => appendWorkflowEvent(path, event('run-completed', 1)), /ordering/);
});
test('append refuses symlink destinations without modifying the target', (t) => {
  const root = tempRoot(t);
  const target = join(root, 'target.jsonl');
  writeFileSync(target, JSON.stringify(event('run-started', 0)) + '\n');
  const link = join(root, 'journal.jsonl');
  symlinkSync(target, link);
  assert.throws(() => appendWorkflowEvent(link, event('run-completed', 1)), /append/);
  assert.equal(readFileSync(target, 'utf8'), JSON.stringify(event('run-started', 0)) + '\n');
});
