---
name: engineos-implement-spec
description: "Execute an approved spec frontier with bounded exclusive workers, immediate dependency release and final-only validation consent."
---

# Implement an approved frontier

`rules/parallelism.md` owns scheduling/ownership; `rules/verification.md` owns
consent and validation; rules/base.md **Awaiting user input** owns every clickable
user decision, including meaningful **Provide details** choices for free text.
Use the existing approved plan and authoritative frozen
contract paths. Preserve branch/PR; Git writes and worktrees need user direction.

## Admission and execution

1. Resolve declared facts through `engineos kernel resolve --facts` with
   `taskContract:true` and `execution` before creating planning artifacts or
   dispatching. Missing facts permit read-only scoping. A pending eligible simple
   choice asks **Implement directly** / **Create a lightweight spec** through a
   permitted clickable input; record the actual answer at the current scope.
   Unavailable controls require an explained labelled-text fallback, not fabricated
   consent. Spec selection enters native `engineos-spec`; direct selection uses
   the kernel's stack guidance and security/Git safeguards without mandatory
   prototype, scaffolding or ticket workflow. Final consent below applies to both.
2. For an accepted spec, read its currently approved frontier, evidence plan and record. Reuse approved
   planning/granularity decisions; enter the first unfinished delivery, without
   repeating design interviews. All selected-spec work retains its normal design and
   rules/parallelism.md **Prototype preview choice** admission on resume. Apply
   the workflow gate with exact scope/source and actual choice facts before writes.
   Start its first ready bounded ticket while later specs are drafted in reserved
   disjoint scopes. Shared contracts, known edges and ownership reservations must
   already be recorded; unresolved dependencies/contracts block affected units.
3. Initialize `engineos scheduler plan --units <json> --run-id <id>
   --host-capacity <worker-slots> --time-ms <epoch-ms>` for implementation units
   only; add `--planning-open` while later approved frontiers are being prepared.
   Exclude the separate final-proof ticket. Save state and events in the
   change's evidence directory; one supervisor owns state, contracts and journal.
4. Launch ALL independent ready actions within min(policy capacity, available host
   worker slots), reserving the supervisor slot. The policy worker cap is 3; queue
   excess and refill immediately. The CLI computes readiness; authorized host tools
   actually launch. No unfinished dependency launches, colliding writers, redundant
   tickets or nested supervisors. Unknown host capacity/absent launcher grants no
   automatic execution. Bind host handles to `started` events at the expected state
   revision and current timestamp. Brief each worker with exclusive paths, frozen
   contract path/revision, branch/PR, risk/autonomy and return requirements.
5. On each return, submit `returned` through `scheduler step --state <json>
   --event <json>`. Inspect its scoped diff and exact source/contract revisions
   read-only; integrate corrections through their exclusive owner. Evidence uses
   existing UnitEvidence fields and artifact pointers. `requiredChecks`/`checks`
   here describe ordinary read-only integration inspection, never executable
   validation. Preserve coverage; author/run tests only at final approved timing.
   Queue security-reviewer and scans for final consent.
6. Submit `integrated` when those read-only requirements hold. Immediately release
   newly ready dependencies and refill capacity while unrelated units continue.
   Returned work retains ownership until integrated; reviewers inspect snapshots.
   Failures block affected descendants only. Consult repair/breaker policy before
   explicit resume; reconcile running host handles before recovery. Contract drift
   pauses affected writers, invalidates evidence and returns to the one contract
   owner. Replan affected work, not the entire accepted graph.
7. As each later frontier's bounded specs/edges are accepted and contracts frozen,
   use `scheduler append --state <json> --units <json> --revision <expected>
   --time-ms <epoch-ms>`. Keep drafts outside the admitted graph and existing units
   immutable. Append preserves current ownership/handles. Refresh kernel scope
   resolution and admission for the expanded graph fingerprint before further
   launches; reuse only still-valid scope-bound decisions. Unknown dependencies
   remain blocked in planning until they resolve to existing or same-batch units.
