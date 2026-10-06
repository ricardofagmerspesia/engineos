---
description: Orchestrate a coordinated multi-domain change — dispatch the relevant domain coordinators in IMPLEMENT mode for a well-scoped task.
argument-hint: <domain|all> <task description>
allowed-tools: Task, Read, Write, Edit, Bash, Grep, Glob
---

You are the top-level implement supervisor. `$ARGUMENTS`: first token
backend|frontend|mobile|dba|devops|llm|all, then task. `ia` is a deprecated llm
alias. Unknown first token: infer domains from the whole argument string.

## Steps

0. **Route before writes/dispatch**, including mechanical edits and follow-ups.
   Use kernel routing; supervisor resolves residue or consults read-only router.
   Explicit /engineos:route stays plan-only. Load routed rules/skills/patterns,
   classify risk/autonomy, announce route. Unknown intent: always-on rules plus
   appropriate exclusive worker. Authorized work gains no approval gate; pure
   explanations create no implementation units.
1. **Spec first:** >2 files or any new feature requires a spec. If missing, route
   to superpowers:brainstorming + superpowers:writing-plans before implementation.
   Spec/PRD uses fable (rules/models.md); delegate if session tier is lower.
2. Open active `.engineos/changes/<date>-<slug>.md` from _template.md.
3. Select relevant domain-coordinator(s): backend, frontend, mobile, dba, devops,
   llm. MCP leaves are AUDIT-only. Security is not an implement domain: its owner
   implements; security-reviewer supplies read-only review afterwards.
4. **Freeze contracts** (single-file exemption): one opus design owner specifies
   types/DTOs, HTTP routes/payloads, DB deltas, events and module public surfaces.
   Link source/owner/revision from change record; use templates/api-contract.md
   for HTTP, keeping existing schemas authoritative. Consumers start only when
   their required contracts exist.
5. Split into exclusive paths; maintain dependency/contract-revision ledger in
   rules/parallelism.md. Units become ready as prerequisites integrate. Announce
   `[fanout] waves=<n> wave1=<agent:scope, ...> model=<per-agent>`.
6. Dispatch **all useful ready units**, filling min(policy cap, host worker slots),
   reserving supervisor slot. Queue excess and refill promptly; one indivisible
   task gets one worker. Flat workers; same coordinator can own disjoint units.
   Brief: MODE: IMPLEMENT, role, rules/skills/patterns, task, exclusive paths,
   prerequisites, contracts/revisions, risk/autonomy, active branch/PR and return
   expectations. Model: opus for code/design risk; haiku for mechanical work.
   Workers return scope changes/new tasks for supervisor rerouting. Inspect and
   integrate returns, release dependencies and refill; no intermediate gates.
7. Integrate all units, then final lint/typecheck/build (rules/verification.md).
   Tests are a separate final action requiring direct current-task consent;
   otherwise state `[tests] pending — final-stage user approval required`.
   Name failed/incomplete units; never hide them behind a green summary.
8. Close via record-change: files/movements, mark done honestly, move changes → archived.
9. Offer once per CLAUDE.md: scaffold/flowchart/template/UI-UX/none, pruning
   inapplicable choices. Template/UI-UX only for frontend/mobile.

## Rules

Follow routed domain rules (edit hook) and project CLAUDE.md. Keep change atomic
and follow rules/git.md; preserve current branch/PR until user directs a change.
