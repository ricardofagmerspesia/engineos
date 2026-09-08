import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enabledInFrontmatter,
  enabledSkills,
  frontmatterReading,
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
  assert.equal(state.get('on'), 'enabled');
  assert.equal(state.get('off'), 'disabled');
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

// ------------------------------------------------- the far side of the bound

// The read is bounded at 64 KiB (HEAD_BYTES). Everything below is about the one
// question the old signature could not ask: was what we read all there was? A
// block whose closing fence lies past the bound used to read as "unclosed, key
// absent" — enabled — which is the bound failing OPEN, silently, in the one
// direction an operator cannot audit.

test('a frontmatter block that does not close inside a truncated head is unreadable', () => {
  // Same text, two verdicts, and the difference is only whether the caller knows
  // the text was cut. That is the whole fix.
  assert.equal(frontmatterReading('---\nname: x\n', false), 'enabled');
  assert.equal(frontmatterReading('---\nname: x\n', true), 'unreadable');
});

test('truncation only matters while the block is still open', () => {
  // Closed inside the head, or decided inside the head: the answer is in hand,
  // so what lies past the bound cannot change it.
  assert.equal(frontmatterReading('---\nname: x\n---\n', true), 'enabled');
  assert.equal(frontmatterReading('---\nenabled: false\n---\n', true), 'disabled');
  assert.equal(frontmatterReading('---\nenabled: false\n', true), 'disabled');
  // No opening fence: the file has no frontmatter to be unreadable, however long
  // it is. It is the block that was unreadable, never the file.
  assert.equal(frontmatterReading('# x\nenabled: false\n', true), 'enabled');
  assert.equal(frontmatterReading('', true), 'enabled');
});

test('a truncated final line is a fragment, not evidence', () => {
  // `enabled: false` straddling the last byte of the head arrives as `enabled:
  // fals`, which is not the literal `false`, which under bash's `case` means
  // enabled. Reading the fragment would put the fail-open bug back exactly at
  // the boundary it was reported at, so the fragment is dropped and the answer
  // falls through to unreadable.
  assert.equal(frontmatterReading('---\nname: x\nenabled: fals', true), 'unreadable');
  // On a complete text the same last line is a real line, and reads as one.
  assert.equal(frontmatterReading('---\nname: x\nenabled: fals', false), 'enabled');
});

test('a 70 KiB SKILL.md whose block closes past the head is withheld and says why', (t) => {
  const root = fixtureRoot(t);
  plant(root, 'x', overlongFrontmatter());
  plant(root, 'plain', '---\nname: plain\n---\n');
  const state = readSkillState(root);

  assert.equal(state.get('x'), 'unreadable');
  // Fail closed: the kernel does not hand over a skill whose switch it could not
  // see. Every public answer has to agree on that, or a consumer reading one of
  // them gets the pre-fix behaviour back.
  assert.equal(isSkillEnabled(state, 'x'), false);
  assert.deepEqual(enabledSkills(['x', 'plain'], state), ['plain']);
  assert.deepEqual(suppressedSkills(['x', 'plain'], state), [{ id: 'x', reason: 'unreadable' }]);

  const section = skillStateSection(state);
  assert.deepEqual(section.skills, [
    { id: 'plain', enabled: true },
    { id: 'x', enabled: false },
  ]);
  // Listed as disabled AND as unreadable: a consumer that knows only the bash
  // kernel's two keys still withholds it, and one that knows the third learns
  // the cause rather than a wrong reason.
  assert.deepEqual(section.disabled, ['x']);
  assert.deepEqual(section.unreadable, ['x']);
  assert.deepEqual(Object.keys(section), ['skills', 'disabled', 'unreadable']);

  assert.deepEqual(skillLookupSection(state, 'x'), { id: 'x', exists: true, enabled: false, unreadable: true });
});

test('the same size with the block closed inside the head reads normally', (t) => {
  const root = fixtureRoot(t);
  // 70 KiB of body under a three-line block. The file is far past the bound; its
  // frontmatter is not, so nothing about it is unknown.
  plant(root, 'big-off', `---\nenabled: false\n---\n${'body line\n'.repeat(7200)}`);
  plant(root, 'big-on', `---\nname: big-on\n---\n${'body line\n'.repeat(7200)}`);
  const state = readSkillState(root);

  assert.equal(state.get('big-off'), 'disabled');
  assert.equal(state.get('big-on'), 'enabled');
  assert.deepEqual(suppressedSkills(['big-off'], state), [{ id: 'big-off', reason: 'disabled' }]);
});

test('a 70 KiB file with no frontmatter fence is enabled and adds no key', (t) => {
  const root = fixtureRoot(t);
  plant(root, 'prose', `# prose\n${'not frontmatter\n'.repeat(4500)}`);
  const state = readSkillState(root);

  assert.equal(state.get('prose'), 'enabled');
  const section = skillStateSection(state);
  // Sparse on purpose: the bash kernel had no third key, so every tree without
  // an unreadable skill — the shipped one and the parity fixture included — must
  // answer the same two keys in the same order it did.
  assert.equal(section.unreadable, undefined);
  assert.deepEqual(Object.keys(section), ['skills', 'disabled']);
  assert.deepEqual(Object.keys(skillLookupSection(state, 'prose')), ['id', 'exists', 'enabled']);
  assert.deepEqual(Object.keys(skillLookupSection(state, 'absent')), ['id', 'exists', 'enabled']);
});

// ------------------------------------------------------------------ internals

// A block that opens on line 1, pads past HEAD_BYTES, and only then carries the
// deciding line and its closing fence. Built by size rather than by a line count
// so it stays overlong if the bound ever moves.
function overlongFrontmatter(): string {
  let text = '---\nname: x\n';
  while (text.length <= 70 * 1024) text += 'note: padding that keeps the block open\n';
  return `${text}enabled: false\n---\n`;
}

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
