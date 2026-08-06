---
name: 2026-08-06-decision-kernel-p3-router-agent
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 3: a router agent (`agents/router.md`, model opus) that
handles the residue the kernel cannot resolve deterministically — multi-agent
dispatch, unrouted scale signals, requests that explicitly need a dispatch
plan — plus the new `route-escalate` kernel subcommand and hook that decide
when the router is needed at all.

## Why

P2's kernel resolves single-domain routing deterministically, but some
requests span multiple domains/agents or carry scale signals no single
intent match captures (e.g. "add a paginated orders endpoint and mirror the
screen to mobile"). The parent plan's literal trigger — "escalate when
ambiguous" — was rejected during spec authoring: zero intent matches is the
*common* case (proceed on always-on rules alone), not the hard one. The real
trigger is precisely computed: ≥2 agent-bearing intents, an unrouted scale
signal, or an intent explicitly flagged `requires_dispatch_plan`.

## Scope

registries/intents.json (1.1.0: suppressible/suppressed_by, route-planning
intent, requires_dispatch_plan), registries/policy.json (1.2.0: router
block), registries/capabilities.json (1.1.0: route capability),
scripts/kernel.sh (route-escalate), agents/router.md (new),
commands/route.md (new), commands/agents/router.md (generated),
hooks/route-advisor.sh (new) + hooks/hooks.json, scripts/gen-agent-commands.sh
(unrelated pre-existing bug fixed in passing — self-referential alias text),
scripts/validate-engineos.sh (C18), scripts/test-validate-engineos.sh,
scripts/test-kernel.sh, hooks/test-route-advisor.sh (new), the P3 spec.

## Checklist

- [x] Spec with frozen contracts before code (opus, design tier — spec/design
      work stays above session model per rules/models.md)
- [x] P3-U1: registries (intents/policy/capabilities) + CLAUDE.md row
- [x] P3-U2: kernel.sh route-escalate subcommand
- [x] P3-U3: agents/router.md + commands/route.md
- [x] P3-U4 (barrier): route-advisor.sh hook + registration + regenerated
      agents.json/commands/agents/router.md
- [x] P3-U5: C18 validator checks + 7 planted-breakage cases +
      test-kernel.sh/test-route-advisor.sh extensions
- [x] Full verification green, all prior suites unchanged where not touched

## What was made

- `registries/intents.json` 1.1.0: `suppressible`/`suppressed_by` fields
  resolve tiebreaks as data instead of unreachable "note" prose; new
  `route-planning` intent (agent: router, command: `/engineos:route`);
  `requires_dispatch_plan: true` on `big-sweep`.
- `registries/policy.json` 1.2.0: new `router` block — the single source of
  truth for escalation reasons (`multi-agent-dispatch`, `unrouted-scale`,
  `requires-dispatch-plan`), triggers, and self-validating fixtures.
- `registries/capabilities.json` 1.1.0: new `route` capability bound to the
  router agent, design tier.
- `scripts/kernel.sh` `route-escalate`: reuses `route-intent` and `scale`
  rather than duplicating matching logic; resolves suppression directly from
  intents.json; aggregates `model_tier`/`risk_floor` by max-lookup across
  surviving intents; fails closed if `policy.json.router` is absent. Found
  and fixed a jq `index(.)`-after-pipe footgun in the tier-aggregation step.
- `agents/router.md`: read-only planner (`Read, Grep, Glob, Bash` — no
  Edit/Write/Task). Runs `kernel.sh route-escalate` and `risk` first, reasons
  only about the residue (intent tiebreaks, file-scope decomposition, risk
  evidence), returns a dispatch-plan envelope with a MUST-copy/MAY-override/
  MUST-NOT contract distinguishing kernel facts from its own reasoning. Never
  dispatches — a hook/agent handing back a plan is not the same as fanning
  out.
- `commands/route.md` + generated `commands/agents/router.md`: `/engineos:route`
  always dispatches the router via Task (even when `escalate: false`) and
  asks once before executing.
- `hooks/route-advisor.sh`: new UserPromptSubmit hook. A hook is a command
  process with no Task tool, so on escalation it *announces* — names the
  reasons, tells the reading model to dispatch `router` via Task itself; on
  a resolved single path it prints the same deterministic route line the
  model would compute by hand (union of rules/skills/mcp over surviving
  intents); on zero matches with no scale signal it's silent. Non-blocking,
  exit 0 always, jq-guarded.
- `scripts/validate-engineos.sh` C18: route capability pinned to router/design
  tier and cross-checked against `agents/router.md`'s frontmatter; router's
  5 required kernel-call literals; read-only tool contract (Bash present,
  Edit/Write/Task absent); suppression-graph integrity (unknown targets,
  self-reference, 2-cycles, at-least-one-non-suppressible sanity check);
  fixture-driven `route-escalate` conformance; hook registration. Found and
  fixed 3 defects while building this: a message-text/test-substring
  mismatch (C18c), an `&&`/`||` precedence bug that let the hook-registration
  check pass even with the hook removed (C18f), and two more instances of the
  same jq footgun already found in `route-escalate` (`selfref`/`twocycle`).
- `scripts/gen-agent-commands.sh`: fixed in passing — router had no real
  alias, so the generated command rendered the self-referential
  "alias `router`"; now the alias clause is conditional and omitted when
  there is none.

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 63, failed 0
- `scripts/test-validate-engineos.sh`: passed 43, failed 0 (7 new
  planted-breakage cases for C18)
- `scripts/test-kernel.sh`: passed 142, failed 0 (new route-escalate section:
  fixtures, suppression, aggregation, non-trigger, error cases)
- `hooks/test-route-advisor.sh`: passed 12, failed 0 (new)
- `hooks/test-route.sh`: pass=38 fail=0 UNCHANGED — P2 behavior-preservation
  proof
- `hooks/test-gate-advisor.sh`: 16/0; `hooks/test-task-scale.sh`: 12/0
- `scripts/run-evals.sh`: passed 11, failed 0 (33 skipped as designed)
- `bash -n` clean on every changed shell file; `jq empty` clean on every
  changed registry
- Manual smoke: `kernel.sh route-escalate --prompt "add a paginated orders
  endpoint to the API and mirror the screen to mobile"` returns
  `escalate: true`, `reasons: [multi-agent-dispatch]`; the same prompt through
  `hooks/route-advisor.sh` emits the matching escalation notice naming the
  router agent and the Task-tool instruction.

## Changes registered

Commit `5ebce4a` on `feat/decision-kernel-p1` (follows P1's `9d718f9`, P2's
`cb04a66`):

```
docs/specs/2026-08-06-decision-kernel-p3-router-agent.md | new
agents/router.md                                          | new
commands/route.md                                         | new
commands/agents/router.md                                 | new (generated)
hooks/route-advisor.sh                                     | new (executable)
hooks/test-route-advisor.sh                                 | new (executable)
hooks/hooks.json                                            | route-advisor registered
registries/intents.json                                     | suppression fields, route-planning, 1.1.0
registries/policy.json                                      | router block, 1.2.0
registries/capabilities.json                                | route capability, 1.1.0
registries/agents.json                                      | router entry (generated)
scripts/kernel.sh                                            | route-escalate
scripts/gen-agent-commands.sh                                | alias-suffix fix (unrelated pre-existing bug)
scripts/validate-engineos.sh                                 | C18 added
scripts/test-validate-engineos.sh                            | 7 cases added
scripts/test-kernel.sh                                       | route-escalate section added
CLAUDE.md                                                    | router table row + jq-hook-count sentence
17 files changed, 1557 insertions(+), 13 deletions(-)
```

No renames. `hooks/{layout-manifest,lib-common}.sh` mode-only changes remain
unstaged (pre-existing, unrelated to this branch's work).

## Notes

- Suppression is now resolved once, as data (`suppressible`/`suppressed_by`),
  replacing the unreachable "note" prose the parent plan's audit flagged.
- Next: P4 per the plan's own scope note is small — `waves` already shipped
  in P2; P4 is only the handoff-template frontmatter work. P5–P8 (repair
  loop, spec-conformance, telemetry, 28-contradiction cleanup) and the
  ai-se-os runner-adoption follow-on are not started and not yet requested
  for this session.
- Separately spawned, out-of-band, not part of this change: `task_e63ed7e2`
  (the gen-agent-commands.sh alias bug) is now moot — fixed here — and should
  be dismissed if still open in that session.
