import { strictReader } from './strict';

// The `.judge` block of registries/policy.json (contracts.md@rev2 §6.2). The
// shape is declared here structurally rather than imported from src/judge/types:
// the kernel loads this registry and must never import src/judge (D5, C38c), and
// a structural match keeps JudgePolicy assignable both ways.
//
// No key material is ever read here: key_env is the NAME of the environment
// variable that holds it, and the loader refuses anything that is not shaped
// like such a name.

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
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
const KIND = /^[a-z][a-z0-9-]*$/;
// A bare file name: the breaker state lives in the telemetry directory, and a
// separator or a dot-dot segment would let the registry aim the write elsewhere.
const STATE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The only origin the judge's bearer key may be sent to (D3). src/judge/jev.ts
// keeps its own copy for the request-time check, since src/judge stays free of
// registry imports; a provider change is a code change in both, never a
// registry edit.
const JUDGE_ENDPOINT_ORIGIN = 'https://api.typesafe.ai';
// `{m,}` at the start of the remaining source: a quantifier with no upper bound.
const OPEN_RANGE = /^\{[0-9]{1,6},\}/;

const { malformed, requireRecord, requireString, requireNumber, requireRows } = strictReader('policy.json');

export function parseJudge(value: unknown, breakerScopes: readonly string[]): JudgePolicy {
  const at = '.judge';
  const judge = requireRecord(value, at);
  const retries = requireNumber(judge['retries'], `${at}.retries`);
  // The judge sits inside a 400 ms hook budget; a retry would double the worst
  // case and the deterministic tier already answers when the judge does not.
  if (retries !== 0) malformed(`${at}.retries must be 0`);
  return {
    enabled_env: envName(judge['enabled_env'], `${at}.enabled_env`),
    enabled_value: nonBlank(judge['enabled_value'], `${at}.enabled_value`),
    provider: nonBlank(judge['provider'], `${at}.provider`),
    endpoint: httpsEndpoint(judge['endpoint'], `${at}.endpoint`),
    model: nonBlank(judge['model'], `${at}.model`),
    timeout_ms: positiveInteger(judge['timeout_ms'], `${at}.timeout_ms`),
    retries,
    key_env: envName(judge['key_env'], `${at}.key_env`),
    mode: judgeMode(judge['mode'], `${at}.mode`),
    max_state_bytes: positiveInteger(judge['max_state_bytes'], `${at}.max_state_bytes`),
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
    intent_default: aboveZero(thresholds['intent_default'], `${at}.intent_default`),
    primary_confidence: unitInterval(thresholds['primary_confidence'], `${at}.primary_confidence`),
    margin: unitInterval(thresholds['margin'], `${at}.margin`),
    rule_default: aboveZero(thresholds['rule_default'], `${at}.rule_default`),
  };
}

// Patterns stay strings (src/judge/redact.ts compiles them); each is compiled
// here once, with the flag redact.ts uses, only so a broken one is refused at
// load rather than skipped at redaction time, where a skip would send the secret.
function parsePatterns(value: unknown, at: string): JudgeRedactionPattern[] {
  const redaction = requireRecord(value, at);
  const rows = requireRows(redaction['patterns'], `${at}.patterns`);
  if (rows.length === 0) malformed(`${at}.patterns must not be empty`);
  return rows.map((row, i) => {
    const kind = requireString(row['kind'], `${at}.patterns[${i}].kind`);
    if (!KIND.test(kind)) malformed(`${at}.patterns[${i}].kind must be a lower-case slug`);
    const pattern = nonBlank(row['pattern'], `${at}.patterns[${i}].pattern`);
    if (!compiles(pattern)) malformed(`${at}.patterns[${i}].pattern does not compile as a regular expression`);
    if (hasUnboundedQuantifier(pattern)) malformed(`${at}.patterns[${i}].pattern must bound every quantifier ({m,n}, ?)`);
    return { kind, pattern };
  });
}

// Redaction runs on every judged prompt inside the hook budget, so a pattern
// must be linear-time by construction: `*`, `+` and `{m,}` are refused outside
// a character class, which also rules out nested unbounded repetition. Bounded
// forms ({m,n}, {m}, ?) remain, so the worst case per start position is a
// constant the pattern itself states; keeping a bounded nested group
// unambiguous (as the shipped set does) keeps that constant small.
function hasUnboundedQuantifier(source: string): boolean {
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === '*' || char === '+') return true;
    else if (char === '{' && OPEN_RANGE.test(source.slice(index))) return true;
  }
  return false;
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

function envName(value: unknown, path: string): string {
  const name = requireString(value, path);
  if (!ENV_NAME.test(name)) malformed(`${path} must be an environment variable name`);
  return name;
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

function positiveInteger(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (!Number.isInteger(number) || number < 1) malformed(`${path} must be a positive integer`);
  return number;
}

function aboveZero(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number <= 0 || number > 1) malformed(`${path} must be greater than 0 and at most 1`);
  return number;
}

function unitInterval(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number < 0 || number > 1) malformed(`${path} must be between 0 and 1`);
  return number;
}
