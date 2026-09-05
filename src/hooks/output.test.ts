import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { block, context, fail, message, render, silent } from './output';

test('a context decision renders the harness additionalContext envelope', () => {
  const io = memoryIo();
  const code = render(context('UserPromptSubmit', 'hello — world'), io);
  assert.equal(code, 0);
  assert.deepEqual(io.stdout, ['{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"hello — world"}}\n']);
  assert.deepEqual(io.stderr, []);
});

test('a block decision renders the Stop-gate block envelope', () => {
  const io = memoryIo();
  const code = render(block('EngineOS gate: verification failed'), io);
  assert.equal(code, 0);
  assert.deepEqual(io.stdout, ['{"decision":"block","reason":"EngineOS gate: verification failed"}\n']);
});

test('a message decision renders systemMessage', () => {
  const io = memoryIo();
  const code = render(message('[engineos] stop-verify skipped'), io);
  assert.equal(code, 0);
  assert.deepEqual(io.stdout, ['{"systemMessage":"[engineos] stop-verify skipped"}\n']);
});

test('a fail decision writes stderr and exits 2', () => {
  const io = memoryIo();
  const code = render(fail('engineos: not a git repository'), io);
  assert.equal(code, 2);
  assert.deepEqual(io.stdout, []);
  assert.deepEqual(io.stderr, ['engineos: not a git repository\n']);
});

test('a silent decision writes nothing and exits 0', () => {
  const io = memoryIo();
  assert.equal(render(silent, io), 0);
  assert.deepEqual(io.stdout, []);
  assert.deepEqual(io.stderr, []);
});

test('tabs, newlines and quotes survive rendering as JSON escapes', () => {
  const io = memoryIo();
  render(context('Stop', 'line one\ttabbed\nline "two"'), io);
  assert.equal(io.stdout.join(''), '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"line one\\ttabbed\\nline \\"two\\""}}\n');
});
