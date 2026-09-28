import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord, KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { tempRoot } from '../testing/harness';
import { parseFlags, requirePositional, runKernel } from './cli';
import { lazyRegistries } from './context';

const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };
// The same registry the arms answer from: every number and every record home
// below is read from it rather than spelled here, so re-parameterising policy.json
// moves these cases instead of turning them red.
const policy = lazyRegistries(env.ENGINEOS_ROOT).policy;

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
  assert.deepEqual(Object.keys(answer), [
    'domain', 'rules', 'skills', 'skills_suppressed', 'agent', 'risk_floor', 'hook_guidance', 'excluded',
  ]);
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
    'id', 'title', 'rules', 'skills', 'skills_suppressed', 'agents', 'commands', 'mcp',
    'model_tier', 'risk_floor', 'note',
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

test('admit answers the section in the legacy key order', () => {
  const cap = policy.parallelism.wave_concurrency_cap;
  assert.deepEqual(keysOf(['admit', '--inflight', '0', '--queued', '0']), ['action', 'capacity', 'reason']);
  assert.deepEqual(answerOf(['admit', '--inflight', '0', '--queued', '0'], 0), {
    action: 'dispatch',
    capacity: cap,
    reason: `inflight 0 below cap ${cap}`,
  });
});

test('admit gives an absent, empty and non-numeric count the one legacy message', () => {
  const inflight = { error: 'admit requires a numeric --inflight' };
  assert.deepEqual(answerOf(['admit'], 1), inflight);
  assert.deepEqual(answerOf(['admit', '--inflight', ''], 1), inflight);
  assert.deepEqual(answerOf(['admit', '--inflight', 'abc', '--queued', '0'], 1), inflight);
  const queued = { error: 'admit requires a numeric --queued' };
  assert.deepEqual(answerOf(['admit', '--inflight', '1'], 1), queued);
  assert.deepEqual(answerOf(['admit', '--inflight', '1', '--queued', 'abc'], 1), queued);
});

// A leading zero is a shell-ism, not a JSON number: bash normalised it, and the
// digits check in front of Number.parseInt keeps that without reading "1abc" as 1.
test('admit normalises a leading-zero count and refuses a partly-numeric one', () => {
  const cap = policy.parallelism.wave_concurrency_cap;
  assert.deepEqual(answerOf(['admit', '--inflight', '02', '--queued', '0'], 0), {
    action: 'dispatch',
    capacity: cap - 2,
    reason: `inflight 2 below cap ${cap}`,
  });
  assert.deepEqual(answerOf(['admit', '--inflight', '1abc', '--queued', '0'], 1), {
    error: 'admit requires a numeric --inflight',
  });
});

// bash checked `[ $# -ge 2 ]` here and answered "admit requires a value for
// --inflight" (and "admit: unknown argument --bogus"); parseFlags answers the two
// messages the plan pins for every arm. Both sides refuse — the wording is the
// only difference, which is why parity.test.ts excludes these cases by name
// rather than asserting them.
test('admit refuses a valueless flag and an unknown one rather than spinning', () => {
  assert.deepEqual(answerOf(['admit', '--inflight'], 1), { error: 'admit: --inflight requires a value' });
  assert.deepEqual(answerOf(['admit', '--bogus', 'x'], 1), { error: 'admit: unknown flag --bogus' });
});

test('breaker answers the section in the legacy key order', () => {
  const threshold = policy.breaker.failure_threshold;
  assert.deepEqual(keysOf(['breaker', '--state', 'closed', '--failures', '0']), ['state', 'allow', 'reason']);
  assert.deepEqual(answerOf(['breaker', '--state', 'closed', '--failures', '0'], 0), {
    state: 'closed',
    allow: true,
    reason: `0 of ${threshold} failures — resource healthy`,
  });
});

test('breaker gives an absent, empty and unrecognized state the one legacy message', () => {
  const expected = { error: 'breaker requires --state closed|open|half-open' };
  assert.deepEqual(answerOf(['breaker'], 1), expected);
  assert.deepEqual(answerOf(['breaker', '--state', ''], 1), expected);
  assert.deepEqual(answerOf(['breaker', '--state', 'bogus', '--failures', '1'], 1), expected);
  assert.deepEqual(answerOf(['breaker', '--failures', '1'], 1), expected);
  assert.deepEqual(answerOf(['breaker', '--state'], 1), { error: 'breaker: --state requires a value' });
});

