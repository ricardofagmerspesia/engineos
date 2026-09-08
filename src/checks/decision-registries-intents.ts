// C16's intents.json block: uniqueness, the names it points at, the signal
// metasyntax ban, its foreign keys into routing.json, its closed-set fields and
// the drift alarm against the CLAUDE.md router table. None of these are mirror
// rows — every one either joins two registries or counts prose rows, and a
// MIRRORS row resolves one registry field into one document passage.
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import {
  duplicates,
  readIntents,
  readModels,
  readRoutingDomains,
  sortedUnique,
  subjectText,
  unreadableRegistry,
  type RawDomain,
  type RawIntent,
} from './decision-registries-data';

// Bare X/Y/N stand for documentation placeholders; `>` and the comparison glyph
// mark threshold notation, which belongs in parallelism.fanout_signals rather
// than in a phrase list.
const METASYNTAX = /\b[XYN]\b|>|≥/;

const RISK_TIER = /^(low|medium|high)$/;

// The router table's header row, matched literally the way the bash `sed` range
// did (its BRE treated every `|` and `(` as an ordinary character).
const ROUTER_TABLE_HEADER = '| Intent (signals) | Load |';

export function intentsResults(ctx: CheckContext): CheckResult[] {
  let intents: readonly RawIntent[];
  try {
    intents = readIntents(ctx.root);
  } catch {
    return [unreadableRegistry('registries/intents.json')];
  }
  const domains = readRoutingDomains(ctx.root);
  return [
    result(
      'C16',
      'intent ids are unique',
      duplicates(intents.map((intent) => intent.id)).map((id) => finding('C16', 'duplicate-intent-id', id)),
    ),
    result('C16', 'intents.json rules, skills and agents all resolve', dangling(ctx, intents)),
    result('C16', 'no intents.json signal carries placeholder metasyntax', signals(intents)),
    result('C16', 'hook_mirrored and domain agree on every intent', mirroredFlag(intents)),
    result('C16', 'every hook-mirrored intent matches its routing.json domain (rules)', foreignKeys(intents, domains)),
    result('C16', 'every routing.json domain is claimed by exactly one intent', claims(intents, domains)),
    result('C16', 'every intent model_tier resolves in models.json', modelTiers(ctx, intents)),
    result('C16', 'every intent risk_floor is a valid tier', riskFloors(intents)),
    result('C16', 'intent count matches the CLAUDE.md router table', drift(ctx, intents)),
  ];
}

// ------------------------------------------------------------------ internals

// Unqualified rules and agents resolve to a file; unqualified skills resolve
// unless the intent's note marks them external (spec deviation 2: code-review).
// A qualified skill (`superpowers:brainstorming`) is another repo's to ship.
function dangling(ctx: CheckContext, intents: readonly RawIntent[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of sortedUnique(intents.flatMap((intent) => [...intent.rules]))) {
    if (!ctx.exists(`rules/${rule}.md`)) findings.push(finding('C16', 'dangling-reference', `rule:${rule}`));
  }
  for (const agent of sortedUnique(intents.flatMap((intent) => [...intent.agents]))) {
    if (!ctx.exists(`agents/${agent}.md`)) findings.push(finding('C16', 'dangling-reference', `agent:${agent}`));
  }
  for (const intent of intents) {
    // The exemption is case-insensitive: notes write "EXTERNAL" for emphasis.
    const external = intent.note.toLowerCase().includes('external');
    for (const skill of intent.skills) {
      if (skill.includes(':')) continue;
      if (ctx.exists(`skills/${skill}/SKILL.md`)) continue;
      if (external) continue;
      findings.push(finding('C16', 'dangling-reference', `skill:${skill}`));
    }
  }
  return findings;
}

// Signals are matched as LITERAL phrases by the route-intent arm, so a signal
// carrying documentation metasyntax can never fire. Ten such signals were once
// copied verbatim out of CLAUDE.md's human-readable router table and silently
// made seven intents unroutable. The table may keep its placeholders; the
// registry is a matching engine and may not.
function signals(intents: readonly RawIntent[]): Finding[] {
  const findings: Finding[] = [];
  for (const intent of intents) {
    for (const signal of intent.signals) {
      if (!METASYNTAX.test(signal)) continue;
      findings.push(finding('C16', 'unmatchable-signal', `${intent.id}:${subjectText(signal)}`));
    }
  }
  return findings;
}

