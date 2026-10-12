import { createHash } from 'node:crypto';
import { patternShape } from './policy-judge-pattern';
import { numberBounds, strictReader } from './strict';

// The `.judge` block of registries/policy.json (contracts.md@rev2 §6.2). The
// shape is declared here structurally rather than imported from src/judge/types:
// the kernel loads this registry and must never import src/judge (D5, C38c), and
// a structural match keeps JudgePolicy assignable both ways.
//
// No key material is ever read here: key_env is the NAME of the environment
// variable that holds it. That name, the opt-in switch and the redaction list
// are pinned in code below (E2): registries are data that ENGINEOS_ROOT can
// point anywhere, so a registry must not choose which secret is sent, what
// turns the judge on, or how little of the prompt is redacted.

export type JudgeMode = 'shadow' | 'advisory' | 'authoritative';

export interface JudgeRedactionPattern {
  kind: string;
  pattern: string;
}

export interface JudgeThresholds {
  intent_default: number;
  primary_confidence: number;
  margin: number;
  rule_default: number;
}

export interface JudgeBreaker {
  scope: string;
  state_file: string;
  cooldown_ms: number;
}

export interface JudgePolicy {
  enabled_env: string;
  enabled_value: string;
  provider: string;
  endpoint: string;
  model: string;
  timeout_ms: number;
  retries: number;
  key_env: string;
  mode: JudgeMode;
  max_state_bytes: number;
  thresholds: JudgeThresholds;
  redaction: { patterns: JudgeRedactionPattern[] };
  breaker: JudgeBreaker;
}

const JUDGE_MODES: readonly JudgeMode[] = ['shadow', 'advisory', 'authoritative'];
const KIND = /^[a-z][a-z0-9-]*$/;
// A bare file name: the breaker state lives in the telemetry directory, and a
// separator or a dot-dot segment would let the registry aim the write elsewhere.
const STATE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The only origin the judge's bearer key may be sent to (D3). src/judge/jev.ts
// keeps its own copy for the request-time check, since src/judge stays free of
// registry imports; a provider change is a code change in both, never a
// registry edit.
const JUDGE_ENDPOINT_ORIGIN = 'https://api.typesafe.ai';
// E2 pins. jev.ts reads the variable names from the loaded policy, so these
// values are the only ones it can ever see.
const JUDGE_KEY_ENV = 'TYPESAFE_API_KEY';
const JUDGE_ENABLED_ENV = 'ENGINEOS_JUDGE';
const JUDGE_ENABLED_VALUE = 'jev';
// The judge state cap. The pre-cap before redaction is twice this, so a larger
// registry value would widen both what leaves the machine and what redaction
// scans inside the hook budget; it may be lowered, never raised, by data.
const MAX_STATE_BYTES_CAP = 16384;
// SHA-256 hex of JSON.stringify(judge.redaction.patterns) as parsed from
// registries/policy.json (rows and key order as in the file). Changing, adding,
// removing or reordering a pattern changes this value, so a weaker list cannot
// arrive as a registry edit; update it only with a reviewed pattern change.
const REDACTION_PATTERNS_SHA256 = 'dffb903c4b0f554d494e3cf78981703f3c85f42c97240de5be2e844d82d86058';

const reader = strictReader('policy.json');
const { malformed, requireRecord, requireString, requireNumber, requireRows } = reader;
const { positiveInteger, unitInterval, aboveZeroAtMostOne } = numberBounds(reader);

export function parseJudge(value: unknown, breakerScopes: readonly string[]): JudgePolicy {
  const at = '.judge';
  const judge = requireRecord(value, at);
  const retries = requireNumber(judge['retries'], `${at}.retries`);
  // The judge sits inside a 400 ms hook budget; a retry would double the worst
  // case and the deterministic tier already answers when the judge does not.
  if (retries !== 0) malformed(`${at}.retries must be 0`);
  return {
    enabled_env: pinned(judge['enabled_env'], `${at}.enabled_env`, JUDGE_ENABLED_ENV),
    enabled_value: pinned(judge['enabled_value'], `${at}.enabled_value`, JUDGE_ENABLED_VALUE),
    provider: nonBlank(judge['provider'], `${at}.provider`),
    endpoint: httpsEndpoint(judge['endpoint'], `${at}.endpoint`),
    model: nonBlank(judge['model'], `${at}.model`),
    timeout_ms: positiveInteger(judge['timeout_ms'], `${at}.timeout_ms`),
    retries,
    key_env: pinned(judge['key_env'], `${at}.key_env`, JUDGE_KEY_ENV),
    mode: judgeMode(judge['mode'], `${at}.mode`),
    max_state_bytes: stateCap(judge['max_state_bytes'], `${at}.max_state_bytes`),
    thresholds: parseThresholds(judge['thresholds'], `${at}.thresholds`),
    redaction: { patterns: parsePatterns(judge['redaction'], `${at}.redaction`) },
    breaker: parseBreaker(judge['breaker'], `${at}.breaker`, breakerScopes),
  };
}

