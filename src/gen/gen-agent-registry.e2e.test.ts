// End-to-end cases for `engineos gen agent-registry`, ported one-for-one from
// scripts/test-gen-agent-registry.sh (plan Tasks 42-57), in the bash suite's
// order and under its case messages.
//
// src/gen/agent-registry.test.ts already drives buildAgentRegistry and
// generateAgentRegistry in process, over synthetic AgentFile lists. These cases
// are not that: they spawn dist/engineos.cjs, so they pin that the generator is
// reachable through `gen agent-registry` dispatch, that a tier failure survives
// the process boundary as a nonzero exit with the FAIL line on stderr, and that
// ENGINEOS_ROOT makes a relocated tree generate from and into ITSELF — the
// property the shim exists to preserve.
//
// The fixtures are the frontmatter edges no shipped agents/*.md happens to
// exercise today (every real file has a space after every "field:" and declares
// tools), which is why the bash suite planted a file rather than checking the
// real directory.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// The name every fixture declares, and the entry each case selects out of the
// generated document (the bash suite's jq `select(.name=="zz-fixture")`).
const FIXTURE_NAME = 'zz-fixture';

// The checkout the compiled tests sit in. Resolved from an EMPTY env, never
// process.env: an operator's own ENGINEOS_ROOT must not decide which agents/ a
// case copies, the same reason the harness resolves its guard root that way.
const CHECKOUT = resolveRoot({}, __dirname);

// The bash suite tar-copied the whole checkout per case and planted the fixture
// in the copy. The generator reads exactly two things under its root — agents/
// and registries/ — so the copy is narrowed to those: relocatedRoot brings the
// registries, the real agents/ is copied beside them, and the fixture lands in
// it. Keeping the real agent set means a case also goes red if the SHIPPED
// files stopped generating, which is what the bash rc check bought.
function generatorRoot(t: TestContext, fixture: string): string {
  const root = relocatedRoot(tempRoot(t));
  // The committed agents.json came along with registries/; remove it so a case
  // can only ever read what this run wrote.
  rmSync(join(root, 'registries', 'agents.json'), { force: true });
  cpSync(join(CHECKOUT, 'agents'), join(root, 'agents'), { recursive: true });
  writeFileSync(join(root, 'agents', `${FIXTURE_NAME}.md`), fixture);
  return root;
}

function generate(root: string): RunResult {
  // ENGINEOS_ROOT is what scripts/gen-agent-registry.sh exports from where it
  // sits; the harness allowlist strips it, so every case passes it explicitly.
  return runCli(['gen', 'agent-registry'], { env: { ENGINEOS_ROOT: root } });
}

// bash `case_()`: run the generator over the planted tree, then read one field
// of the fixture's entry out of the generated registries/agents.json.
function generatedEntry(t: TestContext, fixture: string): Record<string, unknown> {
  const root = generatorRoot(t, fixture);
  const run = generate(root);
  assert.equal(run.status, 0, `generator exited ${run.status}: ${run.stderr}`);

  const document: unknown = readJsonFile(join(root, 'registries', 'agents.json'));
  assert.ok(isRecord(document), 'generated agents.json is not a JSON object');
  const agents = document['agents'];
  assert.ok(Array.isArray(agents), 'generated agents.json has no agents array');
  const entry = agents.find((row: unknown): row is Record<string, unknown> => isRecord(row) && row['name'] === FIXTURE_NAME);
  assert.ok(entry !== undefined, `no ${FIXTURE_NAME} entry in the generated document`);
  return entry;
}

// bash `fail_case()`: the generator must exit nonzero AND name the problem — a
// silent bad exit is as unreviewable as a silent success.
function generatorFailure(t: TestContext, fixture: string): RunResult {
  const run = generate(generatorRoot(t, fixture));
  assert.equal(run.status, 1, `generator exited ${run.status}, expected failure: ${run.stdout}${run.stderr}`);
  return run;
}

test('an agent with no tools: line does not crash the generator, produces an empty array', (t) => {
  const entry = generatedEntry(
    t,
    `---
name: zz-fixture
description: throwaway.
model: opus
tier: build
---
body
`,
  );
  assert.deepEqual(entry['tools'], []);
});

test('a frontmatter line with no space after the colon still strips the field name', (t) => {
  const entry = generatedEntry(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read
model:opus
tier:build
---
body
`,
  );
  assert.equal(entry['model'], 'opus');
});

test('a trailing comma in tools: does not produce a spurious empty entry', (t) => {
  const entry = generatedEntry(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read, Grep,
model: opus
tier: build
---
body
`,
  );
  assert.deepEqual(entry['tools'], ['Read', 'Grep']);
});

test('model_tier is taken from tier: frontmatter, not reverse-derived from the model', (t) => {
  // build and design both bind opus in registries/models.json, so a tier derived
  // from the model name could not tell this fixture from the one above.
  const entry = generatedEntry(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
tier: design
---
body
`,
  );
  assert.equal(entry['model_tier'], 'design');
});

test('an agent with no tier: frontmatter fails the generator loudly', (t) => {
  const run = generatorFailure(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
---
body
`,
  );
  assert.ok(run.stderr.includes("has no 'tier:' frontmatter"), `stderr lacks the tier-missing FAIL line: ${run.stderr}`);
});

test('an unknown tier id fails the generator loudly', (t) => {
  const run = generatorFailure(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
tier: turbo
---
body
`,
  );
  assert.ok(run.stderr.includes("unknown tier 'turbo'"), `stderr lacks the unknown-tier FAIL line: ${run.stderr}`);
});

test('a tier whose models.json binding disagrees with model: fails the generator loudly', (t) => {
  const run = generatorFailure(
    t,
    `---
name: zz-fixture
description: throwaway.
tools: Read
model: haiku
tier: design
---
body
`,
  );
  assert.ok(run.stderr.includes("declares tier 'design'"), `stderr lacks the tier-mismatch FAIL line: ${run.stderr}`);
});
