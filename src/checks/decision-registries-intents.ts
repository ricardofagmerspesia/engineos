// C16's intents.json block: uniqueness, the names it points at, the signal
// metasyntax ban, its foreign keys into routing.json, its closed-set fields and
// the drift alarm against the CLAUDE.md router table. None of these are mirror
// rows — every one either joins two registries or counts prose rows, and a
// MIRRORS row resolves one registry field into one document passage.
import { FRAMEWORK_LANGUAGE, isFramework } from '../registry/project-config';
import { finding, result, type CheckResult, type Finding } from './findings';
import { kernelAnswer } from './kernel-lib';
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
    result('C16', 'intents.json rules, skills, agents and commands all resolve', dangling(ctx, intents)),
    result('C16', 'no intents.json signal carries placeholder metasyntax', signals(intents)),
    result('C16', 'hook_mirrored and domain agree on every intent', mirroredFlag(intents)),
    result('C16', 'every hook-mirrored intent matches its routing.json domain (rules)', foreignKeys(intents, domains)),
    result('C16', 'every routing.json domain is claimed by exactly one intent', claims(intents, domains)),
    result('C16', 'every intent model_tier resolves in models.json', modelTiers(ctx, intents)),
    result('C16', 'every intent risk_floor is a valid tier', riskFloors(intents)),
    result('C16', 'intent count matches the CLAUDE.md router table', drift(ctx, intents)),
    result('C16', 'every intent stack is node or python, pairs with a reciprocal stack_sibling, and lists only frameworks of its own stack', stacks(intents)),
    result('C16', 'every intent generic_signals entry is one of its signals', genericSignals(intents)),
    result('C16', "every active stack-bearing intent's domain sample_path routes to it", stackSamples(ctx, intents, domains)),
  ];
}

// ------------------------------------------------------------------ internals

// A command is spelled either as the router table types it (`/engineos:audit`,
// `/analyze-architecture`) or as its bare file name (`design-agents`); both
// resolve to commands/<name>.md. C36 resolves the same tokens in the CLAUDE.md
// table; this is the registry side, so an intent cannot name a command the
// table never had.
const COMMAND_NAME = /^(?:\/(?:engineos:)?)?([a-z][a-z0-9-]*)$/;

// Unqualified rules and agents resolve to a file; unqualified skills resolve
// unless the intent's note marks them external (spec deviation 2: code-review).
// A qualified skill (`superpowers:brainstorming`) is another repo's to ship.
function dangling(ctx: CheckContext, intents: readonly RawIntent[]): Finding[] {
  const findings: Finding[] = [];
  for (const command of sortedUnique(intents.flatMap((intent) => [...intent.commands]))) {
    const name = COMMAND_NAME.exec(command)?.[1];
    if (name === undefined || !ctx.exists(`commands/${name}.md`)) {
      findings.push(finding('C16', 'dangling-reference', `command:${subjectText(command)}`));
    }
  }
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

// The loader's four stack rules (src/registry/intents.ts), restated over the raw
// file so the validator names WHICH row broke instead of reporting the whole
// registry unreadable. The subject's suffix is the defect kind.
const STACKS: readonly string[] = ['node', 'python'];

function stacks(intents: readonly RawIntent[]): Finding[] {
  const findings: Finding[] = [];
  for (const intent of intents) {
    const declared = intent.stack !== undefined && intent.stack !== null;
    const paired = intent.stackSibling !== undefined && intent.stackSibling !== null;
    // A framework list names what counts as this row's stack; on a stack-neutral
    // row it would claim a rebind that can never happen, and a framework of the
    // other stack would make the wrong repositories eligible for the row.
    for (const framework of intent.stackFrameworks) {
      const ok = declared && isFramework(framework) && FRAMEWORK_LANGUAGE[framework] === intent.stack;
      if (!ok) findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}:framework=${subjectText(framework)}`));
    }
    if (!declared && !paired) continue;
    if (declared && (typeof intent.stack !== 'string' || !STACKS.includes(intent.stack))) {
      findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}:stack=${subjectText(intent.stack)}`));
      continue;
    }
    if (declared !== paired || typeof intent.stackSibling !== 'string') {
      findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}:unpaired`));
      continue;
    }
    const sibling = intents.find((other) => other.id === intent.stackSibling);
    if (sibling === undefined) {
      findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}->${subjectText(intent.stackSibling)}:missing`));
    } else if (typeof sibling.stack !== 'string' || sibling.stack === intent.stack) {
      findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}->${sibling.id}:wrong-stack`));
    } else if (sibling.stackSibling !== intent.id) {
      findings.push(finding('C16', 'intent-stack-invalid', `${intent.id}->${sibling.id}:not-reciprocal`));
    }
  }
  return findings;
}

function genericSignals(intents: readonly RawIntent[]): Finding[] {
  const findings: Finding[] = [];
  for (const intent of intents) {
    for (const signal of intent.genericSignals) {
      if (intent.signals.includes(signal)) continue;
      findings.push(finding('C16', 'intent-generic-signal-unknown', `${intent.id}:${subjectText(signal)}`));
    }
  }
  return findings;
}

// The rebind replaces an intent by its sibling on the strength of the
// repository's stack, so every stack-bearing intent must be reachable by path
// too: its domain carries a sample_path, and the kernel routes that sample back
// to the domain (C17b's machinery, asked for these rows by name, so a stack row
// whose domain was renamed or shadowed fails here rather than routing a prompt
// to a domain no path can reach).
function stackSamples(ctx: CheckContext, intents: readonly RawIntent[], domains: readonly RawDomain[]): Finding[] {
  const findings: Finding[] = [];
  for (const intent of intents) {
    if (intent.stack === undefined || intent.stack === null) continue;
    // An inactive deprecated compatibility row keeps its stack for the sibling
    // pairing but routes nothing, so it owes no sample path.
    if (intent.enabled === false && intent.deprecated === true) continue;
    const domain = intent.domain === null ? undefined : domains.find((row) => row.id === intent.domain);
    if (domain === undefined || domain.samplePath === null || domain.samplePath === '') {
      findings.push(finding('C16', 'stack-intent-sample-unrouted', `${intent.id}->${intent.domain ?? 'null'}:no-sample`));
      continue;
    }
    const got = kernelAnswer(ctx, ['route-path', domain.samplePath])?.['domain'];
    const routed = typeof got === 'string' ? got : 'null';
    if (routed !== domain.id) {
      findings.push(finding('C16', 'stack-intent-sample-unrouted', `${intent.id}->${domain.id}:routes-to-${routed}`));
    }
  }
  return findings;
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