// Each state reads its own fact, so each one refuses on its own terms: an absent
// value and a value outside the vocabulary reach the same message, exactly as the
// bash case statements did.
test('each state refuses the fact it needs and did not get', () => {
  assert.deepEqual(answerOf(['breaker', '--state', 'closed'], 1), {
    error: 'breaker --state closed requires a numeric --failures',
  });
  assert.deepEqual(answerOf(['breaker', '--state', 'closed', '--failures', 'abc'], 1), {
    error: 'breaker --state closed requires a numeric --failures',
  });
  assert.deepEqual(answerOf(['breaker', '--state', 'open'], 1), {
    error: 'breaker --state open requires --cooldown-elapsed true|false',
  });
  assert.deepEqual(answerOf(['breaker', '--state', 'open', '--cooldown-elapsed', 'maybe'], 1), {
    error: 'breaker --state open requires --cooldown-elapsed true|false',
  });
  assert.deepEqual(answerOf(['breaker', '--state', 'half-open'], 1), {
    error: 'breaker --state half-open requires --probe-result ok|failed',
  });
  assert.deepEqual(answerOf(['breaker', '--state', 'half-open', '--probe-result', 'maybe'], 1), {
    error: 'breaker --state half-open requires --probe-result ok|failed',
  });
});

test('breaker reads the booleans and the counts its flags spell', () => {
  const threshold = policy.breaker.failure_threshold;
  assert.equal(stateOf(['breaker', '--state', 'closed', '--failures', String(threshold)]), 'open');
  // A leading zero normalises, and the value is the threshold itself so only a
  // correctly parsed number answers open.
  assert.equal(stateOf(['breaker', '--state', 'closed', '--failures', `0${String(threshold)}`]), 'open');
  assert.equal(stateOf(['breaker', '--state', 'open', '--cooldown-elapsed', 'false']), 'open');
  assert.equal(stateOf(['breaker', '--state', 'open', '--cooldown-elapsed', 'true']), 'half-open');
  assert.equal(stateOf(['breaker', '--state', 'half-open', '--probe-result', 'ok']), 'closed');
  assert.equal(stateOf(['breaker', '--state', 'half-open', '--probe-result', 'failed']), 'open');
});

test('hitl answers the section in the legacy key order', () => {
  assert.deepEqual(keysOf(['hitl', '--risk', 'low', '--autonomy', 'A2']), [
    'required', 'reasons', 'autonomy_after', 'record_home',
  ]);
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2'], 0), {
    required: false,
    reasons: [],
    autonomy_after: 'A2',
    record_home: policy.hitl.record_home,
  });
});

test('hitl gives an absent, empty and unrecognized tier the one legacy message', () => {
  const expected = { error: 'hitl requires --risk low|medium|high' };
  assert.deepEqual(answerOf(['hitl'], 1), expected);
  assert.deepEqual(answerOf(['hitl', '--risk', ''], 1), expected);
  assert.deepEqual(answerOf(['hitl', '--risk', 'banana', '--autonomy', 'A2'], 1), expected);
  assert.deepEqual(answerOf(['hitl', '--autonomy', 'A2'], 1), expected);
  assert.deepEqual(answerOf(['hitl', '--risk'], 1), { error: 'hitl: --risk requires a value' });
});

// The arm hands every value but the tier over as the raw flag string, so these
// messages are the section's — one place, whichever caller declared the fact.
test('hitl refuses an absent autonomy and every value outside its vocabulary', () => {
  assert.deepEqual(answerOf(['hitl', '--risk', 'low'], 1), { error: 'hitl requires --autonomy A0..A4' });
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A9'], 1), { error: 'hitl requires --autonomy A0..A4' });
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--evidence', 'maybe'], 1), {
    error: 'hitl --evidence must be thin|adequate',
  });
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--external-effect', 'yes'], 1), {
    error: 'hitl --external-effect must be true|false',
  });
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--conflict', 'yes'], 1), {
    error: 'hitl --conflict must be true|false',
  });
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', 'nonsense'], 1), {
    error: 'unknown situation: nonsense (one of retry.never_retry or hitl.situations)',
  });
});

// The same plan-pinned wording as the other arms, where bash had a per-arm one
// ("hitl requires a value for --situation").
test('hitl refuses a valueless flag rather than spinning', () => {
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation'], 1), {
    error: 'hitl: --situation requires a value',
  });
  assert.deepEqual(answerOf(['hitl', '--bogus', 'x'], 1), { error: 'hitl: unknown flag --bogus' });
});

