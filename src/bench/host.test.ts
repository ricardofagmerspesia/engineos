import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { collectHost, hostId, type HostDeps } from './host';

const deps: HostDeps = {
  platform: () => 'darwin',
  cpus: () => [{ model: 'Apple M2 Pro' }, { model: 'Apple M2 Pro' }],
  nodeVersion: () => 'v22.11.0',
};

test('collectHost reports the host a baseline belongs to', () => {
  deepStrictEqual(collectHost(deps, '2.0.0'), {
    platform: 'darwin',
    cpuModel: 'Apple M2 Pro',
    cpuCount: 2,
    nodeVersion: 'v22.11.0',
    engineosVersion: '2.0.0',
  });
});

test('collectHost reports an unknown cpu rather than crashing on an empty list', () => {
  const empty: HostDeps = { ...deps, cpus: () => [] };
  strictEqual(collectHost(empty, '2.0.0').cpuModel, 'unknown');
  strictEqual(collectHost(empty, '2.0.0').cpuCount, 0);
});

test('hostId is stable for the same hardware and ignores the engineos version', () => {
  const a = collectHost(deps, '2.0.0');
  const b = collectHost(deps, '2.1.0');
  strictEqual(hostId(a), hostId(b));
  strictEqual(/^[a-z0-9-]+$/.test(hostId(a)), true);
});

test('hostId separates different hardware', () => {
  const other = collectHost({ ...deps, cpus: () => [{ model: 'Intel i7' }] }, '2.0.0');
  notStrictEqual(hostId(collectHost(deps, '2.0.0')), hostId(other));
});
