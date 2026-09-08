// C16's policy.json block: the shape the risk and autonomy arms answer from,
// and the prose numbers the always-on rules quote. Four of the assertions are
// MIRRORS rows — the gate ladder, the wave cap, the spec threshold and the
// fan-out threshold — because each resolves one registry field into one passage.
// The rest compare the registry against itself or against a sentence with no
// number to capture, and stay code.
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { duplicates, readPolicy, subjectText, unreadableRegistry, type RawPolicy } from './decision-registries-data';
import type { MirrorSelector } from './decision-registries';

const RISK_INPUTS: readonly string[] = ['blast-radius', 'contract-surface', 'data-sensitivity', 'reversibility', 'spend'];

const AUTONOMY_LEVELS = 'A0 A1 A2 A3 A4';

const RISK_TIER = /^(low|medium|high)$/;

// The bash asserted `>= 4`: the list may grow, and must never quietly shrink to
// a couple of entries that make the never-retry rule look satisfied.
const NEVER_RETRY_MINIMUM = 4;

export function policyResults(ctx: CheckContext, mirror: MirrorSelector): CheckResult[] {
  let policy: RawPolicy;
  try {
    policy = readPolicy(ctx.root);
  } catch {
    return [unreadableRegistry('registries/policy.json')];
  }
  return [
    result('C16', 'policy.json risk aggregation is max (risk never averages)', aggregation(policy)),
    result('C16', 'policy.json carries the five risk inputs', riskInputs(policy)),
    result('C16', 'policy.json autonomy levels are A0..A4 in order', autonomyLevels(policy)),
    result('C16', 'policy.json autonomy ceiling covers low/medium/high with valid levels', ceiling(policy)),
    // Deviation 5: the bash compared the ladder against a literal string and
    // never opened rules/gates.md. The row reads the `## The ladder` table.
    result('C16', 'policy.json gate ladder matches rules/gates.md', mirror('gate-ladder-missing-from-prose')),
    result('C16', 'policy.json gates.by_risk covers every ladder gate for every tier', gateCoverage(policy)),
    result('C16', 'policy.json never_retry list intact', neverRetry(policy)),
    result('C16', 'wave cap agrees between policy.json and rules/parallelism.md', mirror('wave-cap-drift')),
    result('C16', 'retry bound agrees: 2 attempts + 1 escalation in prose and policy.json', retryBound(ctx, policy)),
    result('C16', 'spec threshold agrees between CLAUDE.md and policy.json', mirror('spec-threshold-drift')),
    result('C16', 'fan-out threshold agrees between rules/parallelism.md and policy.json', mirror('fanout-threshold-drift')),
  ];
}

// ------------------------------------------------------------------ internals

function aggregation(policy: RawPolicy): Finding[] {
  if (policy.riskAggregation === 'max') return [];
  return [finding('C16', 'risk-aggregation-not-max', subjectText(policy.riskAggregation))];
}

function riskInputs(policy: RawPolicy): Finding[] {
  const findings: Finding[] = [];
  const declared = policy.riskInputs;
  for (const id of RISK_INPUTS) {
    if (!declared.includes(id)) findings.push(finding('C16', 'risk-inputs-drift', `missing:${id}`));
  }
  for (const id of declared) {
    if (!RISK_INPUTS.includes(id)) findings.push(finding('C16', 'risk-inputs-drift', `unexpected:${subjectText(id)}`));
  }
  // The bash compared sorted joins, so a repeated id failed it too; set
  // membership alone would not see one.
  for (const id of duplicates(declared)) findings.push(finding('C16', 'risk-inputs-drift', `duplicate:${id}`));
  return findings;
}

function autonomyLevels(policy: RawPolicy): Finding[] {
  if (policy.autonomyLevels.join(' ') === AUTONOMY_LEVELS) return [];
  return [finding('C16', 'autonomy-levels-drift', subjectText(policy.autonomyLevels.join(',')))];
}

// Every key is a risk tier, every value an autonomy level the same file
// declares, and all three tiers are present.
function ceiling(policy: RawPolicy): Finding[] {
  const levels = new Set(policy.autonomyLevels);
  const findings: Finding[] = [];
  for (const [tier, level] of Object.entries(policy.ceilingByRisk)) {
    if (RISK_TIER.test(tier) && typeof level === 'string' && levels.has(level)) continue;
    findings.push(finding('C16', 'ceiling-by-risk-invalid', subjectText(tier)));
  }
  const entries = Object.keys(policy.ceilingByRisk).length;
  if (entries !== 3) findings.push(finding('C16', 'ceiling-by-risk-invalid', `entries:${entries}`));
  return findings;
}

// A tier whose gate set is not exactly the ladder cannot answer "which gates
// apply" for that tier. An unreadable ladder leaves every tier reported, which
// is the honest answer: with no ladder there is no coverage to confirm.
function gateCoverage(policy: RawPolicy): Finding[] {
  const ladder = [...policy.gateLadder].sort().join(',');
  const findings: Finding[] = [];
  for (const [tier, gates] of Object.entries(policy.gatesByRisk)) {
    if ([...gates].sort().join(',') !== ladder) findings.push(finding('C16', 'gates-by-risk-incomplete', subjectText(tier)));
  }
  return findings;
}

function neverRetry(policy: RawPolicy): Finding[] {
  if (policy.neverRetryCount >= NEVER_RETRY_MINIMUM) return [];
  return [finding('C16', 'never-retry-shrunk', String(policy.neverRetryCount))];
}

// The one prose-number pair with no numeral to capture: rules/parallelism.md
// spells the bound in words ("Two attempts per unit, one escalation"), so a
// `quotes` mirror row has nothing to read and the sentence is asserted here
// beside the two registry fields it is the prose form of.
function retryBound(ctx: CheckContext, policy: RawPolicy): Finding[] {
  const findings: Finding[] = [];
  const prose = ctx.readText('rules/parallelism.md') ?? '';
  if (!/two attempts per unit, one escalation/i.test(prose)) findings.push(finding('C16', 'retry-bound-drift', 'prose'));
  if (String(policy.retryMaxAttempts) !== '2') {
    findings.push(finding('C16', 'retry-bound-drift', `max_attempts_per_unit:${subjectText(policy.retryMaxAttempts)}`));
  }
  if (String(policy.retryEscalations) !== '1') {
    findings.push(finding('C16', 'retry-bound-drift', `escalations:${subjectText(policy.retryEscalations)}`));
  }
  return findings;
}
