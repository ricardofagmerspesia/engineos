import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { isRecord, KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { parseFlags, requirePositional, runKernel } from './cli';

const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };

test('route-path rejects a flag where a positional is expected', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', '--prompt', 'x'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path takes a file path as a positional argument, not a flag (got --prompt)' });
});

test('route-path requires exactly one argument', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path requires a file path' });
  const io2 = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'a', 'b'], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'route-path takes exactly one argument, got 2' });
});

test('route-path answers JSON with exit 0', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'README.md'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { domain: null, excluded: true });
});

test('route-path emits the section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', '/tmp/api/user.controller.ts'], io), 0);
  const answer: unknown = JSON.parse(io.stdout.join(''));
  if (!isRecord(answer)) throw new Error('route-path did not answer an object');
  assert.deepEqual(Object.keys(answer), ['domain', 'rules', 'skills', 'agent', 'risk_floor', 'hook_guidance', 'excluded']);
});

test('unknown subcommand is a JSON error', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['nope'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'unknown subcommand: nope' });
});

test('no subcommand at all is the same JSON error', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel([], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'unknown subcommand: ' });
});

test('requirePositional refuses an empty first argument', () => {
  assert.throws(() => requirePositional('route-intent', 'the request text', ['']), KernelError);
});

test('parseFlags reads --k v pairs and rejects unknown flags and missing values', () => {
  assert.deepEqual([...parseFlags('risk', ['--risk', 'high'], ['--risk'])], [['--risk', 'high']]);
  assert.deepEqual([...parseFlags('risk', [], ['--risk'])], []);
  assert.throws(() => parseFlags('risk', ['--nope', 'x'], ['--risk']), KernelError);
  assert.throws(() => parseFlags('risk', ['--risk'], ['--risk']), KernelError);
});

test('route-intent rejects a flag where a positional is expected', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', '--prompt', 'add a thing'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-intent takes the request text as a positional argument, not a flag (got --prompt)' });
});

test('route-intent requires exactly one argument', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-intent requires the request text' });
  const io2 = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'a', 'b'], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'route-intent takes exactly one argument, got 2' });
  const io3 = memoryIo({ env });
  assert.equal(runKernel(['route-intent', ''], io3), 1);
  assert.deepEqual(JSON.parse(io3.stdout.join('')), { error: 'route-intent requires the request text' });
});

test('route-intent answers a zero-match prompt as ambiguous with exit 0', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'zzz qqq'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { matches: [], ambiguous: true });
});

test('route-intent emits the section and its matches in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'run a retro'], io), 0);
  const answer: unknown = JSON.parse(io.stdout.join(''));
  if (!isRecord(answer)) throw new Error('route-intent did not answer an object');
  assert.deepEqual(Object.keys(answer), ['matches', 'ambiguous']);
  const matches = answer['matches'];
  if (!Array.isArray(matches)) throw new Error('route-intent did not answer a matches array');
  const first: unknown = matches[0];
  if (!isRecord(first)) throw new Error('route-intent answered no match for a known signal');
  assert.deepEqual(Object.keys(first), [
    'id', 'title', 'rules', 'skills', 'agents', 'commands', 'mcp', 'model_tier', 'risk_floor', 'note',
  ]);
  assert.equal(first['id'], 'retro');
});
