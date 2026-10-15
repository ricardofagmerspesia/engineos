# Sub-agent Rules — always on

One supervisor routes every project change. Eligible direct execution under
`rules/parallelism.md` uses the main executor; otherwise dispatch scoped workers.
Naming a worker while implementing its delegated assignment inline violates ownership.

## Dispatch outside eligible direct execution is mandatory

- Before any code/config/design/docs write, including mechanical follow-ups, the
  supervisor classifies intent/risk, resolves role/rules/skills/patterns and
  assigns exclusive ownership. Dispatch the named agent via Agent/Task unless
  all direct-execution conditions and the current scope-bound direct choice in
  `rules/parallelism.md` are established. Eligible pending tasks ask the clickable
  spec choice before spec/ticket workers start; direct tasks use stack guidance.
  Exception: queue `security-reviewer` for final integrated consent under
  `rules/verification.md`; keep security guidance active and assign implementation
  to an appropriate stack worker when the primary route names this read-only agent.
- Resolve deterministic kernel routing first; use the read-only router only for
  unresolved planning. Unknown intents use always-on rules and a suitable scoped
  worker; missing specialists do not stall authorized work.
- This is the user's standing subagent request outside eligible direct execution.
  Missing or unresolved execution facts require dispatch even for one unit;
  `rules/parallelism.md` determines concurrent count, not whether dispatch occurs.
- Brief: MODE (AUDIT|IMPLEMENT), role, rules/skills/patterns, exact files,
  prerequisites, available host capacity, frozen contracts/revisions,
  risk/autonomy, branch/PR, model per `rules/models.md`, return envelope.
  Mark absent contracts/prerequisites/PR as none/unknown.
- Supervisor owns routing, contracts, integration and final gate; its writes are
  limited to assigned shared contracts, plans/records and integration, except
  implementation owned by the main executor in eligible direct mode. Reroute
  uncovered implementation units. Keep scopes disjoint or serialize.
- Queue test-writer and all executable-check workers until ALL implementation
  tickets/corrections integrate and the user answers the fresh final clickable
  check prompt. Unit integration uses read-only evidence, not test output.
- Answer pure explanations directly; invent no implementation units.

## Visible subagent announcements

Before each actual dispatch or follow-up that starts work, show the standalone
bold label **Subagents starting work**, then a separate `diff` fence with blank
lines around it; one block per dispatch batch. Each agent gets exactly ONE line
per lifecycle event, never wrapped onto a second line:

```diff
+ [<short role>] <model> <AUDIT|IMPLEMENT> starting — <scope> — <task>
+ [<short role>] <model> returned — <result summary>
+ [<short role>] <model> FAILED — <reason>
```

Shorten scope and task to about 60 characters each: a shared directory in braces
(`docs/specs/{05-backend,08-security}.md`), a glob (`src/orders/**`) or
`<first path> +N`; the task is a plain-English summary. `[<short role>]` is the
role-only visible identity. Canonical agent IDs and registered aliases remain
dispatch and telemetry identities; agent responsibilities remain unchanged.

Resolve short roles by canonical agent ID:

| Canonical agent ID | Short role |
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

For unregistered agents use their canonical role with a trailing `-coordinator`
removed when present. When active workers share a short role, add a `#<instance>`
suffix to the role using the actual host worker identifier or a
supervisor-assigned identifier, and keep it for their whole lifecycle.

**Subagents starting work**

```diff
+ [backend] <actual configured model> IMPLEMENT starting — src/orders/** — order API changes
+ [qa#1] <actual configured model> AUDIT starting — src/orders/** — review order API diff
+ [qa#2] <actual configured model> AUDIT starting — apps/web/orders/** — review order UI diff
```

Write the actual configured host model; if inherited and not inspectable, say
`inherited (exact model unknown)`, never a tier-inferred `opus` or unsupported
override. Role, status and task stay clear without color (diff highlighting is
renderer-dependent); a host with verified rich-text or role-badge coloring may
show the bracketed role in purple, keeping its literal text, while plain
Markdown/diff gets no ANSI, HTML or CSS imitation. The host owns presentation;
hook fields stay unchanged. A queued or pending agent has not started: announce
`starting` just before the real launch, claim `running` only after the host
confirms it, and announce a launch failure with an explicit FAILED line. Return
and failure lines reuse the same role, model and any `#<instance>` suffix, each in
its own later block, e.g.
`+ [backend] <actual configured model> returned — 3 files, scoped diff inspected`.
Never combine agents on one line or hide a failed unit in a wave summary.

## If you are the dispatched agent

AUDIT is read-only: inspect, gather evidence, report. IMPLEMENT changes only the
assignment and reports changes/review evidence. If MODE is absent, infer AUDIT
from questions/review/analyze and IMPLEMENT from explicit implementation tasks.

- Confirm role, loaded guidance, ownership, contracts, prerequisites and
  risk/autonomy before writing. Return missing/new assignments for rerouting.
- Stay inside exclusive scope; report outside findings under `### Out of scope`.
- Honor frozen types/API/DB/module contracts verbatim; report concerns, never
  redefine contracts unilaterally.
- Return review evidence; implementation dispatch grants no intermediate
  lint/typecheck/build/test gate, repo-wide formatter/codemod or git write.
  All executable validation waits for final integration and a separate scoped
  user-approved brief under `rules/verification.md`. Ordinary read-only integration
  inspection may overlap; security review and scans await final security consent.
- Keep workers flat: never spawn agents. Return independent work to the supervisor
  for scheduling under `rules/parallelism.md`. Development dispatch does not
  trigger application topology-design approval.
- Project `CLAUDE.md` outranks EngineOS.

## Relation to the router

`rules/parallelism.md` owns decomposition; `rules/models.md` owns tiers; this file
owns dispatch and visibility, including the one-line lifecycle format.
Hooks `hooks/announce-agent-dispatch.sh` and `announce-agent-return.sh` re-inject
the lifecycle display contract at dispatch/return (see README); the supervisor adds
the prominent title and supplemental fields before actual dispatch. Hosts without
these hooks apply the full announcement directly.
