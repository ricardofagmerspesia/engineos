// Shared plumbing for the 50-kernel family (C17*, C18*).
//
// The behavioural checks of this family used to run `bash scripts/kernel.sh
// <arm> ...` and pipe the answer through jq. scripts/kernel.sh is now a shim
// over the same TypeScript entry point this validator is built from, so the
// checks call the entry point directly: no subprocess, no jq, and a malformed
// answer is a parse failure here rather than an empty shell variable three
// pipes downstream.
import { join } from 'node:path';
import { memoryIo } from '../io';
import { runKernel } from '../kernel/cli';
import { isRecord, KernelError, readJsonFile } from '../lib/json';
import { finding, result, type CheckResult } from './findings';
import type { CheckId } from './ids';
import type { CheckContext } from './lib';
import { executableBit, type ExecutableBit } from './runtime-surface-fs';

// The bash preconditions named scripts/kernel.sh alongside the registries. It is
// dropped from both lists on purpose: nothing here executes the shim any more,
// and a precondition on a file the check never opens is a guard that cannot
// fail for the reason it claims. The shim's own existence and mode are C29/C30's.
export const KERNEL_INPUTS: readonly string[] = ['registries/routing.json'];

export const ROUTER_INPUTS: readonly string[] = [
  'registries/intents.json',
  'registries/capabilities.json',
  'registries/policy.json',
  'registries/models.json',
];

export const KERNEL_TOKEN = 'kernel';
export const ROUTER_TOKEN = 'router';
export const ROUTER_AGENT_TOKEN = 'router-agent';

export const ROUTER_MD = 'agents/router.md';

export function missingInputs(ctx: CheckContext, paths: readonly string[]): boolean {
  return paths.some((path) => !ctx.exists(path));
}

// A registry the typed loader refuses is not a finding this family can name: the
// bash pipeline answered a malformed registry with an empty jq result and then
// reported nothing at all, which is a fail-open. The harness code says the input
// could not be read, and `result` still grades it a FAIL.
export function preconditionResult(check: CheckId, title: string, path: string): CheckResult {
  return result(check, title, [finding(check, 'precondition-missing', path)]);
}

// Only a KernelError means "this registry does not parse or does not conform".
// Anything else is a defect in the loader and must not be swallowed into a
// finding that blames the tree.
export function loadedOr<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (e) {
    if (e instanceof KernelError) return undefined;
    throw e;
  }
}

// The raw document, for the assertions a strict loader erases: a field's
// ABSENCE (the loader throws for the whole registry) and a field's WRONG TYPE
// (the loader coerces it to the default). C17e and C18d assert exactly those.
export function rawJson(ctx: CheckContext, relativePath: string): Record<string, unknown> | undefined {
  const parsed = loadedOr(() => readJsonFile(join(ctx.root, relativePath)));
  return isRecord(parsed) ? parsed : undefined;
}

export function subRecord(row: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = row?.[key];
  return isRecord(value) ? value : undefined;
}

export function rows(row: Record<string, unknown> | undefined, key: string): Record<string, unknown>[] {
  const value = row?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

// One kernel call, answered as the parsed JSON object it printed. `undefined`
// covers every way the bash pipeline produced an empty variable — non-zero exit,
// an `{"error": ...}` document, unparseable output — so each caller keeps the
// bash comparison against a value that cannot match.
export function kernelAnswer(ctx: CheckContext, argv: readonly string[]): Record<string, unknown> | undefined {
  const io = memoryIo({ env: { ENGINEOS_ROOT: ctx.root }, cwd: ctx.root });
  let code: number;
  try {
    code = runKernel([...argv], io);
  } catch {
    // A check reports; it never takes the validator run down with it.
    return undefined;
  }
  if (code !== 0) return undefined;
  const parsed = parseOr(io.stdout.join(''));
  return isRecord(parsed) ? parsed : undefined;
}

export function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

// The `[ -x FILE ]` of the shell, without asking who is asking: the bit matters
// because a consumer executes the shim by path. One reader for the whole
// validator, so the tri-state (`null` where the filesystem cannot answer) is
// decided in exactly one place.
export function isExecutable(ctx: CheckContext, relativePath: string): ExecutableBit {
  return executableBit(ctx.root, relativePath);
}

// Sorted and de-duplicated, which is what every jq `unique` in the bash family
// produced, so a finding list does not depend on registry row order.
export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

// jq's `sort`, which is NOT `unique`: a fixture that declares the same reason
// twice must still compare unequal to an answer that declares it once.
export function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function parseOr(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
