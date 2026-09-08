// Behavioural tests for the base-revision guard: the thing standing between an
// operator's draft and someone else's work on the same file.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

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
