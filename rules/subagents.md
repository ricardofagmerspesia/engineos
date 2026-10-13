# Sub-agent Rules — always on

One supervisor routes every project change and dispatches scoped workers; naming
an agent while implementing its assignment inline violates dispatch ownership.

## Dispatch is mandatory

- Before any code/config/design/docs write, including mechanical follow-ups, the
  supervisor classifies intent/risk, resolves role/rules/skills/patterns and
  assigns exclusive ownership. Dispatch the named agent via Agent/Task.
- Resolve deterministic kernel routing first; use the read-only router only for
  unresolved planning. Unknown intents use always-on rules and a suitable scoped
  worker; missing specialists do not stall authorized work.
- This is the user's standing subagent request. Dispatch even for one unit;
  `rules/parallelism.md` determines concurrent count, not whether dispatch occurs.
- Brief: MODE (AUDIT|IMPLEMENT), role, rules/skills/patterns, exact files,
  prerequisites, available host capacity, frozen contracts/revisions,
  risk/autonomy, branch/PR, model per `rules/models.md`, return envelope.
  Mark absent contracts/prerequisites/PR as none/unknown.
- Supervisor owns routing, contracts, integration and final gate; its writes are
  limited to assigned shared contracts, plans/records and integration. Reroute
  uncovered implementation units. Keep scopes disjoint or serialize.
- Answer pure explanations directly; invent no implementation units.

## Announcement format — green, on its own line

Announce each dispatch before execution and each return afterwards in a
`diff` fence, separated by blank lines. One agent per line; one block per wave.
Use aliases when present, with canonical name on first mention:

```diff
+ [agent] borisenko (backend-coordinator) | model: opus | mode: IMPLEMENT | scope: src/orders/**
```

```diff
+ [agent] borisenko -> returned | 3 files | scoped diff inspected
```

Failures use the same visible line with `-> FAILED` and reason. Never bury names,
combine agents on one line or hide a failed unit in a wave summary.

## If you are the dispatched agent

AUDIT is read-only: inspect, gather evidence, report. IMPLEMENT changes only the
assignment and reports changes/review evidence. If MODE is absent, infer AUDIT
from questions/review/analyze and IMPLEMENT from explicit implementation tasks.

- Confirm role, loaded guidance, ownership, contracts, prerequisites and
  risk/autonomy before writing. Return missing/new assignments for rerouting.
- Stay inside exclusive scope; report outside findings under `### Out of scope`.
- Honor frozen types/API/DB/module contracts verbatim; report concerns, never
  redefine contracts unilaterally.
- Return review evidence; run no intermediate lint/typecheck/build/test gates,
  repo-wide formatters/codemods or git writes. Testing requires an approved
  final-stage brief under `rules/verification.md`.
- Keep workers flat: never spawn agents. Return independent work to the supervisor
  for scheduling under `rules/parallelism.md`. Development dispatch does not
  trigger application topology-design approval.
- Project `CLAUDE.md` outranks EngineOS.

## Relation to the router

`rules/parallelism.md` owns decomposition; `rules/models.md` owns tiers; this file
owns dispatch and visibility. Hooks `hooks/announce-agent-dispatch.sh` and
`announce-agent-return.sh` re-inject banners at dispatch/return (see README).
