import { strictEqual, throws } from 'node:assert/strict';
import { test } from 'node:test';
import { percentile, summarize, type LifecycleSample } from './lifecycle';

function sample(durationMs: number): LifecycleSample {
  return {
    scenario: 's',
    phase: 'routing',
    durationMs,
    tokensIn: null,
    tokensOut: null,
    costMicros: null,
    cacheHit: null,
    retries: 0,
  };
}

test('percentile uses nearest-rank on the sorted values', () => {
  const values = [10, 20, 30, 40];
  strictEqual(percentile(values, 50), 20);
  strictEqual(percentile(values, 95), 40);
  strictEqual(percentile(values, 100), 40);
});

test('percentile of a single value is that value', () => {
  strictEqual(percentile([7], 50), 7);
  strictEqual(percentile([7], 95), 7);
});

test('percentile refuses an empty series rather than inventing a zero', () => {
  throws(() => percentile([], 50), /no samples/);
});

test('summarize reports both percentiles and carries the inputs it was given', () => {
  const result = summarize('direct-edit-warm', [sample(10), sample(20), sample(30)], 28019, 0);
  strictEqual(result.scenario, 'direct-edit-warm');
  strictEqual(result.p50Ms, 20);
  strictEqual(result.p95Ms, 30);
  strictEqual(result.contextBytes, 28019);
  strictEqual(result.dispatches, 0);
  strictEqual(result.samples.length, 3);
});
