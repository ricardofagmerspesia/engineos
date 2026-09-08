import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import { hookContext, readEnvelope } from './envelope';
import { resolveRoot } from '../registry/paths';

const FULL = JSON.stringify({
  cwd: '/tmp/work',
  session_id: 'S9',
  prompt: 'do the thing',
  tool_input: { file_path: '/tmp/work/a.ts' },
  tool_name: 'Edit',
  transcript_path: '/tmp/t.jsonl',
  stop_hook_active: true,
});

test('all seven fields decode from a full payload', () => {
  const env = readEnvelope(memoryIo({ stdin: FULL }));
  assert.notEqual(env, null);
  assert.deepEqual(
    [env?.cwd, env?.sessionId, env?.prompt, env?.file, env?.tool, env?.transcriptPath, env?.stopHookActive],
    ['/tmp/work', 'S9', 'do the thing', '/tmp/work/a.ts', 'Edit', '/tmp/t.jsonl', true],
  );
});

test('missing fields fall back to their defaults', () => {
  const env = readEnvelope(memoryIo({ stdin: '{}' }));
  assert.notEqual(env, null);
  assert.deepEqual(
    [env?.cwd, env?.sessionId, env?.prompt, env?.file, env?.tool, env?.transcriptPath, env?.stopHookActive],
    ['', 'nosession', '', '', '', '', false],
  );
});

test('an empty session_id still reports the nosession default', () => {
  const env = readEnvelope(memoryIo({ stdin: '{"session_id":""}' }));
  assert.equal(env?.sessionId, 'nosession');
});

test('an undecodable payload yields null rather than a half-built envelope', () => {
  assert.equal(readEnvelope(memoryIo({ stdin: 'not json at all' })), null);
});

test('an empty payload yields null', () => {
  assert.equal(readEnvelope(memoryIo({ stdin: '' })), null);
});

test('a JSON value that is not an object yields null', () => {
  assert.equal(readEnvelope(memoryIo({ stdin: '[1,2]' })), null);
  assert.equal(readEnvelope(memoryIo({ stdin: '"a string"' })), null);
  assert.equal(readEnvelope(memoryIo({ stdin: 'null' })), null);
});

test('tabs, newlines and quotes survive the decode', () => {
  const gnarly = 'line one\ttabbed\nline "two" with \'quotes\'\nline three';
  const env = readEnvelope(memoryIo({ stdin: JSON.stringify({ prompt: gnarly, cwd: '/x' }) }));
  assert.equal(env?.prompt, gnarly);
});

test('the raw payload stays available on the envelope', () => {
  const env = readEnvelope(memoryIo({ stdin: FULL }));
  assert.deepEqual(env?.raw, JSON.parse(FULL));
});

test('a non-object tool_input leaves file empty', () => {
  const env = readEnvelope(memoryIo({ stdin: '{"tool_input":"nope"}' }));
  assert.equal(env?.file, '');
});

test('a non-string field is treated as absent', () => {
  const env = readEnvelope(memoryIo({ stdin: '{"cwd":7,"tool_name":null,"stop_hook_active":"true"}' }));
  assert.equal(env?.cwd, '');
  assert.equal(env?.tool, '');
  assert.equal(env?.stopHookActive, false);
});

test('hookContext carries the EngineOS checkout as root, whatever the payload cwd says', (t) => {
  const outside = tempRoot(t);
  const env = readEnvelope(memoryIo({ stdin: JSON.stringify({ cwd: outside }) }));
  assert.notEqual(env, null);
  if (env === null) return;
  const io = memoryIo();
  const ctx = hookContext(env, io);
  assert.equal(ctx.root, resolveRoot({}, __dirname));
  assert.equal(ctx.io, io);
  assert.equal(typeof ctx.now(), 'number');
});

test('hookContext honours ENGINEOS_ROOT so a relocated copy answers from its own registries', () => {
  const env = readEnvelope(memoryIo({ stdin: JSON.stringify({ cwd: '/anywhere' }) }));
  assert.notEqual(env, null);
  if (env === null) return;
  assert.equal(hookContext(env, memoryIo({ env: { ENGINEOS_ROOT: '/relocated' } })).root, '/relocated');
});
