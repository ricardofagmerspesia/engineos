import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, type InfraPattern } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { INFRA_PATTERN_REASONS, RUNNER_KINDS, SITUATIONS, classify, infraRegExp } from './classify-failure';

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

// The python row: a tool the environment does not hold is a runner that is
// missing, never a stale target and never red.
test('a python tool missing from its environment is a missing runner', () => {
  // The three alternatives of the contract row: `python -m` wording, the
  // shell's, and the OS error the runner writes when the binary never started.
  const missing = [
    '/repo/.venv/bin/python: No module named ruff',
    'No module named pyright',
    '/bin/sh: ruff: command not found',
    'No such file or directory: /repo/.venv/bin/pytest',
  ];
  for (const output of missing) {
    assert.deepEqual(
      classify({ kind: 'run', runner: 'python', target: 'lint', code: 127, output, timedOut: false }),
      { situation: 'infra', reason: 'runner-missing' },
      output,
    );
  }
  // A test whose OWN subject is a missing module is still red: the pattern
  // names the three tools, not any module.
  assert.deepEqual(
    classify({ kind: 'run', runner: 'python', target: 'test', code: 1, output: "E   ModuleNotFoundError: No module named 'app.settings'", timedOut: false }),
    { situation: 'red' },
  );
  assert.deepEqual(
    classify({ kind: 'run', runner: 'python', target: 'lint', code: 1, output: 'app/main.py:3:8: F401 `os` imported but unused', timedOut: false }),
    { situation: 'red' },
  );
  // The row is keyed by runner: the same wording from npm stays what it was.
  assert.deepEqual(classify(run({ code: 127, output: 'No module named ruff' })), { situation: 'red' });
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

// ------------------------------------------------------------------ injected patterns

const CUSTOM: readonly InfraPattern[] = [{ runner: 'npm-family', pattern: 'registry says <t> is gone', reason: 'runner-missing' }];

test('patterns a caller passes in decide the verdict instead of the registry', () => {
  assert.deepEqual(classify(run({ code: 1, output: 'registry says lint is gone' }), CUSTOM), {
    situation: 'infra',
    reason: 'runner-missing',
  });
  // The registry phrase means nothing to a caller that supplied its own table.
  assert.deepEqual(classify(run({ code: 1, output: 'npm ERR! missing script: lint' }), CUSTOM), { situation: 'red' });
});

test('a runner with no row in the passed table is red on any failure', () => {
  assert.deepEqual(classify(run({ code: 1, output: 'npm ERR! missing script: lint' }), []), { situation: 'red' });
});

test('injected patterns are never consulted for a green or timed-out run', () => {
  assert.equal(classify(run({ code: 0, output: 'registry says lint is gone' }), CUSTOM), null);
  assert.deepEqual(classify(run({ code: 1, timedOut: true }), []), { situation: 'infra', reason: 'timeout' });
});

test('infraRegExp substitutes every target slot literally and ignores case', () => {
  const pattern = infraRegExp('"<t>" then "<t>"', 'a+b');
  assert.equal(pattern.test('"A+B" then "a+b"'), true);
  assert.equal(pattern.test('"aab" then "aab"'), false);
});

test('every runner kind and both pattern reasons are covered by the registry rows', () => {
  const rows = loadPolicy(resolveRoot({}, __dirname)).repair.infra_patterns;
  assert.deepEqual(rows.map((row) => row.runner).sort(), Object.keys(RUNNER_KINDS).sort());
  for (const row of rows) assert.ok(INFRA_PATTERN_REASONS.includes(row.reason), row.reason);
});
