// Family 40-decision-registries: check C16.
//
// models.json, intents.json and policy.json are the machine-readable form of
// rules/models.md, the CLAUDE.md router table and the always-on policy prose.
// The prose stays the human mirror; C16 is what keeps mirror and data from
// drifting apart in silence. One check over three registries because the
// cross-registry assertions — an intent's rules against its routing domain, a
// prose number against its registry field — do not decompose along file lines.
//
// The bash printed one ok/bad line per assertion into a single aggregated
// message; the port returns one CheckResult per assertion, in the same order,
// so a failure names the invariant rather than a substring of a sentence.
// Five of those assertions are now MIRRORS rows (src/checks/mirrors.ts); the
// rest are registry-to-registry joins and prose canaries, which are not
// mirrors and stay code here.
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';
import { frontmatterValue } from '../gen/frontmatter';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import type { CheckContext } from './lib';
import { duplicates, readModels, unreadableRegistry, type RawModels } from './decision-registries-data';
import { intentsResults } from './decision-registries-intents';
import { policyResults } from './decision-registries-policy';

// One code per bash assertion, named for the invariant it breaks; where an
// assertion covered several kinds of defect the kind is a prefix on the
// subject, the way runMirrors already reports `undeclared:` and `section-empty:`.
// The five ids that are MIRRORS rows appear here because the row id IS the
// finding code under this check.
export const C16_FINDINGS = [
  'registry-unreadable',
  'escalation-order-not-a-permutation',
  'escalates-to-breaks-order',
  'work-type-unknown-tier',
  'duplicate-tier-id',
  'shared-binding-undocumented',
  'model-missing-from-prose',
  'adr-row-model-mismatch',
  'code-review-row-model-mismatch',
  'agent-model-unbound',
  'duplicate-intent-id',
  'dangling-reference',
  'unmatchable-signal',
  'hook-mirrored-domain-mismatch',
  'intent-routing-mismatch',
  'routing-domain-not-claimed-once',
  'intent-unknown-model-tier',
  'intent-invalid-risk-floor',
  'intent-count-drift',
  'intent-stack-invalid',
  'intent-generic-signal-unknown',
  'stack-intent-sample-unrouted',
  'risk-aggregation-not-max',
  'risk-inputs-drift',
  'autonomy-levels-drift',
  'ceiling-by-risk-invalid',
  'gate-ladder-missing-from-prose',
  'gates-by-risk-incomplete',
  'never-retry-shrunk',
  'wave-cap-drift',
  'retry-bound-drift',
  'spec-threshold-drift',
  'fanout-threshold-drift',
] as const;

declare module './codes' {
  interface CheckCodes {
    C16: (typeof C16_FINDINGS)[number];
  }
}

export type MirrorSelector = (rowId: string) => Finding[];

export const DECISION_REGISTRIES_CHECKS: readonly Check[] = [
  { id: 'C16', codes: C16_FINDINGS, run: checkC16 },
];

function checkC16(ctx: CheckContext): CheckResult[] {
  // The table runs once; each row's findings land in the result for the bash
  // assertion it replaced, so the check keeps one line per assertion. The
  // selector is called only inside a registry's guarded block, which is where
  // the bash ran the assertion it replaced.
  let cached: Finding[] | undefined;
  const mirror: MirrorSelector = (rowId) => {
    if (cached === undefined) cached = runMirrors(rowsOf('C16'), ctx);
    return cached.filter((entry) => entry.code === rowId);
  };
  return [...modelsResults(ctx, mirror), ...intentsResults(ctx), ...policyResults(ctx, mirror)];
}

// ------------------------------------------------------------------ models.json

