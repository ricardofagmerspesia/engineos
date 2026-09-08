// The same-origin gate in front of every /api/** route.
//
// Three walls stand between the operator's repository and a cross-site write.
// The first is the loopback binding in package.json (`next dev -H 127.0.0.1`,
// `next start -H 127.0.0.1`): Next binds every interface by default, so
// without it "local single-operator tool" was enforced by nothing. The second
// is the Host allowlist and the third the origin check, both in
// src/lib/request-origin.ts — binding does nothing about the two attacks that
// matter here, a browser already running on this machine being tricked into
// posting to publish or rollback, and a hostname the attacker controls that
// resolves to 127.0.0.1 (DNS rebinding), which makes every origin signal agree
// with them.
//
// The gate covers the read verbs too, so "reads are not the threat" is not the
// claim being made: `GET /api/skills` writes to the store today (recorded for
// U11), and a rebound origin can read every GET regardless. Reads pass the
// origin check, never the Host allowlist.
//
// The verdict lives in src/lib/request-origin.ts, pure and unit-tested. This
// file only reads the headers and shapes the refusal, so there is no logic here
// that the tests cannot reach.
//
// The import below is relative and extensionless on purpose: the `@/` alias is
// a tsconfig path that nothing rewrites in the `node --test` build, and an
// explicit `.js` specifier does not resolve to a `.ts` file under webpack
// unless `experimental.extensionAlias` is set, which this app does not set.
// Extensionless resolves in both.

import { NextResponse, type NextRequest } from 'next/server';

import { originVerdict } from './lib/request-origin';

export const config = { matcher: '/api/:path*' };

export function middleware(request: NextRequest): NextResponse {
  const verdict = originVerdict({
    method: request.method,
    secFetchSite: request.headers.get('sec-fetch-site'),
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
  });

  if (verdict === 'refuse') {
    return NextResponse.json({ ok: false, reason: 'Cross-site request refused.' }, { status: 403 });
  }

  return NextResponse.next();
}
