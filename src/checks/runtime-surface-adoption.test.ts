// C28, C29 and C30: the retrieval-metrics pair, the adoption entrypoints and
// the hook file modes. The bash registered C28's and C29's cases behind an
// `if [ -f ... ]` guard because their artifacts land on another branch of the
// stack; here both branches are tested — the cases on the tree that carries the
// artifact, and the skip shape on a tree that does not.
import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { C28_FINDINGS, C29_FINDINGS, C30_FINDINGS, RUNTIME_SURFACE_CHECKS } from './runtime-surface';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';

const LLM_RULES = 'rules/llm-apps.md';
const REFERENCE = 'skills/eval-harness/references/retrieval-metrics.md';
const EVAL_SKILL = 'skills/eval-harness/SKILL.md';
const INSTALLER = 'install.sh';
const produced = new Set<string>();

function run(root: string, id: CheckId): Finding[] {
  const found = findingsOf(RUNTIME_SURFACE_CHECKS, id, contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

function rewrite(root: string, path: string, needle: string, replacement: string): void {
  editFile(root, path, (text) => {
    if (!text.includes(needle)) throw new Error(`${path} no longer contains: ${needle}`);
    return text.split(needle).join(replacement);
  });
}

function remove(root: string, path: string): void {
  rmSync(join(root, path), { recursive: true, force: true });
}

// ------------------------------------------------------------------------ C28

test('C28 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C28'), []);
});

test('C28 reports a pending artifact when the reference directory is absent', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'skills/eval-harness/references'));
  assert.deepEqual(run(root, 'C28'), [{ code: 'artifact-pending', subject: 'skills/eval-harness/references' }]);
});

test('the RAG section deleted from rules/llm-apps.md is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, LLM_RULES, (text) => text.replace(/^## RAG\n[\s\S]*?(?=^## )/m, ''));
  });
  assert.ok(hasFinding(run(root, 'C28'), 'rag-section-missing', '## RAG'));
});

test('a metric name dropped from the RAG section is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, LLM_RULES, ' and **MRR**', ''));
  assert.ok(hasFinding(run(root, 'C28'), 'rag-section-does-not-name', 'MRR'));
});

test('the retrieval-metrics reference deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, REFERENCE));
  assert.ok(hasFinding(run(root, 'C28'), 'reference-missing', REFERENCE));
});

test('a metric the reference no longer defines is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, REFERENCE, 'Recall@K', 'Hit@K'));
  assert.ok(hasFinding(run(root, 'C28'), 'reference-does-not-define', 'Recall@K'));
});

test('the eval-harness skill deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, EVAL_SKILL));
  assert.ok(hasFinding(run(root, 'C28'), 'skill-missing', EVAL_SKILL));
});

test('the eval-harness skill no longer linking the reference is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, EVAL_SKILL, 'references/retrieval-metrics.md', 'references/metrics.md'));
  assert.ok(hasFinding(run(root, 'C28'), 'skill-does-not-link-the-reference', EVAL_SKILL));
});

test('rules/llm-apps.md deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, LLM_RULES));
  assert.ok(hasFinding(run(root, 'C28'), 'rule-missing', LLM_RULES));
});

// ------------------------------------------------------------------------ C29

test('C29 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C29'), []);
});

test('C29 reports a pending artifact when init-project.sh is absent', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'scripts/init-project.sh'));
  assert.deepEqual(run(root, 'C29'), [{ code: 'artifact-pending', subject: 'scripts/init-project.sh' }]);
});

test('init-project.sh losing its exec bit is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => chmodSync(join(copy, 'scripts/init-project.sh'), 0o644));
  assert.ok(hasFinding(run(root, 'C29'), 'init-script-not-executable', 'scripts/init-project.sh'));
});

test('ensure-project-layout no longer importing the scaffolder is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, 'src/hooks/ensure-project-layout.ts', "from './scaffold'", "from './layout'"));
  assert.ok(hasFinding(run(root, 'C29'), 'hook-does-not-import-the-scaffolder', 'src/hooks/ensure-project-layout.ts'));
});