function modelsResults(ctx: CheckContext, mirror: MirrorSelector): CheckResult[] {
  let models: RawModels;
  try {
    models = readModels(ctx.root);
  } catch {
    return [unreadableRegistry('registries/models.json')];
  }
  const tierIds = models.tiers.map((tier) => tier.id);
  const order = models.escalationOrder;
  const prose = ctx.readText('rules/models.md') ?? '';
  return [
    result('C16', 'models.json escalation_order covers every tier exactly once', permutation(tierIds, order)),
    result('C16', 'models.json escalates_to chain follows escalation_order', chain(models)),
    result(
      'C16',
      'models.json work_type tiers all resolve',
      models.workTypes
        .filter((work) => !tierIds.includes(work.tier))
        .map((work) => finding('C16', 'work-type-unknown-tier', work.id)),
    ),
    result(
      'C16',
      'models.json tier ids are unique',
      duplicates(tierIds).map((id) => finding('C16', 'duplicate-tier-id', id)),
    ),
    result('C16', 'models.json model bindings are unique or documented as shared', sharedBinding(models, prose)),
    result('C16', 'every models.json model appears in rules/models.md', mirror('model-missing-from-prose')),
    result(
      'C16',
      "rules/models.md ADR row binds the registry's tier model",
      tableRow(models, prose, 'adr', 'adr-row-model-mismatch'),
    ),
    result(
      'C16',
      "rules/models.md code-review row binds the registry's tier model",
      tableRow(models, prose, 'code-review', 'code-review-row-model-mismatch'),
    ),
    result('C16', 'every agent frontmatter model is bound in models.json', agentModels(ctx, models)),
  ];
}

// The sorted-list equality the bash compared, reported as the elements that
// differ. A tier id repeated in `tiers` but listed once here is not caught by
// the three loops; the uniqueness assertion below owns that defect.
function permutation(tierIds: readonly string[], order: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const id of tierIds) {
    if (!order.includes(id)) findings.push(finding('C16', 'escalation-order-not-a-permutation', `missing:${id}`));
  }
  for (const entry of order) {
    if (!tierIds.includes(entry)) findings.push(finding('C16', 'escalation-order-not-a-permutation', `unknown:${entry}`));
  }
  for (const entry of duplicates(order)) {
    findings.push(finding('C16', 'escalation-order-not-a-permutation', `duplicate:${entry}`));
  }
  return findings;
}

// Each tier points at its successor in escalation_order, the strongest at null.
// A tier missing from the order is skipped rather than compared: jq's `null + 1`
// silently indexed element 1 for it, which is an accident of arithmetic, and the
// permutation assertion above already names that tier.
function chain(models: RawModels): Finding[] {
  const order = models.escalationOrder;
  const findings: Finding[] = [];
  for (const tier of models.tiers) {
    const index = order.indexOf(tier.id);
    if (index === -1) continue;
    const want = index === order.length - 1 ? null : (order[index + 1] ?? null);
    if (tier.escalatesTo !== want) findings.push(finding('C16', 'escalates-to-breaks-order', tier.id));
  }
  return findings;
}

// Two tiers MAY share a model binding — build and design do today. The tier is
// the contract, so a shared binding is legal, but it makes one escalation step a
// no-op and must be stated in the prose rather than left for a reader to notice.
function sharedBinding(models: RawModels, prose: string): Finding[] {
  const shared = duplicates(models.tiers.map((tier) => tier.model));
  if (shared.length === 0 || prose.includes('bound to the same model')) return [];
  return shared.map((model) => finding('C16', 'shared-binding-undocumented', model));
}

// A join, not a mirror: the model comes from tiers[].model via work_types[].tier,
// and a mirror row resolves one registry field rather than following a key.
function tableRow(
  models: RawModels,
  prose: string,
  workTypeId: string,
  code: 'adr-row-model-mismatch' | 'code-review-row-model-mismatch',
): Finding[] {
  const work = models.workTypes.find((row) => row.id === workTypeId);
  const model = models.tiers.find((tier) => tier.id === work?.tier)?.model ?? '';
  const needle = workTypeId.replace('-', ' ');
  const rows = prose.split('\n').filter((line) => line.startsWith('|') && line.toLowerCase().includes(needle));
  if (rows.some((line) => line.includes(`\`${model}\``))) return [];
  return [finding('C16', code, model === '' ? 'unresolved' : model)];
}

// What replaced the removed "no agent declares fable" prose ban: an agent may
// name any model the registry binds, and only a model it binds. frontmatterValue
// reproduces the bash reader exactly, first `model:` line of the whole file
// included, so the check and the generators read one agent the same way.
function agentModels(ctx: CheckContext, models: RawModels): Finding[] {
  const known = new Set(models.tiers.map((tier) => tier.model));
  const findings: Finding[] = [];
  for (const name of ctx.list('agents')) {
    if (!name.endsWith('.md')) continue;
    const text = ctx.readText(`agents/${name}`);
    if (text === undefined) continue;
    const model = frontmatterValue(text, 'model');
    if (model === '' || known.has(model)) continue;
    findings.push(finding('C16', 'agent-model-unbound', `${name.replace(/\.md$/, '')}(${model})`));
  }
  return findings;
}
