import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontmatterAlias, frontmatterValue, splitCsv } from './frontmatter';

const AGENT = `---
name: critic
description: Adversarial correctness review. Alias: vera (invocable by this name).
tools: Read, Grep, Glob, Bash
model: opus
tier: design
---

Body prose mentioning Alias: impostor must never win.
`;

test('frontmatterValue reads a present field', () => {
  assert.equal(frontmatterValue(AGENT, 'name'), 'critic');
  assert.equal(frontmatterValue(AGENT, 'model'), 'opus');
});

test('frontmatterValue answers "" for an absent field', () => {
  assert.equal(frontmatterValue(AGENT, 'capability_ids'), '');
  assert.equal(frontmatterValue('', 'name'), '');
});

test('frontmatterValue strips a colon with no space after it', () => {
  assert.equal(frontmatterValue('name:critic\n', 'name'), 'critic');
  assert.equal(frontmatterValue('name:\t\tcritic\n', 'name'), 'critic');
});

test('frontmatterValue takes the first match', () => {
  assert.equal(frontmatterValue('name: first\nname: second\n', 'name'), 'first');
});

test('frontmatterValue keeps trailing whitespace', () => {
  assert.equal(frontmatterValue('name: critic   \n', 'name'), 'critic   ');
});

test('frontmatterValue only matches at the start of a line', () => {
  assert.equal(frontmatterValue('  name: critic\nname: real\n', 'name'), 'real');
});

// The bash read the WHOLE file, not just the frontmatter block, and the port keeps
// that: a `name:` below the closing `---` is still the agent's name.
test('frontmatterValue reads past the closing dashes', () => {
  assert.equal(frontmatterValue('---\n---\nname: late\n', 'name'), 'late');
});

test('frontmatterAlias reads the alias out of the frontmatter block', () => {
  assert.equal(frontmatterAlias(AGENT), 'vera');
});

test('frontmatterAlias is case-insensitive on the label', () => {
  assert.equal(frontmatterAlias('---\ndescription: alias: vera (x).\n---\n'), 'vera');
});

test('frontmatterAlias ignores body prose after the closing dashes', () => {
  assert.equal(frontmatterAlias('---\nname: critic\n---\nAlias: impostor\n'), '');
});

// sed range semantics: a later `---` reopens the range, so an alias between a third
// and fourth marker is still found.
test('frontmatterAlias sees a reopened dash range', () => {
  assert.equal(frontmatterAlias('---\nname: critic\n---\nprose\n---\nAlias: vera\n---\n'), 'vera');
});

test('frontmatterAlias reads an unclosed range to end of file', () => {
  assert.equal(frontmatterAlias('---\nname: critic\ndescription: Alias: vera.\n'), 'vera');
});

test('frontmatterAlias answers "" when there is none', () => {
  assert.equal(frontmatterAlias('---\nname: router\n---\n'), '');
  assert.equal(frontmatterAlias(''), '');
});

// Documented bash quirk, reproduced: grep -i matched `ALIAS:` but the sed that
// strips the prefix only knew `[Aa]lias: `, so the label survives into the value.
test('frontmatterAlias keeps an upper-case label the bash sed never stripped', () => {
  assert.equal(frontmatterAlias('---\nALIAS: vera\n---\n'), 'ALIAS: vera');
});

test('splitCsv trims entries and drops empty ones', () => {
  assert.deepEqual(splitCsv('Read, Grep,  Glob'), ['Read', 'Grep', 'Glob']);
  assert.deepEqual(splitCsv('Read, Grep,'), ['Read', 'Grep']);
  assert.deepEqual(splitCsv(' , ,'), []);
  assert.deepEqual(splitCsv(''), []);
});
