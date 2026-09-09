// C36 and C37: router-table reference resolution and check-count drift.
//
// One case runs on a copy of the checkout, and it is the one that matters most:
// it asserts that the real prose is true right now. The mutation cases run on a
// purpose-built four-document fixture instead, the way portability.test.ts
// builds its own mirror trees — `checkoutCopy` duplicates ~600 MB per call
// (console/node_modules is not excluded), and a family whose every negative
// case copies the checkout makes the suite unrunnable for one assertion about
// one backticked token.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { tempRoot } from '../testing/harness';
import type { Finding } from './findings';
import { CHECK_IDS, type CheckId } from './ids';
import { C36_FINDINGS, C37_FINDINGS, PROSE_TRUTH_CHECKS, claimedCounts } from './prose-truth';
import { checkoutCopy, contextFor, editFile, findingsOf, writeFile } from './testing';

const produced = new Set<string>();

function run(root: string, id: CheckId): Finding[] {
  const found = findingsOf(PROSE_TRUTH_CHECKS, id, contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

// Two router rows, two resolvable commands, one resolvable pattern and one
// truthful count per document. Small on purpose: a finding is about one token
// or one number, and the real 200-row table asserts nothing more.
const ROUTER_TABLE = `## Router

| Intent (signals) | Load |
|---|---|
| Audit | \`/engineos:audit <domain>\` — see \`/engineos:audit\` |
| Interview | \`/talk-about-the-system\`; runs \`patterns/1-Analysis.md\` |
`;

function proseFixture(t: TestContext, mutate?: (root: string) => void): string {
  const root = join(tempRoot(t), 'tree');
  const count = CHECK_IDS.length;
  writeFile(root, 'CLAUDE.md', `${ROUTER_TABLE}\nKept coherent by a ${count}-check validator.\n`);
  writeFile(root, 'AGENTS.md', `${ROUTER_TABLE}\nKept coherent by a ${count}-check validator.\n`);
  writeFile(root, 'README.md', `scripts/validate-engineos.sh   # ${count} self-integrity Checks\n`);
  writeFile(root, 'docs/CODEBASE_MAP.md', `A validator (${count} checks) keeps prose honest.\n`);
  writeFile(root, 'commands/audit.md', '# audit\n');
  writeFile(root, 'commands/talk-about-the-system.md', '# talk about the system\n');
  writeFile(root, 'patterns/1-Analysis.md', '# analysis\n');
  if (mutate !== undefined) mutate(root);
  return root;
}

// A row shaped like the ones the fixture already carries, appended so the real
// rows keep resolving and the planted one is the only finding.
function appendRow(text: string, row: string): string {
  return `${text}\n${row}\n`;
}

function remove(root: string, path: string): void {
  rmSync(join(root, path), { recursive: true, force: true });
}

// -------------------------------------------------------------- the real tree

test('C36 and C37 are both clean on an unmutated checkout', (t: TestContext) => {
  const root = checkoutCopy(t);
  assert.deepEqual(run(root, 'C36'), []);
  assert.deepEqual(run(root, 'C37'), []);
});

// ------------------------------------------------------------------------ C36

test('C36 is clean when every row token resolves', (t: TestContext) => {
  assert.deepEqual(run(proseFixture(t), 'C36'), []);
});

test('a router row naming a command with no file under commands/ is caught', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => appendRow(text, '| Something | `/no-such-command` |')),
  );
  assert.deepEqual(run(root, 'C36'), [{ code: 'command-missing', subject: 'CLAUDE.md:/no-such-command' }]);
});

test('the engineos: prefix resolves against the same commands/ directory', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'AGENTS.md', (text) => appendRow(text, '| Something | `/engineos:no-such-command` |')),
  );
  assert.deepEqual(run(root, 'C36'), [
    { code: 'command-missing', subject: 'AGENTS.md:/engineos:no-such-command' },
  ]);
});

test('a patterns/ reference resolving to no file is caught', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => appendRow(text, '| Something | runs `patterns/9-Nothing` |')),
  );
  assert.deepEqual(run(root, 'C36'), [{ code: 'pattern-missing', subject: 'CLAUDE.md:patterns/9-Nothing' }]);
});

