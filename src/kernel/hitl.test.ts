import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KernelError, isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { lazyRegistries, type Registries } from './context';
import { hitlSection, type HitlFacts, type HitlSection } from './hitl';

const root = resolveRoot({}, __dirname);
const regs = lazyRegistries(root);

// The record home, the situation list and the reason ids come from the registry,
// so renaming a reason or adding a situation moves these fixtures rather than
// turning them red. The tiers and autonomy levels stay literal on purpose: they
// are the INPUTS the section is being asked about, not registry data mirrored
// back.
const RECORD_HOME = regs.policy.hitl.record_home;
const THIN_HIGH = regs.policy.autonomy.high_with_thin_evidence;

// --- the no-human answer ----------------------------------------------------

test('low risk at A2 needs no human and keeps the ceiling it was given', () => {
  const section = hitlSection({ riskTier: 'low', autonomy: 'A2' }, regs);
  assert.deepEqual(Object.keys(section), ['required', 'reasons', 'autonomy_after', 'record_home']);
  assert.equal(section.required, false);
  assert.deepEqual(section.reasons, []);
  assert.equal(section.autonomy_after, 'A2');
  assert.equal(section.record_home, RECORD_HOME);
});

// --- the reason vocabulary --------------------------------------------------

test('risk high is its own reason and adequate evidence keeps A3', () => {
  const section = hitlSection({ riskTier: 'high', autonomy: 'A3' }, regs);
  assert.equal(section.required, true);
  assert.deepEqual(section.reasons, ['high-risk']);
  assert.equal(section.autonomy_after, 'A3');
});

test('an external effect at A3 requires a human', () => {
  assert.deepEqual(reasons({ riskTier: 'medium', autonomy: 'A3', externalEffect: true }), ['external-effect']);
});

test('an external effect below A3 is not reachable, so it is not a reason', () => {
  const section = hitlSection({ riskTier: 'medium', autonomy: 'A2', externalEffect: true }, regs);
  assert.deepEqual(section.reasons, []);
  assert.equal(section.required, false);
});

test('an external effect above A3 is still a reason', () => {
  assert.deepEqual(reasons({ riskTier: 'medium', autonomy: 'A4', externalEffect: true }), ['external-effect']);
});

test('reasons accumulate in the order the registry declares them', () => {
  assert.deepEqual(
    reasons({ riskTier: 'high', autonomy: 'A3', conflict: true, externalEffect: true }),
    ['high-risk', 'external-effect', 'policy-conflict'],
  );
});

test('a never-retry situation collapses to one reason', () => {
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', situation: 'security-risk' }), [
    'never-retry-situation',
  ]);
});

test('backpressure reject maps to the same id admit cites', () => {
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', situation: 'reject' }), ['budget-exhausted']);
});

test('an exhausted budget and an open breaker each carry their own reason', () => {
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', situation: 'budget-exhausted' }), [
    'budget-exhausted',
  ]);
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', situation: 'breaker-open' }), ['breaker-open']);
});

test('a destructive situation carries the destructive-action reason', () => {
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', situation: 'destructive' }), [
    'destructive-action',
  ]);
});

// Every declared situation must produce at least one reason from the closed
// vocabulary. A situation the section accepts and then drops would answer
// required:false — "no human needed" for an input it did not act on.
test('every declared situation requires a human and cites only declared reasons', () => {
  const declared = [...regs.policy.retry.never_retry, ...regs.policy.hitl.situations];
  assert.ok(declared.length > 0);
  for (const situation of declared) {
    const section = hitlSection({ riskTier: 'low', autonomy: 'A2', situation }, regs);
    assert.equal(section.required, true, `situation ${situation} requires a human`);
    const undeclared = section.reasons.filter((reason) => !regs.policy.hitl.reasons.includes(reason));
    assert.deepEqual(undeclared, [], `situation ${situation} cites only declared reasons`);
  }
});

// --- the thin-evidence drop -------------------------------------------------

