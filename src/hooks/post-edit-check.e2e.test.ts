// End-to-end port of hooks/test-post-edit.sh: the REAL per-edit gate driven
// through `engineos hook post-edit-check` over npm-only fixture packages (no
// pnpm-lock.yaml / yarn.lock, no nx.json), with the assertions the bash suite
// made — the process exit code, and silence where the hook must be a no-op.
//
// The hook is PostToolUse(Edit|Write) and is NOT wired by default
// (src/hooks/post-edit-check.ts header); this suite drives it directly, which is
// the only way it runs at all.
//
// src/hooks/post-edit-check.test.ts covers the same ladder in process with an
// injected spawner — every runner and linter permutation without a toolchain.
// This file is the other half: a real spawned CLI, real npm, real npx, real
// exit codes, so the two are deliberately not the same assertions.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { envelope, fixtureRepo, runCli, tempRoot, type RunResult } from '../testing/harness';

// Isolate from the operator's bypass switches: a machine-wide pause must never
// make this suite go quiet and report green (bash suite, lines 8-9). The
// harness env allowlist already strips a stray ENGINEOS_BYPASS, which is the
// other half of the bash suite's `unset`.
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// ------------------------------------------------------------------ helpers

function hasTool(command: string): boolean {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

// The bash suite refused to run at all without npm; a node:test suite says so
// per case instead of aborting the whole run. git joins it because every
// fixture here is a git-initialised repo.
function skipWithoutTooling(t: TestContext): boolean {
  if (!hasTool('git')) {
    t.skip('git is not installed');
    return true;
  }
  if (!hasTool('npm')) {
    t.skip('npm is not installed');
    return true;
  }
  return false;
}

// bash `invoke`: one PostToolUse payload naming the edited file on stdin, the
// hook's exit code and output back. The bash suite folded stderr into stdout
// with `2>&1`; the two stay separate here and the silence cases assert both.
function invoke(repo: string, file: string): RunResult {
  const stdin = envelope({
    event: 'PostToolUse',
    cwd: repo,
    sid: 'postedit',
    tool: { name: 'Edit', input: { file_path: file } },
  });
  return runCli(['hook', 'post-edit-check'], { stdin, env: ISOLATED, cwd: repo });
}

// ------------------------------------------------------------------ the cases

// A config file existing with no matching binary reachable is a tooling gap,
// not a code defect; the hook must skip lint silently rather than exit 2. Real
// `npx --no-install eslint --version` in a package with no node_modules is the
// probe failing exactly the way an absent linter makes it fail.
test('caseA lint-not-installed: expected exit 0', (t) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: { name: 'pkg' },
    files: { '.eslintrc.js': 'module.exports = {};\n', 'src/x.ts': 'export const x = 1;\n' },
  });
  const result = invoke(repo, join(repo, 'src', 'x.ts'));
  assert.equal(result.status, 0, `expected exit 0 (stdout: ${result.stdout} stderr: ${result.stderr})`);
});

// The one red verdict this hook reports: a declared typecheck script that
// exits non-zero blocks the edit with exit 2 (`fail`).
test('caseB failing-typecheck: expected exit 2', (t) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: { scripts: { typecheck: 'exit 1' } },
    files: { 'src/x.ts': 'export const x = 1;\n' },
  });
  const result = invoke(repo, join(repo, 'src', 'x.ts'));
  assert.equal(result.status, 2, `expected exit 2 (stdout: ${result.stdout} stderr: ${result.stderr})`);
});

// Same failing package as case B: what makes this silent is the extension, so
// a hook that stopped filtering would go red here instead of saying nothing.
test('caseC non-js-file: expected silent exit 0', (t) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), {
    pkg: { scripts: { typecheck: 'exit 1' } },
    files: { 'src/notes.md': '# notes\n' },
  });
  const result = invoke(repo, join(repo, 'src', 'notes.md'));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

// No package.json (and no project.json) anywhere up-tree: nothing owns the
// file, so there is no scoped run to issue.
test('caseD no-package-json: expected silent exit 0', (t) => {
  if (skipWithoutTooling(t)) return;
  const repo = fixtureRepo(tempRoot(t), { files: { 'src/x.ts': 'export const x = 1;\n' } });
  const result = invoke(repo, join(repo, 'src', 'x.ts'));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
