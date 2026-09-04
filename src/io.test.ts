import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo, writeJson } from './io';

test('writeJson pretty-prints with two-space indent and trailing newline', () => {
  const io = memoryIo();
  writeJson(io, { domain: null, excluded: true });
  assert.equal(io.stdout.join(''), '{\n  "domain": null,\n  "excluded": true\n}\n');
});

test('memoryIo returns the stdin it was given exactly once', () => {
  const io = memoryIo({ stdin: '{"cwd":"/x"}' });
  assert.equal(io.readStdin(), '{"cwd":"/x"}');
  assert.equal(io.readStdin(), '');
});
