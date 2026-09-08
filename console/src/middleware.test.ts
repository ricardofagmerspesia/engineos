// The middleware's own wiring, exercised through a real NextRequest: the header
// names it reads, the refusal it shapes, and the pass-through it returns. The
// verdict table itself belongs to request-origin.test.ts — these are the cases
// that only a NextRequest can prove, and the middleware had no test at all
// before this.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NextRequest } from 'next/server';

import { middleware } from './middleware.js';

const PASS_THROUGH_HEADER = 'x-middleware-next';

function apiRequest(url: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(url, { method: 'POST', headers });
}

test('a cross-site POST to publish is refused with a 403 and a reason', async () => {
  const response = middleware(
    apiRequest('http://127.0.0.1:3000/api/publish', {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'cross-site',
      origin: 'https://attacker.example',
    }),
  );

  assert.equal(response.status, 403);
  const body: unknown = await response.json();
  assert.deepEqual(body, { ok: false, reason: 'Cross-site request refused.' });
});

test('a same-origin POST from the loopback host passes through to the route', () => {
  const response = middleware(
    apiRequest('http://127.0.0.1:3000/api/publish', {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
      origin: 'http://127.0.0.1:3000',
    }),
  );

  assert.equal(response.headers.get(PASS_THROUGH_HEADER), '1');
});

test('a same-origin POST whose Host is a rebound hostname is refused', async () => {
  const response = middleware(
    apiRequest('http://evil.example:3000/api/publish', {
      host: 'evil.example:3000',
      'sec-fetch-site': 'same-origin',
      origin: 'http://evil.example:3000',
    }),
  );

  assert.equal(response.status, 403);
  const body: unknown = await response.json();
  assert.deepEqual(body, { ok: false, reason: 'Cross-site request refused.' });
});
