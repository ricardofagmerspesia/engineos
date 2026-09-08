import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type Registries } from './context';
import { wavesSection, type WavesSection } from './waves';

const root = resolveRoot({}, __dirname);
const regs = lazyRegistries(root);

// The cap is registry data, so the oversized fixture is GENERATED from it: a
// literal count is "two units over the cap" for exactly one value of
// wave_concurrency_cap, and re-parameterising the registry used to turn such a
// fixture red against a kernel splitting correctly.
const CAP = regs.policy.parallelism.wave_concurrency_cap;

// --- layering ---------------------------------------------------------------

test('independent units share a wave and a dependant waits for the next one', () => {
  const section = layered([
    { id: 'a', files: ['a.ts'], depends_on: [] },
    { id: 'b', files: ['b.ts'], depends_on: [] },
    { id: 'c', files: ['c.ts'], depends_on: ['a', 'b'] },
  ]);
  assert.deepEqual(section.waves, [['a', 'b'], ['c']]);
  assert.deepEqual(section.violations, []);
  assert.equal(section.fanout_line, '[fanout] waves=2 wave1=(a, b) wave2=(c)');
});

test('a chain of dependencies layers one unit per wave', () => {
  assert.deepEqual(layered([{ id: 'a' }, { id: 'b', depends_on: ['a'] }]).waves, [['a'], ['b']]);
});

test('absent files and depends_on read as empty, exactly as the optional jq path did', () => {
  const section = layered([{ id: 'solo' }]);
  assert.deepEqual(section.waves, [['solo']]);
  assert.deepEqual(section.violations, []);
});

test('an empty unit list answers with an empty plan rather than an error', () => {
  const section = layered([]);
  assert.deepEqual(section.waves, []);
  assert.deepEqual(section.violations, []);
  assert.equal(section.fanout_line, '[fanout] waves=0 ');
});

// --- the disjoint-scope rule ------------------------------------------------

test('two units in one wave owning a file is a violation, not an error', () => {
  const section = layered([
    { id: 'a', files: ['shared.ts'], depends_on: [] },
    { id: 'b', files: ['shared.ts'], depends_on: [] },
  ]);
  assert.deepEqual(section.waves, [['a', 'b']]);
  assert.deepEqual(section.violations, [{ file: 'shared.ts', units: ['a', 'b'] }]);
});

test('the same file in different waves is no violation — the waves serialize it', () => {
  const section = layered([
    { id: 'a', files: ['shared.ts'], depends_on: [] },
    { id: 'b', files: ['shared.ts'], depends_on: ['a'] },
  ]);
  assert.deepEqual(section.waves, [['a'], ['b']]);
  assert.deepEqual(section.violations, []);
});

test('violations are reported per file, in file order', () => {
  const section = layered([
    { id: 'a', files: ['z.ts', 'm.ts'], depends_on: [] },
    { id: 'b', files: ['m.ts', 'z.ts'], depends_on: [] },
  ]);
  assert.deepEqual(section.violations, [
    { file: 'm.ts', units: ['a', 'b'] },
    { file: 'z.ts', units: ['a', 'b'] },
  ]);
});

// --- the concurrency cap ----------------------------------------------------

test('a layer wider than the cap splits in input order', () => {
  const units = Array.from({ length: CAP + 2 }, (_unused, i) => ({ id: `u${i + 1}`, files: [], depends_on: [] }));
  const section = layered(units);
  assert.equal(section.waves.length, 2);
  assert.equal(section.waves[0]?.length, CAP);
  assert.equal(section.waves[1]?.length, 2);
  assert.deepEqual(section.waves[1], [`u${CAP + 1}`, `u${CAP + 2}`]);
});

test('a cap below one is refused rather than spun over', () => {
  withPolicy(
    (policy) => {
      const parallelism = policy['parallelism'];
      if (!isRecord(parallelism)) throw new Error('policy.json .parallelism is not an object');
      parallelism['wave_concurrency_cap'] = 0;
    },
    (mutated) => {
      assert.throws(
        () => wavesSection({ units: [{ id: 'a' }] }, mutated),
        kernelError('policy.json .parallelism.wave_concurrency_cap must be a positive integer, not 0'),
      );
    },
  );
});

