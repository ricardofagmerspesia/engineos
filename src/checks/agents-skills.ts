// Checks on the agent and skill documents themselves — frontmatter, the return
// envelope, slash-command coverage, the no-empty-document floor, and the
// tier/model agreement between an agent and registries/models.json.
//
// The frontmatter is read with src/gen/frontmatter.ts — the SAME reader
// src/gen/agent-registry.ts uses. The bash refused to do that on purpose, keeping
// its own sed so a broken generator could not hide by having the check misread
// the files exactly as it did. That independence is genuinely spent here; what
// replaces it is that `frontmatterValue` is a pure function with its own unit
// tests pinning the sed's observable quirks (whole-file scan, first match wins,
// trailing space kept). The drift the bash feared was a reader reassembled per
// call site; a second hand-written scanner here would be a second thing to keep
// correct, not a second opinion.
//
// One reader is not borrowed: the alias grep. See aliasesOf for why.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatterValue } from '../gen/frontmatter';
import { KernelError } from '../lib/json';
import type { ModelTier } from '../registry/models';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { skipOnce, type CheckContext } from './lib';

export const C9_FINDINGS = ['name-drifts-from-filename', 'description-missing', 'tools-missing'] as const;

export const C10_FINDINGS = ['return-format-section-missing', 'status-enum-missing'] as const;

export const C11_FINDINGS = ['command-missing', 'alias-command-missing'] as const;

export const C12_FINDINGS = ['skill-md-missing', 'name-drifts-from-directory', 'description-missing'] as const;

export const C13_FINDINGS = ['empty-document'] as const;

export const C31_FINDINGS = ['unknown-tier', 'tier-model-mismatch'] as const;

declare module './codes' {
  interface CheckCodes {
    C9: (typeof C9_FINDINGS)[number];
    C10: (typeof C10_FINDINGS)[number];
    C11: (typeof C11_FINDINGS)[number];
    C12: (typeof C12_FINDINGS)[number];
    C13: (typeof C13_FINDINGS)[number];
    C31: (typeof C31_FINDINGS)[number];
  }
}

export const AGENTS_SKILLS_CHECKS: readonly Check[] = [
  { id: 'C9', codes: C9_FINDINGS, run: checkC9 },
  { id: 'C10', codes: C10_FINDINGS, run: checkC10 },
  { id: 'C11', codes: C11_FINDINGS, run: checkC11 },
  { id: 'C12', codes: C12_FINDINGS, run: checkC12 },
  { id: 'C13', codes: C13_FINDINGS, run: checkC13 },
  { id: 'C31', codes: C31_FINDINGS, run: checkC31 },
];

const C9_TITLE = 'agent frontmatter complete and name matches filename';
const C10_TITLE = 'every agent declares the canonical Return format envelope';
const C11_TITLE = 'every agent and alias has a slash command';
const C12_TITLE = 'every skill has SKILL.md with matching name and a description';
const C13_TITLE = 'no empty rule/agent/skill documents';
const C31_TITLE = "every agent's tier binds the model it declares";

// ------------------------------------------- C9/C10/C11: agent contract checks
// One walk over agents/*.md answering three independent questions, exactly as
// the bash's scan_agent_contracts did. Each check runs the walk itself rather
// than sharing a cached answer: the walk is cheap, and a cache keyed on nothing
// would make `--only C10` depend on whether C9 ran first.

interface AgentContractScan {
  readonly frontmatter: Finding[];
  readonly returnFormat: Finding[];
  readonly commands: Finding[];
}

const RETURN_FORMAT_HEADING = '## Return format';

// grep -q '^status: OK | DEGRADED | CRITICAL | BLOCKED | FAILED$' — a basic
// regular expression, so every `|` is a literal and the whole thing is an exact
// line match, not an alternation.
const STATUS_ENUM_LINE = 'status: OK | DEGRADED | CRITICAL | BLOCKED | FAILED';