test('thin evidence drops autonomy exactly one level', () => {
  assert.equal(after({ riskTier: 'medium', autonomy: 'A2', evidence: 'thin' }), 'A1');
  assert.equal(after({ riskTier: 'low', autonomy: 'A2', evidence: 'thin' }), 'A1');
  assert.equal(after({ riskTier: 'medium', autonomy: 'A3', evidence: 'thin' }), 'A2');
  assert.equal(after({ riskTier: 'low', autonomy: 'A4', evidence: 'thin' }), 'A3');
});

test('thin evidence is its own reason', () => {
  assert.deepEqual(reasons({ riskTier: 'medium', autonomy: 'A2', evidence: 'thin' }), [
    'evidence-insufficient',
  ]);
});

test('the drop never raises the ceiling it was given', () => {
  assert.equal(after({ riskTier: 'low', autonomy: 'A0', evidence: 'thin' }), 'A0');
  assert.equal(after({ riskTier: 'high', autonomy: 'A0', evidence: 'thin' }), 'A0');
});

test('the drop bottoms out at A1', () => {
  assert.equal(after({ riskTier: 'medium', autonomy: 'A1', evidence: 'thin' }), 'A1');
});

test('at risk high the drop lands on the registry value, not one level down', () => {
  assert.equal(after({ riskTier: 'high', autonomy: 'A3', evidence: 'thin' }), THIN_HIGH);
  assert.equal(after({ riskTier: 'high', autonomy: 'A4', evidence: 'thin' }), THIN_HIGH);
});

// Adequate evidence is the identity: without this half, a section that always
// dropped would pass every case above.
test('adequate evidence keeps the ceiling it was given', () => {
  assert.equal(after({ riskTier: 'medium', autonomy: 'A3' }), 'A3');
  assert.equal(after({ riskTier: 'low', autonomy: 'A0' }), 'A0');
  assert.equal(after({ riskTier: 'low', autonomy: 'A2', evidence: 'adequate' }), 'A2');
});

// --- refused inputs ---------------------------------------------------------

test('an unknown situation is an error, never an ignored flag', () => {
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: 'A2', situation: 'nonsense' }, regs),
    kernelError('unknown situation: nonsense (one of retry.never_retry or hitl.situations)'),
  );
});

test('a tier outside low|medium|high is refused', () => {
  // The guard exists for a tier arriving from parsed JSON, where the static type
  // says nothing about the value; JSON.parse is how one really reaches it.
  const rogue: HitlFacts = JSON.parse('{"riskTier":"","autonomy":"A2"}');
  assert.throws(() => hitlSection(rogue, regs), kernelError('hitl requires --risk low|medium|high'));
});

test('an autonomy level outside the declared list is refused', () => {
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: 'A9' }, regs),
    kernelError('hitl requires --autonomy A0..A4'),
  );
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: '' }, regs),
    kernelError('hitl requires --autonomy A0..A4'),
  );
});

test('an unknown evidence value is refused', () => {
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: 'A2', evidence: 'maybe' }, regs),
    kernelError('hitl --evidence must be thin|adequate'),
  );
});

test('a non-boolean conflict or external effect is refused', () => {
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: 'A2', conflict: 'yes' }, regs),
    kernelError('hitl --conflict must be true|false'),
  );
  assert.throws(
    () => hitlSection({ riskTier: 'low', autonomy: 'A2', externalEffect: 'yes' }, regs),
    kernelError('hitl --external-effect must be true|false'),
  );
});

// The legacy CLI hands the flags over as strings; both spellings answer the same.
test('the raw flag strings are read as the booleans they spell', () => {
  assert.deepEqual(reasons({ riskTier: 'medium', autonomy: 'A3', externalEffect: 'true' }), [
    'external-effect',
  ]);
  assert.deepEqual(reasons({ riskTier: 'medium', autonomy: 'A3', externalEffect: 'false' }), []);
  assert.deepEqual(reasons({ riskTier: 'low', autonomy: 'A2', conflict: 'true' }), ['policy-conflict']);
});

// --- fail-closed on the registry -------------------------------------------

