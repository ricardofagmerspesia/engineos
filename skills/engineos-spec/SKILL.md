---
name: engineos-spec
description: "Resolve a simple-task planning choice or publish accepted bounded tracer-bullet frontiers as their specs become ready."
---

# Native feature design

`rules/gates.md` owns design triggers; `rules/risk-autonomy.md` owns autonomy.
`rules/parallelism.md` owns execution/ownership; `rules/verification.md` owns final
consent. Preserve accepted decisions, artifact paths and the current branch/PR.

## Resolve the planning lane first

1. Scope outcome, existing seams and acceptance; resolve routing/stack and declared
   execution facts through `engineos kernel resolve --facts` with `taskContract:true`
   and `execution`. Clarify only unknown facts or correctness/one-way-door decisions.
   Missing eligibility facts permit read-only scoping, never a direct bypass.
2. Consume the kernel's execution/planning result before creating PRD, ADR, spec or
   tickets. For an eligible simple task with a pending scope-bound choice, ask one
   permitted clickable question: **Implement directly** / **Create a lightweight
   spec**. Record the actual answer and scope revision. Preselection, silence and
   implementation permission are not a planning answer. If the host lacks a
   permitted clickable input, explain that limitation and offer labelled text choices.
3. **Direct:** resolve again with the actual matching choice, then implement under
   the returned stack guidance and security/Git safeguards. No mandatory prototype,
   scaffolding, PRD, ADR or ticket workflow applies to this eligible lane. An explicit
   preview request remains available. Expanded scope requires fresh resolution.
   Finish with the final-consent procedure in native `engineos-implement-spec`.
4. **Spec:** create the requested lightweight spec and proposed evidence plan at
   the existing spec paths; decompose it below. A simple spec choice does not by
   itself require a full PRD/ADR package. Non-simple work and independent design
   obligations follow the full design branch. Actual spec selection is required
   before creating artifacts for an eligible task; an accepted existing spec reuses
   its recorded decision.

## Full design branch

1. Record alternatives and rationale through native `adr`; glossary facts belong
   in `CONTEXT.md`. Exit: proposed/approved ADR with no hidden irreversible assumption.
   Application multi-agent topology uses design-agents; development delegation
   does not create an application topology.
2. Write `docs/prds/<date>-<feature>.md`: problem, users, observable outcomes,
   non-goals and acceptance. Exit: developer-reviewed problem/scope.
3. Write `.specs/features/<feature>/plan.md`: surfaces, entities, frozen interface
   revisions, risk, rollback and EARS acceptance ids. Write `checks.md` mapping each
   claim to proposed final evidence. These are plans, not executable tests.
   Exit: developer-reviewed contracts and acceptance.

## Decompose every accepted spec

1. Resolve `engineos kernel skill-reference --id upstream-to-tickets`; read its
   available actual path `.agents/skills/to-tickets/SKILL.md`. Apply Matt Pocock's
   tracer-bullet decomposition and blocking-edge process within this authorized
   native flow. Keep the vendored skill unchanged. If unavailable, report the
   missing prerequisite once and request its location; install nothing implicitly.
2. Draft multiple bounded tickets, each a complete observable vertical slice that
   fits a fresh worker context, with only genuine blocking edges. Wide mechanical
   refactors use its expand–migrate–contract exception. Preserve test coverage in
   acceptance/evidence plans; test authoring and execution wait for final consent.
   Use kernel task budgets as guidance, never a numerical minimum or a ticket per
   file. Never fabricate independent units to occupy workers. If no honest split
   exists, return that granularity conflict for scope adjustment before publication.
3. Record the shared outcome/scope, authoritative contract revisions, known blockers
   and exclusive reservations before first launch. Draft later ticket prose in
   disjoint paths while accepted ready tickets implement. Unknown dependencies or
   unresolved shared contracts keep affected tickets blocked.
   Show the available frontier's numbered titles, blockers and delivered behavior.
   Ask whether granularity and blocking edges are correct, whether tickets should merge/split, and
   whether fewer units deliver the same result. Iterate until approved. Reuse
   approved unchanged breakdowns on resume; do not repeat the interview. Review
   each later frontier when ready; retain every applicable design/user gate.
4. Publish each approved bounded frontier immediately. Preserve native local paths:
   `docs/specs/<feature>/tickets/NN-<slug>.md`, one file per ticket, blockers first.
   Use the upstream ticket body for outcome, blockers, status and acceptance;
   append EngineOS brief metadata: exclusive paths, acceptance ids, `dependsOn`,
   owner, authoritative contract path/revision and read-only integration evidence.
   Preserve existing `docs/agents/` tracker/domain conventions with these native
   local paths. Local publication is the default for this flow. A real tracker needs explicit
   user authorization and configured conventions; no parent issue changes.
5. Maintain accepted implementation deliveries in one `units.json` using existing
   WorkflowUnit fields. `requiredChecks` names ordinary read-only integration
   evidence only, such as scoped diff/contract inspection. Executable tests, scans,
   builds, startup, lint, typecheck, integrity and test-writer output cannot gate
   implementation integration. Keep those obligations in `checks.md` and a separate
   final-proof ticket blocked by ALL implementation deliveries. That proof ticket
   is outside the runtime implementation graph and completion ticket list, avoiding
   a circular final-consent gate. Do not add ad-hoc scheduler fields.
6. Hand off the first accepted frozen frontier to native `engineos-implement-spec`
   immediately once its scope-bound admission holds; keep drafting later specs.
   Use `engineos scheduler plan --planning-open` with known host capacity when
   later frontiers remain, then append each accepted frontier at the current state
   revision/time. These resolve readiness, not executable validation. Unknown
   deps/cycles are design failures. Refresh scope resolution/workflow admission
   after expansion before further launches. Exit per frontier: approved bounded
   tickets, exclusive scopes and frozen contracts; final planning exit: one DAG
   covering every implementation acceptance id, with planning explicitly sealed.
7. Write `docs/specs/<date>-<feature>.md` indexing applicable PRD/ADRs, plan, checks,
   tickets and graph; link the change record. Create/update this index for each
   accepted frontier before its launch, keeping later planning explicit. For all selected-spec implementation,
   complete rules/parallelism.md **Prototype preview choice**, including on resume.
   Preserve unchanged-scope decisions and scoped preview approval.

Reuse the same implementation run as frontiers arrive; final proof waits for sealed
planning and all actual deliveries/corrections integrated. Optional upstream
references do not grant Git writes, test consent or workflow overrides. After
delivery follow rules/parallelism.md **Completion follow-up** for the separate
optional Matt Pocock `/retro` offer; invoke only on opt-in.
