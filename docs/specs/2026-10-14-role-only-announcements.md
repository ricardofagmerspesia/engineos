# Role-only agent announcements

Status: implemented and final proof passed on 2026-10-14; approved build and seven focused suites passed (104 tests). Change record archived under `.engineos/archived/2026/10/llm/2026-10-14-role-only-announcements.md`.
Scope revision: role-only-v1. Risk: medium. Autonomy: A2, reversible working-tree edits only.
Branch/current PR: unknown; preserve existing work context and unrelated changes.

## Problem and decision

The user confirmed: "Use role-only labels; keep responsibilities." Lifecycle announcements currently repeat the generic agent marker, registered alias and canonical role. Show the short role as the visible identity while preserving configured model, mode, status, scope and task.

Chosen: change presentation instructions at their existing authoritative source and hook/adaptor integration points. Rejected: rename canonical agents or delete coordination duties; either changes dispatch/public identity and exceeds the request. No graph, capability, routing, alias or agent-responsibility changes are needed.

## Display contract

Before real dispatch/follow-up, retain the standalone bold **Subagents starting work** label and one diff block per dispatch batch. One agent per entry, with blank lines around the block:

```diff
+ [devops] | model: <actual configured model> | mode: IMPLEMENT | scope: <files>
+ [devops] | model: <actual configured model> | status: starting | task: <plain-English task>
```

Status, return and failure lines reuse `[devops]` and the actual model. A failed unit carries `status: FAILED` and a reason. Report unavailable model identity as `inherited (exact model unknown)`; never infer it from a tier. The visible lifecycle identity contains only `[<short role>]`; remove the generic `[agent]` marker, aliases and redundant `role: <canonical ID>` fields from that presentation.

Use a separate `instance` field when two active workers share a display role. Preserve the same instance through their lifecycle; derive it from the actual host worker identifier or supervisor assignment, never alter an alias or dispatch ID. If the host supports verified role coloring, preserve the existing optional role-color guidance; readable text remains sufficient.

## Complete registered mapping

| Canonical dispatch ID | Visible role |
|---|---|
| android-builder | android |
| architecture-analyst | architecture |
| audit-consolidator | audit |
| backend-coordinator | backend |
| cicd-specialist | cicd |
| critic | critic |
| dba-coordinator | dba |
| devops-coordinator | devops |
| docs-writer | docs |
| frontend-coordinator | frontend |
| gcp-specialist | gcp |
| ios-builder | ios |
| kubernetes-specialist | kubernetes |
| llm-coordinator | llm |
| mobile-coordinator | mobile |
| oracle-specialist | oracle |
| postgres-specialist | postgres |
| product-spec | product |
| qa-tester | qa |
| router | router |
| security-reviewer | security |
| test-writer | qa |

For an unregistered agent use its canonical role, removing a trailing `-coordinator` when present. Keep the registered mapping authoritative in `rules/subagents.md`; the spec freezes this revision rather than adding a second runtime mapping.

## Acceptance criteria

1. When any registered agent launches, the lifecycle guidance presents its mapped role in one bracketed label and retains model, mode, scope, startup status and task.
2. When an agent returns or fails, the guidance reuses its role/model and any assigned instance, with an explicit result/failure status.
3. When distinct workers have the same visible role, their separate instance fields distinguish them through launch, status, return and failure.
4. When a role/model is unregistered or unknown, the stated role fallback and truthful model fallback apply.
5. Canonical IDs, aliases, dispatch resolution, hook envelope keys, quoted hook context, telemetry fields, capabilities and agent responsibilities retain their existing contracts.
6. Codex guidance follows the same presentation contract, and compatibility documentation distinguishes display labels from canonical identifiers.

## Tickets and ownership

- **ROLE-1 — Implement the atomic display contract.** One routed worker owns `rules/subagents.md`, `src/hooks/announce-agent-dispatch.ts`, `src/hooks/announce-agent-return.ts`, `templates/adapters/codex.md` and the current announcement paragraph in `docs/COMPATIBILITY.md`. Change only presentation guidance. `requiredChecks`: read-only scoped diff/contract inspection confirms criteria 1–6 and preservation of existing dirty edits; no executable checks. This is one indivisible contract update, not one task per file.
- **ROLE-PROOF — Final proof, depends on integrated ROLE-1 and fresh final consent.** After complete integration and scoped approval, update literal announcement expectations in `src/hooks/announce-agent-dispatch.test.ts`, `src/hooks/announce-agent-return.test.ts` and `src/hooks/announce-agent.e2e.test.ts`, retaining identity/envelope/telemetry assertions. Resolve exact existing commands then seek approval for the selected test/build/integrity checks and generated `dist/engineos.cjs` rebuild. Do not author/run tests or rebuild during ROLE-1. Exclude this proof ticket from the implementation prerequisite set.

No independent implementation units exist; serialized ownership prevents divergent hook/rule contracts. Scope growth requires supervisor re-resolution. Existing prototype HTML is historical preview/reference unless explicitly selected for revision; no production edits there are necessary.

## Release and rollback

Working-tree owner: top-level supervisor. No release, installation or Git writes are authorized by this spec. Roll back only this task's identified patch hunks; preserve pre-existing dirty work. If later released, monitor launch/return announcement consistency for one normal agent lifecycle and retain the prior display guidance as recovery evidence. Validation and release clearance remain pending until approved evidence exists.

## Evidence

Read-only inspection, 2026-10-14: `rules/subagents.md` visible announcement contract; `registries/agents.json` all 22 registered agents; hook banner helpers in `src/hooks/announce-agent-dispatch.ts` and `src/hooks/announce-agent-return.ts`; native Codex announcement guidance in `templates/adapters/codex.md`; current unreleased announcement note in `docs/COMPATIBILITY.md`. No executable validation performed.
