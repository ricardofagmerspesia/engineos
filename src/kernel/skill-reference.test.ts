import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempRoot } from '../testing/harness';
import { skillReference } from './skill-reference';
import { isRecord } from '../lib/json';

const entries = [
  {id: 'upstream-to-tickets', command: '/to-tickets', origin: 'Matt Pocock upstream', purpose: 'ticketing', path: '.agents/skills/to-tickets/SKILL.md'},
  {id: 'upstream-session-retro', command: '/retro', origin: 'Matt Pocock upstream', purpose: 'session', path: '.agents/skills/retro/SKILL.md'},
  {id: 'engineos-recurring-retro', command: '/engineos:retro', origin: 'EngineOS native', purpose: 'recurring', path: 'skills/retro/SKILL.md'},
  {id: 'upstream-prototype', command: '/prototype', origin: 'Matt Pocock upstream', purpose: 'preview', path: '.agents/skills/prototype/SKILL.md'},
];
function manifest(root: string, value: unknown = {schema_version: 1, references: entries}): void {
  mkdirSync(join(root, 'registries'), {recursive: true});
  writeFileSync(join(root, 'registries/skill-references.json'), JSON.stringify(value));
}
test('named retro discovery distinguishes provenance, purpose, actual path and availability', t => {
  const root = tempRoot(t); manifest(root);
  const native = join(root, 'skills/retro/SKILL.md'); mkdirSync(dirname(native), {recursive: true}); writeFileSync(native, '# Native');
  const upstream = skillReference(root, 'upstream-session-retro');
  const recurring = skillReference(root, 'engineos-recurring-retro');
  assert.ok(isRecord(upstream) && isRecord(recurring));
  assert.equal(upstream['available'], false);
  assert.equal(recurring['available'], true);
  assert.equal(recurring['absolutePath'], native);
  assert.notEqual(upstream['origin'], recurring['origin']);
  assert.notEqual(upstream['purpose'], recurring['purpose']);
  assert.equal(upstream['enforcement'], 'discovery-only');
});
test('unknown ids and malformed/unbounded manifests are rejected without broad discovery', t => {
  const root = tempRoot(t); manifest(root);
  assert.throws(() => skillReference(root, 'retro'), /unknown reference/);
  for (const value of [{schema_version: 1, references: [entries[0], entries[0]]},
    {schema_version: 1, references: [{...entries[0], path: '../retro/SKILL.md'}]},
    {schema_version: 1, references: [{...entries[0], extra: true}]},
    {schema_version: 1, references: Array.from({length: 17}, () => entries[0])},
    {schema_version: 1, references: entries, unknown: true}]) {
    manifest(root, value); assert.throws(() => skillReference(root, 'upstream-session-retro'));
  }
  writeFileSync(join(root, 'registries/skill-references.json'), ' '.repeat(16385));
  assert.throws(() => skillReference(root, 'upstream-session-retro'), /16 KiB/);
});
test('directory skills and symlinks outside the repository are unavailable', t => {
  const root = tempRoot(t); manifest(root);
  mkdirSync(join(root, '.agents/skills/retro/SKILL.md'), {recursive: true});
  const outside = tempRoot(t); writeFileSync(join(outside, 'SKILL.md'), '# Outside');
  mkdirSync(join(root, 'skills/retro'), {recursive: true});
  symlinkSync(join(outside, 'SKILL.md'), join(root, 'skills/retro/SKILL.md'));
  for (const id of ['upstream-session-retro', 'engineos-recurring-retro']) {
    const result = skillReference(root, id); assert.ok(isRecord(result)); assert.equal(result['available'], false);
  }
});

test('ticket reference resolves the installed upstream skill without claiming execution', t => {
  const root = tempRoot(t); manifest(root);
  const file = join(root, '.agents/skills/to-tickets/SKILL.md'); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, '# Tickets');
  const result = skillReference(root, 'upstream-to-tickets'); assert.ok(isRecord(result));
  assert.equal(result['available'], true); assert.equal(result['absolutePath'], file);
  assert.equal(result['command'], '/to-tickets'); assert.equal(result['enforcement'], 'discovery-only');
});
