// C32 and C33: adapter-mirror parity and the LF end-of-line policy.
//
// C33's cases run on a copy of the checkout, the way every other family's do.
// C32's cases run on a purpose-built three-directory fixture instead, and that
// is deliberate: this checkout's mirrors are currently DRIFTED — .agents/skills
// carries 147 files and each mirror 47, since the mattpocock skills were added
// to the base only — so the checkout is not a clean baseline for a parity
// check. Asserting the drift here would pin a defect the check exists to
// report, and the assertion would fail the moment the mirrors are synced.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { tempRoot } from '../testing/harness';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { C32_FINDINGS, C33_FINDINGS, PORTABILITY_CHECKS } from './portability';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding, writeFile } from './testing';

const BASE = '.agents/skills';
const TRAE = '.trae/skills';
const WINDSURF = '.windsurf/skills';
const produced = new Set<string>();

function run(root: string, id: CheckId): Finding[] {
  const found = findingsOf(PORTABILITY_CHECKS, id, contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

// Two skills, two files each, in all three trees. Small on purpose: a parity
// finding is about one path, and 147 identical files would only slow the case
// down without asserting anything more.
function mirrorFixture(t: TestContext, mutate?: (root: string) => void): string {
  const root = join(tempRoot(t), 'tree');
  for (const dir of [BASE, TRAE, WINDSURF]) {
    writeFile(root, `${dir}/alpha/SKILL.md`, 'alpha skill\n');
    writeFile(root, `${dir}/alpha/references/notes.md`, 'alpha notes\n');
    writeFile(root, `${dir}/beta/SKILL.md`, 'beta skill\n');
  }
  if (mutate !== undefined) mutate(root);
  return root;
}

function remove(root: string, path: string): void {
  rmSync(join(root, path), { recursive: true, force: true });
}

function toCrlf(text: string): string {
  return text.split('\r\n').join('\n').split('\n').join('\r\n');
}

// ------------------------------------------------------------------------ C32

test('C32 is clean when both mirrors match the base byte for byte', (t: TestContext) => {
  assert.deepEqual(run(mirrorFixture(t), 'C32'), []);
});

test('a mirror file whose bytes differ from the base is caught', (t: TestContext) => {
  const root = mirrorFixture(t, (copy) => editFile(copy, `${TRAE}/alpha/SKILL.md`, () => 'edited\n'));
  assert.deepEqual(run(root, 'C32'), [{ code: 'file-diverged', subject: `${TRAE}/alpha/SKILL.md` }]);
});

test('a base file absent from one mirror is caught', (t: TestContext) => {
  const root = mirrorFixture(t, (copy) => remove(copy, `${WINDSURF}/alpha/references/notes.md`));
  assert.deepEqual(run(root, 'C32'), [
    { code: 'file-missing-in-mirror', subject: `${WINDSURF}/alpha/references/notes.md` },
  ]);
});

test('a file a mirror carries and the base does not is caught', (t: TestContext) => {
  const root = mirrorFixture(t, (copy) => writeFile(copy, `${TRAE}/gamma/SKILL.md`, 'gamma\n'));
  assert.deepEqual(run(root, 'C32'), [{ code: 'file-only-in-mirror', subject: `${TRAE}/gamma/SKILL.md` }]);
});

test('a mirror directory that is gone is reported once, not once per file', (t: TestContext) => {
  const root = mirrorFixture(t, (copy) => remove(copy, TRAE));
  assert.deepEqual(run(root, 'C32'), [{ code: 'mirror-missing', subject: TRAE }]);
});

test('C32 reports a pending artifact when the base is absent', (t: TestContext) => {
  const root = mirrorFixture(t, (copy) => remove(copy, BASE));
  assert.deepEqual(run(root, 'C32'), [{ code: 'artifact-pending', subject: BASE }]);
});

// ------------------------------------------------------------------------ C33

test('C33 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C33'), []);
});

test('a rule file rewritten with CRLF is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editFile(copy, 'rules/base.md', toCrlf));
  assert.deepEqual(run(root, 'C33'), [{ code: 'crlf', subject: 'rules/base.md' }]);
});

test('install.ps1 carrying CRLF is the exception .gitattributes declares, not a finding', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => editFile(copy, 'install.ps1', toCrlf));
  assert.deepEqual(run(root, 'C33'), []);
});

test('a CRLF file under node_modules is outside the policy', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => writeFile(copy, 'node_modules/vendored/index.ts', 'const a = 1;\r\n'));
  assert.deepEqual(run(root, 'C33'), []);
});

// ------------------------------------------------------------------- coverage

test('every code these checks declare is produced by a case above', () => {
  const declared = [...C32_FINDINGS, ...C33_FINDINGS];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
});