function scanAgentContracts(ctx: CheckContext): AgentContractScan {
  const frontmatter: Finding[] = [];
  const returnFormat: Finding[] = [];
  const commands: Finding[] = [];
  for (const base of agentBaseNames(ctx)) {
    const text = ctx.readText(`agents/${base}.md`) ?? '';
    const name = frontmatterValue(text, 'name');
    const description = frontmatterValue(text, 'description');

    if (name !== base) {
      frontmatter.push(finding('C9', 'name-drifts-from-filename', `${base}:${orNone(name)}`));
    }
    if (description === '') frontmatter.push(finding('C9', 'description-missing', base));
    if (frontmatterValue(text, 'tools') === '') frontmatter.push(finding('C9', 'tools-missing', base));

    const lines = text.split('\n');
    if (!lines.some((line) => line.startsWith(RETURN_FORMAT_HEADING))) {
      returnFormat.push(finding('C10', 'return-format-section-missing', base));
    }
    if (!lines.includes(STATUS_ENUM_LINE)) returnFormat.push(finding('C10', 'status-enum-missing', base));

    if (!ctx.exists(`commands/agents/${base}.md`)) commands.push(finding('C11', 'command-missing', base));
    for (const alias of aliasesOf(description)) {
      if (ctx.exists(`commands/agents/${alias}.md`)) continue;
      commands.push(finding('C11', 'alias-command-missing', `${base}:${alias}`));
    }
  }
  return { frontmatter, returnFormat, commands };
}

// bash: printf '%s' "$desc" | grep -oE 'Alias(es)?: [a-z-]+' | sed 's/.*: //'
//
// Deliberately NOT src/gen/frontmatter.ts's frontmatterAlias. That helper answers
// a different question for the generators: the FIRST alias, case-insensitively,
// over `[a-z0-9-]`, anywhere inside a `---` range. This check reads EVERY alias
// an agent's description declares, case-sensitively, over `[a-z-]`, and only
// from the description value. Borrowing the helper would silently change which
// aliases must have a slash command, so the grep is ported as a grep.
// The capture is what `sed 's/.*: //'` left of each match.
const ALIAS_DECLARATION = /Alias(?:es)?: ([a-z-]+)/g;

function aliasesOf(description: string): string[] {
  return [...description.matchAll(ALIAS_DECLARATION)]
    .map((match) => match[1])
    .filter((alias): alias is string => alias !== undefined);
}

function checkC9(ctx: CheckContext): CheckResult[] {
  return [result('C9', C9_TITLE, scanAgentContracts(ctx).frontmatter)];
}

function checkC10(ctx: CheckContext): CheckResult[] {
  return [result('C10', C10_TITLE, scanAgentContracts(ctx).returnFormat)];
}

function checkC11(ctx: CheckContext): CheckResult[] {
  return [result('C11', C11_TITLE, scanAgentContracts(ctx).commands)];
}

// ------------------------------------------------------- C12: skill contracts

function checkC12(ctx: CheckContext): CheckResult[] {
  const found: Finding[] = [];
  for (const skill of skillDirectories(ctx)) {
    // `[ -f "$d/SKILL.md" ]`: a directory or an unreadable entry by that name is
    // not a SKILL.md, and readText answers undefined for all three.
    const text = ctx.readText(`skills/${skill}/SKILL.md`);
    if (text === undefined) {
      found.push(finding('C12', 'skill-md-missing', skill));
      continue;
    }
    const name = frontmatterValue(text, 'name');
    if (name !== skill) found.push(finding('C12', 'name-drifts-from-directory', `${skill}:${orNone(name)}`));
    if (frontmatterValue(text, 'description') === '') found.push(finding('C12', 'description-missing', skill));
  }
  return [result('C12', C12_TITLE, found)];
}

// ------------------------------------------------------------ C13: no empties

interface DocumentGroup {
  readonly pattern: string;
  paths(ctx: CheckContext): string[];
}

const DOCUMENT_GROUPS: readonly DocumentGroup[] = [
  { pattern: 'rules/*.md', paths: (ctx) => markdownIn(ctx, 'rules') },
  { pattern: 'agents/*.md', paths: (ctx) => markdownIn(ctx, 'agents') },
  {
    // The glob matches only the SKILL.md files that exist; a skill directory
    // without one contributes nothing here, and C12 owns that absence.
    pattern: 'skills/*/SKILL.md',
    paths: (ctx) =>
      skillDirectories(ctx)
        .map((skill) => `skills/${skill}/SKILL.md`)
        .filter((path) => isFile(ctx.root, path)),
  },
];

