// The 10-rules family's negative cases, ported from the `case_ C2/C3/C5/C5b`
// rows of scripts/test-validate-engineos.sh. Each case plants exactly one
// breakage in a private copy of the checkout and asserts the finding CODE the
// check reports, not a substring of a rendered line.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_NODE_MAJOR } from '../node-guard';
import type { Finding } from './findings';
import {
  C1_FINDINGS,
  C2_FINDINGS,
  C3_FINDINGS,
  C5_FINDINGS,
  C5b_FINDINGS,
  RULES_CHECKS,
  checkC1,
} from './rules';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding } from './testing';
import type { CheckId } from './ids';

// Every code this file actually saw a check produce. The last test compares it
// with the declared lists, so a code no case reaches is a failing test.
const produced = new Set<string>();

function findings(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const observed = findingsOf(RULES_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of observed) produced.add(entry.code);
  return observed;
}

function note(observed: readonly Finding[]): readonly Finding[] {
  for (const entry of observed) produced.add(entry.code);
  return observed;
}

// ------------------------------------------------------------------------- C1

test('C1 passes on the node this suite runs on', (t) => {
  assert.deepEqual(findings(t, 'C1'), []);
});

test('C1 catches a node below the floor', () => {
  const observed = note(checkC1('16.20.2').flatMap((r) => [...r.findings]));
  assert.ok(hasFinding(observed, 'node-too-old', '16'));
  assert.equal(observed.length, 1);
});

test('C1 accepts the floor version itself', () => {
  const results = checkC1(`${MIN_NODE_MAJOR}.0.0`);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0]?.findings, []);
  assert.equal(results[0]?.status, 'ok');
});

// ------------------------------------------------------------------------- C2

test('C2 passes on a clean tree', (t) => {
  assert.deepEqual(findings(t, 'C2'), []);
});

test('deleted always-on rule is caught', (t) => {
  const observed = findings(t, 'C2', (root) => {
    rmSync(join(root, 'rules', 'context.md'));
  });
  assert.ok(hasFinding(observed, 'rule-missing', 'context'));
  assert.equal(observed.length, 1);
});

test('C2 catches a CLAUDE.md that imports no always-on rule', (t) => {
  const observed = findings(t, 'C2', (root) => {
    editFile(root, 'CLAUDE.md', (text) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('@rules/'))
        .join('\n'),
    );
  });
  assert.ok(hasFinding(observed, 'no-always-on-imports'));
  assert.equal(observed.length, 1);
});

// ------------------------------------------------------------------------- C3

test('C3 passes on a clean tree', (t) => {
  assert.deepEqual(findings(t, 'C3'), []);
});

test('dangling rule reference is caught', (t) => {
  const observed = findings(t, 'C3', (root) => {
    editFile(root, 'rules/base.md', (text) => `${text}\nSee \`rules/does-not-exist.md\`.\n`);
  });
  assert.ok(hasFinding(observed, 'dangling-reference', 'rules/base.md->rules/does-not-exist.md'));
  assert.equal(observed.length, 1);
});

// ------------------------------------------------------------------------- C5

test('C5 passes on a clean tree', (t) => {
  assert.deepEqual(findings(t, 'C5'), []);
});

test('router row dropping a deferred rule is caught', (t) => {
  const observed = findings(t, 'C5', (root) => {
    // The bash case's sed, line-targeted the same way: only the NestJS backend
    // row. The FastAPI row also starts with "| Backend work" and its rule defers
    // to observability.md too, so a prefix match would plant two findings.
    editFile(root, 'CLAUDE.md', (text) =>
      text
        .split('\n')
        .map((line) =>
          line.startsWith('| Backend work (NestJS') ? line.replace(' + `rules/observability.md`', '') : line,
        )
        .join('\n'),
    );
  });
  assert.ok(hasFinding(observed, 'row-not-closed', 'row3:backend->observability'));
  assert.equal(observed.length, 1);
});

// ------------------------------------------------------------------------ C5b

test('C5b passes on a clean tree', (t) => {
  assert.deepEqual(findings(t, 'C5b'), []);
});

test('always-on rule pointing at a route-loaded rule is caught', (t) => {
  const observed = findings(t, 'C5b', (root) => {
    editFile(root, 'rules/context.md', (text) => `${text}\nDefer to \`rules/frontend.md\`.\n`);
  });
  assert.ok(hasFinding(observed, 'route-loaded-reference', 'context->frontend'));
  assert.equal(observed.length, 1);
});

// A task-contract rule is invisible to the closure graph C5 walks but not to
// C5b, which is why C5b cannot be expressed as deferralsOf.
test('C5b catches an always-on rule pointing at a task-contract rule', (t) => {
  const observed = findings(t, 'C5b', (root) => {
    editFile(root, 'rules/git.md', (text) => `${text}\nSee \`rules/verification.md\`.\n`);
  });
  assert.ok(hasFinding(observed, 'route-loaded-reference', 'git->verification'));
  assert.equal(observed.length, 1);
});

// -------------------------------------------------------------------- coverage

test('every declared finding code is produced by a case in this file', () => {
  const declared = [
    ...C1_FINDINGS,
    ...C2_FINDINGS,
    ...C3_FINDINGS,
    ...C5_FINDINGS,
    ...C5b_FINDINGS,
  ];
  const dead = declared.filter((code) => !produced.has(code));
  assert.deepEqual(dead, [], `finding codes no case produces: ${dead.join(' ')}`);
});

test('every registered check declares codes that match the code pattern', () => {
  for (const check of RULES_CHECKS) {
    assert.ok(check.codes.length > 0, `${check.id} declares no codes`);
    assert.equal(new Set(check.codes).size, check.codes.length, `${check.id} repeats a code`);
    for (const code of check.codes) assert.match(code, /^[a-z][a-z0-9-]*$/);
  }
});
