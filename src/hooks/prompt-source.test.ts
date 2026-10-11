import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import type { HookEnvelope } from './envelope';
import { classifyPromptSource, judgeMayReceive, type SourceMarkers } from './prompt-source';

const markers: SourceMarkers = loadPolicy(resolveRoot({}, __dirname)).router.source_markers;
const shipped = (): SourceMarkers => markers;

function envelope(prompt: string, raw: Record<string, unknown> = {}): HookEnvelope {
  return {
    cwd: '/project',
    sessionId: 'S1',
    prompt,
    file: '',
    tool: '',
    transcriptPath: '',
    stopHookActive: false,
    raw: { hook_event_name: 'UserPromptSubmit', prompt, ...raw },
  };
}

test('ordinary typed text is the user\'s for both routing and the judge', () => {
  const env = envelope('add a settings page to the dashboard');

  assert.equal(classifyPromptSource(env, markers), 'user');
  assert.equal(judgeMayReceive(env, shipped), true);
});

test('each shipped marker family classifies its frame', () => {
  assert.equal(classifyPromptSource(envelope('<task-notification>\n<task-id>1</task-id>'), markers), 'notification');
  assert.equal(classifyPromptSource(envelope('<agent-message from="worker">audit report</agent-message>'), markers), 'notification');
  assert.equal(classifyPromptSource(envelope('[SYSTEM NOTIFICATION - NOT USER INPUT] done'), markers), 'notification');
  assert.equal(classifyPromptSource(envelope('<tool_result>output</tool_result>'), markers), 'tool-result');
  assert.equal(classifyPromptSource(envelope('[engineos] router line'), markers), 'hook-echo');
});

test('leading whitespace before a frame is ignored, but typed text before it makes the prompt the user\'s', () => {
  assert.equal(classifyPromptSource(envelope('  \n<task-notification>done'), markers), 'notification');
  assert.equal(classifyPromptSource(envelope('look at this: <task-notification>done'), markers), 'user');
});

test('a host-declared source is believed over the text, in either spelling', () => {
  assert.equal(classifyPromptSource(envelope('plain words', { source: 'tool_result' }), markers), 'tool-result');
  assert.equal(classifyPromptSource(envelope('plain words', { prompt_source: 'hook-echo' }), markers), 'hook-echo');
  assert.equal(classifyPromptSource(envelope('<task-notification>x', { source: 'user' }), markers), 'user');
});

test('an unknown host-declared value is ignored and the markers decide', () => {
  assert.equal(classifyPromptSource(envelope('<task-notification>x', { source: 'assistant' }), markers), 'notification');
  assert.equal(classifyPromptSource(envelope('plain words', { source: 42 }), markers), 'user');
});

test('an empty marker is skipped rather than matching every prompt', () => {
  const withEmpty: SourceMarkers = { notification: [''], tool_result: [''], hook_echo: [''] };

  assert.equal(classifyPromptSource(envelope('anything at all'), withEmpty), 'user');
});

test('the judge refuses text that is not the user\'s', () => {
  assert.equal(judgeMayReceive(envelope('<task-notification>done'), shipped), false);
  assert.equal(judgeMayReceive(envelope('plain words', { source: 'notification' }), shipped), false);
});

// The judge's stricter egress test (D3): a frame no marker lists yet is still
// not the user's typing, so it never leaves the machine.
test('the judge refuses an unlisted tag frame that routing still treats as the user\'s', () => {
  const frames = [
    '<div>pasted markup</div>',
    '<system-reminder>\nsome injected context\n</system-reminder>',
    '<command-name>/foo</command-name>',
    '<x/>',
    '<local-command-stdout>',
    '  <user-prompt-submit-hook>text',
  ];
  for (const prompt of frames) {
    const env = envelope(prompt);

    assert.equal(classifyPromptSource(env, markers), 'user', prompt);
    assert.equal(judgeMayReceive(env, shipped), false, prompt);
  }
});

test('a less-than sign that opens no tag frame is still the user\'s for the judge', () => {
  for (const prompt of ['<3 thanks for the help', 'is a < b here?', '<= is the operator', '< div>']) {
    assert.equal(judgeMayReceive(envelope(prompt), shipped), true, prompt);
  }
});

test('a host that declares user text still cannot send a tag frame to the judge', () => {
  const env = envelope('<system-reminder>injected</system-reminder>', { source: 'user' });

  assert.equal(classifyPromptSource(env, markers), 'user');
  assert.equal(judgeMayReceive(env, shipped), false);
});

test('a marker read that throws makes the prompt non-user for the judge', () => {
  const throwing = (): SourceMarkers => {
    throw new Error('registry unreadable');
  };

  assert.equal(judgeMayReceive(envelope('add a settings page'), throwing), false);
});

test('a non-object raw payload falls back to the markers', () => {
  const env: HookEnvelope = { ...envelope('[engineos] echo'), raw: 'not an object' };

  assert.equal(classifyPromptSource(env, markers), 'hook-echo');
});
