import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import { TASK_CONTRACT_RULES, alwaysOnRules, deferralsOf, ruleNames } from './deferrals';

function ruleTree(t: TestContext, rules: Record<string, string>): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'rules'), { recursive: true });
  for (const [name, text] of Object.entries(rules)) writeFileSync(join(root, 'rules', `${name}.md`), text);
  return root;
}

test('alwaysOnRules reads the @rules imports and de-dupes them in byte order', () => {
  const claudeMd = ['# Title', '', '@rules/security.md', '@rules/base.md', '@rules/security.md', 'text @rules/nope.md'].join('\n');
  assert.deepEqual(alwaysOnRules(claudeMd), ['base', 'security']);
});

test('alwaysOnRules ignores a name outside the slug class', () => {
  assert.deepEqual(alwaysOnRules('@rules/a.b.md\n@rules/ok.md\n'), ['ok']);
});

test('alwaysOnRules answers nothing for a file with no imports', () => {
  assert.deepEqual(alwaysOnRules(''), []);
});

test('ruleNames lists the markdown basenames in byte order', (t) => {
  const root = ruleTree(t, { zeta: 'z', alpha: 'a', beta: 'b' });
  writeFileSync(join(root, 'rules', 'notes.txt'), 'not a rule');
  assert.deepEqual(ruleNames(root), ['alpha', 'beta', 'zeta']);
});

test('ruleNames answers nothing when there is no rules directory', (t) => {
  assert.deepEqual(ruleNames(tempRoot(t)), []);
});

test('deferralsOf catches all three textual forms of a mention', (t) => {
  const root = ruleTree(t, {
    a: 'defers path-style to rules/b.md, in a code span to `c.md`, and bare to d.md',
    b: '',
    c: '',
    d: '',
  });
  assert.deepEqual(deferralsOf(root, 'a', []), ['b', 'c', 'd']);
});

test('deferralsOf excludes the rule itself, always-on rules and task-contract rules', (t) => {
  const rules: Record<string, string> = {
    a: 'names a.md, base.md, and every task-contract rule, plus b.md',
    b: '',
    base: '',
  };
  for (const name of TASK_CONTRACT_RULES) {
    rules['a'] = `${rules['a'] ?? ''} ${name}.md`;
    rules[name] = '';
  }
  const root = ruleTree(t, rules);
  assert.deepEqual(deferralsOf(root, 'a', ['base']), ['b']);
});

test('deferralsOf answers nothing for a rule that does not exist', (t) => {
  const root = ruleTree(t, { a: 'names b.md', b: '' });
  assert.deepEqual(deferralsOf(root, 'ghost', []), []);
});