// intent_default and rule_default must be above 0: an intent or rule the judge
// never scored reads as probability 0, and a zero cut would qualify it on every
// prompt. primary_confidence and margin compare scores that exist, so 0 is a
// legal (if permissive) value for them.
function parseThresholds(value: unknown, at: string): JudgeThresholds {
  const thresholds = requireRecord(value, at);
  return {
    intent_default: aboveZeroAtMostOne(thresholds['intent_default'], `${at}.intent_default`),
    primary_confidence: unitInterval(thresholds['primary_confidence'], `${at}.primary_confidence`),
    margin: unitInterval(thresholds['margin'], `${at}.margin`),
    rule_default: aboveZeroAtMostOne(thresholds['rule_default'], `${at}.rule_default`),
  };
}

// Patterns stay strings (src/judge/redact.ts compiles them); each is compiled
// here once, with the flag redact.ts uses, only so a broken one is refused at
// load rather than skipped at redaction time, where a skip would send the secret.
// Each row is checked first so a malformed edit names its row; the hash pin then
// refuses any list but the reviewed one.
function parsePatterns(value: unknown, at: string): JudgeRedactionPattern[] {
  const redaction = requireRecord(value, at);
  const raw = redaction['patterns'];
  const rows = requireRows(raw, `${at}.patterns`);
  if (rows.length === 0) malformed(`${at}.patterns must not be empty`);
  const patterns = rows.map((row, i) => {
    const kind = requireString(row['kind'], `${at}.patterns[${i}].kind`);
    if (!KIND.test(kind)) malformed(`${at}.patterns[${i}].kind must be a lower-case slug`);
    const pattern = nonBlank(row['pattern'], `${at}.patterns[${i}].pattern`);
    if (!compiles(pattern)) malformed(`${at}.patterns[${i}].pattern does not compile as a regular expression`);
    const shape = patternShape(pattern);
    if (shape !== 'linear') malformed(`${at}.patterns[${i}].pattern is not linear-time (${shape})`);
    return { kind, pattern };
  });
  const digest = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  if (digest !== REDACTION_PATTERNS_SHA256) malformed(`${at}.patterns differ from the list pinned in code`);
  return patterns;
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, 'g');
    return true;
  } catch {
    return false;
  }
}

function parseBreaker(value: unknown, at: string, scopes: readonly string[]): JudgeBreaker {
  const breaker = requireRecord(value, at);
  const scope = requireString(breaker['scope'], `${at}.scope`);
  if (!scopes.includes(scope)) malformed(`${at}.scope must be one of .breaker.scopes`);
  const stateFile = requireString(breaker['state_file'], `${at}.state_file`);
  if (!STATE_FILE.test(stateFile)) malformed(`${at}.state_file must be a bare file name`);
  return { scope, state_file: stateFile, cooldown_ms: positiveInteger(breaker['cooldown_ms'], `${at}.cooldown_ms`) };
}

function judgeMode(value: unknown, path: string): JudgeMode {
  const mode = requireString(value, path);
  const known = JUDGE_MODES.find((candidate) => candidate === mode);
  return known ?? malformed(`${path} must be shadow, advisory or authoritative`);
}

function pinned(value: unknown, path: string, expected: string): string {
  const text = requireString(value, path);
  if (text !== expected) malformed(`${path} must be ${expected}`);
  return text;
}

function stateCap(value: unknown, path: string): number {
  const bytes = positiveInteger(value, path);
  if (bytes > MAX_STATE_BYTES_CAP) malformed(`${path} must be at most ${MAX_STATE_BYTES_CAP}`);
  return bytes;
}

function httpsEndpoint(value: unknown, path: string): string {
  const endpoint = requireString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return malformed(`${path} must be an absolute URL`);
  }
  // Prompts leave the machine through this URL: plain http, or credentials in
  // the URL itself, are refused.
  if (parsed.protocol !== 'https:') malformed(`${path} must use https`);
  if (parsed.username !== '' || parsed.password !== '') malformed(`${path} must not carry credentials`);
  // The bearer key travels to this origin. Registries are data that
  // ENGINEOS_ROOT can point anywhere, so the one origin the key may reach is
  // fixed here, in code: a registry naming any other host or port is refused.
  if (parsed.origin !== JUDGE_ENDPOINT_ORIGIN) malformed(`${path} must be on ${JUDGE_ENDPOINT_ORIGIN}`);
  return endpoint;
}

function nonBlank(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (text.trim() === '') malformed(`${path} must not be empty`);
  return text;
}