// bash bound --situation with ${2:-} and tested `[ -n "$situation" ]`, so an
// empty value was no situation at all rather than an unknown one.
test('an empty situation is no situation, not an unknown one', () => {
  assert.deepEqual(answerOf(['hitl', '--risk', 'low', '--autonomy', 'A2', '--situation', ''], 0), {
    required: false,
    reasons: [],
    autonomy_after: 'A2',
    record_home: policy.hitl.record_home,
  });
});

test('waves answers the section in the legacy key order', () => {
  const units = JSON.stringify([
    { id: 'a', files: ['a.ts'], depends_on: [] },
    { id: 'b', files: ['b.ts'], depends_on: [] },
    { id: 'c', files: ['c.ts'], depends_on: ['a', 'b'] },
  ]);
  assert.deepEqual(keysOf(['waves', '--units', units]), ['waves', 'violations', 'fanout_line']);
  assert.deepEqual(answerOf(['waves', '--units', units], 0), {
    waves: [['a', 'b'], ['c']],
    violations: [],
    fanout_line: '[fanout] waves=2 wave1=(a, b) wave2=(c)',
  });
});

test('waves gives an absent and an empty --units the one legacy message', () => {
  const expected = { error: 'waves requires --units <json array>' };
  assert.deepEqual(answerOf(['waves'], 1), expected);
  assert.deepEqual(answerOf(['waves', '--units', ''], 1), expected);
});

// bash piped the payload into `jq -e 'type == "array"'`, so text that is not JSON
// and JSON that is not an array failed the same guard with the same message.
test('waves refuses a payload that is not a JSON array', () => {
  const expected = { error: 'waves --units must be a JSON array' };
  assert.deepEqual(answerOf(['waves', '--units', 'not json'], 1), expected);
  assert.deepEqual(answerOf(['waves', '--units', '{}'], 1), expected);
});

// The one arm where bash could not refuse at all: `--units` with no value bound
// "" and then `shift 2` ran off the end, so the flag re-matched and the loop spun
// forever. parseFlags answers instead — which is why parity.test.ts cannot carry
// this case.
test('waves refuses --units with no value rather than spinning', () => {
  assert.deepEqual(answerOf(['waves', '--units'], 1), { error: 'waves: --units requires a value' });
});

test('waves reports a cycle as an error naming the units it could not order', () => {
  const units = JSON.stringify([
    { id: 'a', files: [], depends_on: ['b'] },
    { id: 'b', files: [], depends_on: ['a'] },
  ]);
  assert.deepEqual(answerOf(['waves', '--units', units], 1), { error: 'dependency cycle among: a, b' });
});

// A refusal is two facts, and asserting only the message would let a kernel that
// exits 0 on an error pass: the status is checked here so every call site gets it.
function answerOf(argv: string[], status: number): unknown {
  const io = memoryIo({ env });
  assert.equal(runKernel(argv, io), status, `${argv.join(' ')}: unexpected exit code`);
  return JSON.parse(io.stdout.join('')) as unknown;
}

function actionOf(argv: string[]): unknown {
  return fieldOf(argv, 'action');
}

function stateOf(argv: string[]): unknown {
  return fieldOf(argv, 'state');
}

function fieldOf(argv: string[], field: string): unknown {
  const answer = answerOf(argv, 0);
  if (!isRecord(answer)) throw new Error(`${argv.join(' ')} did not answer an object`);
  return answer[field];
}

// Key order is part of an answer's contract, not a formatting detail: callers
// diff kernel output.
function keysOf(argv: string[]): string[] {
  const answer = answerOf(argv, 0);
  if (!isRecord(answer)) throw new Error(`${argv.join(' ')} did not answer an object`);
  return Object.keys(answer);
}

test('decision-rules answers the section and its matches in the legacy key order', () => {
  assert.deepEqual(keysOf(['decision-rules', '--prompt', 'drop the users table in production']), ['matches', 'any_high']);
  const answer = answerOf(['decision-rules', '--prompt', 'drop the users table in production'], 0);
  if (!isRecord(answer)) throw new Error('decision-rules did not answer an object');
  const matches = answer['matches'];
  if (!Array.isArray(matches)) throw new Error('decision-rules did not answer a matches array');
  const first: unknown = matches[0];
  if (!isRecord(first)) throw new Error('a destructive prompt matched no rule');
  assert.deepEqual(Object.keys(first), ['id', 'require', 'prefer', 'gate', 'risk']);
  assert.equal(answer['any_high'], true);
});

