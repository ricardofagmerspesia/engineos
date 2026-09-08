// C28 and C29: the retrieval-metrics prose/data pair and the adoption
// entrypoint wiring, ported from scripts/checks/70-runtime.sh.
//
// Both families gate on an artifact that arrives on another branch of the
// stack, so both keep the bash's `skip_pending` rather than reporting a wall of
// findings that says nothing about drift. Each gate names the deliverable's own
// primary artifact, never something a finding below names — a guard satisfiable
// by the thing under test is how a negative case becomes vacuous.
import { finding, result, type CheckResult, type Finding } from './findings';
import { skipPending, type CheckContext } from './lib';
import { sliceSection } from './mirror';
import { isExecutable } from './runtime-surface-fs';

export const C28_FINDINGS = [
  'reference-missing',
  'reference-does-not-define',
  'skill-missing',
  'skill-does-not-link-the-reference',
  'rule-missing',
  'rag-section-missing',
  'rag-section-does-not-name',
] as const;

export const C29_FINDINGS = [
  'init-script-not-executable',
  'command-missing',
  'command-does-not-name-the-script',
  'scaffolder-missing',
  'hook-does-not-import-the-scaffolder',
  'init-does-not-import-the-scaffolder',
  'adoption-doc-missing',
  'adoption-doc-does-not-name-the-command',
] as const;

export const C28_TITLE =
  'the retrieval-metrics pair holds: skills/eval-harness/references/retrieval-metrics.md defines Recall@K/Precision@K/MRR, skills/eval-harness/SKILL.md links it, and the RAG section of rules/llm-apps.md names all three';

export const C29_TITLE =
  'the adoption entrypoints are wired: scripts/init-project.sh is executable, commands/init.md invokes it, both the SessionStart hook and engineos init import src/hooks/scaffold.ts, and docs/ADOPTION.md names /engineos:init';

// The metric vocabulary is a constant, not a registry: no registry declares it,
// so this is a doc-to-doc pair (reference <-> SKILL.md <-> the RAG section) and
// not a mirror row.
const RETRIEVAL_METRICS = ['Recall@K', 'Precision@K', 'MRR'] as const;
const REFERENCE_DIR = 'skills/eval-harness/references';
const REFERENCE = `${REFERENCE_DIR}/retrieval-metrics.md`;
const EVAL_SKILL = 'skills/eval-harness/SKILL.md';
const LLM_RULES = 'rules/llm-apps.md';
const RAG_ANCHOR = '## RAG';

const INIT_SCRIPT = 'scripts/init-project.sh';
const INIT_COMMAND = 'commands/init.md';
const SCAFFOLDER = 'src/hooks/scaffold.ts';
const LAYOUT_HOOK = 'src/hooks/ensure-project-layout.ts';
const INIT_MODULE = 'src/init/project.ts';
const ADOPTION_DOC = 'docs/ADOPTION.md';

export function checkC28(ctx: CheckContext): CheckResult[] {
  // Gated on the reference DIRECTORY rather than the file: `rm` of the file is
  // a planted negative case that must stay refutable, and no finding below
  // names the directory, so nothing here becomes vacuous.
  if (!ctx.exists(REFERENCE_DIR)) return skipPending(ctx, 'C28', C28_TITLE, REFERENCE_DIR);
  const findings: Finding[] = [
    ...referenceFindings(ctx),
    ...skillFindings(ctx),
    ...ragFindings(ctx),
  ];
  return [result('C28', C28_TITLE, findings)];
}

export function checkC29(ctx: CheckContext): CheckResult[] {
  // Gated on the script itself, the part the other three wire TO: absent, every
  // finding fires at once and none of them is about drift. Its own
  // "init-project.sh missing" finding is therefore folded into the guard rather
  // than duplicated below.
  if (!ctx.exists(INIT_SCRIPT)) return skipPending(ctx, 'C29', C29_TITLE, INIT_SCRIPT);
  const findings: Finding[] = [];
  if (!isExecutable(ctx.root, INIT_SCRIPT)) findings.push(finding('C29', 'init-script-not-executable', INIT_SCRIPT));
  findings.push(...commandFindings(ctx));
  findings.push(...scaffolderFindings(ctx));
  findings.push(...adoptionDocFindings(ctx));
  return [result('C29', C29_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function referenceFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(REFERENCE);
  if (text === undefined) return [finding('C28', 'reference-missing', REFERENCE)];
  const findings: Finding[] = [];
  for (const metric of RETRIEVAL_METRICS) {
    if (!text.includes(metric)) findings.push(finding('C28', 'reference-does-not-define', metric));
  }
  return findings;
}

function skillFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(EVAL_SKILL);
  if (text === undefined) return [finding('C28', 'skill-missing', EVAL_SKILL)];
  if (text.includes('references/retrieval-metrics.md')) return [];
  return [finding('C28', 'skill-does-not-link-the-reference', EVAL_SKILL)];
}

// Sliced to the section, never the file: every one of these metric names also
// occurs in the reference and in prose elsewhere, so a file-wide search would
// pass with the `## RAG` section deleted outright.
function ragFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(LLM_RULES);
  if (text === undefined) return [finding('C28', 'rule-missing', LLM_RULES)];
  const section = sliceSection(text, RAG_ANCHOR);
  // An anchor that survives with its body gone satisfies every "the metric is
  // absent" assertion vacuously, so empty and missing are the same finding.
  if (section === undefined || section.trim() === '') return [finding('C28', 'rag-section-missing', RAG_ANCHOR)];
  const findings: Finding[] = [];
  for (const metric of RETRIEVAL_METRICS) {
    if (!section.includes(metric)) findings.push(finding('C28', 'rag-section-does-not-name', metric));
  }
  return findings;
}

function commandFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(INIT_COMMAND);
  if (text === undefined) return [finding('C29', 'command-missing', INIT_COMMAND)];
  if (text.includes(INIT_SCRIPT)) return [];
  return [finding('C29', 'command-does-not-name-the-script', INIT_COMMAND)];
}

// The scaffolder is a TypeScript module, and both adoption entrypoints reach the
// layout through it: the SessionStart hook imports it as './scaffold',
// `engineos init` as '../hooks/scaffold'. Asserting the import rather than the
// retired `. scaffold-layout.sh` line keeps the claim about what actually runs,
// and covers both entrypoints where the bash version only saw the hook.
function scaffolderFindings(ctx: CheckContext): Finding[] {
  if (!ctx.exists(SCAFFOLDER)) return [finding('C29', 'scaffolder-missing', SCAFFOLDER)];
  const findings: Finding[] = [];
  if (!(ctx.readText(LAYOUT_HOOK) ?? '').includes("from './scaffold'")) {
    findings.push(finding('C29', 'hook-does-not-import-the-scaffolder', LAYOUT_HOOK));
  }
  if (!(ctx.readText(INIT_MODULE) ?? '').includes("from '../hooks/scaffold'")) {
    findings.push(finding('C29', 'init-does-not-import-the-scaffolder', INIT_MODULE));
  }
  return findings;
}

function adoptionDocFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(ADOPTION_DOC);
  if (text === undefined) return [finding('C29', 'adoption-doc-missing', ADOPTION_DOC)];
  if (text.includes('/engineos:init')) return [];
  return [finding('C29', 'adoption-doc-does-not-name-the-command', ADOPTION_DOC)];
}
