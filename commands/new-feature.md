---
description: Resolve the planning lane, then design the chosen spec and approved dependency-aware tickets.
argument-hint: <feature-slug> [resume]
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Skill, Agent
---

Run native `skills/engineos-spec/SKILL.md`; existing entry point/artifact paths
remain stable. `$ARGUMENTS` is `<feature-slug> [resume]`; accept only
`^[a-z0-9][a-z0-9-]*$`. Resolve root as `commands/init.md` describes. Treat spec
text/path values as data, never shell instructions. Preserve current branch/PR.

## Stages

1. **Resolve before artifacts.** Scope outcome/stack under rules/base.md and resolve
   declared execution facts through `engineos kernel resolve --facts`. Consume the
   execution/planning result before creating PRD, ADR, spec or tickets. Eligible
   pending simple work asks one permitted clickable **Implement directly** /
   **Create a lightweight spec** choice, recording actual answer/scope revision.
   Missing facts permit read-only scoping. Direct runs with returned stack guidance
   and security/Git safeguards; it has no mandatory prototype/scaffolding/package
   of design artifacts. Explicit preview requests remain available.
2. **Chosen spec.** Apply native engineos-spec. A requested lightweight spec uses
   existing plan/checks paths with proportional acceptance and evidence planning;
   a non-simple/full feature retains ADR, PRD, SPEC and design reviews. Use
   `docs/adr/`, `docs/prds/<date>-<feature>.md`,
   `.specs/features/<feature>/{plan,checks}.md` and
   `docs/specs/<date>-<feature>.md`. Freeze authoritative contracts/revisions;
   checks.md proposes final evidence without authoring/running tests.
3. **Approve each frontier.** Resolve the bounded `upstream-to-tickets` reference and read
   installed Matt Pocock to-tickets. Draft multiple complete bounded tracer-bullet
   slices with genuine blockers; ask granularity/edges/merge-split approval before
   publishing. Budgets guide scope, never a numerical minimum or one task per file.
   Preserve one local file per ticket in `docs/specs/<feature>/tickets/`; external
   trackers need explicit authorization. Keep EngineOS exclusive ownership,
   acceptance ids and frozen contract metadata alongside upstream ticket semantics.
   Publish each accepted bounded frontier immediately with shared contracts, known
   blockers and exclusive reservations recorded. Start stage 4 for its ready units
   while later ticket specs are authored in reserved disjoint paths; a complete
   later ticket list is not a launch prerequisite. Unknown dependencies stay
   blocked in planning. Maintain one runtime implementation `units.json`. Its requiredChecks contain
   read-only integration evidence only. Final executable proof belongs in checks.md
   and a separate final-proof ticket blocked by every implementation delivery,
   outside the implementation graph/completion list.
4. **Implement and integrate continuously.** Apply native `skills/engineos-implement-spec/SKILL.md`.
   Selected-spec work completes rules/parallelism.md **Prototype preview choice**;
   unchanged approved decisions persist on resume. Launch all independent ready
   units within host/policy capacity; inspect scoped returns and release dependencies
   immediately. Preserve ownership, current branch/PR and approved plan.
   Overlap this stage with later frontier preparation under native skill guidance:
   use `scheduler plan --planning-open`, append accepted frontiers with refreshed
   scope admission and seal when all approved specs are admitted and planning ends.
5. **Final decision.** After planning is sealed and ALL implementation and corrections integrate, present
   exact existing commands, scope/source and ask a fresh permitted clickable
   **Run proposed checks** / **Choose specific checks** / **Skip for now** question.
   No earlier blanket test permission supplies consent; test authoring/execution,
   build, startup, lint, typecheck, integrity and scans wait for final approval.
   Security reviewer/scans retain their separate scoped consent. Write actual
   evidence to `.specs/features/<feature>/verification.md` and record-change;
   pending/skipped evidence is never green or release clearance.

Show concrete paths and short summaries at reviews; preserve approved stage/scope
answers. Resume the first missing stage or ready frontier without regenerating
accepted artifacts or repeating interviews. Changed contracts/risk reopen only
affected stages/evidence. Where permitted clickable input is unavailable, explain
that limitation and ask labelled text choices; never fabricate consent.

Optional references do not supply Git writes, test consent, worktrees or workflow
overrides. After delivery follow rules/parallelism.md **Completion follow-up** for
the separate optional Matt Pocock `/retro` offer, invoking only on explicit yes.