test('decision-rules answers an innocuous prompt with no matches at exit 0', () => {
  assert.deepEqual(answerOf(['decision-rules', '--prompt', "let's write a friendly test"], 0), {
    matches: [],
    any_high: false,
  });
});

test('scale answers the section in the legacy key order', () => {
  assert.deepEqual(keysOf(['scale', '--prompt', 'implement all the endpoints across the codebase']), [
    'big_task', 'spec_authoring', 'design_work',
  ]);
  assert.deepEqual(answerOf(['scale', '--prompt', 'implement all the endpoints across the codebase'], 0), {
    big_task: true,
    spec_authoring: false,
    design_work: false,
  });
});

test('route-escalate answers the escalate composite in the legacy key order', () => {
  const argv = ['route-escalate', '--prompt', 'add a paginated orders endpoint to the API and mirror the screen to mobile'];
  assert.deepEqual(keysOf(argv), [
    'escalate', 'reasons', 'intents', 'suppressed', 'agents', 'model_tier', 'risk_floor', 'scale', 'ambiguous',
  ]);
  const answer = answerOf(argv, 0);
  if (!isRecord(answer)) throw new Error('route-escalate did not answer an object');
  assert.deepEqual(answer['intents'], ['backend', 'mobile']);
  assert.deepEqual(answer['suppressed'], [{ id: 'new-feature', by: 'more-specific-match' }]);
});

test('resolve-task answers the four sections in the legacy key order', () => {
  const argv = ['resolve-task', '--prompt', 'deploy the billing service to production'];
  assert.deepEqual(keysOf(argv), ['task_contract', 'route', 'decision_rules', 'hitl']);
  const answer = answerOf(argv, 0);
  if (!isRecord(answer)) throw new Error('resolve-task did not answer an object');
  // The composite publishes two hitl fields, not the whole section.
  assert.deepEqual(answer['hitl'], { required: true, reasons: ['high-risk'] });
  const contract = answer['task_contract'];
  if (!isRecord(contract)) throw new Error('resolve-task did not answer a task contract');
  assert.equal(contract['risk_floor'], 'high');
  assert.equal(contract['autonomy_ceiling_at_floor'], policy.autonomy.ceiling_by_risk.high);
});

test('resolve-task answers a floor-only prompt with a null hitl, not an absent one', () => {
  const answer = answerOf(['resolve-task', '--prompt', 'add a paginated orders endpoint and mirror the screen to mobile'], 0);
  if (!isRecord(answer)) throw new Error('resolve-task did not answer an object');
  assert.equal(answer['hitl'], null);
  const contract = answer['task_contract'];
  if (!isRecord(contract)) throw new Error('resolve-task did not answer a task contract');
  assert.equal(contract['risk_floor'], 'medium');
});

// bash bound --prompt with ${2:-} and checked it with `[ -n ... ]`, so an absent
// flag and an empty value got one message per arm.
test('the four prompt arms give an absent and an empty --prompt the one legacy message', () => {
  for (const arm of ['decision-rules', 'scale', 'route-escalate', 'resolve-task']) {
    const expected = { error: `${arm} requires --prompt <text>` };
    assert.deepEqual(answerOf([arm], 1), expected, arm);
    assert.deepEqual(answerOf([arm, '--prompt', ''], 1), expected, arm);
  }
});

// The arms where bash could not refuse at all: `--prompt` with no value bound ""
// and then `shift 2` ran off the end, so the flag re-matched and the loop spun
// forever. parseFlags answers instead, which is why parity.test.ts cannot carry
// these cases.
test('the four prompt arms refuse --prompt with no value rather than spinning', () => {
  for (const arm of ['decision-rules', 'scale', 'route-escalate', 'resolve-task']) {
    assert.deepEqual(answerOf([arm, '--prompt'], 1), { error: `${arm}: --prompt requires a value` }, arm);
  }
});

test('the four prompt arms refuse an unknown flag', () => {
  for (const arm of ['decision-rules', 'scale', 'route-escalate', 'resolve-task']) {
    assert.deepEqual(answerOf([arm, '--bogus', 'x'], 1), { error: `${arm}: unknown flag --bogus` }, arm);
  }
});

