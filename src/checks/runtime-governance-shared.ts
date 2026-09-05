// Shared vocabulary for the runtime-governance family (scripts/checks/70-runtime.sh
// lines 1-832): the preconditions three sub-families share, the raw policy reads
// the well-formedness checks need, and the in-process kernel and telemetry
// canaries that replace the bash `bash "$KSH" ...` subprocesses.
//
// Why these checks read registries/policy.json RAW rather than through
// ctx.registries.policy: the typed loader is fail-closed by design and throws a
// KernelError on exactly the malformations C20a/C22a/C24a/C25a/C26a exist to
// report. Reading through it would turn every named finding into an unhandled
// throw, so the well-formedness half reads the document the way jq did and the
// consumers (canaries, mirrors) go through the typed path.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { runKernel } from '../kernel/cli';
import { runTelemetry } from '../journal/telemetry-cli';
import { isRecord } from '../lib/json';
import type { CheckResult } from './findings';
import type { CheckId } from './ids';
import { skipOnce, type CheckContext } from './lib';

export const POLICY_JSON = 'registries/policy.json';
export const ROUTING_JSON = 'registries/routing.json';

// The bash guards read `[ -f "$PJ" ] && [ -x "$KSH" ]`. The kernel half is gone
// on purpose: the canaries below call the kernel in this process, so the mode of
// scripts/kernel.sh — a shim over dist/engineos.cjs — is no longer an input to
// any check in this family, and gating on it would be a guard that can fail
// while the real input is present. The skip_once TOKEN is unchanged, so a
// missing policy.json is still one FAIL per sub-family rather than one per check.
export function requirePolicy(
  ctx: CheckContext,
  check: CheckId,
  title: string,
  token: string,
): CheckResult[] | undefined {
  if (ctx.exists(POLICY_JSON)) return undefined;
  return skipOnce(ctx, check, title, token);
}

export function requireRouting(
  ctx: CheckContext,
  check: CheckId,
  title: string,
  token: string,
): CheckResult[] | undefined {
  if (ctx.exists(ROUTING_JSON)) return undefined;
  return skipOnce(ctx, check, title, token);
}

// An unreadable or non-object policy.json answers {} so every field below reads
// as absent — the same shape jq produced when its filters found nothing.
export function policyDocument(ctx: CheckContext): Record<string, unknown> {
  const parsed = parseJson(ctx.readText(POLICY_JSON) ?? '');
  return isRecord(parsed) ? parsed : {};
}

export function child(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

export function arrayOf(record: Record<string, unknown> | undefined, key: string): unknown[] | undefined {
  const value = record?.[key];
  return Array.isArray(value) ? value : undefined;
}

export function stringsOf(record: Record<string, unknown> | undefined, key: string): string[] {
  return (arrayOf(record, key) ?? []).filter((item): item is string => typeof item === 'string');
}

// `jq -r` of one value, which is what every numeric guard in this family compared
// against a digit class. It is the reason a JSON string "3" reads as 3 here: the
// assertion the bash made — and the verdict it printed — is "reads as a whole
// number", never "is a JSON number".
export function jqText(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

const DIGITS = /^[0-9]+$/;

export function wholeNumber(value: unknown): number | undefined {
  const text = jqText(value);
  return DIGITS.test(text) ? Number.parseInt(text, 10) : undefined;
}

// A bound that must read as a whole number >= 1 before a downstream check may
// consume it: the bash `repair_bound` / `backpressure_maxq` / `breaker_threshold`
// helpers, which print nothing on exactly the condition their own C*a fails on so
// a condemned value can never silently reach the checks below.
export function usableBound(value: unknown, minimum: number): number | undefined {
  const parsed = wholeNumber(value);
  if (parsed === undefined || parsed < minimum) return undefined;
  return parsed;
}

// ------------------------------------------------------------------- canaries

// The bash ran `bash scripts/kernel.sh <arm> ... | jq -r '...'` and read an empty
// answer on any failure. In process, a KernelError is already rendered as
// {"error": ...} on stdout, so a caller reading a field it does not carry gets
// the same "none" the bash got.
export function kernelAnswer(ctx: CheckContext, argv: readonly string[]): Record<string, unknown> {
  const io = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  try {
    runKernel([...argv], io);
  } catch {
    // Only a non-KernelError escapes runKernel. The bash canary saw that as an
    // empty answer too; a validator must report it, never die of it.
    return {};
  }
  const parsed = parseJson(io.stdout.join(''));
  return isRecord(parsed) ? parsed : {};
}

// `jq -r '.<key> // empty'`: a string field, or '' when the arm answered an error.
export function answerText(answer: Record<string, unknown>, key: string): string {
  const value = answer[key];
  return typeof value === 'string' ? value : '';
}

export function answerStrings(answer: Record<string, unknown>, key: string): string[] {
  const value = answer[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

// scripts/telemetry.sh, in process. True means exit 0, which is the only thing
// the C22b canary reads from it.
export function telemetryRun(ctx: CheckContext, argv: readonly string[]): boolean {
  const io = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  try {
    return runTelemetry([...argv], io) === 0;
  } catch {
    return false;
  }
}

// The bash canary's mktemp. Outside the checkout, removed on every path, so a
// canary that throws cannot leave a file behind.
export function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-check-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- text greps

export function fileHas(ctx: CheckContext, path: string, needle: string): boolean {
  return (ctx.readText(path) ?? '').includes(needle);
}

export function fileMatches(ctx: CheckContext, path: string, pattern: RegExp): boolean {
  return pattern.test(ctx.readText(path) ?? '');
}

// `grep -F <needle> <file> | grep -E <pattern>`: the second grep sees only the
// lines the first matched, which is what makes "the event call references prompt
// text" a claim about the call site rather than about the file.
export function linesWith(ctx: CheckContext, path: string, needle: string): string[] {
  return (ctx.readText(path) ?? '').split('\n').filter((line) => line.includes(needle));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// `jq -r '.<field> // ""'`: a string field, or '' for absent, null, or any
// non-string. Several C26 assertions read a registry scalar this way and treat
// emptiness as unusable rather than as a value.
export function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
