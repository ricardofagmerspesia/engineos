import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { baselinePath, compare, readBaseline, writeBaseline, type BaselineIo } from './baseline';
import type { HostMetadata } from './host';
import type { LifecycleReport } from './lifecycle';

const host: HostMetadata = {
  platform: 'darwin',
  cpuModel: 'Apple M2 Pro',
  cpuCount: 2,
  nodeVersion: 'v22.11.0',
  engineosVersion: '2.0.0',
};

function report(p50: number): LifecycleReport {
  return { host, scenarios: [{ scenario: 'direct-edit-warm', p50Ms: p50, p95Ms: p50 + 10, dispatches: 0, contextBytes: 100, samples: [] }] };
}

function memoryIo(): BaselineIo & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: (path) => files.get(path) ?? null,
    write: (path, text) => { files.set(path, text); },
  };
}

test('a baseline round-trips through the host-named file', () => {
  const io = memoryIo();
  const path = writeBaseline(io, '/repo', report(50));
  strictEqual(path, baselinePath('/repo', host));
  deepStrictEqual(readBaseline(io, '/repo', host), report(50));
});

test('a missing baseline reads as null rather than an invented zero', () => {
  strictEqual(readBaseline(memoryIo(), '/repo', host), null);
});

test('compare reports a scenario that regressed past the tolerance', () => {
  const found = compare(report(120), report(100), 0.1);
  strictEqual(found.length, 1);
  strictEqual(found[0]?.scenario, 'direct-edit-warm');
});

test('compare accepts a scenario inside the tolerance', () => {
  deepStrictEqual(compare(report(105), report(100), 0.1), []);
});

test('compare reports a scenario the baseline does not contain as unmeasured', () => {
  const current: LifecycleReport = { host, scenarios: [{ scenario: 'new-path', p50Ms: 1, p95Ms: 1, dispatches: 0, contextBytes: 0, samples: [] }] };
  strictEqual(compare(current, report(100), 0.1)[0]?.reason, 'no-baseline');
});