// The one arm with no bash counterpart: it emits the sparse Answer itself, so a
// caller that needs several sections declares several facts and pays for one
// process.
test('resolve answers only the sections whose facts were declared', () => {
  assert.deepEqual(answerOf(['resolve', '--facts', '{"workType":"build"}'], 0), {
    model: { work: 'build', tier: 'build', model: 'opus', escalates_to: { tier: 'design', model: 'opus' } },
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{}'], 0), {});
});

test('resolve answers several declared facts in the Answer key order', () => {
  const facts = JSON.stringify({
    path: 'README.md',
    workType: 'mechanical',
    riskTier: 'low',
    scale: { prompt: 'write a spec for the payment flow' },
    decisions: { prompt: 'drop the users table in production' },
    waves: { units: [] },
  });
  assert.deepEqual(keysOf(['resolve', '--facts', facts]), [
    'route', 'model', 'risk', 'scale', 'decision_rules', 'waves',
  ]);
});

test('resolve answers the task-contract composite through one call', () => {
  const facts = JSON.stringify({ prompt: 'deploy the billing service to production', taskContract: true });
  assert.deepEqual(keysOf(['resolve', '--facts', facts]), ['route', 'decision_rules', 'hitl', 'task_contract']);
});

test('resolve refuses an absent, empty or valueless --facts', () => {
  assert.deepEqual(answerOf(['resolve'], 1), { error: 'resolve requires --facts <json>' });
  assert.deepEqual(answerOf(['resolve', '--facts', ''], 1), { error: 'resolve requires --facts <json>' });
  assert.deepEqual(answerOf(['resolve', '--facts'], 1), { error: 'resolve: --facts requires a value' });
});

// Text that is not JSON and JSON that is not an object fail the same guard: both
// mean "these are not declared facts".
test('resolve refuses a payload that is not a JSON object', () => {
  const expected = { error: 'resolve --facts must be a JSON object' };
  assert.deepEqual(answerOf(['resolve', '--facts', 'not json'], 1), expected);
  assert.deepEqual(answerOf(['resolve', '--facts', '[]'], 1), expected);
  assert.deepEqual(answerOf(['resolve', '--facts', '"prompt"'], 1), expected);
});

// An unknown key is a caller asking a question this kernel does not answer.
// Accepting it silently would report the absence of a section as an answer.
test('resolve names the fact it does not know', () => {
  assert.deepEqual(answerOf(['resolve', '--facts', '{"bogus":1}'], 1), {
    error: 'resolve --facts: unknown fact bogus',
  });
});

test('resolve narrows each fact by type and names the one that is wrong', () => {
  assert.deepEqual(answerOf(['resolve', '--facts', '{"prompt":123}'], 1), {
    error: 'resolve --facts: prompt must be a string',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"prompt":"x","escalate":"yes"}'], 1), {
    error: 'resolve --facts: escalate must be a boolean',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"riskTier":"banana"}'], 1), {
    error: 'resolve --facts: riskTier must be low|medium|high',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"scale":"x"}'], 1), {
    error: 'resolve --facts: scale must be an object',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"admit":{"inflight":0}}'], 1), {
    error: 'resolve --facts: admit.queued must be a number',
  });
});

// The sections keep their own messages: a fact the parser accepts by type and the
// section refuses by value is refused by the section, not re-validated here.
test('resolve lets a section refuse its own fact', () => {
  assert.deepEqual(answerOf(['resolve', '--facts', '{"waves":{}}'], 1), {
    error: 'waves --units must be a JSON array',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"breaker":{"state":"bogus"}}'], 1), {
    error: 'breaker requires --state closed|open|half-open',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"hitl":{"riskTier":"low","autonomy":"A2","evidence":"maybe"}}'], 1), {
    error: 'hitl --evidence must be thin|adequate',
  });
});

// The refusals resolve() owns rather than any section: two facts answering one key.
test('resolve refuses two facts that would answer one key', () => {
  assert.deepEqual(answerOf(['resolve', '--facts', '{"path":"a.ts","prompt":"add a thing"}'], 1), {
    error: 'a path fact and a prompt fact cannot be declared together',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"escalate":true}'], 1), {
    error: 'an escalate fact cannot be declared without a prompt fact',
  });
  assert.deepEqual(answerOf(['resolve', '--facts', '{"prompt":"x","taskContract":true,"decisions":{"prompt":"x"}}'], 1), {
    error: 'a task-contract fact and a decisions fact cannot be declared together',
  });
});

// skill-state is the one arm parsed by hand rather than by parseFlags, because
// the bash message for an unrecognised argument here is "unknown argument" and
// the parity suite compares that string. The missing-value refusal is the half
// with NO bash counterpart — bash's `shift 2` ran off the end and spun its loop
// forever — so it is asserted here, where the TypeScript wording is owned.
test('skill-state refuses an unknown argument with the legacy wording', () => {
  assert.deepEqual(answerOf(['skill-state', '--bogus', 'x'], 1), {
    error: 'skill-state: unknown argument --bogus',
  });
});

