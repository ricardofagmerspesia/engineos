// Seam onto `scripts/kernel.sh` — the same binary the hooks and the runtime
// call.
//
// The console's job is to show what the system will actually do. Reimplementing
// routing, precedence or enablement in TypeScript would produce a second
// resolver, and a second resolver drifts: the page would show one answer while
// the runtime took another, which is exactly the failure this whole epic is
// about. So the console asks the kernel instead of modelling it.
//
// execFile with an array argv, never a shell string: the arguments here are
// operator-supplied paths and prompts. An array argv keeps a shell out of the
// picture; it does not bound what the CLI itself makes of a value, which is
// what `assertKernelArgument` below is for.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export class KernelError extends Error {
  readonly subcommand: string;
  constructor(subcommand: string, detail: string) {
    super(`kernel ${subcommand} failed: ${detail}`);
    this.name = 'KernelError';
    this.subcommand = subcommand;
  }
}

export type KernelArgumentKind = 'path' | 'prompt';

/** A path argument long enough to exceed this is not a path in this repository. */
export const MAX_PATH_ARG_CHARS = 512;

/** Mirrors the description cap the console already enforces on its own inputs. */
export const MAX_PROMPT_ARG_CHARS = 2000;

export class KernelArgumentError extends Error {
  readonly kind: KernelArgumentKind;
  constructor(kind: KernelArgumentKind, detail: string) {
    super(`kernel ${kind} argument rejected: ${detail}`);
    this.name = 'KernelArgumentError';
    this.kind = kind;
  }
}

// U+0000-U+001F and U+007F. Written with escapes rather than literal control
// characters so the class is readable in a diff.
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

/**
 * Bounds one operator-supplied kernel argument, returning the value it
 * accepted so a caller can inline the call.
 *
 * Three refusals, each for a reason an array argv does not cover. A value over
 * the cap is unbounded work handed to every downstream read on the kernel's
 * side. A leading `-` is read by the CLI as an option rather than an operand,
 * so `--help` or an unknown flag arrives where a path was meant. A control
 * character either truncates the argument (NUL) or lands verbatim in the
 * kernel's own output and logs.
 */
export function assertKernelArgument(kind: KernelArgumentKind, value: string): string {
  const max = kind === 'path' ? MAX_PATH_ARG_CHARS : MAX_PROMPT_ARG_CHARS;

  if (value.length > max) {
    throw new KernelArgumentError(kind, `longer than ${max} characters (${value.length})`);
  }
  if (value.startsWith('-')) {
    throw new KernelArgumentError(kind, 'starts with "-", which the CLI reads as an option');
  }
  if (CONTROL_CHAR_RE.test(value)) {
    throw new KernelArgumentError(kind, 'contains a control character');
  }

  return value;
}

function runKernel(repoRoot: string, args: string[]): unknown {
  const script = path.join(repoRoot, 'scripts', 'kernel.sh');
  let raw: string;
  try {
    raw = execFileSync('bash', [script, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      // A resolver call is milliseconds. A hang means something is wrong with
      // the environment, and the page should say so rather than never answer.
      timeout: 15_000,
    });
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    // The kernel reports its own errors as {"error": "..."} on stdout, by
    // contract, so a non-zero exit still usually carries a usable message.
    const detail = (nodeErr.stdout || nodeErr.stderr || nodeErr.message || '').trim();
    throw new KernelError(args[0] ?? '(none)', detail || 'no output');
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new KernelError(args[0] ?? '(none)', `answer was not JSON: ${raw.slice(0, 200)}`);
  }
}

export interface RoutePathAnswer {
  domain: string | null;
  excluded: boolean;
  rules?: string[];
  skills?: string[];
  skills_suppressed?: Array<{ id: string; reason: string }>;
  agent?: string | null;
  risk_floor?: string | null;
}

export function routePath(repoRoot: string, filePath: string): RoutePathAnswer {
  return runKernel(repoRoot, ['route-path', assertKernelArgument('path', filePath)]) as RoutePathAnswer;
}

export interface ResolveTaskAnswer {
  task_contract?: Record<string, unknown>;
  [key: string]: unknown;
}

export function resolveTask(repoRoot: string, prompt: string): ResolveTaskAnswer {
  return runKernel(repoRoot, ['resolve-task', '--prompt', assertKernelArgument('prompt', prompt)]) as ResolveTaskAnswer;
}

export interface SkillStateAnswer {
  skills: Array<{ id: string; enabled: boolean }>;
  disabled: string[];
}

export function skillState(repoRoot: string): SkillStateAnswer {
  return runKernel(repoRoot, ['skill-state']) as SkillStateAnswer;
}
