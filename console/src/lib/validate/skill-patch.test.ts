// The PUT body allowlist: what reaches the store, and what is refused before it
// gets there. `enabled: "false"` is the case the audit found in production code.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSkillPatch } from './skill-patch.js';
import type { SkillPatch, ValidationIssue } from '@/lib/entities/types';

const ENTITY_ID = 'skills/code-review';

function error(message: string): ValidationIssue {
  return { entityId: ENTITY_ID, level: 'error', message };
}

function refusal(input: unknown): ValidationIssue[] {
  const result = parseSkillPatch(ENTITY_ID, input);
  if (result.ok) {
    assert.fail(`expected a refusal, got patch ${JSON.stringify(result.patch)}`);
  }
  return result.issues;
}

function accepted(input: unknown): SkillPatch {
  const result = parseSkillPatch(ENTITY_ID, input);
  if (!result.ok) {
    assert.fail(`expected acceptance, got issues ${JSON.stringify(result.issues)}`);
  }
  return result.patch;
}

test('null is refused as a body, not read as an empty patch', () => {
  assert.deepEqual(refusal(null), [error('Patch body must be a JSON object.')]);
});

test('an array is refused — JSON valid is not body valid', () => {
  assert.deepEqual(refusal([{ enabled: true }]), [error('Patch body must be a JSON object.')]);
});

test('a primitive body is refused', () => {
  assert.deepEqual(refusal('enabled'), [error('Patch body must be a JSON object.')]);
  assert.deepEqual(refusal(7), [error('Patch body must be a JSON object.')]);
});

test('an empty object is refused — there is nothing to apply', () => {
  assert.deepEqual(refusal({}), [error('Patch carries no field to apply.')]);
});

test('an unknown field is refused by name, so mass assignment cannot ride the spread', () => {
  assert.deepEqual(refusal({ sourcePaths: ['skills/x/SKILL.md'] }), [
    error('Unknown field: sourcePaths.'),
    error('Patch carries no field to apply.'),
  ]);
});

test('an unknown field alongside a valid one is still refused', () => {
  assert.deepEqual(refusal({ enabled: true, status: 'active' }), [error('Unknown field: status.')]);
});

test('enabled: "false" is refused — the string used to be stored and read as enabled', () => {
  assert.deepEqual(refusal({ enabled: 'false' }), [error('enabled must be a boolean.')]);
});

test('description: 123 is refused here instead of throwing inside validateSkill', () => {
  assert.deepEqual(refusal({ description: 123 }), [error('description must be a string.')]);
});

test('both fields wrong yields one issue per defect', () => {
  assert.deepEqual(refusal({ description: null, enabled: 1 }), [
    error('description must be a string.'),
    error('enabled must be a boolean.'),
  ]);
});

test('{ enabled: false } is accepted', () => {
  assert.deepEqual(accepted({ enabled: false }), { enabled: false });
});

test("{ description: 'x' } is accepted", () => {
  assert.deepEqual(accepted({ description: 'x' }), { description: 'x' });
});

test('both fields together are accepted', () => {
  assert.deepEqual(accepted({ description: 'x', enabled: true }), { description: 'x', enabled: true });
});

test('an empty description is accepted here — validateSkill owns emptiness and length', () => {
  assert.deepEqual(accepted({ description: '' }), { description: '' });
});

test('a body of unknown fields is refused with a bounded list — the refusal cannot be amplified', () => {
  const input = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };

  assert.deepEqual(refusal(input), [
    error('Unknown field: one.'),
    error('Unknown field: two.'),
    error('Unknown field: three.'),
    error('Unknown field: four.'),
    error('Unknown field: five.'),
    error('3 more unknown fields not listed.'),
    error('Patch carries no field to apply.'),
  ]);
});

test('exactly five unknown fields are all named, with no tally issue', () => {
  assert.deepEqual(refusal({ one: 1, two: 2, three: 3, four: 4, five: 5, enabled: true }), [
    error('Unknown field: one.'),
    error('Unknown field: two.'),
    error('Unknown field: three.'),
    error('Unknown field: four.'),
    error('Unknown field: five.'),
  ]);
});
