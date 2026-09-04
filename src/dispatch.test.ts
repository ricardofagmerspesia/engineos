import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from './dispatch';
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