test('a policy with no hitl block is refused, never answered with a null record home', () => {
  withPolicy(
    (policy) => {
      delete policy['hitl'];
    },
    (mutated) => {
      assert.throws(
        () => hitlSection({ riskTier: 'low', autonomy: 'A2' }, mutated),
        (error: unknown): boolean => {
          if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
          assert.match(error.message, /\.hitl/);
          return true;
        },
      );
    },
  );
});

test('an empty hitl.record_home is refused on both paths', () => {
  const message =
    'policy.json has no hitl.record_home — hitl will not require a human decision without naming where it is recorded';
  withPolicy(
    (policy) => {
      const hitl = policy['hitl'];
      if (!isRecord(hitl)) throw new Error('policy.json .hitl is not an object');
      hitl['record_home'] = '';
    },
    (mutated) => {
      assert.throws(() => hitlSection({ riskTier: 'high', autonomy: 'A3' }, mutated), kernelError(message));
      assert.throws(() => hitlSection({ riskTier: 'low', autonomy: 'A2' }, mutated), kernelError(message));
    },
  );
});

test('a thin-evidence ceiling that is not a level id is refused', () => {
  withPolicy(
    (policy) => {
      const autonomy = policy['autonomy'];
      if (!isRecord(autonomy)) throw new Error('policy.json .autonomy is not an object');
      autonomy['high_with_thin_evidence'] = 'sideways';
    },
    (mutated) => {
      assert.throws(
        () => hitlSection({ riskTier: 'high', autonomy: 'A3', evidence: 'thin' }, mutated),
        kernelError('policy.json autonomy.high_with_thin_evidence is not an autonomy level: sideways'),
      );
      // The adequate-evidence path does not read the field, so it must still answer.
      assert.equal(hitlSection({ riskTier: 'high', autonomy: 'A3' }, mutated).autonomy_after, 'A3');
    },
  );
});

test('an empty thin-evidence ceiling is refused rather than indexed with nothing', () => {
  withPolicy(
    (policy) => {
      const autonomy = policy['autonomy'];
      if (!isRecord(autonomy)) throw new Error('policy.json .autonomy is not an object');
      autonomy['high_with_thin_evidence'] = '';
    },
    (mutated) => {
      assert.throws(
        () => hitlSection({ riskTier: 'high', autonomy: 'A3', evidence: 'thin' }, mutated),
        kernelError(
          'policy.json has no autonomy.high_with_thin_evidence — hitl cannot resolve the thin-evidence ceiling at risk high',
        ),
      );
    },
  );
});

// A reason the kernel can observe but the registry does not declare would be
// cited by no rule and argued with by nobody — the closed vocabulary is closed
// in both directions.
test('a triggered reason missing from the registry vocabulary is refused', () => {
  withPolicy(
    (policy) => {
      const hitl = policy['hitl'];
      if (!isRecord(hitl)) throw new Error('policy.json .hitl is not an object');
      hitl['reasons'] = regs.policy.hitl.reasons.filter((reason) => reason !== 'high-risk');
    },
    (mutated) => {
      assert.throws(
        () => hitlSection({ riskTier: 'high', autonomy: 'A3' }, mutated),
        kernelError(
          'policy.json .hitl.reasons does not declare: high-risk — a gate may cite nothing outside the closed vocabulary',
        ),
      );
    },
  );
});

function section(facts: HitlFacts): HitlSection {
  return hitlSection(facts, regs);
}

function reasons(facts: HitlFacts): string[] {
  return section(facts).reasons;
}

function after(facts: HitlFacts): string {
  return section(facts).autonomy_after;
}

function withPolicy(
  mutate: (policy: Record<string, unknown>) => void,
  check: (mutated: Registries) => void,
): void {
  const raw = readJsonFile(join(root, 'registries', 'policy.json'));
  if (!isRecord(raw)) throw new Error('registries/policy.json is not an object');
  mutate(raw);
  const dir = mkdtempSync(join(tmpdir(), 'engineos-hitl-'));
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