// --- refused graphs ---------------------------------------------------------

test('a cycle is an error naming the units it could not order', () => {
  assert.throws(
    () =>
      wavesSection(
        {
          units: [
            { id: 'a', files: [], depends_on: ['b'] },
            { id: 'b', files: [], depends_on: ['a'] },
          ],
        },
        regs,
      ),
    kernelError('dependency cycle among: a, b'),
  );
});

test('duplicate unit ids are an error', () => {
  assert.throws(
    () => wavesSection({ units: [{ id: 'a' }, { id: 'a' }] }, regs),
    kernelError('duplicate unit ids'),
  );
});

test('a dependency on a unit nobody declared is an error', () => {
  assert.throws(
    () => wavesSection({ units: [{ id: 'a', depends_on: ['zz'] }] }, regs),
    kernelError('depends_on references unknown unit(s): zz'),
  );
});

test('unknown dependencies are reported once each, in order', () => {
  assert.throws(
    () =>
      wavesSection(
        { units: [{ id: 'a', depends_on: ['zz', 'yy'] }, { id: 'b', depends_on: ['zz'] }] },
        regs,
      ),
    kernelError('depends_on references unknown unit(s): yy, zz'),
  );
});

// --- refused payloads -------------------------------------------------------

test('a payload that is not an array is refused', () => {
  const message = 'waves --units must be a JSON array';
  assert.throws(() => wavesSection({ units: { id: 'a' } }, regs), kernelError(message));
  assert.throws(() => wavesSection({ units: 'a,b' }, regs), kernelError(message));
  assert.throws(() => wavesSection({ units: null }, regs), kernelError(message));
});

// A unit the kernel cannot read must not become a wave naming nothing: the bash
// arm answered `null` there, and a plan that dispatches an unnamed unit is worse
// than a refusal.
test('a unit without a usable id is refused rather than answered with a nameless wave', () => {
  assert.throws(
    () => wavesSection({ units: [{ files: ['x.ts'] }] }, regs),
    kernelError('waves --units[0] must be an object with a non-empty string id'),
  );
  assert.throws(
    () => wavesSection({ units: [{ id: 'a' }, 2] }, regs),
    kernelError('waves --units[1] must be an object with a non-empty string id'),
  );
  assert.throws(
    () => wavesSection({ units: [{ id: '' }] }, regs),
    kernelError('waves --units[0] must be an object with a non-empty string id'),
  );
});

test('malformed files and depends_on are refused', () => {
  assert.throws(
    () => wavesSection({ units: [{ id: 'a', files: 'a.ts' }] }, regs),
    kernelError('waves --units[0].files must be an array of file paths'),
  );
  assert.throws(
    () => wavesSection({ units: [{ id: 'a', files: [1] }] }, regs),
    kernelError('waves --units[0].files must be an array of file paths'),
  );
  assert.throws(
    () => wavesSection({ units: [{ id: 'a', depends_on: { b: true } }] }, regs),
    kernelError('waves --units[0].depends_on must be an array of unit ids'),
  );
});

function layered(units: unknown): WavesSection {
  const section = wavesSection({ units }, regs);
  assert.deepEqual(Object.keys(section), ['waves', 'violations', 'fanout_line']);
  return section;
}

function withPolicy(
  mutate: (policy: Record<string, unknown>) => void,
  check: (mutated: Registries) => void,
): void {
  const raw = readJsonFile(join(root, 'registries', 'policy.json'));
  if (!isRecord(raw)) throw new Error('registries/policy.json is not an object');
  mutate(raw);
  const dir = mkdtempSync(join(tmpdir(), 'engineos-waves-'));
  try {
    mkdirSync(join(dir, 'registries'));
    writeFileSync(join(dir, 'registries', 'policy.json'), JSON.stringify(raw), 'utf8');
    check(lazyRegistries(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function kernelError(message: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}