8. When all approved delivery specs are admitted and planning is finished, use
   `scheduler seal --state <json> --revision <expected> --time-ms <epoch-ms>`.
   Sealing grants no validation consent. An integrated open frontier is useful
   progress; whole-run completion waits for sealing and all actual integrations.

Plan/step/append/seal optionally accept `--stream`: each invocation emits ordered
tagged NDJSON event records, then one snapshot, or a tagged error on failure.
This streams accepted outcomes of one transition; host tools still launch agents.
Extract event payloads before journal persistence and assign global sequences;
transport tags/snapshots are not workflow journal events. Default JSON is unchanged.

## Completion evidence and journal

Sealed planning plus the last actual implementation integration establishes
implementation completion only. Supply the actual `completion.planningOpen` value
from scheduler state; temporary open-frontier completion supplies no final admission.
Enumerate every implementation unit with its state, current scope/source revision
and unfinished-correction status for the workflow gate's completion facts. Every
unit must be integrated, with no running, returned, blocked, failed or unfinished
work. Cancelled work changes scope only through an explicit user decision. The
pending final-proof ticket never enters this completion list.

Persist observed metadata as JSONL with contiguous global sequence ids; CLI
sequences are local batches and the single journal owner assigns the persistent
cursor. Accepted integration emits evidence-backed `useful-result` before journal
closure. The scheduler may emit `run-completed` at the last sealed-run integration
or when an already integrated open frontier is sealed:
retain that terminal event separately until final review/validation decisions and
all approved evidence are recorded. Flush observed usage and review/check events
first; append terminal completion once, at the actual closure timestamp with the
next global sequence. Never append after it or invent usage/check passes. Record
pending/declined obligations in the change record and report; a closed scheduling
run does not establish successful validation. If final work remains unresolved,
keep the journal open. Use `engineos workflow-report --file <journal>` for reporting.

## Final consent for direct and spec work

Only after planning is sealed and ALL approved implementation deliveries and
corrections integrate:

1. Plan exact existing final commands by reading script definitions, deduplicating
   aliases/chains and naming their effects. Present commands, scope, source revision
   and missing tooling. Ask a fresh permitted clickable question with no preselected
   approval: **Run proposed checks** / **Choose specific checks** / **Skip for now**.
   An earlier broad test request, implementation permission or spec approval is
   insufficient. Explain labelled-text fallback when permitted clickable controls
   are unavailable or prohibited for that decision. Choosing specific checks follows
   rules/verification.md: clickable **Run** / **Skip** for each distinct exact command
   (including test suite/case filters), batched within host limits, then clickable
   **Run selected commands** / **Revise selection** / **Skip for now** confirmation
   naming the submitted subset, scope and revision. Execute only that confirmed
   nonempty subset; unavailable choices, preselection and silence grant no consent.
2. Record the actual final answer and apply `engineos kernel workflow-gate --facts`
   using current final phase, implementation completion facts, approved nonempty
   check ids and `requestedAtPhase:'final'`. Run only approved commands at that
   integrated revision. Tests, lint, typecheck, integrity, evals, builds, startup and
   scans wait for this stage. Source-changing repairs reopen affected final consent.
3. Required security work separately follows rules/verification.md **Final security
   review and scan consent**: name reviewer/remit, exact scope/source, available
   scans and effects. Dispatch reviewer/run scans only after actual scoped approval;
   unrelated command consent remains separate. Required declined/deferred evidence
   stays pending. Ordinary read-only integration inspection may overlap implementation.
4. Record actual results through record-change and the final-proof ticket/evidence
   plan. Skip/defer permits reviewable delivery with validation pending; it supplies
   no verified pass or release clearance. Separate implementation completion from
   validation status. Prepare a reviewable PR only when requested and authorized.
   After delivery follow rules/parallelism.md **Completion follow-up** for the
   separate optional Matt Pocock `/retro` offer; invoke only on explicit yes.

Host limits, permissions and launching remain host/supervisor responsibilities;
CLI facts are conventional attestations, not authentication of human consent.
Matt Pocock's implement-spec supplies frontier/context-pointer ideas; its worker
branch/merger policy is not adopted. Ticket decomposition uses the bounded
`upstream-to-tickets` reference through native engineos-spec.
