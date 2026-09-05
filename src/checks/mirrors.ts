// The rule-to-registry mirror table (design "Mirror table"). Every row is one
// pair that fifteen bash checks used to spell out by hand; `element` and
// `pattern` carry today's exact grep strings with the value replaced by a
// placeholder, so plan Task 37's "keep the exact grep strings" holds as data.
// The runner and the rationale for the invariants live in ./mirror.ts.
//
// A row is a REGISTRY-to-document claim. Registry-to-registry assertions
// (foreign keys, uniqueness, well-formedness), canaries that pin a literal
// string, and joins across two registry fields are not mirrors and stay code in
// their family; each check's remaining assertions are named in its comment.
import type { Registries } from '../kernel/context';
import type { CheckId } from './ids';

export type Direction = 'doc-names-registry' | 'registry-names-doc' | 'both';
export type RegistryName = keyof Registries;

// Dot segments under a registry name. A segment may carry `[]` (map over an
// array) or `[id=x]` (the one element whose id is x — every registry array in
// this repo is keyed by id, and C19b/C21b/C21e all mirror one intent's fields).
export type RegistryPath = `${RegistryName}.${string}`;

export interface MirrorBase {
  readonly id: string;
  readonly check: CheckId;
  readonly registry: RegistryPath;
  readonly doc: string;
  readonly anchor?: string;
  readonly scope?: 'file';
  readonly direction: Direction;
  // Two of today's mirrors are case-insensitive in bash and cannot be ported
  // without it: C19c lowercases both sides before comparing, and the gate
  // ladder is declared in lower case but rendered in Title Case.
  readonly ignoreCase?: true;
}

export type MirrorPair = MirrorBase & (
  | { readonly kind: 'names'; readonly element: string }
  | { readonly kind: 'quotes'; readonly pattern: string }
);

