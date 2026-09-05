// C23*: the constitution preamble mirrors. CLAUDE.md's routing preamble and
// docs/COMPATIBILITY.md's always-on enumeration are prose surfaces no earlier
// check reads; the registry and the import list are truth, the sentence is the
// checked mirror. Ported from scripts/checks/70-runtime.sh's C23 block.
// Spec: docs/specs/2026-08-06-decision-kernel-p8-contradiction-cleanup.md
import { basename } from 'node:path';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { runMirrors } from './mirror';
import { rowsOf } from './mirrors';
import { fileMatches, requireRouting } from './runtime-governance-shared';

export const C23_FINDINGS = [
  'precedence-sentence-disagrees',
  'missing-from-compatibility',
  // Mirror row id (src/checks/mirrors.ts): every routing.json precedence domain
  // is named in the chain sentence. The ORDER stays code below — a per-element
  // row cannot express it.
  'precedence-domain-missing',
] as const;

export const C23C_FINDINGS = ['authority-claim-reintroduced'] as const;

declare module './codes' {
  interface CheckCodes {
    C23: (typeof C23_FINDINGS)[number];
    C23c: (typeof C23C_FINDINGS)[number];
  }
}

const TOKEN = 'constitution';

// C23a and C23b share one verdict line: they are two halves of "the preamble
// mirrors the registry", and the flat script emitted a single ok for both.
const C23_TITLE = "CLAUDE.md's precedence sentence and always-on mirror agree with the registry";
const C23C_TITLE = 'CLAUDE.md does not reintroduce the retired routing-map.sh authority claim';

const CLAUDE_MD = 'CLAUDE.md';
const COMPATIBILITY = 'docs/COMPATIBILITY.md';
const CHAIN_SEPARATOR = ' → ';
const RETIRED_CLAIM = /authoritative for file-pattern routing/i;

export function checkC23(ctx: CheckContext): CheckResult[] {
  const skipped = requireRouting(ctx, 'C23', C23_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  const findings: Finding[] = [];

  // C23a: the precedence-chain sentence names every routing.json domain, IN
  // REGISTRY ORDER. The mirror row below asserts membership; order is only
  // visible in the whole rendered sentence, so that comparison stays here. The
  // finding carries no subject: both sides are multi-word sentences and a
  // subject is rendered as a single whitespace-free token.
  const declared = precedenceOf(ctx).join(CHAIN_SEPARATOR);
  const stated = precedenceSentence(ctx.readText(CLAUDE_MD) ?? '');
  if (stated === '' || stated !== declared) findings.push(finding('C23', 'precedence-sentence-disagrees'));

  // C23b: every CLAUDE.md always-on @rules/ import is named in
  // COMPATIBILITY.md's always-on enumeration. No registry side, so it is code.
  const compatibility = ctx.readText(COMPATIBILITY) ?? '';
  for (const rule of alwaysOnImports(ctx.readText(CLAUDE_MD) ?? '')) {
    const name = basename(rule);
    if (!compatibility.includes(`${name}\``)) findings.push(finding('C23', 'missing-from-compatibility', name));
  }

  findings.push(...runMirrors(rowsOf('C23'), ctx));
  return [result('C23', C23_TITLE, findings)];
}

export function checkC23c(ctx: CheckContext): CheckResult[] {
  const skipped = requireRouting(ctx, 'C23c', C23C_TITLE, TOKEN);
  if (skipped !== undefined) return skipped;
  // hooks/routing-map.sh is gone; the registry is the canonical map, and CLAUDE.md
  // prose must not crown anything else — a hook, a shim — in its place.
  const findings: Finding[] = fileMatches(ctx, CLAUDE_MD, RETIRED_CLAIM)
    ? [finding('C23c', 'authority-claim-reintroduced', CLAUDE_MD)]
    : [];
  return [result('C23c', C23C_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function precedenceOf(ctx: CheckContext): string[] {
  try {
    return ctx.registries.routing.precedence;
  } catch {
    // An unreadable registry declares nothing, so the sentence cannot agree with
    // it — reported as the disagreement it is, never as a crash.
    return [];
  }
}

// `grep -A1 'in this precedence chain:' | tr '\n' ' ' | tr -s ' ' | sed -n
// 's/.*precedence chain: \(.*\)\. When you route.*/\1/p'`. The chain wraps across
// two lines, which is why the match line and the one after it are flattened
// before the sentence is cut out of them.
function precedenceSentence(text: string): string {
  const lines = text.split('\n');
  const window: string[] = [];
  lines.forEach((line, index) => {
    if (!line.includes('in this precedence chain:')) return;
    window.push(line, lines[index + 1] ?? '');
  });
  const flat = window.join(' ').replace(/\s+/g, ' ');
  // Greedy on both sides, as sed's `.*` is: the last occurrence wins.
  return /precedence chain: (.*)\. When you route/.exec(flat)?.[1] ?? '';
}

function alwaysOnImports(text: string): string[] {
  return text.split('\n').flatMap((line) => /^@(rules\/[a-z-]+\.md)/.exec(line)?.slice(1, 2) ?? []);
}
