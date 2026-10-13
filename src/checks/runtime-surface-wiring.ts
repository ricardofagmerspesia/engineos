// C27c: exec-journal span wiring, in both directions — every declared writer
// really writes a span, every hook that writes one is declared, the shared
// append site cannot see prompt text, and the reaper covers the new file.
//
// The hooks are TypeScript now (design deviation 3). A writer reaches the
// journal through the span lifecycle in src/hooks/telemetry.ts — `withSpan` (or
// `withSpanAsync`, for work that awaits) for work it can time in one process, or the `openSpan`/`closeSpan` pair a
// PreToolUse and its PostToolUse need — and states the kind as a `kind: '<k>'`
// field on the facts it passes. openSpan is the one deliberate exception: the
// dispatch hook records only the start instant, and the kind is stated by the
// return hook that closes it.
import { stringArray } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';
import { execJournalBlock, haveExecJournalInputs } from './runtime-surface-journal';

export const C27c_FINDINGS = [
  'span-kinds-empty',
  'declared-writer-writes-no-span',
  'dispatch-hook-opens-no-span',
  'return-hook-closes-no-span',
  'undeclared-span-writer',
  'span-sink-references-prompt-text',
  'reaper-ignores-exec-jsonl',
  'reaper-ignores-span-markers',
] as const;

export const C27c_TITLE =
  'exec-journal span wiring is complete in both directions (every declared writer writes a span, every span-writing hook is declared), prompt-text-free at the sink, and reaped by src/hooks/ensure-project-layout.ts';

const HOOKS_DIR = 'src/hooks';
const DISPATCH_HOOK = 'src/hooks/announce-agent-dispatch.ts';
const RETURN_HOOK = 'src/hooks/announce-agent-return.ts';
const LAYOUT_HOOK = 'src/hooks/ensure-project-layout.ts';
// telemetry.ts and span-writer.ts pass the kind through as a parameter and
// never carry a kind literal; *.test.ts assert on a kind, they do not produce
// one.
const NOT_WRITERS = new Set(['src/hooks/telemetry.ts', 'src/hooks/span-writer.ts']);
// Any of the lifecycle calls counts as wired; the pair below is what pins
// which hook must use which.
const LIFECYCLE = /openSpan\(|closeSpan\(|withSpan(?:Async)?\(/;

export function checkC27c(ctx: CheckContext): CheckResult[] {
  const skipped = haveExecJournalInputs(ctx, 'C27c', C27c_TITLE);
  if (skipped !== undefined) return skipped;
  const block = execJournalBlock(ctx);
  const kinds = stringArray(block?.['span_kinds']);
  const writers = stringArray(block?.['written_by']);
  const findings: Finding[] = [];
  if (kinds.length === 0) {
    // An empty alternation matches every line, so the searches below would pass
    // against a hook that writes nothing at all.
    findings.push(finding('C27c', 'span-kinds-empty'));
  } else {
    findings.push(...forwardFindings(ctx, writers));
    findings.push(...pairFindings(ctx));
    findings.push(...reverseFindings(ctx, kinds, writers));
  }
  findings.push(...sinkFindings(ctx, block?.['written_by_helper']));
  findings.push(...reaperFindings(ctx));
  return [result('C27c', C27c_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

function forwardFindings(ctx: CheckContext, writers: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const writer of writers) {
    const text = ctx.readText(writer);
    // A missing file is C27's finding, not a second one here.
    if (text === undefined) continue;
    if (!LIFECYCLE.test(text)) findings.push(finding('C27c', 'declared-writer-writes-no-span', writer));
  }
  return findings;
}

// The dispatch hook opens a span it cannot close and the return hook closes it;
// one without the other leaks markers or fabricates durations.
function pairFindings(ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  if (!(ctx.readText(DISPATCH_HOOK) ?? '').includes('openSpan(')) {
    findings.push(finding('C27c', 'dispatch-hook-opens-no-span', DISPATCH_HOOK));
  }
  if (!(ctx.readText(RETURN_HOOK) ?? '').includes('closeSpan(')) {
    findings.push(finding('C27c', 'return-hook-closes-no-span', RETURN_HOOK));
  }
  return findings;
}

// Reverse: a hook that emits a span kind is declared as a writer. Without this
// half a second hook could start writing `router` spans and the registry —
// which the retro and the breaker count read to know where spans come from —
// would never say so.
function reverseFindings(ctx: CheckContext, kinds: readonly string[], writers: readonly string[]): Finding[] {
  const declared = new Set(writers);
  const emitsKind = new RegExp(`kind: '(${kinds.map(escapeRegExp).join('|')})'`);
  const findings: Finding[] = [];
  for (const name of ctx.list(HOOKS_DIR)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    const path = `${HOOKS_DIR}/${name}`;
    if (NOT_WRITERS.has(path)) continue;
    const text = ctx.readText(path);
    if (text === undefined || !emitsKind.test(text)) continue;
    if (!declared.has(path)) findings.push(finding('C27c', 'undeclared-span-writer', path));
  }
  return findings;
}

// The sink is where a prompt-text leak would actually happen, so the ban is
// enforced there and not only at the callers. It receives the whole envelope —
// it needs cwd and session id — so `env.prompt` appearing in it at all is the
// leak.
function sinkFindings(ctx: CheckContext, helper: unknown): Finding[] {
  if (typeof helper !== 'string' || helper === '') return [];
  const text = ctx.readText(helper);
  if (text === undefined || !text.includes('env.prompt')) return [];
  return [finding('C27c', 'span-sink-references-prompt-text', helper)];
}

// <session>.exec.jsonl is covered by the '.jsonl' suffix pass, and the span
// start markers live one level down where that pass never looks.
function reaperFindings(ctx: CheckContext): Finding[] {
  const text = ctx.readText(LAYOUT_HOOK) ?? '';
  const findings: Finding[] = [];
  if (!text.includes("endsWith('.jsonl')")) findings.push(finding('C27c', 'reaper-ignores-exec-jsonl', LAYOUT_HOOK));
  if (!text.includes('reapFilesBelow(spans')) findings.push(finding('C27c', 'reaper-ignores-span-markers', LAYOUT_HOOK));
  return findings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