test('a patterns/ reference resolves with or without the .md extension', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'AGENTS.md', (text) => appendRow(text, '| Something | `patterns/1-Analysis` |')),
  );
  assert.deepEqual(run(root, 'C36'), []);
});

test('a patterns/ token that walks out of the directory names no pattern', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => appendRow(text, '| Something | `patterns/../commands/audit.md` |')),
  );
  assert.deepEqual(run(root, 'C36'), [
    { code: 'pattern-missing', subject: 'CLAUDE.md:patterns/../commands/audit.md' },
  ]);
});

test('the same broken token repeated across rows is reported once', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) =>
      appendRow(appendRow(text, '| One | `/no-such-command` |'), '| Two | `/no-such-command` |'),
    ),
  );
  assert.deepEqual(run(root, 'C36'), [{ code: 'command-missing', subject: 'CLAUDE.md:/no-such-command' }]);
});

test('a command named outside the table is prose, not a routing reference', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => `${text}\nRun \`/no-such-command\` to see nothing happen.\n`),
  );
  assert.deepEqual(run(root, 'C36'), []);
});

test('a row token carrying argument metasyntax is not a file reference', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => appendRow(text, '| Something | `/no-such-command <domain>` |')),
  );
  assert.deepEqual(run(root, 'C36'), []);
});

test('a table that resolves nothing at all fails rather than passing vacuously', (t: TestContext) => {
  const root = proseFixture(t, (tree) => editFile(tree, 'CLAUDE.md', () => '# no router table here\n'));
  assert.deepEqual(run(root, 'C36'), [{ code: 'no-references', subject: 'CLAUDE.md' }]);
});

test('an absent router file is a broken tree, counted as a precondition failure', (t: TestContext) => {
  const root = proseFixture(t, (tree) => remove(tree, 'AGENTS.md'));
  assert.deepEqual(run(root, 'C36'), [{ code: 'precondition-missing', subject: 'AGENTS.md' }]);
});

// ------------------------------------------------------------------------ C37

test('C37 is clean when every document states the registered count', (t: TestContext) => {
  assert.deepEqual(run(proseFixture(t), 'C37'), []);
});

test('a README claiming a count the registry does not carry is caught', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'README.md', (text) => text.replace(/\d+ self-integrity Checks/, '12 self-integrity Checks')),
  );
  assert.deepEqual(run(root, 'C37'), [{ code: 'count-drift', subject: 'README.md:12' }]);
});

test('the hyphenated spelling is read as the same claim', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(tree, 'CLAUDE.md', (text) => text.replace(/\d+-check validator/, '62-check validator')),
  );
  assert.deepEqual(run(root, 'C37'), [{ code: 'count-drift', subject: 'CLAUDE.md:62' }]);
});

test('one wrong number written three times in a file is one finding', (t: TestContext) => {
  const root = proseFixture(t, (tree) =>
    editFile(
      tree,
      'docs/CODEBASE_MAP.md',
      (text) => `${text}\nAlso 12 checks. And 12 checks again. And a 12-check harness.\n`,
    ),
  );
  assert.deepEqual(run(root, 'C37'), [{ code: 'count-drift', subject: 'docs/CODEBASE_MAP.md:12' }]);
});

test('a count claim in a file the family does not read is left alone', (t: TestContext) => {
  const root = proseFixture(t, (tree) => writeFile(tree, 'docs/BIG-PICTURE.md', 'A 12-check validator.\n'));
  assert.deepEqual(run(root, 'C37'), []);
});

test('claimedCounts reads every spelling the documents use and nothing else', () => {
  assert.deepEqual(claimedCounts('a 68-check validator'), [68]);
  assert.deepEqual(claimedCounts('68 self-integrity Checks'), [68]);
  assert.deepEqual(claimedCounts('68 checks and 12 checks'), [68, 12]);
  assert.deepEqual(claimedCounts('seven checks, 108 results, 7 assertions'), []);
});

// ------------------------------------------------------------------- coverage

test('every code these checks declare is produced by a case above', () => {
  const declared = [...C36_FINDINGS, ...C37_FINDINGS];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
});