function mirroredFlag(intents: readonly RawIntent[]): Finding[] {
  return intents
    .filter((intent) => intent.hookMirrored !== (intent.domain !== null))
    .map((intent) => finding('C16', 'hook-mirrored-domain-mismatch', intent.id));
}

// Every domain foreign key resolves, and a mirrored intent's rules[] equal its
// domain's. The floor comparison went with routing.json's domain risk_floor
// (deviation 9): intents.json is now the one home of the floor, and the kernel
// derives a domain's floor from the intent that claims it, so there is no
// second copy left to compare.
function foreignKeys(intents: readonly RawIntent[], domains: readonly RawDomain[]): Finding[] {
  const findings: Finding[] = [];
  for (const intent of intents) {
    if (!intent.hookMirrored) continue;
    const domain = intent.domain === null ? undefined : domains.find((row) => row.id === intent.domain);
    if (domain === undefined) {
      findings.push(finding('C16', 'intent-routing-mismatch', `${intent.id}->${intent.domain ?? 'null'}`));
      continue;
    }
    const wanted = domain.rules.join(',');
    const declared = intent.rules.join(',');
    if (declared !== wanted) {
      findings.push(finding('C16', 'intent-routing-mismatch', `${intent.id}(rules:${declared}!=${wanted})`));
    }
  }
  return findings;
}

function claims(intents: readonly RawIntent[], domains: readonly RawDomain[]): Finding[] {
  const findings: Finding[] = [];
  for (const domain of domains) {
    const claimed = intents.filter((intent) => intent.domain === domain.id).length;
    if (claimed !== 1) findings.push(finding('C16', 'routing-domain-not-claimed-once', `${domain.id}(x${claimed})`));
  }
  return findings;
}

// An unreadable models.json is the models block's finding, reported there once.
// Re-deriving it as one dangling tier per intent would bury that line under
// noise, which is what the bash's failing `--slurpfile` did by answering empty.
function modelTiers(ctx: CheckContext, intents: readonly RawIntent[]): Finding[] {
  let tierIds: string[];
  try {
    tierIds = readModels(ctx.root).tiers.map((tier) => tier.id);
  } catch {
    return [];
  }
  return intents
    .filter((intent) => intent.modelTier !== null && !tierIds.includes(intent.modelTier))
    .map((intent) => finding('C16', 'intent-unknown-model-tier', intent.id));
}

function riskFloors(intents: readonly RawIntent[]): Finding[] {
  return intents
    .filter((intent) => intent.riskFloor !== null && intent.riskFloor !== undefined)
    .filter((intent) => typeof intent.riskFloor !== 'string' || !RISK_TIER.test(intent.riskFloor))
    .map((intent) => finding('C16', 'intent-invalid-risk-floor', intent.id));
}

// Exact on purpose: a prose row added or removed without a registry update
// fails either way. The registry carries one row more than the table because
// the store-release row is two intents (spec deviation 1).
function drift(ctx: CheckContext, intents: readonly RawIntent[]): Finding[] {
  const rows = routerTableRows(ctx.readText('CLAUDE.md') ?? '');
  if (intents.length === rows + 1) return [];
  return [finding('C16', 'intent-count-drift', `registry=${intents.length},claude=${rows}`)];
}

// The `sed -n '/^| Intent (signals) | Load |/,/^## /p' | grep -c '^|'` minus 2:
// data rows only, header and separator removed. A missing header answers -2, as
// the bash did, so the drift alarm fires rather than passing on an empty count.
function routerTableRows(text: string): number {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(ROUTER_TABLE_HEADER));
  if (start === -1) return -2;
  let counted = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    // The sed range's end pattern is searched from the line after the opener.
    if (index > start && line.startsWith('## ')) break;
    if (line.startsWith('|')) counted += 1;
  }
  return counted - 2;
}
