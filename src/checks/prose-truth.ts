// Family `prose-truth`: the two claims the constitution makes about itself that
// a reader cannot verify without leaving the page — where a router row's
// `/command` and `patterns/` references point (C36), and how many checks the
// validator actually answers for (C37).
//
// Both were written after an audit found the router table pointing at
// `/analisy-architecture` and `patterns/1-Analisys` — neither of which has ever
// existed, the real names being `commands/analyze-architecture.md` and
// `patterns/1-Analysis.md` — and four documents advertising a "62-check
// validator" against 66 registered ids. Every one of those is a fact the tree
// already knows, so the drift is a check's job rather than a reviewer's.
//
// The counts stay in the prose on purpose. A reader is better served by a
// number CI proves than by "some checks", which is what deleting the number
// would leave behind.
import { finding, result, type CheckResult, type Finding } from './findings';
import { CHECK_IDS } from './ids';
import type { Check } from './index';
import { skipOnce, type CheckContext } from './lib';

export const C36_FINDINGS = ['command-missing', 'pattern-missing', 'no-references'] as const;

export const C37_FINDINGS = ['count-drift'] as const;

declare module './codes' {
  interface CheckCodes {
    C36: (typeof C36_FINDINGS)[number];
    C37: (typeof C37_FINDINGS)[number];
  }
}

export const PROSE_TRUTH_CHECKS: readonly Check[] = [
  { id: 'C36', codes: C36_FINDINGS, run: checkC36 },
  { id: 'C37', codes: C37_FINDINGS, run: checkC37 },
];

export const C36_TITLE = 'router-table command and pattern references resolve';

export const C37_TITLE = 'check-count claims equal the registered count';

// CLAUDE.md is the router table; AGENTS.md is the Codex copy of it, and the
// copy drifting is exactly how the two typos survived a rename.
const ROUTER_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md'];

// Every document that spells the number out. Widening this list is cheap; the
// check is a grep with an assertion attached.
const COUNT_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/CODEBASE_MAP.md'];

// A whole slash command and nothing else: `/engineos:audit` resolves, and
// `/engineos:audit <domain\|all>` — the same command with its argument
// metasyntax — is not a file reference and is left alone. Anchored for that
// reason, not for tidiness.
const COMMAND_TOKEN = /^\/(?:engineos:)?([a-z][a-z0-9-]*)$/;

const PATTERN_TOKEN = /^patterns\/([^`]+)$/;

// `\b(\d+)[- ]` covers both spellings the documents use: "62-check validator"
// and "62 checks". `matchAll` species-constructs its own regex, so the shared
// literal's lastIndex is never advanced by a previous file.
const COUNT_CLAIM = /\b(\d+)[- ](?:self-integrity )?[Cc]hecks?\b/g;

const BACKTICKED = /`([^`]+)`/g;

interface Reference {
  readonly kind: 'command' | 'pattern';
  readonly token: string;
  readonly name: string;
}

// Both files ship in every release artifact (scripts/package-release.sh), so an
// absent one is a broken checkout rather than a tree that does not carry the
// artifact yet — skipOnce, which counts a FAIL, not skipPending, which would
// let `passed N, failed 0` mean "this was never read".
export function checkC36(ctx: CheckContext): CheckResult[] {
  const absent = ROUTER_FILES.find((file) => !ctx.exists(file));
  if (absent !== undefined) return skipOnce(ctx, 'C36', C36_TITLE, absent);

  const findings: Finding[] = [];
  for (const file of ROUTER_FILES) {
    const references = referencesIn(ctx.readText(file) ?? '');
    // A table that yields nothing is the failure mode a resolver check cannot
    // otherwise see: the references were reworded out of the backticks and
    // every row now passes by having nothing to resolve.
    if (references.length === 0) {
      findings.push(finding('C36', 'no-references', file));
      continue;
    }
    for (const reference of references) {
      if (reference.kind === 'command') {
        if (!ctx.exists(`commands/${reference.name}.md`)) {
          findings.push(finding('C36', 'command-missing', `${file}:${reference.token}`));
        }
        continue;
      }
      if (!resolvesUnderPatterns(ctx, reference.name)) {
        findings.push(finding('C36', 'pattern-missing', `${file}:${reference.token}`));
      }
    }
  }
  return [result('C36', C36_TITLE, findings)];
}

export function checkC37(ctx: CheckContext): CheckResult[] {
  const absent = COUNT_FILES.find((file) => !ctx.exists(file));
  if (absent !== undefined) return skipOnce(ctx, 'C37', C37_TITLE, absent);

  const registered = CHECK_IDS.length;
  const findings: Finding[] = [];
  for (const file of COUNT_FILES) {
    // Deduped per file: the same wrong number written in three places is one
    // fact to correct, and the subject the contract fixes (`<file>:<n>`) cannot
    // tell those three apart anyway.
    for (const claimed of claimedCounts(ctx.readText(file) ?? '')) {
      if (claimed !== registered) findings.push(finding('C37', 'count-drift', `${file}:${claimed}`));
    }
  }
  return [result('C37', C37_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// Table rows only. A `/command` named in a paragraph is prose about the command
// rather than the routing contract, and the router table is the surface
// non-negotiable #11 versions.
function referencesIn(text: string): Reference[] {
  const seen = new Set<string>();
  const collected: Reference[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    for (const match of line.matchAll(BACKTICKED)) {
      const token = match[1] ?? '';
      if (seen.has(token)) continue;
      const reference = referenceOf(token);
      if (reference === undefined) continue;
      seen.add(token);
      collected.push(reference);
    }
  }
  return collected;
}

function referenceOf(token: string): Reference | undefined {
  const command = COMMAND_TOKEN.exec(token);
  if (command !== null) return { kind: 'command', token, name: command[1] ?? '' };
  const pattern = PATTERN_TOKEN.exec(token);
  if (pattern !== null) return { kind: 'pattern', token, name: pattern[1] ?? '' };
  return undefined;
}

// The extension is optional in the prose (`patterns/1-Analysis.md` and
// `patterns/1-Analysis` both name the same file), so both spellings resolve.
// A token that walks out of the directory names no pattern and is reported
// without touching the filesystem — a reference is a name here, never a path
// to follow.
function resolvesUnderPatterns(ctx: CheckContext, name: string): boolean {
  if (name.split('/').includes('..')) return false;
  return ctx.exists(`patterns/${name}`) || ctx.exists(`patterns/${name}.md`);
}

export function claimedCounts(text: string): number[] {
  const claimed = new Set<number>();
  for (const match of text.matchAll(COUNT_CLAIM)) {
    claimed.add(Number.parseInt(match[1] ?? '', 10));
  }
  return [...claimed];
}
