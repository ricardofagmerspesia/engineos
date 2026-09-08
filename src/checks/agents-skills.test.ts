import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENTS_SKILLS_CHECKS,
  C9_FINDINGS,
  C10_FINDINGS,
  C11_FINDINGS,
  C12_FINDINGS,
  C13_FINDINGS,
  C31_FINDINGS,
} from './agents-skills';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { checkoutCopy, contextFor, editFile, findingsOf, hasFinding, runCheckById, writeFile } from './testing';

// Every `<check>:<code>` a case below actually produced. The last test compares
// it with the declared lists, so a code no mutation can reach is a failing test
// rather than a finding nobody has ever seen.
const produced = new Set<string>();

function findingsFor(t: TestContext, id: CheckId, mutate?: (root: string) => void): Finding[] {
  const found = findingsOf(AGENTS_SKILLS_CHECKS, id, contextFor(checkoutCopy(t, mutate)));
  for (const entry of found) produced.add(`${id}:${entry.code}`);
  return found;
}

// ---------------------------------------------------------------------- C9

test('C9 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C9'), []);
});

test('agent whose frontmatter name drifts from filename is caught', (t) => {
  const found = findingsFor(t, 'C9', (root) => {
    editFile(root, 'agents/test-writer.md', (text) => text.replace(/^name: test-writer$/m, 'name: test-writer-renamed'));
  });
  assert.ok(hasFinding(found, 'name-drifts-from-filename', 'test-writer:test-writer-renamed'));
});

test('agent with no description frontmatter is caught', (t) => {
  const found = findingsFor(t, 'C9', (root) => {
    editFile(root, 'agents/docs-writer.md', (text) => text.replace(/^description: /m, 'summary: '));
  });
  assert.ok(hasFinding(found, 'description-missing', 'docs-writer'));
});

test('agent with no tools frontmatter is caught', (t) => {
  const found = findingsFor(t, 'C9', (root) => {
    editFile(root, 'agents/qa-tester.md', (text) => text.replace(/^tools: /m, 'toolset: '));
  });
  assert.ok(hasFinding(found, 'tools-missing', 'qa-tester'));
});

// --------------------------------------------------------------------- C10

test('C10 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C10'), []);
});

test('agent missing the Return format envelope is caught', (t) => {
  const found = findingsFor(t, 'C10', (root) => {
    editFile(root, 'agents/security-reviewer.md', (text) => text.replace(/^## Return format$/m, '## Output notes'));
  });
  assert.ok(hasFinding(found, 'return-format-section-missing', 'security-reviewer'));
});

test('agent whose status line drops a value from the envelope enum is caught', (t) => {
  const found = findingsFor(t, 'C10', (root) => {
    editFile(root, 'agents/critic.md', (text) => text.replace(/^status: OK \| DEGRADED \| CRITICAL \| BLOCKED \| FAILED$/m, 'status: OK | FAILED'));
  });
  assert.ok(hasFinding(found, 'status-enum-missing', 'critic'));
});

// --------------------------------------------------------------------- C11

test('C11 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C11'), []);
});

test('agent alias without a slash command is caught', (t) => {
  const found = findingsFor(t, 'C11', (root) => {
    rmSync(join(root, 'commands/agents/leo-ely.md'));
  });
  assert.ok(hasFinding(found, 'alias-command-missing', 'security-reviewer:leo-ely'));
});

test('agent without a slash command of its own name is caught', (t) => {
  const found = findingsFor(t, 'C11', (root) => {
    rmSync(join(root, 'commands/agents/test-writer.md'));
  });
  assert.ok(hasFinding(found, 'command-missing', 'test-writer'));
});

// --------------------------------------------------------------------- C12

test('C12 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C12'), []);
});

test('skill whose name drifts from its directory is caught', (t) => {
  const found = findingsFor(t, 'C12', (root) => {
    editFile(root, 'skills/adr/SKILL.md', (text) => text.replace(/^name: adr$/m, 'name: adr-v2'));
  });
  assert.ok(hasFinding(found, 'name-drifts-from-directory', 'adr:adr-v2'));
});

