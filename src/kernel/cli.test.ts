import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { isRecord, KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { parseFlags, requirePositional, runKernel } from './cli';

const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };

test('route-path rejects a flag where a positional is expected', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', '--prompt', 'x'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path takes a file path as a positional argument, not a flag (got --prompt)' });
});

test('route-path requires exactly one argument', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-path requires a file path' });
  const io2 = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'a', 'b'], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'route-path takes exactly one argument, got 2' });
});

test('route-path answers JSON with exit 0', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', 'README.md'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { domain: null, excluded: true });
});

test('route-path emits the section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-path', '/tmp/api/user.controller.ts'], io), 0);
  const answer: unknown = JSON.parse(io.stdout.join(''));
  if (!isRecord(answer)) throw new Error('route-path did not answer an object');
  assert.deepEqual(Object.keys(answer), ['domain', 'rules', 'skills', 'agent', 'risk_floor', 'hook_guidance', 'excluded']);
});

test('unknown subcommand is a JSON error', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['nope'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'unknown subcommand: nope' });
});

test('no subcommand at all is the same JSON error', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel([], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'unknown subcommand: ' });
});

test('requirePositional refuses an empty first argument', () => {
  assert.throws(() => requirePositional('route-intent', 'the request text', ['']), KernelError);
});

test('parseFlags reads --k v pairs and rejects unknown flags and missing values', () => {
  assert.deepEqual([...parseFlags('risk', ['--risk', 'high'], ['--risk'])], [['--risk', 'high']]);
  assert.deepEqual([...parseFlags('risk', [], ['--risk'])], []);
  assert.throws(() => parseFlags('risk', ['--nope', 'x'], ['--risk']), KernelError);
  assert.throws(() => parseFlags('risk', ['--risk'], ['--risk']), KernelError);
});

test('route-intent rejects a flag where a positional is expected', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', '--prompt', 'add a thing'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-intent takes the request text as a positional argument, not a flag (got --prompt)' });
});

test('route-intent requires exactly one argument', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent'], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'route-intent requires the request text' });
  const io2 = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'a', 'b'], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'route-intent takes exactly one argument, got 2' });
  const io3 = memoryIo({ env });
  assert.equal(runKernel(['route-intent', ''], io3), 1);
  assert.deepEqual(JSON.parse(io3.stdout.join('')), { error: 'route-intent requires the request text' });
});

test('route-intent answers a zero-match prompt as ambiguous with exit 0', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'zzz qqq'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { matches: [], ambiguous: true });
});

test('route-intent emits the section and its matches in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['route-intent', 'run a retro'], io), 0);
  const answer: unknown = JSON.parse(io.stdout.join(''));
  if (!isRecord(answer)) throw new Error('route-intent did not answer an object');
  assert.deepEqual(Object.keys(answer), ['matches', 'ambiguous']);
  const matches = answer['matches'];
  if (!Array.isArray(matches)) throw new Error('route-intent did not answer a matches array');
  const first: unknown = matches[0];
  if (!isRecord(first)) throw new Error('route-intent answered no match for a known signal');
  assert.deepEqual(Object.keys(first), [
    'id', 'title', 'rules', 'skills', 'agents', 'commands', 'mcp', 'model_tier', 'risk_floor', 'note',
  ]);
  assert.equal(first['id'], 'retro');
});

test('model answers the section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['model', '--work', 'build'], io), 0);
  assert.equal(
    io.stdout.join('').trim(),
    JSON.stringify({ work: 'build', tier: 'build', model: 'opus', escalates_to: { tier: 'design', model: 'opus' } }, null, 2),
  );
});

test('model refuses a missing, empty or unknown --work with the legacy messages', () => {
  assert.deepEqual(answerOf(['model'], 1), { error: 'model requires --work <type>' });
  assert.deepEqual(answerOf(['model', '--work', ''], 1), { error: 'model requires --work <type>' });
  assert.deepEqual(answerOf(['model', '--work', 'nonsense'], 1), {
    error: 'unknown work type: nonsense (see registries/models.json work_types)',
  });
});

// bash lost this case: `shift 2` with one argument left fails silently, the flag
// re-matches, and the loop spins forever. parseFlags refuses instead.
test('model refuses --work with no value rather than spinning', () => {
  assert.deepEqual(answerOf(['model', '--work'], 1), { error: 'model: --work requires a value' });
});