// `direction` is meaningless for a `quotes` row — one scalar has no reverse —
// so those rows all declare doc-names-registry and the runner ignores it.
const ROWS = [
  // --------------------------------------------------------------- C16
  // Stays code in 40-decision-registries.sh: the ADR and code-review rows of
  // rules/models.md (they join work_types[].tier to tiers[].model, and a path
  // resolves one field, never a join); the spelled-out retry bound ("Two
  // attempts per unit, one escalation" carries no numeral to capture); the
  // shared-binding documentation grep; the CLAUDE.md router-row count; and
  // every registry-to-registry assertion in the check.
  {
    id: 'model-missing-from-prose', check: 'C16',
    registry: 'models.tiers[].model', doc: 'rules/models.md',
    // scope: file — the bash greps the whole document, and a tier's model is
    // named in the escalation prose as well as in the table.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '`{x}`',
  },
  {
    id: 'gate-ladder-missing-from-prose', check: 'C16',
    registry: 'policy.gates.ladder', doc: 'rules/gates.md', anchor: '## The ladder',
    // Deviation 5: the bash compared policy.json against a literal string and
    // never opened rules/gates.md. This row reads the ladder table for real.
    direction: 'doc-names-registry', ignoreCase: true,
    kind: 'names', element: '^\\| {x} \\|',
  },
  {
    id: 'wave-cap-drift', check: 'C16',
    registry: 'policy.parallelism.wave_concurrency_cap', doc: 'rules/parallelism.md',
    // scope: file — the bash greps the sentence wherever it sits in the file.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'Cap concurrency at ~{n}',
  },
  {
    id: 'spec-threshold-drift', check: 'C16',
    registry: 'policy.gates.spec_threshold.files_greater_than', doc: 'CLAUDE.md',
    // scope: file — non-negotiable #1 is prose, not a section of its own.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'touching >{n} files',
  },
  {
    id: 'fanout-threshold-drift', check: 'C16',
    registry: 'policy.parallelism.fanout_signals.files_greater_than', doc: 'rules/parallelism.md',
    // scope: file — as above; the threshold sits in the opening paragraph.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'quotes', pattern: '\\*\\*>{n} files\\*\\*',
  },

  // --------------------------------------------------------------- C19b
  // Stays code: the reverse assertion (every `## ` heading in the template is
  // declared). Section names are multi-word, and the reverse capture class
  // stops at a space, so reversing here would match nothing and pass.
  {
    id: 'template-missing-section', check: 'C19b',
    registry: 'intents.intents[id=handoff].required_sections', doc: 'templates/handoff.md',
    // scope: file — the whole template is the mirrored surface.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '^## {x}$',
  },
  {
    id: 'template-missing-field', check: 'C19b',
    registry: 'intents.intents[id=handoff].required_fields', doc: 'templates/handoff.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '^{x}:',
  },

  // --------------------------------------------------------------- C19c
  // The element pins the match to the router row itself rather than to the
  // document, which is what the bash did by extracting the row first.
  {
    id: 'claude-row-missing-section', check: 'C19c',
    registry: 'intents.intents[id=handoff].required_sections', doc: 'CLAUDE.md',
    // scope: file — the row is found by its own load target, not by a heading.
    scope: 'file', direction: 'doc-names-registry', ignoreCase: true,
    kind: 'names', element: '^\\|.*templates/handoff\\.md.*{x}',
  },
  {
    id: 'claude-row-missing-field', check: 'C19c',
    registry: 'intents.intents[id=handoff].required_fields', doc: 'CLAUDE.md',
    scope: 'file', direction: 'doc-names-registry', ignoreCase: true,
    kind: 'names', element: '^\\|.*templates/handoff\\.md.*{x}',
  },

  // --------------------------------------------------------------- C20c
  // Stays code: the two "until clean" canaries and the verify-done note
  // pointer — literal strings, with no registry side to mirror.
  {
    id: 'fix-attempt-bound-drift', check: 'C20c',
    registry: 'policy.repair.max_fix_attempts_per_check', doc: 'CLAUDE.md',
    // scope: file — the bash greps table rows, and the element carries the row
    // shape (`^|` … `kernel.sh repair`) so the file scope stays non-vacuous.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'quotes', pattern: '^\\|.*{n} fix attempts per check.*kernel\\.sh repair',
  },

  // --------------------------------------------------------------- C21b
  // Stays code: the reverse assertion, for C19b's reason.
  {
    id: 'template-missing-section', check: 'C21b',
    registry: 'intents.intents[id=record-change].required_sections', doc: '.engineos/changes/_template.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '^## {x}$',
  },
  {
    id: 'template-missing-field', check: 'C21b',
    registry: 'intents.intents[id=record-change].required_fields', doc: '.engineos/changes/_template.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '^{x}:',
  },

  // --------------------------------------------------------------- C21e
  // Three homes, one registry list, one row each: a finding must say WHICH
  // home lost the domain. Stays code: the changes/README.md canary that keeps
  // the killed inline schema copy dead.
  {
    id: 'skill-missing-domain', check: 'C21e',
    registry: 'intents.intents[id=record-change].archive_contract.domains', doc: 'skills/record-change/SKILL.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '{x}',
  },
  {
    id: 'archive-readme-missing-domain', check: 'C21e',
    registry: 'intents.intents[id=record-change].archive_contract.domains', doc: '.engineos/archived/README.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '{x}',
  },
  {
    id: 'template-missing-domain', check: 'C21e',
    registry: 'intents.intents[id=record-change].archive_contract.domains', doc: '.engineos/changes/_template.md',
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '{x}',
  },

  // --------------------------------------------------------------- C23
  // Stays code: the ORDER of the precedence chain (the bash compares the whole
  // rendered sentence, and a per-element row cannot express order), and C23b's
  // CLAUDE.md-to-COMPATIBILITY.md always-on list, which has no registry side.
  {
    id: 'precedence-domain-missing', check: 'C23',
    registry: 'routing.precedence', doc: 'CLAUDE.md', anchor: '## Router — classify before acting',
    // The chain wraps across two lines, so the separator is matched with \s
    // rather than a literal space; 'chain:' carries the first domain.
    direction: 'doc-names-registry',
    kind: 'names', element: '(?:chain:|→)\\s*{x}',
  },

  // --------------------------------------------------------------- C24c
  // Stays code: the 'kernel.sh admit' literal. Anchored to the section the
  // claim is about, where the bash grepped the whole file.
  {
    id: 'action-row-missing', check: 'C24c',
    registry: 'policy.parallelism.backpressure.actions', doc: 'rules/parallelism.md', anchor: '## Backpressure',
    // both: actions is a closed answer set, so a table row the kernel never
    // answers is drift in the direction the bash could not see.
    direction: 'both',
    kind: 'names', element: '^\\| `{x}`',
  },
  {
    id: 'queue-bound-drift', check: 'C24c',
    registry: 'policy.parallelism.backpressure.max_queued_units', doc: 'rules/parallelism.md', anchor: '## Backpressure',
    direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'max_queued_units[^0-9]*{n}\\b',
  },
  {
    id: 'overload-row-missing', check: 'C24c',
    registry: 'policy.parallelism.backpressure.overload_action', doc: 'rules/parallelism.md', anchor: '## Backpressure',
    direction: 'doc-names-registry',
    kind: 'names', element: '^\\| `{x}`.*max_queued_units',
  },

  // --------------------------------------------------------------- C25c
  // Stays code: the 'kernel.sh breaker' literal. The scope row is anchored on
  // the vocabulary SENTENCE, not the section: `provider` and `tool` also occur
  // in the exec-journal paragraph inside this section, so a section-wide
  // element would pass with the vocabulary deleted.
  {
    id: 'state-row-missing', check: 'C25c',
    registry: 'policy.breaker.states', doc: 'rules/parallelism.md', anchor: '## Circuit breaker',
    direction: 'both',
    kind: 'names', element: '^\\| `{x}`',
  },
  {
    id: 'failure-threshold-drift', check: 'C25c',
    registry: 'policy.breaker.failure_threshold', doc: 'rules/parallelism.md', anchor: '## Circuit breaker',
    direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'failure_threshold[^0-9]*{n}\\b',
  },
  {
    id: 'scope-vocabulary-missing', check: 'C25c',
    registry: 'policy.breaker.scopes', doc: 'rules/parallelism.md', anchor: '## Circuit breaker',
    // [^.] spans the line wrap and stops at the sentence's period, which is the
    // bash's "flatten, split on '.', keep the fragment saying 'scopes over'".
    direction: 'doc-names-registry',
    kind: 'names', element: 'scopes over[^.]*`{x}`',
  },

  // --------------------------------------------------------------- C26c
  // Stays code: the 'kernel.sh hitl' literal and the three record_home
  // mirrors, which derive a heading from the value's URL fragment rather than
  // naming the value itself.
  {
    id: 'reason-row-missing', check: 'C26c',
    registry: 'policy.hitl.reasons', doc: 'rules/risk-autonomy.md', anchor: '## Human-in-the-loop',
    // both: the registry calls reasons a CLOSED vocabulary, so a reason the
    // prose invents is the failure this row exists to catch.
    direction: 'both',
    kind: 'names', element: '^\\| `{x}`',
  },

  // --------------------------------------------------------------- C27d
  // Stays code: every literal caveat the section must keep (the 0-is-not-free
  // and status-is-a-FLOOR warnings, the all-but-note slug claim, trace_id /
  // span_kind / cost_micros / tokens_in), the span-kind alternation asserted
  // as one ordered string, and the parallelism.md back-reference.
  {
    id: 'span-kind-missing', check: 'C27d',
    registry: 'policy.telemetry.exec_journal.span_kinds', doc: 'rules/observability.md', anchor: '## Agent traces',
    // Pinned to the alternation sentence rather than the section: every kind
    // is a substring of some other bullet, which is the vacuity the bash
    // patched by asserting the whole line separately.
    direction: 'doc-names-registry',
    kind: 'names', element: 'is one of[^.]*{x}',
  },
  {
    id: 'journal-home-missing', check: 'C27d',
    registry: 'policy.telemetry.exec_journal.home', doc: 'rules/observability.md', anchor: '## Agent traces',
    direction: 'doc-names-registry',
    kind: 'names', element: '{x}',
  },
  {
    id: 'value-length-drift', check: 'C27d',
    registry: 'policy.telemetry.exec_journal.max_value_length', doc: 'rules/observability.md', anchor: '## Agent traces',
    // The bash asserted only that the field NAME is stated; the number beside
    // it is the same claim, checked.
    direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'max_value_length[^0-9]*{n}\\b',
  },
] satisfies readonly MirrorPair[];

export const MIRRORS: readonly MirrorPair[] = ROWS;

export function rowsOf(check: CheckId): MirrorPair[] {
  return MIRRORS.filter((row) => row.check === check);
}
