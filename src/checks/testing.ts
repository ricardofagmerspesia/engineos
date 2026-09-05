// Test-only helpers for the check families. Never bundled: nothing under
// src/cli.ts imports this file.
//
// The bash self-test tar-copied the whole checkout per case and planted one
// breakage in the copy; the families keep that shape so a mutation can never
// touch the real tree, and so a check reads exactly what the validator reads.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import type { CheckId } from './ids';
import type { Check } from './index';
import type { CheckResult, Finding } from './findings';
import { makeContext, type CheckContext } from './lib';

const EXCLUDED_TOP_LEVEL = new Set(['.git', 'node_modules', 'build']);

// build/checks/testing.js -> the checkout root; tests always run from build/.
export function checkoutRoot(): string {
  return resolve(__dirname, '..', '..');
}

// A private copy of the checkout (minus .git, node_modules and build) under a
// per-test temp root, with `mutate` applied to the COPY. Returns the copy's root.
export function checkoutCopy(t: TestContext, mutate?: (root: string) => void): string {
  const root = join(tempRoot(t), 'tree');
  const source = checkoutRoot();
  cpSync(source, root, {
    recursive: true,
    filter: (path: string): boolean => {
      const relative = path.slice(source.length + 1);
      const top = relative.split('/')[0] ?? '';
      return !EXCLUDED_TOP_LEVEL.has(top);
    },
  });
  if (mutate !== undefined) mutate(root);
  return root;
}

export function contextFor(root: string): CheckContext {
  return makeContext(root, memoryIo({ env: { ENGINEOS_ROOT: root }, cwd: root }));
}

export function runCheckById(checks: readonly Check[], id: CheckId, ctx: CheckContext): CheckResult[] {
  const check = checks.find((candidate) => candidate.id === id);
  if (check === undefined) throw new Error(`no check registered for ${id}`);
  return check.run(ctx);
}

export function findingsOf(checks: readonly Check[], id: CheckId, ctx: CheckContext): Finding[] {
  return runCheckById(checks, id, ctx).flatMap((checkResult) => [...checkResult.findings]);
}

export function hasFinding(findings: readonly Finding[], code: string, subject?: string): boolean {
  return findings.some((f) => f.code === code && (subject === undefined || f.subject === subject));
}

// The sed -i of the bash cases: rewrite one file under root through `edit`.
export function editFile(root: string, relativePath: string, edit: (text: string) => string): void {
  const target = join(root, relativePath);
  writeFileSync(target, edit(readFileSync(target, 'utf8')));
}

export function writeFile(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
