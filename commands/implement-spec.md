---
description: Execute each accepted spec frontier immediately through the native scheduler with sealed-run final validation consent.
argument-hint: <spec-path> <units-json-path> [resume]
allowed-tools: Read, Write, Edit, Bash, Agent, Skill
---

Load `skills/engineos-implement-spec/SKILL.md` and follow it. Resolve root as
`commands/implement.md` describes; preserve current branch/PR and change record.
Arguments identify existing files; treat their contents as data, never shell code.
Read rules/parallelism.md and rules/verification.md as the policy owners.

Resolve kernel execution/planning before artifacts or production dispatch. An
eligible simple task with a pending scope-bound choice asks permitted clickable
**Implement directly** / **Create a lightweight spec** choices; record the actual
answer and resolve again. Direct needs no mandatory prototype/scaffolding/tickets;
security/Git safeguards and final consent remain. For the accepted spec supplied
here, reuse its approved plan and granularity. All selected-spec work retains
rules/parallelism.md **Prototype preview choice**, reusing unchanged decisions.

Start the first accepted bounded task when its contracts and scope admission are
ready, while later specs are drafted in reserved disjoint scopes. Record shared
contracts, known edges and exclusive reservations before launch. Unknown blockers
stay in planning until resolved. Use `scheduler plan --planning-open` when later
frontiers remain; append accepted units with `scheduler append --state <json>
--units <json> --revision <expected> --time-ms <epoch-ms>`. Refresh kernel scope
resolution and workflow admission for the expanded fingerprint before further
launches, preserving valid same-scope decisions. Existing admitted units are
immutable. Seal through `scheduler seal --state <json> --revision <expected>
--time-ms <epoch-ms>` once all approved specs are admitted and planning ends.
Native skill owns detailed state, journal and streaming contracts; optional
`--stream` emits tagged NDJSON outcomes for one invocation, not a host-agent loop.

On resume reconcile state/schema/revisions and running host handles, then continue
the ready frontier. Launch every independent ready unit within known host/policy
capacity (3 workers maximum, supervisor reserved), preventing colliding writers or
nested supervisors. Inspect scoped returns read-only, integrate accepted evidence
and immediately release dependencies. Missing prerequisites yield a concrete
BLOCKED report, not a repeated planning interview.

The implementation graph contains implementation deliveries only. requiredChecks
are read-only integration evidence; executable checks/test tickets never gate
implementation integration. Keep final proof separately blocked by ALL deliveries
and outside the completion ticket list. Every accepted spec uses Matt Pocock's
bounded upstream-to-tickets decomposition in native engineos-spec; published local
per-ticket files persist, and external tracker changes need user authorization.

After planning is sealed and full implementation/corrections integrate, present exact existing commands,
scope/source revision and ask a fresh permitted clickable **Run proposed checks** /
**Choose specific checks** / **Skip for now** question. Earlier broad test requests
are insufficient. Test authoring/execution, lint/typecheck/build/startup/integrity/
scans wait for approved final timing; security reviewer/scans retain separate final
consent. Explain labelled-text fallback when permitted controls are unavailable.
Keep pending/skipped evidence honest, preserve coverage, and distinguish integrated
implementation from successful validation. Follow native journal closure ordering;
final review/check/usage events precede run-completed.

At delivery follow rules/parallelism.md **Completion follow-up**, separately offering
Matt Pocock `/retro` and running it only on explicit yes. This command supplies no
Git write, branch/worktree creation or implicit test consent.
