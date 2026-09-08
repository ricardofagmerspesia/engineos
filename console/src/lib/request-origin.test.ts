// The same-origin gate's verdict table. The cases that matter are the write
// verbs: a cross-site POST reaching publish or rollback is the whole reason the
// gate exists. Rule 0 — the Host allowlist — is exercised on reads too, because
// under DNS rebinding an attacker's hostname is what the browser puts in Host.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { originVerdict } from './request-origin.js';
import type { OriginSignals } from './request-origin.js';

function signals(overrides: Partial<OriginSignals>): OriginSignals {
  return {
    method: 'POST',
    secFetchSite: null,
    origin: null,
    host: '127.0.0.1:3000',
    ...overrides,
  };
}

test('a cross-site GET is allowed — the write verbs are the threat, and rule 0 already covered the read', () => {
  assert.equal(originVerdict(signals({ method: 'GET', secFetchSite: 'cross-site' })), 'allow');
});

test('a cross-site HEAD is allowed', () => {
  assert.equal(originVerdict(signals({ method: 'HEAD', secFetchSite: 'cross-site' })), 'allow');
});

test('a cross-site OPTIONS is allowed — refusing it would break the preflight', () => {
  assert.equal(originVerdict(signals({ method: 'OPTIONS', secFetchSite: 'cross-site' })), 'allow');
});

test('a same-origin POST is allowed — this is the console UI calling its own API', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin' })), 'allow');
});

test('a POST with Sec-Fetch-Site: none is refused — no legitimate emitter here can POST', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'none' })), 'refuse');
});

test('a cross-site POST is refused — the CSRF case against publish and rollback', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'cross-site' })), 'refuse');
});

test('a same-site POST is refused — a sibling subdomain is a different origin', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-site' })), 'refuse');
});

test('with no Sec-Fetch-Site, a POST whose Origin host equals Host is allowed', () => {
  assert.equal(
    originVerdict(signals({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })),
    'allow',
  );
});

test('with no Sec-Fetch-Site, an Origin on another port of this machine is refused', () => {
  assert.equal(
    originVerdict(signals({ origin: 'http://127.0.0.1:4000', host: '127.0.0.1:3000' })),
    'refuse',
  );
});

test('a malformed Origin is refused rather than guessed at', () => {
  assert.equal(originVerdict(signals({ origin: 'not a url' })), 'refuse');
});

test('a POST with neither header is allowed — a non-browser client has no ambient session to ride', () => {
  assert.equal(originVerdict(signals({ secFetchSite: null, origin: null })), 'allow');
});

test('a missing Host is refused even with an Origin — rule 0 has nothing to match', () => {
  assert.equal(originVerdict(signals({ host: null, origin: 'http://127.0.0.1:3000' })), 'refuse');
});

test('a rebound hostname is refused despite Sec-Fetch-Site: same-origin — the DNS rebinding case', () => {
  assert.equal(
    originVerdict(signals({ secFetchSite: 'same-origin', host: 'evil.example:3000' })),
    'refuse',
  );
});

test('a rebound hostname is refused when its Origin matches Host too — both walls used to open', () => {
  assert.equal(
    originVerdict(signals({ origin: 'http://evil.example:3000', host: 'evil.example:3000' })),
    'refuse',
  );
});

test('host localhost:3000 is on the allowlist', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin', host: 'localhost:3000' })), 'allow');
});

test('host [::1]:3000 is on the allowlist — the IPv6 literal keeps its brackets', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin', host: '[::1]:3000' })), 'allow');
});

test('host [::1] with no port is on the allowlist', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin', host: '[::1]' })), 'allow');
});

test('host 127.0.0.1 with no port is on the allowlist — the binding decides the port', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin', host: '127.0.0.1' })), 'allow');
});

test('the Host allowlist is case-insensitive, as host names are', () => {
  assert.equal(originVerdict(signals({ secFetchSite: 'same-origin', host: 'LocalHost:3000' })), 'allow');
});

test('a Host whose port is not a number is refused as malformed', () => {
  assert.equal(
    originVerdict(signals({ secFetchSite: 'same-origin', host: 'localhost:3000@evil.example' })),
    'refuse',
  );
});
