import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot } from '../testing/harness';
import { runEvals } from './run';

interface Run { out: string; status: number }

// The whole tree `engineos evals` grades, built small: the deterministic tier's
// own cases live in ./deterministic.test.ts, so this file only has to prove the
// two tiers are wired together, counted together, and reported once.
function evalTree(t: TestContext, intents: readonly string[]): string {
  const root = tempRoot(t);
  writeFileSync(join(root, 'CLAUDE.md'), '@rules/base.md\n');
  mkdirSync(join(root, 'rules'), { recursive: true });
  for (const name of ['base', 'backend', 'frontend']) writeFileSync(join(root, 'rules', `${name}.md`), `${name} rules`);
  mkdirSync(join(root, 'agents'), { recursive: true });
  writeFileSync(join(root, 'agents', 'backend-coordinator.md'), 'agent');
  mkdirSync(join(root, 'evals'), { recursive: true });
  writeFileSync(join(root, 'evals', 'intent-routing-cases.jsonl'), `${intents.join('\n')}\n`);
  writeFileSync(
    join(root, 'evals', 'agent-cases.jsonl'),
    `${JSON.stringify({ id: 'agent-001', agent: 'backend-coordinator', must: ['a'], must_not: ['b'] })}\n`,
  );
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(join(root, 'registries', 'routing.json'), JSON.stringify({ domains: [{ id: 'backend' }] }));
  return root;
}

function intents(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) =>
    JSON.stringify({
      id: `intent-${String(index + 1).padStart(3, '0')}`,
      input: 'add a POST /orders endpoint',
      expect_intents: ['backend'],
      must_load: ['backend'],
      must_not_load: ['frontend'],
      notes: 'pins the backend row',
    }),
  );
}

function evals(t: TestContext, cases: readonly string[]): Run {
  const io = memoryIo({ env: { ENGINEOS_ROOT: evalTree(t, cases) } });
  const status = runEvals([], io);
  return { out: io.stdout.join(''), status };
}

test('a clean run skips the live tier, sums both tiers and exits 0', (t) => {
  const { out, status } = evals(t, intents(25));
  assert.equal(status, 0);
  assert.ok(out.startsWith('== deterministic tier ==\n'), out);
  assert.ok(
    out.endsWith(
      [
        '',
        '== live tier ==',
        'SKIP 25 intent cases — set ENGINEOS_EVAL_LIVE=1 to grade against a live model',
        '',
        'passed 11, failed 0, skipped 25',
        '',
      ].join('\n'),
    ),
    out,
  );
});

test('any deterministic failure exits 1 and is counted in the summary', (t) => {
  const { out, status } = evals(t, intents(1));
  assert.equal(status, 1);
  assert.ok(out.includes('FAIL intent set has only 1 cases — below the floor of 25, the set is decorative\n'), out);
  assert.ok(out.endsWith('\npassed 10, failed 1, skipped 1\n'), out);
});
