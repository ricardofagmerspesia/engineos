// The daemon's wire: one JSON object per line, one request per connection.
//
//   -> {"v":1,"op":"rank","text":"...","candidates":[{"id":"backend","exemplars":["..."]}]}
//   <- {"v":1,"ok":true,"model":"<id>@<rev>","scores":{"backend":0.83}}
//   -> {"v":1,"op":"ping"}
//   <- {"v":1,"ok":true,"model":"<id>@<rev>","scores":{}}
//   <- {"v":1,"ok":false,"error":"<code>"}
//
// The bounds are mirrored by the client (src/judge/tiebreak.ts), which trims
// before sending; the daemon refuses rather than trims, so an oversize request
// is a client bug that shows up as `invalid-request`, never as silent loss.

export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  maxLineBytes: 65_536,
  maxTextChars: 2_000,
  maxCandidates: 10,
  maxExemplars: 10,
  maxExemplarChars: 300,
} as const;

// Intent ids as registries/intents.json spells them.
const INTENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type ErrorCode = 'invalid-request' | 'too-large' | 'busy' | 'internal';

export interface Candidate {
  id: string;
  exemplars: string[];
}

export type DaemonRequest = { op: 'ping' } | { op: 'rank'; text: string; candidates: Candidate[] };

export type DaemonResponse =
  | { v: typeof PROTOCOL_VERSION; ok: true; model: string; scores: Record<string, number> }
  | { v: typeof PROTOCOL_VERSION; ok: false; error: ErrorCode };

export type Parsed = { kind: 'request'; request: DaemonRequest } | { kind: 'invalid'; error: ErrorCode };

export function parseRequest(line: string): Parsed {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return invalid();
  }
  if (!isObject(value) || value['v'] !== PROTOCOL_VERSION) return invalid();
  if (value['op'] === 'ping') return { kind: 'request', request: { op: 'ping' } };
  if (value['op'] !== 'rank') return invalid();
  const text = value['text'];
  const candidates = parseCandidates(value['candidates']);
  if (typeof text !== 'string' || text.trim() === '' || text.length > LIMITS.maxTextChars || candidates === null) return invalid();
  return { kind: 'request', request: { op: 'rank', text, candidates } };
}

function parseCandidates(value: unknown): Candidate[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxCandidates) return null;
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const item of value) {
    if (!isObject(item)) return null;
    const { id, exemplars } = item;
    if (typeof id !== 'string' || !INTENT_ID.test(id) || seen.has(id)) return null;
    if (!Array.isArray(exemplars) || exemplars.length === 0 || exemplars.length > LIMITS.maxExemplars) return null;
    const texts: string[] = [];
    for (const exemplar of exemplars) {
      if (typeof exemplar !== 'string' || exemplar.trim() === '' || exemplar.length > LIMITS.maxExemplarChars) return null;
      texts.push(exemplar);
    }
    seen.add(id);
    candidates.push({ id, exemplars: texts });
  }
  return candidates;
}

export function errorResponse(error: ErrorCode): DaemonResponse {
  return { v: PROTOCOL_VERSION, ok: false, error };
}

export function scoresResponse(model: string, scores: Record<string, number>): DaemonResponse {
  return { v: PROTOCOL_VERSION, ok: true, model, scores };
}

function invalid(): Parsed {
  return { kind: 'invalid', error: 'invalid-request' };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
