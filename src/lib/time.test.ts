import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampMs, MS_DIGITS_MIN, nowMs, parseMs, plausibleMs } from './time';

test('nowMs answers epoch milliseconds, not seconds', () => {
  const value = nowMs();
  assert.ok(Number.isInteger(value));
  assert.ok(plausibleMs(String(value)), 'the clock must clear the same bar a persisted value has to');
});

test('a value with fewer than the minimum digits is seconds wearing an ms label', () => {
  assert.equal(MS_DIGITS_MIN, 12);
  assert.equal(plausibleMs('1767225600'), false, 'ten digits is seconds');
  assert.equal(plausibleMs('1767225600000'), true);
});

test('a non-digit value is never plausible', () => {
  for (const raw of ['', '-1767225600000', '1.5e12', '17672256000x0', ' 1767225600000']) {
    assert.equal(plausibleMs(raw), false, raw);
  }
});

test('parseMs reads a persisted marker and refuses an implausible one', () => {
  assert.equal(parseMs('1767225600000'), 1767225600000);
  assert.equal(parseMs('1767225600000\n'), 1767225600000, 'a trailing newline from the writer is tolerated');
  assert.equal(parseMs('5'), null);
  assert.equal(parseMs('not a number'), null);
  assert.equal(parseMs(''), null);
});

test('the clamp floors a backwards clock at zero rather than emitting a negative', () => {
  assert.equal(clampMs(-1), 0);
  assert.equal(clampMs(-100000), 0);
  assert.equal(clampMs(0), 0);
  assert.equal(clampMs(1200), 1200);
});

test('the clamp yields an integer, because duration_ms is an integer column', () => {
  assert.equal(clampMs(12.9), 12);
  assert.equal(clampMs(Number.NaN), 0);
  assert.equal(clampMs(Number.POSITIVE_INFINITY), 0);
});
