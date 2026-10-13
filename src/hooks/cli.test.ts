import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../dispatch';
import { memoryIo } from '../io';
import { runHookFrom, type HookRun } from './cli';
import { context, silent } from './output';

const PAYLOAD = JSON.stringify({ session_id: 's', cwd: '', prompt: 'p' });

const syncHook: HookRun = () => context('UserPromptSubmit', 'sync says hi');

const asyncHook: HookRun = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  return context('UserPromptSubmit', 'async says hi');
};

const EXPECTED_SYNC = `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'sync says hi' } })}\n`;

test('a synchronous hook renders synchronously, byte for byte as before', () => {
  const io = memoryIo({ stdin: PAYLOAD });
  const code = runHookFrom({ probe: syncHook }, ['probe'], io);
  // A number, not a promise: the entry point exits on the spot, as it always did.
  assert.equal(code, 0);
  assert.equal(io.stdout.join(''), EXPECTED_SYNC);
});

test('an asynchronous hook is awaited before anything is rendered', async () => {
  const io = memoryIo({ stdin: PAYLOAD });
  const code = runHookFrom({ probe: asyncHook }, ['probe'], io);
  assert.ok(code instanceof Promise);
  assert.equal(io.stdout.join(''), '', 'nothing may be written before the hook settles');
  assert.equal(await code, 0);
  assert.equal(io.stdout.join(''), `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'async says hi' } })}\n`);
});

test('a rejected asynchronous hook stays out of the way like a throwing one', async () => {
  const rejecting: HookRun = () => Promise.reject(new Error('boom'));
  const io = memoryIo({ stdin: PAYLOAD });
  assert.equal(await runHookFrom({ probe: rejecting }, ['probe'], io), 0);
  assert.equal(io.stdout.join(''), '');
  assert.equal(io.stderr.join(''), '[engineos] probe failed: boom\n');
});

test('a throwing synchronous hook still answers silently and synchronously', () => {
  const throwing: HookRun = () => {
    throw new Error('sync boom');
  };
  const io = memoryIo({ stdin: PAYLOAD });
  assert.equal(runHookFrom({ probe: throwing }, ['probe'], io), 0);
  assert.equal(io.stderr.join(''), '[engineos] probe failed: sync boom\n');
});

test('an unknown hook and an unreadable payload keep their exit codes', () => {
  const unknown = memoryIo({ stdin: PAYLOAD });
  assert.equal(runHookFrom({}, ['nope'], unknown), 2);
  const garbled = memoryIo({ stdin: 'not json' });
  assert.equal(runHookFrom({ probe: () => silent }, ['probe'], garbled), 0);
  assert.equal(garbled.stdout.join(''), '');
});

test('dispatch hands an async command\'s promise back for the entry point to await', async () => {
  const io = memoryIo();
  const code = dispatch({ later: async (_argv, out) => { out.out('done\n'); return 3; } }, ['later'], io);
  assert.ok(code instanceof Promise);
  assert.equal(await code, 3);
  assert.equal(io.stdout.join(''), 'done\n');
});
