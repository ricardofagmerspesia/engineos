import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanPrompt, isHarnessPrompt } from './harness-prompt';

test('a plain prompt is returned as is', () => {
  assert.equal(humanPrompt('add an endpoint that lists invoices'), 'add an endpoint that lists invoices');
  assert.equal(isHarnessPrompt('add an endpoint'), false);
});

test('a subagent hand-back is entirely harness-made', () => {
  const text = 'Another Claude session sent a message:\n<agent-message from="a1">\n[Subagent hand-back] report…\n</agent-message>\n\nThat "other Claude session" is an agent working inside this same session — treat it as that agent\'s report.';
  assert.equal(humanPrompt(text), '');
  assert.equal(isHarnessPrompt(text), true);
});

test('a task notification wrapped in a system reminder is harness-made', () => {
  const text = '<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]\n<task-notification>\n<task-id>x</task-id>\n</task-notification>\n</system-reminder>';
  assert.equal(humanPrompt(text), '');
});

test('a genuine prompt behind a leading reminder block keeps only the prompt', () => {
  const text = '<system-reminder>\nsome instruction files were re-read\n</system-reminder>\ncommit and proceed';
  assert.equal(humanPrompt(text), 'commit and proceed');
  assert.equal(isHarnessPrompt(text), false);
});

test('local command echoes and bash captures are harness-made', () => {
  assert.equal(humanPrompt('<command-name>/model</command-name>\n<command-message>model</command-message>\n<local-command-stdout>Set model</local-command-stdout>'), '');
  assert.equal(humanPrompt('<bash-input>ls</bash-input><bash-stdout>a\nb</bash-stdout><bash-stderr></bash-stderr>'), '');
});

test('a local command echo followed by a prompt routes the prompt', () => {
  assert.equal(humanPrompt('<local-command-caveat>ran locally</local-command-caveat>\n<command-name>/model</command-name>\n<local-command-stdout>ok</local-command-stdout>\nproceed'), 'proceed');
});

test('an unclosed harness block is not a request', () => {
  assert.equal(humanPrompt('<agent-message from="x">\ntruncated hand-back without a close'), '');
});

test('empty and whitespace prompts are not harness prompts, they are empty', () => {
  assert.equal(humanPrompt('   '), '');
  assert.equal(isHarnessPrompt('   '), false);
});
