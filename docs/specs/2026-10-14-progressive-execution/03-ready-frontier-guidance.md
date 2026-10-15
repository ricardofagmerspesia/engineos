# Progressive ready-frontier guidance

Status: implemented; final approved build and focused suites passed on 2026-10-14 (104 tests across both changes).
Scope revision: progressive-execution-v1. Risk: medium. Autonomy: A2.
Branch/current PR: unknown; preserve the existing context and dirty edits.
User decision: "Skip prototype; implement ready task specs" applies to this scope.

## Outcome and frozen ownership

**GUIDANCE-3** changes `rules/parallelism.md`, `skills/engineos-spec/SKILL.md`,
`skills/engineos-implement-spec/SKILL.md`, `commands/implement-spec.md` and
`docs/COMPATIBILITY.md`, plus the `commands/new-feature.md` entrypoint alignment.
This task is independent of STREAM-1 and runtime
implementation once the shared scheduler contract below is frozen. One worker
owns these files; later role-only compatibility edits must integrate before this
worker takes ownership. Preserve canonical agent names and role-only announcements.

The supervisor prepares the shared outcome/scope, contract revisions, known
dependency edges and exclusive ownership reservations before first dispatch.
Each accepted bounded ticket is published and starts when its prerequisites are
integrated, its contracts frozen and its scope-bound planning/design/preview
admission satisfied. Later ticket prose may be drafted concurrently in reserved
disjoint paths. A complete later ticket list is not a prerequisite for the first
ready ticket. Unknown dependencies or unresolved shared contracts block affected
tickets until resolved; they never become speculative runnable units.

Preserve the existing granularity review and required user decisions. Review the
available bounded frontier and known edges, then publish only accepted tickets.
Reuse unchanged same-scope decisions. Material expansion requires fresh resolution
and the applicable admission before expanded dispatch. Final proof remains separate.

## Scheduler contract

The runtime slice owns actual APIs and CLI implementation. Document only its
frozen additive contract: optional `planningOpen` defaults false for old states;
`scheduler plan --planning-open` starts an incremental run; `scheduler append
--state <json> --units <json> --revision <expected> --time-ms <epoch>` appends
accepted immutable units; `scheduler seal --state <json> --revision <expected>
--time-ms <epoch>` closes planning. Preserve existing state, handles and event
history. Each expanded fingerprint needs refreshed host workflow admission.
Plan/step/append/seal optionally use `--stream` for tagged NDJSON event records
followed by one snapshot; errors use tagged error records. Tags are transport,
not workflow journal events; the single journal owner assigns global sequences.

## Acceptance and evidence

- All execution guidance starts the first accepted ready frontier immediately
  while later specs are authored, within existing capacity/ownership limits.
- New graph admission is append-only and revision-bound; drafts remain outside
  the runtime graph until approved. Reserving scopes prevents planning/writer
  collisions. Shared contract drift pauses affected workers as before.
- Every accepted expansion refreshes scoped admission; no user gate, test/Git
  consent or role responsibility is weakened.
- Whole-run implementation completion and final check/security consent wait for
  planning sealed, all actual approved deliveries integrated and corrections
  resolved. Temporary frontier exhaustion while planning is open remains pending.
- Existing closed graph/default JSON callers retain behavior. Compatibility
  records the additive interfaces with no canonical agent rename.

Read-only integration evidence: inspect the scoped diff against each acceptance
item, verify referenced flags against runtime slice contracts and preserve prior
role-only edits. No executable checks, test writing, security scans or Git writes
are authorized by this task. The supervisor proposes final exact checks after all
deliveries integrate. Rollback removes only GUIDANCE-3 patch hunks.
