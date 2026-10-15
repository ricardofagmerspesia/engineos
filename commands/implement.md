---
description: Resolve scoped execution and implement directly or supervise the approved dependency frontier.
argument-hint: <domain|all> <task description>
allowed-tools: Task, Read, Write, Edit, Bash, Grep, Glob, Skill
---

You are the one top-level implement supervisor. `$ARGUMENTS`: first token
backend|frontend|mobile|dba|devops|llm|all, then task. `ia` is a deprecated llm
alias. Unknown first token: infer domains from the whole argument string.

## Steps

0. **Resolve before writes/artifacts/dispatch**, including mechanical follow-ups.
   Resolve declared facts through `engineos kernel resolve --facts` with
   `taskContract:true` and `execution`; load returned guidance, classify risk/autonomy
   and announce route. The supervisor resolves residue or consults read-only router;
   explicit /engineos:route stays plan-only. Missing eligibility facts permit
   read-only scoping; pure explanations create no implementation units.
1. **Choose the planning lane.** Consume the kernel execution/planning result.
   Eligible simple work with no current scope-bound decision asks one permitted
   clickable **Implement directly** / **Create a lightweight spec** question.
   Record the actual scope-bound answer, resolve again, then proceed. Direct uses
   returned stack guidance and security/Git safeguards without mandatory prototype,
   scaffolding, PRD, ADR or tickets. A small new behavior alone need not force a
   spec when all eligibility facts are known and independent design/security gates
   are absent. Unknown/unsafe work cannot inherit this bypass. Explain labelled
   text fallback if no permitted clickable input is available.
2. **Spec lane.** For a selected spec or non-simple work needing design, use native
   `engineos-spec`. Full design retains PRD/ADR/SPEC; requested lightweight design
   is proportional. Every accepted spec uses the bounded Matt Pocock to-tickets
   reference: multiple complete slices, genuine edges, approved granularity before
   publication, local per-ticket files and one consolidated implementation DAG.
   External tracker publication needs explicit user authorization. Reuse an existing
   approved plan; do not restart settled design/granularity interviews.
3. Open/reuse `.engineos/changes/<date>-<slug>.md` and the current branch/PR.
   Selected-spec production retains rules/parallelism.md **Prototype preview
   choice**, including resumes; reuse unchanged scope decisions. Direct admission
   requires exact current scope-bound choice through the workflow gate. Explicit
   preview requests remain available. Contracts have one owner and authoritative
   source/owner/revision pointers before dependent writers start.
4. **Supervise the frontier.** Follow native `engineos-implement-spec`. Brief routed
   workers in IMPLEMENT mode with exclusive paths, prerequisites, contracts,
   risk/autonomy, model, branch/PR and return envelope. MCP leaves are AUDIT-only;
   security-reviewer is a queued read-only reviewer, never a writer. Launch all
   independent ready deliveries within min(policy cap, available host worker slots),
   reserving the supervisor slot; cap is 3 workers. Queue/refill promptly, keep flat
   workers and prevent colliding ownership. Never fabricate work to fill slots.
   Announce `[fanout] waves=<n> wave1=<agent:scope, ...> model=<per-agent>`.
5. **Integrate continuously.** Inspect returned scoped diffs/revisions read-only;
   accepted integration immediately releases dependents while unrelated work runs.
   Unit requiredChecks/evidence checks describe read-only integration evidence.
   Executable checks and test-writer output cannot gate implementation integration;
   keep final obligations in the acceptance/checks plan and separate final-proof
   ticket, outside the runtime implementation graph/completion list. No tests are
   authored/run until approved final timing; preserve existing coverage.
6. **Final consent.** After ALL implementation units and corrections integrate,
   present exact existing commands, scope and source revision. Ask a fresh permitted
   clickable **Run proposed checks** / **Choose specific checks** / **Skip for now**
   question with no preselected approval. Earlier broad permission is insufficient;
   a specific subset needs an actual answer before execution. Apply final workflow
   admission and rules/verification.md. Lint/typecheck/build/startup/tests/integrity/
   evals/scans wait for this stage. Security reviewer/scans require their separate
   scoped final consent. Repairs reopen affected approval at the new source revision.
   On skip/refusal report `[validation] pending — final-stage user approval required`.
   Name failed/incomplete units; pending evidence never establishes verified completion.
7. Record actual implementation/evidence status through record-change. Follow native
   journal sequencing: useful-result/observed usage/final review state precede terminal
   run-completed; implementation integration is distinct from successful validation.
   Archive only when the record's exit criteria hold; release still needs its gates.
8. Offer the applicable output artifact once, pruning inapplicable choices and
   omitting scaffold when implementation is already delivered. Template/UI-UX is
   frontend/mobile only. Separately follow rules/parallelism.md **Completion follow-up**
   for optional Matt Pocock `/retro`; execute only on explicit yes.

Follow routed rules and project CLAUDE.md. Keep change atomic; preserve the active
branch/PR. Git/forge writes and worktrees follow rules/git.md and user direction.
