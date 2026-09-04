// telemetry.ts — kernel-decision event capture, ported from scripts/telemetry.sh.
//
// Registry-driven, fail-closed: the event enum, per-event key sets, and the
// anti-prompt-text value pattern are read from registries/policy.json's telemetry
// block at call time. Deliberately parallel to (never merged with) the exec
// journal — that schema is per-capability-dispatch run accounting, this one is
// hook-side kernel-decision events. Different subjects, different fields, and
// different error conventions: this CLI answers {"error": ...} on STDOUT with
// exit 1, where the exec journal answers plain text on stderr.
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { loadTelemetryPolicy, type TelemetryPolicy } from '../registry/policy-telemetry';

// scripts/telemetry.sh err(): {"error": message} on stdout, exit 1.
export class TelemetryError extends Error {
  readonly kind = 'telemetry';
}

// scripts/telemetry.sh usage(): two lines on stderr, exit 1. A separate class
// because the two failures leave the process by different streams.
export class TelemetryUsageError extends Error {
  readonly kind = 'telemetry-usage';
}

export interface AppendOptions {
  session: string;
  event: string;
  // The RAW --data text, not a parsed value: two of the CLI's error messages
  // quote it back verbatim, and the append re-serializes the parse of it.
  data: string;
  ts?: string;
}

export interface ValidateResult {
  lines: number;
  bad: number[];
}

const APPEND_USAGE_ARGV0 = 'scripts/telemetry.sh';

export function usage(argv0: string = APPEND_USAGE_ARGV0): string {
  return [
    `usage: ${argv0} append <file> --session SID --event ID --data JSON [--ts TS]`,
    `       ${argv0} validate <file>`,
    '',
  ].join('\n');
}

export function parseAppendArgs(args: string[]): { file: string; options: AppendOptions } {
  const [file, ...rest] = args;
  if (file === undefined) throw new TelemetryUsageError();
  return { file, options: parseAppendFlags(rest) };
}

// bash checks the policy file before it looks at a single flag, so a run with
// both problems reports the missing registry. Order is behaviour here.
export function requirePolicyPresent(root: string): void {
  if (!existsSync(join(root, 'registries', 'policy.json'))) throw new TelemetryError('policy.json missing');
}

export function appendEvent(root: string, file: string, options: AppendOptions, now: () => string = utcNow): void {
  requirePolicyPresent(root);
  const policy = loadTelemetryPolicy(root);
  const event = policy.events.find((row) => row.id === options.event);
  if (event === undefined) throw new TelemetryError(`unknown event: ${options.event}`);

  const data = parseData(options.data);
  const pattern = compilePattern(policy.value_pattern);
  if (!dataIsValid(data, event.keys, pattern)) {
    throw new TelemetryError(`data failed schema/value_pattern check for event ${options.event}: ${options.data}`);
  }

  const ts = options.ts === undefined || options.ts === '' ? now() : options.ts;
  const line = jqCompact({ ts, session_id: options.session, event: options.event, data });
  try {
    appendFileSync(file, `${line}\n`);
  } catch {
    // bash lets the `>>` redirection fail and exits 1 with the shell's own
    // message; the port reports the same condition through the CLI's convention.
    throw new TelemetryError(`cannot append to ${file}`);
  }
}

export function validateTelemetry(root: string, file: string): ValidateResult {
  if (!isFile(file)) throw new TelemetryError(`no such file: ${file}`);
  requirePolicyPresent(root);
  const policy = loadTelemetryPolicy(root);
  const pattern = compilePattern(policy.value_pattern);
  const lines = readLines(file);
  const bad: number[] = [];
  lines.forEach((line, index) => {
    // Blank lines are skipped but still counted: bash increments line_no before
    // the `continue`, so the "N line(s), all valid" total includes them.
    if (line === '') return;
    if (!lineIsValid(line, policy, pattern)) bad.push(index + 1);
  });
  return { lines: lines.length, bad };
}

// jq -c's exact bytes. JSON.stringify differs from jq 1.6 in three ways that a
// byte-compared appended line would catch:
//   - jq keeps the sign of -0, JSON.stringify writes 0;
//   - jq picks exponent form on David Gay's g_fmt threshold (decimal point at or
//     below -4, or more than 15 places past the last significant digit) and pads
//     the exponent to two digits, where JSON.stringify switches at 1e21 / 1e-7
//     and writes single-digit exponents;
//   - jq escapes U+007F, JSON.stringify emits it raw.
export function jqCompact(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return jqNumber(value);
  if (typeof value === 'string') return jqString(value);
  if (Array.isArray(value)) return `[${value.map((item) => jqCompact(item)).join(',')}]`;
  if (isRecord(value)) {
    const fields = Object.entries(value).map(([key, item]) => `${jqString(key)}:${jqCompact(item)}`);
    return `{${fields.join(',')}}`;
  }
  return 'null';
}

// ------------------------------------------------------------------ internals