test('skill-state refuses --id with no value instead of answering the list', () => {
  assert.deepEqual(answerOf(['skill-state', '--id'], 1), {
    error: 'skill-state: --id requires a value',
  });
});

test('skill-state answers the list form for no argument and for an empty --id', () => {
  for (const argv of [['skill-state'], ['skill-state', '--id', '']]) {
    const answer = answerOf(argv, 0);
    if (!isRecord(answer)) throw new Error(`${argv.join(' ')} did not answer an object`);
    assert.deepEqual(Object.keys(answer), ['skills', 'disabled']);
  }
});

test('skill-state --id answers the lookup form in jq key order', () => {
  const answer = answerOf(['skill-state', '--id', 'no-such-skill-anywhere'], 0);
  assert.deepEqual(answer, { id: 'no-such-skill-anywhere', exists: false, enabled: true });
});

// resolve-stack is the one arm whose positional is optional and whose answer
// comes from the caller's tree, not the registries: the cases below drive it
// over a scratch directory and never over the checkout.
test('resolve-stack detects the tree at the given directory', (t) => {
  const dir = tempRoot(t);
  mkdirSync(join(dir, 'api'));
  writeFileSync(join(dir, 'api', 'requirements.txt'), 'fastapi==0.110.0\n');
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"18"}}\n');
  const io = memoryIo({ env });
  assert.equal(runKernel(['resolve-stack', dir], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), {
    packages: [
      { dir: '.', language: 'node', framework: 'react', compose_service: null },
      { dir: 'api', language: 'python', framework: 'fastapi', compose_service: null, python_env: 'auto' },
    ],
    source: 'detected',
  });
});

test('resolve-stack answers the config when .engineos/config.json is present', (t) => {
  const dir = tempRoot(t);
  mkdirSync(join(dir, '.engineos'));
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"18"}}\n');
  writeFileSync(join(dir, '.engineos', 'config.json'), JSON.stringify({
    version: 1,
    stack: { packages: [{ dir: './web/', language: 'node', framework: 'next', compose_service: 'web' }] },
  }));
  const io = memoryIo({ env });
  assert.equal(runKernel(['resolve-stack', dir], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), {
    packages: [{ dir: 'web', language: 'node', framework: 'next', compose_service: 'web' }],
    source: 'config',
  });
});

test('resolve-stack defaults to cwd outside a work tree and resolves a relative dir against it', (t) => {
  const dir = tempRoot(t);
  mkdirSync(join(dir, 'svc'));
  writeFileSync(join(dir, 'svc', 'pyproject.toml'), '[project]\ndependencies = ["django"]\n');
  const io = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack'], io), 0);
  assert.deepEqual(JSON.parse(io.stdout.join('')), {
    packages: [{ dir: 'svc', language: 'python', framework: 'django', compose_service: null, python_env: 'auto' }],
    source: 'detected',
  });
  const io2 = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack', 'svc'], io2), 0);
  assert.equal(JSON.parse(io2.stdout.join('')).packages[0].dir, '.');
});

test('resolve-stack refuses a flag, a second argument, a missing directory and a malformed config', (t) => {
  const dir = tempRoot(t);
  const io = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack', '--dir', dir], io), 1);
  assert.deepEqual(JSON.parse(io.stdout.join('')), { error: 'resolve-stack takes a directory as a positional argument, not a flag (got --dir)' });
  const io2 = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack', dir, dir], io2), 1);
  assert.deepEqual(JSON.parse(io2.stdout.join('')), { error: 'resolve-stack takes at most one argument, got 2' });
  const io3 = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack', 'nope'], io3), 1);
  assert.deepEqual(JSON.parse(io3.stdout.join('')), { error: `resolve-stack: ${join(dir, 'nope')} is not a directory` });
  mkdirSync(join(dir, '.engineos'));
  writeFileSync(join(dir, '.engineos', 'config.json'), '{"version":1,"stack":{"packages":[]},"x":1}');
  const io4 = memoryIo({ env, cwd: dir });
  assert.equal(runKernel(['resolve-stack', dir], io4), 1);
  assert.deepEqual(JSON.parse(io4.stdout.join('')), { error: `${join(dir, '.engineos', 'config.json')}: the document has an unknown key "x"` });
});