test('engineos init no longer importing the scaffolder is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, 'src/init/project.ts', "from '../hooks/scaffold'", "from '../hooks/layout'"));
  assert.ok(hasFinding(run(root, 'C29'), 'init-does-not-import-the-scaffolder', 'src/init/project.ts'));
});

test('docs/ADOPTION.md losing the /engineos:init command is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, 'docs/ADOPTION.md', '/engineos:init', '/engineos:setup'));
  assert.ok(hasFinding(run(root, 'C29'), 'adoption-doc-does-not-name-the-command', 'docs/ADOPTION.md'));
});

test('commands/init.md no longer naming init-project.sh is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, 'commands/init.md', 'scripts/init-project.sh', 'scripts/setup-project.sh'));
  assert.ok(hasFinding(run(root, 'C29'), 'command-does-not-name-the-script', 'commands/init.md'));
});

test('commands/init.md deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'commands/init.md'));
  assert.ok(hasFinding(run(root, 'C29'), 'command-missing', 'commands/init.md'));
});

test('the scaffolder module deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'src/hooks/scaffold.ts'));
  assert.ok(hasFinding(run(root, 'C29'), 'scaffolder-missing', 'src/hooks/scaffold.ts'));
});

test('docs/ADOPTION.md deleted is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'docs/ADOPTION.md'));
  assert.ok(hasFinding(run(root, 'C29'), 'adoption-doc-missing', 'docs/ADOPTION.md'));
});

// ------------------------------------------------------------------------ C30

test('C30 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C30'), []);
});

test('C30 reports the shared precondition once when install.sh is absent', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, INSTALLER));
  assert.deepEqual(run(root, 'C30'), [{ code: 'precondition-missing', subject: 'hook-modes' }]);
});

test('a hook entry point losing its exec bit is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => chmodSync(join(copy, 'hooks/prompt-advisor.sh'), 0o644));
  assert.ok(hasFinding(run(root, 'C30'), 'hook-entry-point-is-not-executable', 'prompt-advisor.sh'));
});

test('a sourced-only library carrying the exec bit is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => chmodSync(join(copy, 'hooks/lib-common.sh'), 0o755));
  assert.ok(hasFinding(run(root, 'C30'), 'library-carries-the-executable-bit', 'lib-common.sh'));
});

test("a library dropped from install.sh's list is caught", (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, INSTALLER, ' lib-runner.sh', ''));
  assert.ok(hasFinding(run(root, 'C30'), 'introduces-itself-as-a-library-but-is-not-listed', 'lib-runner.sh'));
});

test("install.sh going back to deciding executability from a file's own header is caught", (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, INSTALLER, (text) => text.split('\n').map((line) =>
      line.includes('case " $ENGINEOS_HOOK_LIBRARIES "')
        ? '  head -8 "$_hook" | grep -q \'Sourced only\' && continue'
        : line).join('\n'));
  });
  assert.ok(hasFinding(run(root, 'C30'), 'install-decides-executability-from-file-text', INSTALLER));
});

test('the hook library list removed from install.sh is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => {
    editFile(copy, INSTALLER, (text) =>
      text.split('\n').filter((line) => !line.startsWith('ENGINEOS_HOOK_LIBRARIES=')).join('\n'));
  });
  assert.deepEqual(run(root, 'C30'), [{ code: 'library-list-unreadable', subject: INSTALLER }]);
});

test('a listed library that does not exist is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => remove(copy, 'hooks/lib-runner.sh'));
  assert.ok(hasFinding(run(root, 'C30'), 'listed-library-does-not-exist', 'lib-runner.sh'));
});

test('a listed library that no longer introduces itself as one is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => rewrite(copy, 'hooks/lib-common.sh', 'Sourced only', 'Loaded only'));
  assert.ok(hasFinding(run(root, 'C30'), 'listed-library-does-not-introduce-itself-as-one', 'lib-common.sh'));
});

// ------------------------------------------------------------------- coverage

test('every code these checks declare is produced by a case above', () => {
  const declared = [...C28_FINDINGS, ...C29_FINDINGS, ...C30_FINDINGS];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
});