const APPEND_FLAGS = ['--session', '--event', '--data', '--ts'];

function parseAppendFlags(args: string[]): AppendOptions {
  const values = new Map<string, string>();
  let index = 0;
  while (index < args.length) {
    // bash refuses an odd tail before it looks at the flag name (`[ $# -ge 2 ] ||
    // usage`), so `--data` with nothing after it is a usage error, not a crash.
    if (args.length - index < 2) throw new TelemetryUsageError();
    const flag = args[index] ?? '';
    if (!APPEND_FLAGS.includes(flag)) throw new TelemetryUsageError();
    values.set(flag, args[index + 1] ?? '');
    index += 2;
  }
  const session = values.get('--session') ?? '';
  const event = values.get('--event') ?? '';
  const data = values.get('--data') ?? '';
  if (session === '' || event === '' || data === '') throw new TelemetryUsageError();
  const ts = values.get('--ts') ?? '';
  return ts === '' ? { session, event, data } : { session, event, data, ts };
}

// `jq -e .` exits 1 on `false` and on `null` — both valid JSON, both reported by
// scripts/telemetry.sh as "not valid JSON". Reproduced rather than corrected: the
// message is public surface, and both values fail the schema check anyway.
function parseData(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TelemetryError(`--data is not valid JSON: ${raw}`);
  }
  if (parsed === false || parsed === null) throw new TelemetryError(`--data is not valid JSON: ${raw}`);
  return parsed;
}

function dataIsValid(data: unknown, keys: string[], pattern: RegExp): boolean {
  if (!isRecord(data)) return false;
  for (const [key, value] of Object.entries(data)) {
    if (!keys.includes(key)) return false;
    if (!valueIsValid(value, pattern)) return false;
  }
  return true;
}

function valueIsValid(value: unknown, pattern: RegExp): boolean {
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  if (typeof value === 'string') return pattern.test(value);
  // An empty array passes, as jq's `all` on an empty generator does.
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string' && pattern.test(item));
  return false;
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    throw new TelemetryError(`telemetry.value_pattern is not a valid regular expression: ${pattern}`);
  }
}

function lineIsValid(line: string, policy: TelemetryPolicy, pattern: RegExp): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return false;
  }
  // jq indexes a non-object and errors out, which the caller reads as a bad line.
  if (!isRecord(parsed)) return false;
  const ts = parsed['ts'];
  const session = parsed['session_id'];
  const event = parsed['event'];
  if (typeof ts !== 'string' || ts.length === 0) return false;
  if (typeof session !== 'string' || session.length === 0) return false;
  if (typeof event !== 'string') return false;
  const known = policy.events.find((row) => row.id === event);
  if (known === undefined) return false;
  // `.data // empty` reads an absent, null or false data as no data at all, and
  // the shell then substitutes {} — so all three validate.
  const raw = parsed['data'];
  const data = raw === undefined || raw === null || raw === false ? {} : raw;
  return dataIsValid(data, known.keys, pattern);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// bash's `while IFS= read -r line || [ -n "$line" ]`: a trailing newline adds no
// line, a file that ends without one still yields its last line, and blank lines
// count toward the total.
function readLines(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new TelemetryError(`no such file: ${file}`);
  }
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function utcNow(): string {
  // `date -u +%Y-%m-%dT%H:%M:%SZ` — seconds, no fraction.
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

function jqString(value: string): string {
  // JSON.stringify already escapes ", \ and every character below 0x20 the way jq
  // does (\b \f \n \r \t shortcuts, \u00XX otherwise). U+007F is the one character
  // the two disagree on.
  return JSON.stringify(value).replace(/\u007F/gu, '\\u007f');
}

function jqNumber(value: number): string {
  // Unreachable from JSON input, which has no literal for either.
  if (!Number.isFinite(value)) return 'null';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const sign = value < 0 ? '-' : '';
  const [digits, exponent] = shortestDigits(Math.abs(value));
  // decpt is g_fmt's: the value is 0.<digits> x 10^decpt.
  const decpt = exponent + 1;
  if (decpt <= -4 || decpt > digits.length + 15) {
    const mantissa = digits.length > 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}` : digits;
    const power = decpt - 1;
    const powerSign = power < 0 ? '-' : '+';
    return `${sign}${mantissa}e${powerSign}${Math.abs(power).toString().padStart(2, '0')}`;
  }
  if (decpt <= 0) return `${sign}0.${'0'.repeat(-decpt)}${digits}`;
  if (decpt >= digits.length) return `${sign}${digits}${'0'.repeat(decpt - digits.length)}`;
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}

// toExponential() without an argument yields the shortest digit string that
// round-trips, which is the same set David Gay's dtoa hands g_fmt.
function shortestDigits(magnitude: number): [string, number] {
  const [mantissa, exponent] = magnitude.toExponential().split('e');
  return [(mantissa ?? '0').replace('.', ''), Number.parseInt(exponent ?? '0', 10)];
}