test('risk answers the classified section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['risk', '--signals', '{"inputs":{"reversibility":"low","blast-radius":"medium"}}'], io), 0);
  assert.equal(
    io.stdout.join('').trim(),
    JSON.stringify({
      risk: 'medium',
      autonomy_ceiling: 'A3',
      gates: {
        discovery: 'if-problem-vague',
        design: 'required-at-spec-threshold',
        implementation: 'required',
        validation: 'required',
        release: 'required-if-ships',
      },
      floors_applied: [],
    }, null, 2),
  );
});

test('risk refuses a missing, empty or unparseable --signals', () => {
  assert.deepEqual(answerOf(['risk'], 1), { error: 'risk requires --signals <json>' });
  assert.deepEqual(answerOf(['risk', '--signals', ''], 1), { error: 'risk requires --signals <json>' });
  assert.deepEqual(answerOf(['risk', '--signals', 'not json'], 1), { error: 'risk --signals is not valid JSON' });
  assert.deepEqual(answerOf(['risk', '--signals'], 1), { error: 'risk: --signals requires a value' });
});

test('gates answers the tier section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['gates', '--risk', 'high'], io), 0);
  assert.equal(
    io.stdout.join('').trim(),
    JSON.stringify({
      risk: 'high',
      gates: {
        discovery: 'required',
        design: 'required',
        implementation: 'required',
        validation: 'required-plus-critic',
        release: 'required-plus-human-approval',
      },
      spec_threshold: { files_greater_than: 2, or_any_new_feature: true },
    }, null, 2),
  );
});

test('gates gives an absent, empty and unrecognized tier the one legacy message', () => {
  const expected = { error: 'gates requires --risk low|medium|high' };
  assert.deepEqual(answerOf(['gates'], 1), expected);
  assert.deepEqual(answerOf(['gates', '--risk', ''], 1), expected);
  assert.deepEqual(answerOf(['gates', '--risk', 'banana'], 1), expected);
  assert.deepEqual(answerOf(['gates', '--risk'], 1), { error: 'gates: --risk requires a value' });
});

test('repair answers the section in the legacy key order', () => {
  const io = memoryIo({ env });
  assert.equal(runKernel(['repair', '--check', 'lint', '--attempt', '1'], io), 0);
  assert.equal(
    io.stdout.join('').trim(),
    JSON.stringify({
      check: 'lint',
      action: 'fix-same-tier',
      reason: 'first red — fix and re-run the check at the same tier',
    }, null, 2),
  );
});

test('repair reads a situation ahead of the ladder, and never-repair ahead of both', () => {
  assert.equal(actionOf(['repair', '--check', 'test', '--situation', 'infra']), 'report-tooling-gap');
  assert.equal(actionOf(['repair', '--check', 'test', '--situation', 'flaky']), 'fix-or-delete');
  assert.equal(actionOf(['repair', '--check', 'build', '--attempt', '1', '--situation', 'weaken-the-check']), 'never-repair');
});

test('repair refuses a missing check, a missing attempt and an unknown situation', () => {
  assert.deepEqual(answerOf(['repair', '--attempt', '1'], 1), { error: 'repair requires --check' });
  assert.deepEqual(answerOf(['repair', '--check', 'lint'], 1), { error: 'repair (red ladder) requires a numeric --attempt' });
  assert.deepEqual(answerOf(['repair', '--check', 'lint', '--attempt', '1', '--situation', 'nonsense'], 1), {
    error: 'unknown situation: nonsense',
  });
  assert.deepEqual(answerOf(['repair', '--check'], 1), { error: 'repair: --check requires a value' });
});

// bash matched --attempt against [0-9]+, so a partly-numeric value was refused
// rather than read as its leading digits.
test('repair refuses a non-numeric --attempt, including a partly-numeric one', () => {
  const expected = { error: 'repair (red ladder) requires a numeric --attempt' };
  assert.deepEqual(answerOf(['repair', '--check', 'lint', '--attempt', 'abc'], 1), expected);
  assert.deepEqual(answerOf(['repair', '--check', 'lint', '--attempt', '1abc'], 1), expected);
  assert.deepEqual(answerOf(['repair', '--check', 'lint', '--attempt', '-1'], 1), expected);
});

// A refusal is two facts, and asserting only the message would let a kernel that
// exits 0 on an error pass: the status is checked here so every call site gets it.
function answerOf(argv: string[], status: number): unknown {
  const io = memoryIo({ env });
  assert.equal(runKernel(argv, io), status, `${argv.join(' ')}: unexpected exit code`);
  return JSON.parse(io.stdout.join('')) as unknown;
}

function actionOf(argv: string[]): unknown {
  const answer = answerOf(argv, 0);
  if (!isRecord(answer)) throw new Error(`${argv.join(' ')} did not answer an object`);
  return answer['action'];
}
