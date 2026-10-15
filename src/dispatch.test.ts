import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, exitWith, type CommandTable } from './dispatch';
import { memoryIo } from './io';

test('dispatch routes to the named command and returns its exit code', () => {
  const io = memoryIo();
  const code = dispatch({ ping: (argv, io) => { io.out(`pong ${argv.join(' ')}\n`); return 0; } }, ['ping', 'a'], io);
  assert.equal(code, 0);
  assert.equal(io.stdout.join(''), 'pong a\n');
});

test('dispatch answers --version from package metadata', () => {
  const io = memoryIo();
  assert.equal(dispatch({}, ['--version'], io), 0);
  assert.match(io.stdout.join(''), /^engineos \d+\.\d+\.\d+\n$/);
});

test('dispatch reports an unknown command as a JSON error with exit 1', () => {
  const io = memoryIo();
  assert.equal(dispatch({}, ['nope'], io), 1);
  assert.equal(io.stdout.join(''), '{\n  "error": "unknown command: nope"\n}\n');
});

test('a table with an asynchronous command answers with a promise of its exit code', async () => {
  const io = memoryIo();
  const table: CommandTable = { later: () => Promise.resolve(3) };
  const result = dispatch(table, ['later'], io);
  assert.ok(result instanceof Promise);
  assert.equal(await result, 3);
});

test('a mixed table still answers a synchronous command synchronously', () => {
  const io = memoryIo();
  const table: CommandTable = { now: () => 4, later: () => Promise.resolve(5) };
  assert.equal(dispatch(table, ['now'], io), 4);
});

test('dispatch passes the remaining argv to an asynchronous command', async () => {
  const io = memoryIo();
  const seen: string[][] = [];
  const table: CommandTable = {
    later: (argv) => {
      seen.push(argv);
      return Promise.resolve(0);
    },
  };
  await dispatch(table, ['later', 'a', 'b'], io);
  assert.deepEqual(seen, [['a', 'b']]);
});

test('exitWith exits in the same tick with a synchronous exit code', () => {
  const codes: number[] = [];
  exitWith(7, (code) => codes.push(code));
  assert.deepEqual(codes, [7]);
});

test('exitWith exits with the code a pending command settles on', async () => {
  const codes: number[] = [];
  const pending = Promise.resolve(2);
  exitWith(pending, (code) => codes.push(code));
  assert.deepEqual(codes, [], 'a pending answer must not exit before it settles');
  await pending;
  await Promise.resolve();
  assert.deepEqual(codes, [2]);
});

test('exitWith exits 0 when a pending command rejects', async () => {
  const codes: number[] = [];
  const pending = Promise.reject(new Error('boom'));
  exitWith(pending, (code) => codes.push(code));
  await pending.catch(() => undefined);
  await Promise.resolve();
  assert.deepEqual(codes, [0]);
});
