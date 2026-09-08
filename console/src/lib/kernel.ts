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
// operator-supplied paths and prompts.

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
  return runKernel(repoRoot, ['route-path', filePath]) as RoutePathAnswer;
}

export interface ResolveTaskAnswer {
  task_contract?: Record<string, unknown>;
  [key: string]: unknown;
}

export function resolveTask(repoRoot: string, prompt: string): ResolveTaskAnswer {
  return runKernel(repoRoot, ['resolve-task', '--prompt', prompt]) as ResolveTaskAnswer;
}

export interface SkillStateAnswer {
  skills: Array<{ id: string; enabled: boolean }>;
  disabled: string[];
}

export function skillState(repoRoot: string): SkillStateAnswer {
  return runKernel(repoRoot, ['skill-state']) as SkillStateAnswer;
}