function checkC13(ctx: CheckContext): CheckResult[] {
  const found: Finding[] = [];
  for (const group of DOCUMENT_GROUPS) {
    const paths = group.paths(ctx);
    if (paths.length === 0) {
      // An unmatched glob stays its own literal word in bash, and
      // `[ -s 'rules/*.md' ]` is false — a tree carrying no rules at all failed
      // this check, and it still does. The pattern is the subject because there
      // is no file to name.
      found.push(finding('C13', 'empty-document', group.pattern));
      continue;
    }
    for (const path of paths) {
      if (sizeOf(ctx.root, path) === 0) found.push(finding('C13', 'empty-document', path));
    }
  }
  return [result('C13', C13_TITLE, found)];
}

// ------------------------------- C31: agent tier agrees with the model binding
// The tier is the contract and the model name is only today's binding
// (rules/models.md); registries/models.json is that table's machine-readable
// form. An agent declaring a tier whose registry binding is not the model it
// also declares is claiming to run somewhere it does not — and because two tiers
// can share one binding (build and design both bind opus today), the mismatch is
// not recoverable by inference. The generator refuses to emit such an agent; this
// check refuses to let one sit in the tree at all, which is why it reads the
// agents/*.md frontmatter and never registries/agents.json — a tree nobody has
// regenerated is exactly the tree it exists for.
//
// The bash's `have_jq || return 0` guard is gone with jq itself.

const MODELS_REGISTRY = 'registries/models.json';

function checkC31(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(MODELS_REGISTRY)) return skipOnce(ctx, 'C31', C31_TITLE, 'models');
  const tiers = modelTiers(ctx);
  const found: Finding[] = [];
  for (const base of agentBaseNames(ctx)) {
    const text = ctx.readText(`agents/${base}.md`) ?? '';
    const tier = frontmatterValue(text, 'tier');
    const model = frontmatterValue(text, 'model');
    // An agent declaring neither has no claim to check; the bash skipped it too.
    if (tier === '' || model === '') continue;
    const bound = tiers.find((row) => row.id === tier)?.model ?? '';
    if (bound === '') found.push(finding('C31', 'unknown-tier', `${base}:${tier}`));
    else if (bound !== model) found.push(finding('C31', 'tier-model-mismatch', `${base}:${bound}!=${model}`));
  }
  return [result('C31', C31_TITLE, found)];
}

// A models.json that exists but does not load leaves every tier unbound, which is
// the answer the bash got from a failing `jq`: an empty `bound`, and one
// unknown-tier per agent. The finding that the registry itself is malformed
// belongs to C14, so this check does not raise a second one.
function modelTiers(ctx: CheckContext): readonly ModelTier[] {
  try {
    return ctx.registries.models.tiers;
  } catch (error) {
    if (error instanceof KernelError) return [];
    throw error;
  }
}

// -------------------------------------------------------------------- internals

function agentBaseNames(ctx: CheckContext): string[] {
  return markdownIn(ctx, 'agents').map((path) => path.slice('agents/'.length, -'.md'.length));
}

function markdownIn(ctx: CheckContext, directory: string): string[] {
  return ctx
    .list(directory)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => `${directory}/${entry}`);
}

// `for d in skills/*/`: the trailing slash keeps only directories, and it follows
// a symlink to one — so statSync, not a dirent type test.
function skillDirectories(ctx: CheckContext): string[] {
  return ctx.list('skills').filter((entry) => isDirectory(ctx.root, `skills/${entry}`));
}

function isDirectory(root: string, relativePath: string): boolean {
  try {
    return statSync(join(root, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

function isFile(root: string, relativePath: string): boolean {
  try {
    return statSync(join(root, relativePath)).isFile();
  } catch {
    return false;
  }
}

// `[ -s <path> ]` is "exists and is non-empty", so an absent file reads as size 0
// and the caller reports it the same way bash did.
function sizeOf(root: string, relativePath: string): number {
  try {
    return statSync(join(root, relativePath)).size;
  } catch {
    return 0;
  }
}

// A subject is rendered after a colon, so an absent value needs a token of its
// own rather than trailing off into nothing.
function orNone(value: string): string {
  return value === '' ? '<none>' : value;
}
