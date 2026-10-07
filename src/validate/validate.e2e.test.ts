// End-to-end cases for `engineos validate`, ported one-for-one from
// scripts/test-validate-engineos.sh (plan Tasks 42-57). What survives here is the
// public surface of the validator — `--list`, `--only` selection, the exit codes,
// the header and summary lines — asserted against the REAL check registry and the
// real tree, through the built bundle.
//
// cli.test.ts already covers argv parsing in process over fixture Checks. These
// cases are not that: they spawn dist/engineos.cjs, so they also pin that
// `validate` is reachable through dispatch, that its exit code survives the
// process boundary, and that ENGINEOS_ROOT makes a copied tree validate itself
// rather than the checkout the runtime lives in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
// Test-only module, never bundled: checkoutCopy is the cpSync form of the tar the
// bash case used to plant its breakage in, and duplicating its exclusion filter
// here would drift from the copy the family tests validate against.
import { checkoutCopy, checkoutRoot } from '../checks/testing';
import { runCli, type RunResult } from '../testing/harness';

const HEADER = '== EngineOS integrity ==';
const OK_PREFIX = 'ok   ';
const FAIL_PREFIX = 'FAIL ';
const CHECK_ID = /^C[0-9]+[a-z]*$/;

function validate(args: string[], root: string): RunResult {
  return runCli(['validate', ...args], { env: { ENGINEOS_ROOT: root } });
}

// The bash suite piped stdout through head/tail/grep, which discards the single
// trailing newline; strip it here so the last line is the summary, not ''.
function lines(text: string): string[] {
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed === '' ? [] : trimmed.split('\n');
}

function okLines(text: string): string[] {
  return lines(text).filter((line) => line.startsWith(OK_PREFIX));
}

test('--list prints the 68 registered Checks in natural order (C1 first, C37 last)', () => {
  const listed = validate(['--list'], checkoutRoot());
  assert.equal(listed.status, 0);
  const ids = lines(listed.stdout);
  assert.deepEqual(ids.filter((id) => !CHECK_ID.test(id)), [], 'every --list line is a check id');
  assert.equal(ids.length, 68);
  assert.equal(ids[0], 'C1');
  assert.equal(ids[ids.length - 1], 'C37');
});

test('--only with an id no Check answers to exits 2', () => {
  const rejected = validate(['--only', 'C0nope'], checkoutRoot());
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stderr, 'unknown check id: C0nope\n');
  assert.equal(rejected.stdout, '');
});

test('an unknown argument exits 2', () => {
  const rejected = validate(['--bogus'], checkoutRoot());
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stderr, 'unknown argument: --bogus\n');
  assert.equal(rejected.stdout, '');
});

test('--only C17 runs its letter-suffixed sub-checks, --only C17c runs only C17c', () => {
  const root = checkoutRoot();
  const parent = okLines(validate(['--only', 'C17'], root).stdout);
  const child = okLines(validate(['--only', 'C17c'], root).stdout);
  assert.ok(child.length >= 1, `--only C17c emitted no ok line: ${child.join(' | ')}`);
  assert.ok(parent.length > child.length, `--only C17 emitted ${parent.length} ok lines, C17c ${child.length}`);
  const childLine = child[0];
  assert.ok(childLine !== undefined);
  assert.ok(parent.includes(childLine), `--only C17 does not cover the sub-check line "${childLine}"`);
});

// The exact result count IS the point, not just `failed 0`. A family that stops
// emitting a result — a guard that returns [] where it used to report, a check
// silently dropped from a registry — keeps every other assertion green and the
// lost evidence is invisible. 116 is the registered checks' result count on this
// tree; changing it is a deliberate edit here, never a side effect elsewhere.
const RESULT_COUNT = 116;

test('a clean tree validates green with the header and the exact result count', () => {
  const clean = validate([], checkoutRoot());
  const out = lines(clean.stdout);
  assert.equal(out[0], HEADER);
  assert.equal(out[out.length - 1], `passed ${RESULT_COUNT}, failed 0`);
  assert.equal(clean.status, 0, `the unfiltered run is not green: ${clean.stdout}${clean.stderr}`);
  assert.equal(okLines(clean.stdout).length, RESULT_COUNT, 'every counted result printed an ok line');
});

// A planted failure must flip the exit code: copy the tree, break one invariant
// the always-on rule check owns, and expect red from the copy — not from here.
test('a planted failure in a copied tree flips the exit code to 1 and prints a FAIL line', (t) => {
  const planted = checkoutCopy(t, (copy) => {
    rmSync(join(copy, 'rules', 'base.md'));
  });
  const red = validate(['--only', 'C2'], planted);
  assert.equal(red.status, 1);
  const failures = lines(red.stdout).filter((line) => line.startsWith(FAIL_PREFIX));
  assert.equal(failures.length, 1, `expected one FAIL line, got: ${red.stdout}`);
  // The subject names the deleted rule, so the case cannot pass on some unrelated
  // breakage in the copy.
  assert.match(failures[0] ?? '', /\[rule-missing:base\]/);
});
