// Whether a request to the console's API may proceed, decided from the request's
// origin signals alone.
//
// Why this exists at all. POST /api/publish and POST /api/rollback/:historyId
// write files and run `git commit` / `git revert` in the operator's repository,
// take no request body, and have no authentication. That combination is a
// textbook CSRF target: a cross-site `<form method=post>` or
// `fetch(..., { mode: 'no-cors' })` on any page the operator happens to have
// open needs no preflight to reach them, so the browser posts the request with
// the operator's own machine as the source.
//
// Why signals and not a token. The console is a local single-operator tool with
// no user model, so there is no session to hang a CSRF token off. The browser
// already reports what the console needs to know, and the loopback binding in
// package.json (`next dev -H 127.0.0.1`) keeps everything off this machine out:
// binding is the first wall, origin the second.
//
// Pure on purpose — no Next import — so the verdict is decidable in a unit test
// without booting a server. The middleware only reads headers and shapes the
// refusal.

export type OriginVerdict = 'allow' | 'refuse';

export interface OriginSignals {
  method: string;
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
}

// Compared exactly, with no case folding: Next normalises `request.method` to
// uppercase, so a lowercase verb cannot reach the middleware.
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

// The only authorities a loopback-bound console can legitimately be addressed
// by. `[::1]` keeps its brackets: that is the form a Host header carries an
// IPv6 literal in (RFC 3986 section 3.2.2), so the brackets are part of the
// name being matched, not punctuation around it.
const LOOPBACK_HOST_NAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

const PORT_PATTERN = /^[0-9]+$/;

export function originVerdict(signals: OriginSignals): OriginVerdict {
  const host = signals.host;

  // Rule 0, and it applies to every method. Under DNS rebinding the attacker
  // owns the name: a hostname they control resolves to 127.0.0.1, so the
  // browser considers the request same-origin and sends their hostname as both
  // `Origin` and `Host` — every signal below then agrees, and both walls open.
  // The one string an attacker cannot make the browser put in `Host` is a
  // loopback literal, because `Host` is the authority the operator typed.
  // Reads are in scope for the same reason: a rebound origin can read every
  // GET, and it can read them cross-origin only because the response would
  // otherwise come back to the attacker's page.
  if (host === null || !isLoopbackHost(host)) {
    return 'refuse';
  }

  // Read verbs, once the authority is known to be loopback. Refusing OPTIONS
  // would break the preflight that protects the rest. This is not the claim
  // that reads are harmless — `GET /api/skills` writes to the store today
  // (recorded for U11) — it is the claim that rule 0 already covers them.
  if (SAFE_METHODS.has(signals.method)) {
    return 'allow';
  }

  // Sec-Fetch-Site is the browser's own answer and cannot be set by page
  // script, so when it is there it is the only signal worth reading. Only
  // `same-origin` passes: that is what the console's own client always sends.
  // `none` is refused on a write verb because nothing here legitimately emits
  // it — a navigation from the address bar or a bookmark cannot POST, and an
  // extension is not this app. `same-site` and `cross-site` are somebody
  // else's page.
  if (signals.secFetchSite !== null) {
    return signals.secFetchSite === 'same-origin' ? 'allow' : 'refuse';
  }

  // Fallback for a client that sends Origin but not Sec-Fetch-Site. The host
  // must match including the port, so a page on another port of this same
  // machine is still cross-origin.
  if (signals.origin !== null) {
    const claimedHost = originHost(signals.origin);
    if (claimedHost === null) {
      return 'refuse';
    }
    // `new URL()` lowercases the host it parses, so the comparison is against
    // the normalised Host rather than the raw header.
    return claimedHost === host.toLowerCase() ? 'allow' : 'refuse';
  }

  // Neither header: not a browser. A non-browser client (curl, a script, the
  // operator's own tooling) cannot be CSRF'd — there is no ambient session for
  // a third party to ride — and every browser able to make this request sends
  // Sec-Fetch-Site. Refusing here would break local tooling to protect nobody.
  return 'allow';
}

// Host names are case-insensitive (RFC 3986 section 3.2.2), so `LocalHost:3000`
// and `localhost:3000` are the same authority; normalise before comparing.
function isLoopbackHost(host: string): boolean {
  const authority = host.toLowerCase();
  const separator = portSeparatorIndex(authority);

  if (separator === -1) {
    return LOOPBACK_HOST_NAMES.has(authority);
  }

  // Any port is allowed — the binding decides which one listens, this
  // allowlist decides the name — but a port that is not a number means a
  // malformed Host header, and malformed is refused rather than parsed.
  return (
    PORT_PATTERN.test(authority.slice(separator + 1)) &&
    LOOPBACK_HOST_NAMES.has(authority.slice(0, separator))
  );
}

// The index of the colon that separates a port, or -1 when there is no port.
// An IPv6 literal is all colons and no port (`[::1]`); only a colon after the
// closing bracket introduces one (`[::1]:3000`).
function portSeparatorIndex(authority: string): number {
  const lastColon = authority.lastIndexOf(':');
  return lastColon > authority.lastIndexOf(']') ? lastColon : -1;
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    // An unparseable Origin (including the literal `null` browsers send for an
    // opaque origin) says nothing about who sent this — refuse, do not guess.
    return null;
  }
}
