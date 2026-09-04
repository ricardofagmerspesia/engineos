import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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

test('processIo reads stdin once and answers empty on the second read', () => {
  const modulePath = join(__dirname, 'io.js');
  const script = `const { processIo } = require(${JSON.stringify(modulePath)}); const io = processIo(); process.stdout.write(JSON.stringify([io.readStdin(), io.readStdin()]));`;
  const result = spawnSync(process.execPath, ['-e', script], { input: '{"cwd":"/x"}', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['{"cwd":"/x"}', '']);
});
