import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enabledInFrontmatter,
  enabledSkills,
  isSkillEnabled,
  readSkillState,
  skillLookupSection,
  skillStateSection,
  suppressedSkills,
} from './skill-state';

// The frontmatter scanner and the tree walk, at the unit the awk program was.
// The CLI-level behaviour is kernel-skill-state.e2e.test.ts; what lives here are
// the spellings a shaped fixture cannot reach cheaply through a spawned process.

test('only the literal false disables', () => {
  assert.equal(enabledInFrontmatter('---\nenabled: false\n---\n'), false);
  assert.equal(enabledInFrontmatter('---\nenabled:false\n---\n'), false);
  assert.equal(enabledInFrontmatter('---\nenabled:\t \tfalse\n---\n'), false);
  // Trailing blanks are stripped, CR included, so a CRLF checkout reads the same.
  assert.equal(enabledInFrontmatter('---\r\nenabled: false  \r\n---\r\n'), false);
});

test('every other value leaves the skill enabled', () => {
  // Not a guess at what a malformed line meant: bash's `case ... in false)` fell
  // through to enabled for all of these, and inventing a disable is worse than
  // ignoring a typo.
  for (const value of ['true', 'False', 'FALSE', '"false"', 'no', '', '0']) {
    assert.equal(enabledInFrontmatter(`---\nenabled: ${value}\n---\n`), true, value);
  }
});

test('the key is read only inside the first frontmatter block', () => {
  // Below the closing fence it is documentation. A parser that scanned the whole
  // file would let a code sample in the body switch a skill off.
  assert.equal(enabledInFrontmatter('---\nname: x\n---\n\nExample:\n\nenabled: false\n'), true);
  // A file that does not OPEN with a fence has no frontmatter at all.
  assert.equal(enabledInFrontmatter('# x\n\nenabled: false\n'), true);
  assert.equal(enabledInFrontmatter('\n---\nenabled: false\n---\n'), true);
  // A second block is a second block, never a continuation of the first.
  assert.equal(enabledInFrontmatter('---\nname: x\n---\n---\nenabled: false\n---\n'), true);
});

test('an unclosed block still reads its own keys, and absence means enabled', () => {
  assert.equal(enabledInFrontmatter('---\nname: x\nenabled: false\n'), false);
  assert.equal(enabledInFrontmatter('---\nname: x\n'), true);
  assert.equal(enabledInFrontmatter(''), true);
});

test('an indented or renamed key is not the key', () => {
  assert.equal(enabledInFrontmatter('---\n  enabled: false\n---\n'), true);
  assert.equal(enabledInFrontmatter('---\nis_enabled: false\n---\n'), true);
});

test('a fence with trailing blanks still opens and closes the block', () => {
  assert.equal(enabledInFrontmatter('---  \nenabled: false\n---\n'), false);
  assert.equal(enabledInFrontmatter('---\n--- \nenabled: false\n'), true);
});

test('readSkillState walks skills/*/SKILL.md and skips everything else', (t) => {
  const root = fixtureRoot(t);
  plant(root, 'on', '---\nname: on\n---\n');
  plant(root, 'off', '---\nname: off\nenabled: false\n---\n');
  // A directory with no SKILL.md, a dotted directory, and a loose file directly
  // under skills/ are all invisible — the three shapes bash's `skills/*/` plus
  // `[ -f "$d/SKILL.md" ]` filtered out.
  mkdirSync(join(root, 'skills', 'no-manifest'), { recursive: true });
  plant(root, '.hidden', '---\nname: hidden\nenabled: false\n---\n');
  writeFileSync(join(root, 'skills', 'SKILL.md'), '---\nenabled: false\n---\n');

  const state = readSkillState(root);
  assert.deepEqual([...state.keys()].sort(), ['off', 'on']);
  assert.equal(state.get('on'), true);
  assert.equal(state.get('off'), false);
});

test('a root with no skills/ directory answers an empty state', (t) => {
  // A consumer project routing against EngineOS registries without carrying its
  // skills tree: empty is the honest answer, not an error and not "all off".
  assert.equal(readSkillState(fixtureRoot(t)).size, 0);
});

test('an absent id reads as enabled, which is not the same fact as false', (t) => {
  const root = fixtureRoot(t);
  plant(root, 'off', '---\nenabled: false\n---\n');
  const state = readSkillState(root);
  assert.equal(isSkillEnabled(state, 'never-shipped-here'), true);
  assert.equal(skillLookupSection(state, 'never-shipped-here').exists, false);
  assert.equal(skillLookupSection(state, 'off').exists, true);
});

test('the list form sorts by id and lists only the disabled ids as disabled', (t) => {
  const root = fixtureRoot(t);
  for (const id of ['zeta', 'alpha', 'mid']) plant(root, id, '---\nname: x\n---\n');
  plant(root, 'beta', '---\nenabled: false\n---\n');
  const section = skillStateSection(readSkillState(root));
  assert.deepEqual(section.skills.map((row) => row.id), ['alpha', 'beta', 'mid', 'zeta']);
  assert.deepEqual(section.disabled, ['beta']);
});

test('the partition keeps declaration order on both sides', (t) => {
  const root = fixtureRoot(t);
  plant(root, 'off', '---\nenabled: false\n---\n');
  plant(root, 'on', '---\nname: on\n---\n');
  const state = readSkillState(root);
  const declared = ['on', 'off', 'absent'];
  // Declaration order, not sorted: a routing row's skill list is ordered data,
  // and the answer publishes it as given minus what was withheld.
  assert.deepEqual(enabledSkills(declared, state), ['on', 'absent']);
  assert.deepEqual(suppressedSkills(declared, state), [{ id: 'off', reason: 'disabled' }]);
  assert.deepEqual(suppressedSkills([], state), []);
});

// ------------------------------------------------------------------ internals

function fixtureRoot(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'engineos-skill-state-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function plant(root: string, id: string, contents: string): void {
  mkdirSync(join(root, 'skills', id), { recursive: true });
  writeFileSync(join(root, 'skills', id, 'SKILL.md'), contents);
}
