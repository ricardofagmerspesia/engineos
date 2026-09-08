import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { SITUATIONS, classify } from './classify-failure';

function run(over: { code?: number; output?: string; timedOut?: boolean; target?: string }) {
  return {
    kind: 'run' as const,
    runner: 'npm-family' as const,
    target: over.target ?? 'lint',
    code: over.code ?? 0,
    output: over.output ?? '',
    timedOut: over.timedOut ?? false,
  };
}

test('the situations are exactly the ones the kernel repairs', () => {
  const policy = loadPolicy(resolveRoot({}, __dirname));
  assert.deepEqual(
    [...SITUATIONS],
    policy.repair.by_situation.map((row) => row.situation),
  );
});

test('a node below the floor is a tooling gap, not a red check', () => {
  assert.deepEqual(classify({ kind: 'environment', nodeMajor: 16 }), {
    situation: 'infra',
    reason: 'node-too-old',
  });
  assert.equal(classify({ kind: 'environment', nodeMajor: 18 }), null);
  assert.equal(classify({ kind: 'environment', nodeMajor: 22 }), null);
});

test('a runner that was never found is a tooling gap', () => {
  assert.deepEqual(classify({ kind: 'runner', found: false }), {
    situation: 'infra',
    reason: 'runner-missing',
  });
  assert.equal(classify({ kind: 'runner', found: true }), null);
});

test('a target killed by its budget is infra, and outranks its exit code', () => {
  assert.deepEqual(classify(run({ code: 1, output: 'error: 3 problems', timedOut: true })), {
    situation: 'infra',
    reason: 'timeout',
  });
});

test('a green run is nothing to judge', () => {
  assert.equal(classify(run({ code: 0, output: 'all good' })), null);
});

test('a package manager saying the script is missing is a stale probe, not red', () => {
  const missing = ['npm ERR! missing script: lint', 'command "lint" not found', 'Couldn\'t find a script named "lint".'];
  for (const output of missing) {
    assert.deepEqual(classify(run({ code: 1, output })), {
      situation: 'infra',
      reason: 'target-absent',
    });
  }
});

test('nx saying the project or target is gone is a stale probe, not red', () => {
  const missing = [
    'Cannot find project api',
    'Project api does not have a lint target',
    'Cannot find configuration for task api:lint',
  ];
  for (const output of missing) {
    assert.deepEqual(
      classify({ kind: 'run', runner: 'nx', target: 'lint', code: 1, output, timedOut: false }),
      { situation: 'infra', reason: 'target-absent' },
    );
  }
});

test('the package-manager pattern is anchored to the target it ran', () => {
  // The runner names the script it could not find; another script's absence is
  // not evidence about this one.
  assert.deepEqual(classify(run({ code: 1, target: 'lint', output: 'command "test" not found' })), {
    situation: 'red',
  });
});

test('a target name with regex metacharacters is matched literally', () => {
  assert.deepEqual(
    classify(run({ code: 1, target: 'lint.all', output: 'command "lint.all" not found' })),
    { situation: 'infra', reason: 'target-absent' },
  );
  assert.deepEqual(
    classify(run({ code: 1, target: 'lint.all', output: 'command "lintxall" not found' })),
    { situation: 'red' },
  );
});

test('a genuinely failing check stays red', () => {
  assert.deepEqual(classify(run({ code: 1, output: '3 errors, 0 warnings' })), { situation: 'red' });
  assert.deepEqual(classify(run({ code: 127, output: 'eslint: command not found' })), {
    situation: 'red',
  });
});

test('flaky is a situation the kernel answers for, never a verdict this returns', () => {
  const verdicts = [
    classify({ kind: 'environment', nodeMajor: 16 }),
    classify({ kind: 'runner', found: false }),
    classify(run({ code: 1, output: 'boom' })),
    classify(run({ code: 1, timedOut: true })),
    classify(run({ code: 1, output: 'missing script: lint' })),
  ];
  for (const verdict of verdicts) assert.notEqual(verdict?.situation, 'flaky');
});
