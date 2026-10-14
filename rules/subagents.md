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
lines around it. One agent per entry; one block per dispatch batch. Keep the
model/mode/scope fields, startup status and plain-English task. Every lifecycle
line uses `[<short role>] | model: <actual configured model>` as its role-only
visible identity. Canonical agent IDs and registered aliases remain dispatch and
telemetry identities; agent responsibilities remain unchanged.

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
removed when present. When active workers share a short role, distinguish them
with a separate `instance` field using the actual host worker identifier or a
supervisor-assigned identifier. Reuse that instance throughout their lifecycle;
keep the bracketed role label unchanged.

**Subagents starting work**

```diff
+ [backend] | model: <actual configured model> | mode: IMPLEMENT | scope: src/orders/**
+ [backend] | model: <actual configured model> | status: starting | task: Implement the approved order API changes
```

Replace the model placeholder with the actual configured host model. If the model
is inherited and unavailable to inspection, say `inherited (exact model unknown)`;
never infer `opus` from an EngineOS tier or claim an unsupported override. The
short role, status and task must remain clear without color: diff highlighting
is renderer-dependent. When the current host has verified rich-text or role-badge
coloring support, display the bracketed role (for example `[qa]`) in purple while
retaining its literal readable text. Plain Markdown/diff rendering cannot promise
per-span color; use its readable bracketed role without ANSI, HTML or CSS tokens
to imitate styling. The host owns presentation; hook fields stay unchanged.
A queued or pending agent has not started; announce
`starting` immediately before the real launch and claim `running` only after the
host confirms it. Launch failure receives an explicit FAILED announcement.

Keep the short role, model and any assigned instance on every subsequent status,
task, return and failure line. Announce each return afterwards in its own block:

```diff
+ [backend] | model: <actual configured model> | status: returned | 3 files | scoped diff inspected
```

Failures use the same visible identity and model with `status: FAILED` and a
reason. Concurrent QA workers, for example, use `[qa]` plus distinct
`instance: qa-1` and `instance: qa-2` fields. Never combine agents on one line or
hide a failed unit in a wave summary.

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
owns dispatch and visibility, including lifecycle role/model/instance and startup
status/task fields.
Hooks `hooks/announce-agent-dispatch.sh` and `announce-agent-return.sh` re-inject
the lifecycle display contract at dispatch/return (see README); the supervisor adds
the prominent title and supplemental fields before actual dispatch. Hosts without
these hooks apply the full announcement directly.