test('skill directory with no SKILL.md is caught', (t) => {
  const found = findingsFor(t, 'C12', (root) => {
    rmSync(join(root, 'skills/retro/SKILL.md'));
  });
  assert.ok(hasFinding(found, 'skill-md-missing', 'retro'));
});

test('skill with no description frontmatter is caught', (t) => {
  const found = findingsFor(t, 'C12', (root) => {
    editFile(root, 'skills/strategy/SKILL.md', (text) => text.replace(/^description: /m, 'summary: '));
  });
  assert.ok(hasFinding(found, 'description-missing', 'strategy'));
});

// --------------------------------------------------------------------- C13

test('C13 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C13'), []);
});

test('emptied rule file is caught', (t) => {
  const found = findingsFor(t, 'C13', (root) => {
    writeFile(root, 'rules/testing.md', '');
  });
  assert.ok(hasFinding(found, 'empty-document', 'rules/testing.md'));
});

test('a document group with no members at all is caught', (t) => {
  const found = findingsFor(t, 'C13', (root) => {
    for (const entry of readdirSync(join(root, 'rules'))) {
      if (entry.endsWith('.md')) rmSync(join(root, 'rules', entry));
    }
  });
  assert.ok(hasFinding(found, 'empty-document', 'rules/*.md'));
});

// --------------------------------------------------------------------- C31

test('C31 passes on an unmutated checkout', (t) => {
  assert.deepEqual(findingsFor(t, 'C31'), []);
});

test('agent whose model drifts off its declared tier is caught', (t) => {
  const found = findingsFor(t, 'C31', (root) => {
    editFile(root, 'agents/critic.md', (text) => text.replace(/^model: opus$/m, 'model: haiku'));
  });
  assert.ok(hasFinding(found, 'tier-model-mismatch', 'critic:opus!=haiku'));
});

test('agent declaring a tier the models registry does not bind is caught', (t) => {
  const found = findingsFor(t, 'C31', (root) => {
    editFile(root, 'agents/critic.md', (text) => text.replace(/^tier: design$/m, 'tier: ghost'));
  });
  assert.ok(hasFinding(found, 'unknown-tier', 'critic:ghost'));
});

test('C31 reports its missing precondition once when the models registry is absent', (t) => {
  const ctx = contextFor(
    checkoutCopy(t, (root) => {
      rmSync(join(root, 'registries/models.json'));
    }),
  );
  const first = runCheckById(AGENTS_SKILLS_CHECKS, 'C31', ctx);
  assert.deepEqual(
    first.map((outcome) => ({ status: outcome.status, findings: outcome.findings })),
    [{ status: 'fail', findings: [{ code: 'precondition-missing', subject: 'models' }] }],
  );
  // skipOnce dedupes per run: a second call in the same context prints nothing.
  assert.deepEqual(runCheckById(AGENTS_SKILLS_CHECKS, 'C31', ctx), []);
});

// ----------------------------------------------------------------- coverage

test('every declared finding code is produced by a case in this file', () => {
  const declared: readonly (readonly [CheckId, readonly string[]])[] = [
    ['C9', C9_FINDINGS],
    ['C10', C10_FINDINGS],
    ['C11', C11_FINDINGS],
    ['C12', C12_FINDINGS],
    ['C13', C13_FINDINGS],
    ['C31', C31_FINDINGS],
  ];
  const dead: string[] = [];
  for (const [id, codes] of declared) {
    for (const code of codes) {
      if (!produced.has(`${id}:${code}`)) dead.push(`${id}:${code}`);
    }
  }
  assert.deepEqual(dead, []);
});

test('the declared lists are the ones the checks register', () => {
  assert.deepEqual(
    AGENTS_SKILLS_CHECKS.map((check) => check.id),
    ['C9', 'C10', 'C11', 'C12', 'C13', 'C31'],
  );
});
