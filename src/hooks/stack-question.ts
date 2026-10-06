// The stack-first question (design 2026-10-06 §C2): the one note SessionStart and
// UserPromptSubmit inject when a repo has declared no stack, and the shared test
// for when it applies. Advisory only — it never blocks a write, because a
// throwaway script in an empty directory is legitimate work too.
//
// Both hooks import from here so the note is one string, not two copies that
// drift, and so "which directory is the project" is answered the same way.
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { spawnSync } from 'node:child_process';
import { hasStackSignal, type StackDeps } from '../kernel/stack';
import { repoRoot } from '../lib/git';

export const STACK_QUESTION_NOTE =
  '[engineos] no stack declared — this repo has no .engineos/config.json and no package manifest. ' +
  'Before writing any code, your FIRST reply must ask the developer which stack to use for each tier ' +
  'the work touches (backend, frontend, mobile, LLM/agent runtime) — never pick one yourself ' +
  '(rules/base.md "New projects — stack first"). Persist the answer with ' +
  '`engineos init --stack <framework>[@dir],...` and record it as the project\'s first ADR.';

/** Intents whose work depends on a language/framework choice. */
export const STACK_DEPENDENT_INTENTS: readonly string[] = [
  'new-feature', 'backend', 'backend-python', 'frontend', 'mobile', 'llm', 'agent-system',
];

export interface StackQuestionOptions {
  home?: string;
  deps?: StackDeps;
}

// True when the stack question must be asked for a session opened at `cwd`
// whose project directory is `root` (the git root, or cwd outside a repo).
// The home directory is never checked: a session started there is not a
// project, and walking it would read the developer's whole home tree.
export function needsStackQuestion(cwd: string, root: string, opts: StackQuestionOptions = {}): boolean {
  if (cwd === '' || root === '') return false;
  const home = opts.home ?? homedir();
  if (samePath(cwd, home) || samePath(root, home)) return false;
  return !hasStackSignal(root, opts.deps);
}

// UserPromptSubmit's form: the root is resolved here, and only after the intent
// test, so a prompt that does not depend on a stack never spawns git for it.
export function promptNeedsStackQuestion(
  intents: readonly string[],
  cwd: string,
  spawn: typeof spawnSync,
  opts: StackQuestionOptions = {},
): boolean {
  if (cwd === '' || !intents.some((intent) => STACK_DEPENDENT_INTENTS.includes(intent))) return false;
  return needsStackQuestion(cwd, repoRoot(cwd, spawn) ?? cwd, opts);
}

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}
