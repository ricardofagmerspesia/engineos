// Behavioural tests for the base-revision guard: the thing standing between an
// operator's draft and someone else's work on the same file.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PathEscapesRootError } from '../contained-path.js';
import { parseMarkdownWithFrontmatter } from './frontmatter.js';
import { detectBaseConflicts, hashSource, parseSkills, writeSkills, SkillWriteError } from './skills.js';
import type { SkillEntity } from './types.js';

function fixtureTree(skillBodies: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'engineos-skills-'));
  for (const [id, content] of Object.entries(skillBodies)) {
    mkdirSync(path.join(root, 'skills', id), { recursive: true });
    writeFileSync(path.join(root, 'skills', id, 'SKILL.md'), content, 'utf8');
  }
  return root;
}

const SKILL = (description: string) => `---\nname: demo\ndescription: ${description}\n---\n\nbody\n`;

test('parseSkills records the source hash as the draft base', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [skill] = parseSkills(root);
    assert.ok(skill);
    assert.equal(skill.baseHash, hashSource(SKILL('first')));
    assert.deepEqual(detectBaseConflicts(root, [skill]), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file edited after the draft was captured is a conflict, not a silent overwrite', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [skill] = parseSkills(root);
    assert.ok(skill);

    // Someone else edits the same file — by hand, by another console, by git.
    writeFileSync(path.join(root, 'skills', 'demo', 'SKILL.md'), SKILL('edited by someone else'), 'utf8');

    const conflicts = detectBaseConflicts(root, [skill]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.reason, 'changed');
    assert.equal(conflicts[0]?.entityId, 'demo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a draft with no recorded base is refused rather than trusted', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [parsed] = parseSkills(root);
    assert.ok(parsed);
    const legacy: SkillEntity = { ...parsed, baseHash: undefined };

    const conflicts = detectBaseConflicts(root, [legacy]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.reason, 'unknown-base');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a source file that disappeared is reported as missing, not as a write target', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  const [skill] = parseSkills(root);
  assert.ok(skill);
  rmSync(path.join(root, 'skills', 'demo', 'SKILL.md'), { force: true });
  try {
    const conflicts = detectBaseConflicts(root, [skill]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.reason, 'missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeSkills refuses on a stale base even when the caller skipped the pre-check', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [skill] = parseSkills(root);
    assert.ok(skill);
    const edited: SkillEntity = { ...skill, description: 'my unpublished edit' };

    writeFileSync(path.join(root, 'skills', 'demo', 'SKILL.md'), SKILL('someone else got there first'), 'utf8');

    assert.throws(() => writeSkills(root, [edited]), SkillWriteError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unchanged file lets the edit through and preserves every untouched line', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [skill] = parseSkills(root);
    assert.ok(skill);
    const edited: SkillEntity = { ...skill, description: 'my edit' };

    const changes = writeSkills(root, [edited]);
    assert.equal(changes.length, 1);
    assert.match(changes[0]!.after, /description: my edit/);
    assert.match(changes[0]!.after, /name: demo/);
    assert.match(changes[0]!.after, /\nbody\n$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Descriptions a plain frontmatter line cannot carry. `frontmatter.ts` reads
// some of them back correctly by accident, so the reader is not the check being
// made here: the block is YAML by declaration, and publishing a line a YAML
// parser rejects hands every other consumer of the file a broken skill.
const YAML_HOSTILE_DESCRIPTIONS: Array<[string, string]> = [
  ['a mapping separator', 'Use when: the operator asks for it'],
  ['an inline comment marker', 'Use for review #not for publishing'],
  ['a leading comment marker', '#review, then publish'],
  ['a leading sequence marker', '- review, then publish'],
];

function publishOne(root: string, description: string): string {
  const [skill] = parseSkills(root);
  assert.ok(skill);
  const changes = writeSkills(root, [{ ...skill, description }]);
  assert.equal(changes.length, 1);
  return changes[0]!.after;
}

function frontmatterLine(after: string, key: string): string | undefined {
  return after.split('\n').find((line) => line.startsWith(`${key}:`));
}

for (const [label, description] of YAML_HOSTILE_DESCRIPTIONS) {
  test(`a description carrying ${label} is published quoted and reads back intact`, () => {
    const root = fixtureTree({ demo: SKILL('first') });
    try {
      const after = publishOne(root, description);
      assert.equal(frontmatterLine(after, 'description'), `description: ${JSON.stringify(description)}`);
      assert.equal(parseMarkdownWithFrontmatter(after).data.description, description);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('a description needing no quoting is still written bare, so diffs stay minimal', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const after = publishOne(root, 'Review the changes since a fixed point');
    assert.equal(frontmatterLine(after, 'description'), 'description: Review the changes since a fixed point');
    assert.equal(
      parseMarkdownWithFrontmatter(after).data.description,
      'Review the changes since a fixed point',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a sourcePath pointing out of the base is refused before any file is read', () => {
  const root = fixtureTree({ demo: SKILL('first') });
  try {
    const [skill] = parseSkills(root);
    assert.ok(skill);
    const escaping: SkillEntity = {
      ...skill,
      sourcePaths: ['../outside/SKILL.md'],
      description: 'my edit',
    };

    assert.throws(() => writeSkills(root, [escaping]), PathEscapesRootError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
