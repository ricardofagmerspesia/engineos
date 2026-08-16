# Decision Kernel — Phase 3: The Router Agent

- **Date:** 2026-08-06
- **Status:** Approved (P3 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — additive public surface (new agent name, new slash command,
  new capability id, new hook file, new kernel subcommand; all MINOR per
  `docs/COMPATIBILITY.md`, no renames, no deprecation window). Reversible by
  revert. No data touched. Autonomy A2.
- **Depends on:** P1 (`registries/models.json`, `intents.json`, `policy.json`,
  commit `9d718f9`) and P2 (`scripts/kernel.sh`,
  `docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md`).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers
  Phase 3 only.

## Problem

P2 gave EngineOS a model-free resolver. It answers every question the registries
can answer, and it answers them the same way every time. What it cannot answer is
the residue:

1. **`route-intent` reports matches, not a decision.** `ambiguous: true` fires
   only on ZERO matches, and multi-match is normal by design (CLAUDE.md: "multiple
   intents can match — load all that apply"). So the interesting case — three
   intents matched, two of them binding different agents, one of them suppressed
   by a carve-out written in prose in a `note` field — comes back as raw data with
   no verdict.
2. **Nothing computes a dispatch plan.** `kernel.sh waves` layers units it is
   *given*; nothing produces the units. Deciding that a request splits into
   "backend endpoint" + "mobile screen", that each owns a disjoint set of real
   files, and which wave each belongs to requires reading the repo. That is model
   work, and today it is improvised fresh every session.
3. **Suppression and tiebreak policy is unreachable prose.** `new-feature`'s note
   says "a more specific matching row suppresses this one"; `mobile`'s note says
   store builds "belong to ios-release / android-release, not here". Neither is
   data, so no consumer can apply them.

P3 adds the model tier of the router — but narrowly. **Everything the registries
can answer stays with the kernel; the agent is invoked only for what they
cannot.** Two decisions follow from that and are the core of this spec: which
prose becomes data (so the kernel resolves more, not less), and the exact,
checkable condition under which a model is worth an `opus` dispatch.

## Scope

**In:** one new kernel subcommand (`route-escalate`), three additive registry
changes, `agents/router.md`, `commands/route.md`, one new UserPromptSubmit hook,
one CLAUDE.md router row plus two prose fixes, validator C18 + planted breakage,
and behavioral tests.

**Out:** handoff frontmatter (P4), repair loop (P5), and everything else in the
parent plan. Also explicitly out: changing `kernel.sh route-intent`'s output
(P2 public surface — it stays byte-identical), teaching the PreToolUse edit hook
about intents (it has a file path, not prompt text), and evals that score plan
quality (see **Test surface — the boundary**).

### Deliverables

Units U1–U3 own disjoint files and form wave 1. U4 is a barrier unit (it consumes
U1–U3). U5 is wave 3 (it asserts on everything).

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/intents.json`, `registries/policy.json`, `registries/capabilities.json`, `CLAUDE.md` | Suppression + dispatch-plan flags as data, the `route-planning` intent, the `router` policy block, the `route` capability, the CLAUDE.md router row and prose fixes |
| U2 | `scripts/kernel.sh` | `route-escalate` subcommand |
| U3 | `agents/router.md`, `commands/route.md` | The agent contract and the manual command |
| U4 | `hooks/route-advisor.sh`, `hooks/hooks.json`, `registries/agents.json`, `commands/agents/router.md` | The announcement hook + hook registration; the two generated artifacts, produced by re-running `scripts/gen-agent-registry.sh` and `scripts/gen-agent-commands.sh` (never hand-written) |
| U5 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`, `scripts/test-kernel.sh`, `hooks/test-route-advisor.sh` | C18 checks, planted breakage, behavioral tests |

---

## Frozen contract 1 — when the router agent is invoked

The parent plan says "router agent ONLY when route-intent returns ambiguous".
**That trigger is rejected as written**, for two reasons that come from the
shipped code, not from taste:

- `ambiguous: true` means ZERO signals matched. CLAUDE.md already has a policy
  for that case — "Unknown intent → proceed with always-on rules only. Never
  block on routing." Most prompts in a session match nothing (verified:
  `"why does the login handler fail with a 500"` matches nothing, because the
  signal is the literal `fails`). Escalating on zero matches would dispatch
  `opus` on the majority of turns to be told what the always-on rules already
  say.
- The genuinely hard case is the opposite one: several matches, with a
  suppression carve-out that lives only in prose and a decomposition that needs
  repo knowledge.

### The principle

**The router agent is invoked when a dispatch plan is needed, and a dispatch plan
is needed only when the registries cannot produce one.** Divergent `model_tier`
and divergent `risk_floor` across matches are NOT triggers — both resolve
mechanically (max over `models.json.escalation_order`; max over low<medium<high,
per `policy.json.risk.aggregation == "max"`). A conflict a lookup can settle is
not a reason to spend a model.

### The trigger, exactly

Computed by one new kernel subcommand so the condition is testable and the hook
stays a formatter — the P2 division of labour ("matching lives in the kernel,
formatting stays in the hook"):

```
kernel.sh route-escalate --prompt <text>
  -> {escalate, reasons, intents, suppressed, agents, model_tier, risk_floor, scale, ambiguous}
```

`escalate` is `true` iff **any** of three reasons holds. Reason ids and thresholds
come from `policy.json.router` (below), never hardcoded:

| Reason id | Condition | Why a model is required |
|---|---|---|
| `multi-agent-dispatch` | After suppression resolution, the number of matched intents whose `agents` array is non-empty is `>= router.escalate_when.multi_agent_intents_min` (frozen at 2) | Two or more owning agents means file scopes must be assigned disjointly and grouped into waves. No registry knows which files exist. |
| `unrouted-scale` | `route-intent` matched ZERO intents AND at least one of `router.escalate_when.unrouted_scale_signals` (frozen: `big_task`, `design_work`) is true in `kernel.sh scale` | Substantial work with no route at all: there is nothing to copy, so the decomposition must be reasoned. |
| `requires-dispatch-plan` | Any surviving matched intent carries `requires_dispatch_plan: true` | The row's own work IS fan-out planning (`big-sweep`, `route-planning`). |

Counting intents-with-agents, not agents, is deliberate: `dba` alone names three
agents (coordinator + two read-only leaves) and `devops` names four. Those are a
domain's internal leaf structure, not a multi-domain fan-out, and counting raw
agents would make both domains escalate on every prompt.

`spec_authoring` is deliberately excluded from `unrouted_scale_signals`:
`hooks/task-scale-advisor.sh` already routes that case to the most-capable tier,
and a spec is authored, not dispatched.

**Not triggers** (each mechanically resolved, and each stated here so a future
reader does not "fix" it): divergent `model_tier` (max wins); divergent
`risk_floor` (max wins); `risk == high` (that changes gates per
`rules/gates.md`, not who plans); zero matches with no scale signal (always-on
rules only, per CLAUDE.md); a suppression relation among matches (now data —
resolved below).

### Suppression resolution (new, deterministic, kernel-side)

Two additive fields on `intents.json` entries turn the prose carve-outs into data:

- `suppressible: true` — this intent is dropped when any **non-suppressible**
  intent also matched. This is exactly `new-feature`'s note ("a more specific
  matching row suppresses this one"); the generic fallback row is the only
  intent that carries it today.
- `suppressed_by: ["<intent-id>", ...]` — this intent is dropped when any listed
  intent also matched. This is `mobile`'s store-release carve-out.

Resolution is a **single pass over the raw matched set** (never transitive, never
iterated): drop intent `I` when `(I.suppressible and at least one matched intent
is not suppressible)` or `(any id in I.suppressed_by is in the matched set)`.
Anchoring `suppressible` on a non-suppressible survivor guarantees the resolved
set is never empty when the raw set was not. Cycles are a registry defect caught
by C18d, not a runtime case.

`kernel.sh route-intent` output is **unchanged** — it keeps reporting the raw
multi-match, because that is its P2 contract and consumers exist.
`route-escalate` reads the new fields from `intents.json` itself.

### route-escalate output schema (frozen)

```json
{
  "escalate": true,
  "reasons": ["multi-agent-dispatch"],
  "intents": ["backend", "mobile"],
  "suppressed": [{"id": "new-feature", "by": "more-specific-match"}],
  "agents": ["backend-coordinator", "mobile-coordinator"],
  "model_tier": "build",
  "risk_floor": "medium",
  "scale": {"big_task": false, "spec_authoring": false, "design_work": false},
  "ambiguous": false
}
```

| Field | Type | Semantics |
|---|---|---|
| `escalate` | bool | The trigger above. |
| `reasons` | array of string | Subset of `policy.json.router.reasons`, emitted in that array's order. Empty iff `escalate` is false. |
| `intents` | array of string | Intent ids surviving suppression, in `intents.json` order. |
| `suppressed` | array of `{id, by}` | Dropped ids. `by` is the suppressing intent id, or the literal `"more-specific-match"` when the drop came from `suppressible`. |
| `agents` | array of string | Union of surviving intents' `agents`, de-duplicated, in first-appearance order. |
| `model_tier` | string or null | Max over surviving non-null `model_tier` by `models.json.escalation_order` index. `null` when none declare one. |
| `risk_floor` | string or null | Max over surviving non-null `risk_floor` (low<medium<high). `null` when none declare one. A floor is a floor, never the risk tier. |
| `scale` | object | `kernel.sh scale` verbatim. |
| `ambiguous` | bool | `route-intent`'s flag, passed through (zero raw matches). |

Argument form is `--prompt <text>` (consistent with `scale` and
`decision-rules`). Exit codes follow P2: `0` on success including
`escalate: false`; `1` with `{"error": "..."}` on stdout for a missing
`--prompt`, an unknown argument, a missing registry, missing `jq`, or a missing
`policy.json.router` block (fail-closed: a resolver that silently defaults its
own policy is worse than one that stops).

### Verified fixture behavior

Run against the shipped registries during authoring, and frozen as
`policy.json.router.fixtures`:

| Prompt | Raw matches | Resolved | escalate | reasons |
|---|---|---|---|---|
| `add a paginated orders endpoint to the API and mirror the screen to mobile` | new-feature, backend, mobile | backend, mobile | true | `multi-agent-dispatch` |
| `migrate all services to the new logging format across all packages` | (none) | (none) | true | `unrouted-scale` |
| `backfill the tenant column` | big-sweep | big-sweep | true | `requires-dispatch-plan` |
| `build the ios release and upload to TestFlight` | new-feature, ios-release | ios-release | false | — |
| `why does the login handler fail with a 500` | (none) | (none) | false | — |

---

## Frozen contract 2 — registry additions

### `registries/intents.json` (1.0.0 → 1.1.0, additive)

Three optional fields, all defaulting to absent/false, plus one new intent.

| Field | Type | Default | On which intents (frozen for P3) |
|---|---|---|---|
| `suppressible` | bool | absent = false | `new-feature` only |
| `suppressed_by` | array of intent id | absent = `[]` | `mobile`: `["ios-release", "android-release"]` |
| `requires_dispatch_plan` | bool | absent = false | `big-sweep`, `route-planning` |

The new intent, mirroring the new CLAUDE.md row (literal, append after
`verify-done` to keep table order):

```json
{
  "id": "route-planning",
  "title": "Ambiguous or multi-agent request needing a dispatch plan",
  "signals": [
    "route this",
    "who should do this",
    "which agents",
    "dispatch plan",
    "how should we split this"
  ],
  "rules": [],
  "skills": [],
  "agents": ["router"],
  "commands": ["/engineos:route"],
  "mcp": [],
  "model_tier": "design",
  "risk_floor": null,
  "hook_mirrored": false,
  "requires_dispatch_plan": true,
  "note": "The router agent runs scripts/kernel.sh route-escalate and risk FIRST and reasons only about the residue: intent tiebreaks the notes do not settle mechanically, scope decomposition against real files, and wave grouping. It returns a dispatch plan; it never dispatches and never edits. Tier is design per registries/models.json work type architecture, which covers task decomposition and fan-out planning. The deterministic path needs no agent at all — hooks/route-advisor.sh emits the kernel's answer directly when route-escalate reports escalate=false."
}
```

C16's exact drift alarm (`intents == CLAUDE.md rows + 1`) means this intent and
the CLAUDE.md row below MUST land in the same commit. U1 owns both files for
exactly that reason.

### `registries/policy.json` (1.1.0 → 1.2.0, additive)

New top-level `router` block. The thresholds and the reason vocabulary are data
so `kernel.sh` hardcodes neither, and the fixtures make the registry
self-validating in the style of `routing.json`'s `sample_path`:

```json
"router": {
  "note": "Escalation policy for the P3 router agent: when the deterministic kernel answer is not enough and a model must produce a dispatch plan. Read by scripts/kernel.sh route-escalate; the fixtures are asserted by validate-engineos.sh C18e and scripts/test-kernel.sh.",
  "agent": "router",
  "capability": "route",
  "reasons": ["multi-agent-dispatch", "unrouted-scale", "requires-dispatch-plan"],
  "escalate_when": {
    "multi_agent_intents_min": 2,
    "unrouted_scale_signals": ["big_task", "design_work"]
  },
  "fixtures": [
    {"prompt": "add a paginated orders endpoint to the API and mirror the screen to mobile", "escalate": true,  "reasons": ["multi-agent-dispatch"]},
    {"prompt": "migrate all services to the new logging format across all packages",         "escalate": true,  "reasons": ["unrouted-scale"]},
    {"prompt": "backfill the tenant column",                                                 "escalate": true,  "reasons": ["requires-dispatch-plan"]},
    {"prompt": "build the ios release and upload to TestFlight",                             "escalate": false, "reasons": []},
    {"prompt": "why does the login handler fail with a 500",                                 "escalate": false, "reasons": []}
  ]
}
```

### `registries/capabilities.json` (1.0.0 → 1.1.0, additive)

```json
{
  "id": "route",
  "title": "Resolve a request into a dispatch plan — intents, rules, agents with disjoint file scopes, risk, gates, waves",
  "agent": "router",
  "model_tier": "design",
  "risk_floor": "low"
}
```

`model_tier: design` per `rules/models.md` (task decomposition and fan-out
planning are design-tier work) — `kernel.sh capability route` therefore resolves
`model: opus`, which must equal `agents/router.md`'s frontmatter (C15 already
enforces tier validity; C18a enforces the binding).

`risk_floor: low` and not higher: the router produces a proposal and holds no
write tool. It operates at A1 by construction (`rules/risk-autonomy.md`) — the
risk of the *planned* work is carried in the plan's own `risk` field, which the
main loop acts on. A high floor here would gate reading and planning, which is
precisely the ceremony `rules/gates.md` calls theatre.

### `registries/agents.json` — generated, do not hand-edit

Produced by `scripts/gen-agent-registry.sh` from `agents/router.md` frontmatter
plus the `capabilities.json` back-reference. The expected result, asserted by
CI's existing drift guard:

```json
{
  "name": "router",
  "alias": null,
  "description": "<verbatim from agents/router.md frontmatter>",
  "tools": ["Read", "Grep", "Glob", "Bash"],
  "model": "opus",
  "model_tier": "design",
  "capability_ids": ["route"]
}
```

**No alias.** `router` already has two invocation surfaces (`/engineos:route`
and `/router`); a third name is public surface with a deprecation obligation and
no benefit. `ios-builder` and `android-builder` set the precedent for
alias-free agents.

### `CLAUDE.md` edits (U1)

1. **New router-table row**, inserted immediately before the `verify-done` row so
   table order matches `intents.json` order:

   ```
   | Ambiguous or multi-agent request needing a dispatch plan ("route this", "who should do this", "which agents", request spans several domains with no obvious owner) | `/engineos:route` — `router` agent runs `scripts/kernel.sh route-escalate` and `risk` FIRST, then reasons only about the residue: intent tiebreaks, scope decomposition, wave grouping. Returns a dispatch plan (intents, rules, agents with disjoint file scopes, model per agent, risk, gates, waves); it never dispatches and never edits. When the kernel resolves the route on its own, no agent is dispatched at all |
   ```

   The row loads no `rules/*.md`, so C5 closure does not apply to it.

2. **The jq-dependency paragraph** in the routing-rules section grows from five
   hooks to six: `route-advisor.sh` joins `route-before-change.sh`,
   `mark-unrecorded.sh`, `record-verify.sh`, `task-scale-advisor.sh` and
   `gate-advisor.sh` in the "exit 0 silently without jq" list, and the sentence
   "Those five are the only ones that go silent" becomes "Those six".

---

## Frozen contract 3 — the dispatch-plan envelope

The router's reply is, in order and with nothing between them:

1. the canonical `## Return format` YAML envelope every agent emits (C9–C11
   parse it — the literal `status:` enum line is mandatory);
2. one fenced ` ```json ` block containing exactly the object below.

The plan is emitted in the reply, not written to a file: the router holds no
`Write` tool, so its read-only, propose-only nature is tool-enforced rather than
prompt-enforced.

```json
{
  "plan_version": "1.0.0",
  "request": "one-line restatement of what was asked",
  "kernel": {
    "route_escalate": { },
    "risk": { },
    "gates": { },
    "waves": { }
  },
  "intents": ["backend", "mobile"],
  "intent_overrides": [
    {"intent": "new-feature", "action": "dropped", "reason": "suppressed by the two stack rows"}
  ],
  "rules": ["rules/architecture.md", "rules/backend.md"],
  "skills": ["nestjs-patterns"],
  "mcp": ["nestjs"],
  "commands": ["/engineos:implement"],
  "risk": {
    "tier": "medium",
    "autonomy_ceiling": "A3",
    "inputs": {"reversibility": "low", "blast-radius": "medium"},
    "floors_applied": [],
    "rationale": "one line naming the driving input"
  },
  "units": [
    {
      "id": "u1-orders-endpoint",
      "objective": "one line",
      "agent": "backend-coordinator",
      "mode": "IMPLEMENT",
      "work_type": "build",
      "model_tier": "build",
      "model": "sonnet",
      "files": ["apps/api/src/orders/**"],
      "depends_on": [],
      "rules": ["rules/architecture.md", "rules/backend.md"],
      "skills": ["nestjs-patterns"],
      "mcp": ["nestjs"],
      "must_not_read": ["apps/mobile/**"]
    }
  ],
  "waves": [["u1-orders-endpoint"], ["u2-mobile-screen"]],
  "fanout_line": "[fanout] waves=2 wave1=(u1-orders-endpoint) wave2=(u2-mobile-screen)",
  "violations": [],
  "residue": [
    {"question": "what the kernel could not answer", "resolution": "what was decided and on what evidence"}
  ],
  "unresolved": ["question only the human can answer"]
}
```

### Field contract

| Field | Type | Source | Notes |
|---|---|---|---|
| `plan_version` | string | literal `"1.0.0"` | Bumped only by a later spec. |
| `request` | string | model | One line. |
| `kernel.route_escalate` | object | `kernel.sh route-escalate --prompt` | **Verbatim.** |
| `kernel.risk` | object or null | `kernel.sh risk --signals` | **Verbatim.** `null` only when no risk input could be evidenced — then `unresolved` must name it. |
| `kernel.gates` | object | `kernel.sh gates --risk <tier>` | **Verbatim.** |
| `kernel.waves` | object or null | `kernel.sh waves --units` | **Verbatim.** `null` only for a single-unit plan. |
| `intents` | array of string | model, from `kernel.route_escalate.intents` | Every difference recorded in `intent_overrides`. |
| `intent_overrides` | array of `{intent, action, reason}` | model | `action` ∈ `added` \| `dropped`. Empty array when the kernel's set was taken as-is. |
| `rules` | array of `rules/*.md` paths | union of `intents`' rules | Closure-complete per CLAUDE.md's closure rule. May ADD closure targets; may never DROP a rule a resolved intent names. |
| `skills`, `mcp`, `commands` | arrays of string | union of `intents`' fields | Additions allowed with a `residue` entry; drops are not. |
| `risk.tier`, `.autonomy_ceiling`, `.floors_applied` | string / string / array | `kernel.risk` | **Verbatim.** Never lower than `route_escalate.risk_floor`. |
| `risk.inputs` | object | model | The five `policy.json` risk inputs, only those actually evidenced. |
| `risk.rationale` | string | model | Names the driving input — `rules/risk-autonomy.md`: "high — irreversible DDL" beats "seems risky". |
| `units[]` | array | model | The core model output. `files` are real paths or globs verified with Glob/Grep, disjoint within a wave. |
| `units[].model_tier`, `.model` | string | `kernel.sh model --work <work_type>` | **Verbatim** from the kernel. A model name from memory is a defect. |
| `units[].work_type` | string | model, from `models.json.work_types[].id` (`spec`, `adr`, `architecture`, `hard-debugging`, `adversarial-review`, `code-review`, `build`, `mechanical`) | Makes the model choice auditable. |
| `units[].mode` | string | model | `AUDIT` \| `IMPLEMENT` \| `N/A`. |
| `units[].agent` | string | model, must exist in `registries/agents.json` | Inventing an agent is a defect. |
| `units[].must_not_read` | array of string | model | `rules/context.md`: saying what NOT to read saves more context than any read instruction. May be empty. |
| `waves`, `fanout_line`, `violations` | array / string / array | `kernel.waves` | **Verbatim.** `violations` MUST be empty (see procedure step 7). |
| `residue` | array of `{question, resolution}` | model | Only what the kernel could not answer. Restating a kernel answer here is a defect. |
| `unresolved` | array of string | model | Non-empty caps `status` at `DEGRADED`. |

### Override authority (frozen)

| The router MUST copy verbatim | The router MAY override, with a reason | The router MUST NOT |
|---|---|---|
| Every `kernel.*` subtree; `risk.tier`/`autonomy_ceiling`/`floors_applied`; `waves`; `fanout_line`; `violations`; per-unit `model_tier`/`model` | The intent set (add/drop → `intent_overrides`); the risk tier **upward only** by supplying stronger risk inputs and re-running `kernel.sh risk`; per-unit tier **upward only** per `rules/models.md` escalation; unit decomposition, `files`, `depends_on`, `mode`, `must_not_read`; additions to `rules`/`skills`/`mcp` | Lower a risk tier or a floor; raise autonomy above `kernel.risk.autonomy_ceiling`; drop a rule a resolved intent names; name an agent absent from `agents.json`; emit a plan with non-empty `violations`; edit any file; dispatch any unit |

---

## Frozen contract 4 — `agents/router.md`

### Frontmatter

```yaml
---
name: router
description: Resolves a request into a dispatch plan — intents, rules and skills to load, agents with disjoint file scopes, model per agent, MCP servers, risk tier, autonomy ceiling, gates and wave grouping. Runs scripts/kernel.sh route-escalate and risk FIRST and reasons only about what those answers leave open: intent tiebreaks the registry notes do not settle mechanically, scope decomposition against the real repo, and wave grouping. Dispatched when hooks/route-advisor.sh reports escalate=true, or on demand via /engineos:route. Read-only planner — it never edits, and it never dispatches the plan it produces.
tools: Read, Grep, Glob, Bash
model: opus
---
```

**Tool justification, frozen:**

- `Bash` — the point of the agent. It shells out to `scripts/kernel.sh`
  (`route-escalate`, `risk`, `gates`, `model`, `capability`, `waves`) and may run
  read-only repo commands (`git ls-files`, `ls`) to verify that a file scope
  exists. It runs nothing that writes.
- `Read`, `Grep`, `Glob` — decomposition requires knowing which files exist.
- **No `Edit`/`Write`** — A1 by construction (`rules/risk-autonomy.md`): the
  router proposes, the main loop applies.
- **No `Task`** — subagents cannot spawn subagents (`rules/parallelism.md`). The
  router plans the wave; the top-level session dispatches it.

### Body — the required numbered procedure

The body MUST be this procedure, in this order. Steps 2–4 and 6–7 are kernel
calls; the model's own judgment appears only in steps 5, 6a and 8.

1. **Restate** the request in one line. If the request is empty, return `BLOCKED`.
2. **Run** `scripts/kernel.sh route-escalate --prompt "<request>"`. Copy the JSON
   verbatim into `kernel.route_escalate`. On a non-zero exit, stop and return
   `BLOCKED` with `.error` as the reason — without the kernel there is no ground
   truth, and re-deriving policy from memory is the failure this phase exists to
   prevent.
3. **Classify risk.** Derive only the `policy.json` risk inputs you can evidence
   from the request and the repo; omit the rest and note the omission in
   `residue`. Run `scripts/kernel.sh risk --signals '<json>'` and copy verbatim.
   The tier may never come out below `route_escalate.risk_floor`.
4. **Get the gates:** `scripts/kernel.sh gates --risk <tier>`, copied verbatim.
5. **Resolve the intent set.** Start from `route_escalate.intents` (suppression is
   already applied). Drop or add an intent ONLY with a reason recorded in
   `intent_overrides`. Then build `rules` as the union and verify closure: for
   each rule, check whether it defers to a non-always-on rule and add that rule if
   missing (CLAUDE.md's closure rule).
6. **Decompose into units.** Each unit owns a disjoint file scope named with real
   paths or globs, verified with Glob/Grep — a scope that matches nothing is a
   defect, not a plan.
   a. Assign the agent from `route_escalate.agents`, `registries/routing.json`'s
      domain agents, or `registries/agents.json`; assign `mode` and `work_type`.
   b. Resolve the model with `scripts/kernel.sh model --work <work_type>` and copy
      `tier`/`model` verbatim. Never write a model name from memory.
   c. Set `depends_on` only for real dependencies — a false dependency serializes
      work `rules/parallelism.md` requires to be parallel.
7. **Layer the waves:** `scripts/kernel.sh waves --units '<json>'`. If
   `violations` is non-empty, re-split the offending units and run it again. Never
   emit a plan carrying violations. Copy `waves`, `violations` and `fanout_line`
   verbatim.
8. **Fill `residue`** with what the kernel could not answer and how you settled
   it, and `unresolved` with anything only the human can settle. Do not restate a
   kernel answer as your own decision.
9. **Emit** the YAML return envelope, then the `dispatch_plan` JSON block.
   `status`: `OK` when the plan is complete and `violations` is empty;
   `DEGRADED` when `unresolved` is non-empty or a risk input could not be
   evidenced; `BLOCKED` when step 2 or step 3 could not run.
10. **Stop.** Do not dispatch, do not edit, do not start the work. The reply is
    the deliverable.

The body also carries, verbatim, the standard `## Return format` section (the
same YAML block and status table every agent file carries — C9–C11 check for the
section heading and the literal enum line), and a **Residue discipline** section
stating: everything the kernel answered is quoted, not re-decided; the only
original content in the plan is the intent tiebreak, the decomposition, and the
risk-input evidence.

---

## Frozen contract 5 — `commands/route.md`

Path `commands/route.md` → invoked as `/engineos:route` (same convention as
`commands/audit.md`). `commands/agents/router.md` is a separate, generated file
(the generic `/router` dispatcher) and is not hand-written.

```yaml
---
description: Resolve a request into a dispatch plan — intents, rules, agents with disjoint file scopes, model per agent, risk, gates and waves. Runs the deterministic kernel first, then the router agent for the residue.
argument-hint: <the request, in plain words>
allowed-tools: Task, Bash, Read, Grep, Glob
---
```

**Input:** `$ARGUMENTS` — the raw request text, verbatim, no preprocessing. Empty
`$ARGUMENTS` → ask the user what to route and stop.

**Steps (frozen):**

1. Run `scripts/kernel.sh route-escalate --prompt "$ARGUMENTS"` and print the
   kernel answer as one line.
2. Dispatch the `router` agent via the Task tool with `model: opus`, passing
   `$ARGUMENTS` as the request. **Explicit invocation always dispatches**, even
   when `escalate` is false — the user asked for a plan, and the fast path is an
   automation default, not a refusal. When `escalate` is false, say so in one
   line first, so the user can see the dispatch was optional.
3. Print, in this order: the `[router]` line in CLAUDE.md's format
   (`[router] intent=<ids> risk=<tier> autonomy=<A?> loaded=<rules/skills>`),
   the plan's `fanout_line`, the `dispatch_plan` JSON block verbatim, and
   `unresolved` as a bulleted list when non-empty.
4. Ask once whether to execute the plan. **Do not dispatch any unit** — this
   command produces a plan, and executing it is a separate, user-approved step.
5. No output-artifact offer: producing the plan IS the artifact, and CLAUDE.md's
   no-recursion rule applies.

---

## Frozen contract 6 — hook wiring

### What a hook can and cannot do here

**A hook cannot dispatch an agent.** Every EngineOS hook is a
`{"type": "command"}` shell script: it receives JSON on stdin and its only
channels back are its exit code and a JSON object on stdout
(`hookSpecificOutput.additionalContext`, permission decisions). There is no Task
or Agent tool available to a hook process, and inventing one is not an option.

So the escalation branch **announces**; the model reading the injected context is
what actually invokes the router. This is the same pattern every other hook in
this repo already uses, and the announcement says so explicitly, so the model
does not wait for something that will never arrive.

### Which hook

**A new hook, `hooks/route-advisor.sh`, on `UserPromptSubmit`** — not a branch in
an existing one:

- `route-before-change.sh` is `PreToolUse(Edit|Write|NotebookEdit)` and sees only
  `tool_input.file_path`. There is no prompt text there, so `route-intent` cannot
  run in it at all. It stays untouched.
- `gate-advisor.sh` and `task-scale-advisor.sh` already run on
  `UserPromptSubmit`, but each owns exactly one question and formats exactly one
  kernel call. Keeping that shape means a broken route branch cannot take the
  gate advice down with it.

Registration in `hooks/hooks.json`, appended as the third `UserPromptSubmit`
entry (order is irrelevant — all three are non-blocking):

```json
{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/route-advisor.sh" }
```

### Behavior (frozen)

Non-blocking, `exit 0` always, silent no-op without `jq` or on any kernel error —
identical discipline to the two sibling advisors. The condition, literally:

```bash
INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULT=$("$DIR/../scripts/kernel.sh" route-escalate --prompt "$PROMPT" 2>/dev/null) || exit 0
printf '%s' "$RESULT" | jq -e . >/dev/null 2>&1 || exit 0
ESCALATE=$(printf '%s' "$RESULT" | jq -r '.escalate // false')
NMATCH=$(printf '%s' "$RESULT" | jq -r '.intents | length')
if [ "$ESCALATE" != "true" ] && [ "${NMATCH:-0}" -eq 0 ]; then exit 0; fi
```

Three outcomes, and nothing else:

| `escalate` | resolved intents | Hook output |
|---|---|---|
| true | any | **Escalation notice** (below). |
| false | ≥ 1 | **Deterministic route line** (below) — the fast path's whole payoff: the model gets the answer instead of deriving it. |
| false | 0 | Silent `exit 0`. CLAUDE.md: unknown intent proceeds on always-on rules; never block on routing. |

Escalation notice (`additionalContext`):

```
[engineos] route escalation — the kernel could not fully resolve this request: <reasons, comma-separated>. Dispatch the `router` agent (agents/router.md, model opus) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=<ids|-> agents=<names|-> scale=<flags true|->. A hook cannot dispatch an agent — you must invoke it.
```

Deterministic route line (`additionalContext`, one line):

```
[engineos] route (kernel, deterministic): intents=<ids> agents=<names|-> rules=<rules/x.md,...|-> skills=<...|-> mcp=<...|-> model_tier=<tier|-> risk_floor=<floor|-> — load these; classify risk per rules/risk-autonomy.md (the floor is a floor, not the tier). No router dispatch needed.
```

`rules`/`skills`/`mcp` in that line are the union over resolved intents, computed
by the hook from the kernel JSON (`jq`), not restated in the hook body.

---

## Validator additions — C18

New block in `scripts/validate-engineos.sh`, after C17, guarded by the same
`jq`-present branch:

- **C18a — capability binding.** `capabilities.json` has an entry `id == "route"`
  with `agent == "router"` and `model_tier == "design"`; `agents/router.md`
  exists; `kernel.sh capability route` returns `bound: true` and a `model` equal
  to `agents/router.md`'s frontmatter `model:`. (C15 already checks tier validity
  generically; this pins the specific binding so it cannot silently vanish.)
- **C18b — the agent actually calls the kernel.** `agents/router.md` contains all
  of the literals `kernel.sh route-escalate`, `kernel.sh risk`,
  `kernel.sh gates`, `kernel.sh waves`, `kernel.sh model`. This is the
  "reasons only about the residue" constraint made grep-checkable: a body that
  stopped calling the kernel would be re-deriving policy from prose, which is the
  regression this phase exists to prevent.
- **C18c — the router is a read-only planner.** `agents/router.md`'s `tools:`
  line contains `Bash` and contains none of `Edit`, `Write`, `Task`.
- **C18d — suppression data integrity.** Every `suppressed_by` id in
  `intents.json` resolves to an existing intent; no intent lists itself; the
  `suppressed_by` digraph has no cycle (2-cycles included); `suppressible` and
  `requires_dispatch_plan` are booleans where present; at least one intent is NOT
  `suppressible` (otherwise resolution could empty the set); at least one intent
  carries `requires_dispatch_plan: true` (otherwise that trigger is dead code).
- **C18e — behavioral, fixture-driven.** For every entry in
  `policy.json.router.fixtures`, `kernel.sh route-escalate --prompt <prompt>`
  returns the declared `escalate` and exactly the declared `reasons` (as a set).
  Same self-validating-registry pattern as C17b's `sample_path`.
- **C18f — hook registration.** `hooks/route-advisor.sh` exists, is executable,
  is registered under `UserPromptSubmit` in `hooks/hooks.json`, and calls
  `kernel.sh route-escalate`.
- **C1 message update:** the jq-tooling check names `route-advisor` alongside the
  other jq-dependent hooks.

### Planted breakage (`scripts/test-validate-engineos.sh`)

One case per new invariant, each breaking exactly one thing:

| Mutation | Expected failure substring |
|---|---|
| Repoint `capabilities.json`'s `route` entry at a nonexistent agent | `capabilities.json names missing agents` (C15) |
| Change `capabilities.json`'s `route` `model_tier` to `build` | `route capability` (C18a) |
| Delete the `kernel.sh waves` mention from `agents/router.md` | `router does not call the kernel` (C18b) |
| Add `Write` to `agents/router.md`'s `tools:` | `router must not hold` (C18c) |
| Add `suppressed_by: ["route-planning"]` to `route-planning` (self-reference) | `suppression` (C18d) |
| Flip a `policy.json.router.fixtures` entry's expected `escalate` | `route-escalate fixture` (C18e) |
| Remove `route-advisor.sh` from `hooks/hooks.json` | `route-advisor` (C18f) |

---

## Test surface

### `scripts/test-kernel.sh` (extended)

- Every `policy.json.router.fixtures` entry, looped from the registry (not
  hardcoded, so a new fixture is covered automatically): `escalate` and `reasons`
  match, exit 0.
- Suppression: `add ... API ... mirror the screen to mobile` resolves to
  `["backend","mobile"]` with `new-feature` in `suppressed` and
  `by == "more-specific-match"`; `publish to App Store the iOS/Android app screen`
  (raw matches `["mobile","ios-release"]`, verified) resolves to `["ios-release"]`
  with `mobile` suppressed and `by == "ios-release"`.
- Aggregation: `model_tier` is the max by `escalation_order` and `risk_floor` the
  max by low<medium<high over a multi-match prompt; both `null` when no matched
  intent declares one.
- Non-triggers stay non-triggers: a single-intent match binding three agents
  (`dba`) does NOT escalate; a prompt whose matches differ in `model_tier` or
  `risk_floor` does NOT escalate on that ground alone.
- Errors: missing `--prompt`, unknown argument, and a `policy.json` with the
  `router` block removed each exit 1 with an `{"error": ...}` body.

### `hooks/test-route-advisor.sh` (new, house pattern of `hooks/test-task-scale.sh`)

Feeds `{"prompt": "..."}` on stdin and asserts on stdout:

- exit code is 0 in every case, including a malformed payload and a `PATH` with
  no `jq`;
- an escalating prompt produces `additionalContext` containing
  `route escalation`, the reason id, and the string `router` agent;
- a non-escalating prompt with matches produces exactly one line containing
  `route (kernel, deterministic)` and the resolved intent ids;
- a prompt with zero matches and no scale signal produces NO output;
- the no-`jq` run produces no output and exits 0.

### The boundary — stated, not papered over

These tests prove three things: **the condition** (escalate is computed correctly
from the registries), **the wiring** (capability → agent → command → hook all
resolve, and the hook says the right thing), and **the shape** (a plan can be
validated for internal consistency by feeding its `units` back through
`kernel.sh waves`, which is exactly what procedure step 7 does).

They prove **nothing about the router's reasoning quality**. Whether a
decomposition is the right one, whether a file scope is genuinely disjoint in
practice, whether the residue was settled sensibly — none of that is scriptable,
because the router is a model. The only mechanisms that reach it are the same two
EngineOS already uses for model behavior: `scripts/run-evals.sh` golden cases
(request → expected intents/agents/wave count), and the `critic` agent on a plan
that matters. **P3 ships neither** — an eval golden set for dispatch planning is
its own unit of work, and pretending a bash suite covers plan quality would be
the kind of green record `rules/gates.md` calls worse than no gate at all. What
P3 does guarantee is that a bad plan is a bad plan for model reasons only: every
policy fact in it was copied from the kernel, and C18b keeps it that way.

---

## Rejected alternatives

1. **Always dispatch the router; never let the kernel answer alone.** Rejected:
   it deletes P2's entire point. The deterministic path is free, instant and
   reproducible; the router costs an `opus` dispatch and a context budget per
   turn. It would also make routing non-deterministic for cases the registries
   answer perfectly (`build the ios release and upload to TestFlight` resolves to
   exactly one agent with zero judgment required), and CLAUDE.md's "never block
   on routing" would be violated on every prompt.
2. **`escalate = ambiguous` (the parent plan's literal wording).** Rejected on
   evidence: `ambiguous` is zero-match, most prompts match nothing, and CLAUDE.md
   already prescribes always-on-only for that case. Kept as a *narrowed* trigger
   — zero match AND a scale/design signal — which is the subset where the model
   adds something.
3. **Escalate when matched intents disagree on `model_tier` or `risk_floor`.**
   Rejected: both resolve by lookup (max over `escalation_order`; max over the
   risk tiers, since `policy.json.risk.aggregation` is `max`). Spending a model
   on a `max()` is the worst trade in the system.
4. **Count agents rather than intents-with-agents for `multi-agent-dispatch`.**
   Rejected on data: `dba` alone names three agents and `devops` four, so every
   database or infra prompt would escalate. Those are leaf structures inside one
   domain, not a fan-out needing scope assignment.
5. **Keep suppression as prose and let the router read the `note` fields.**
   Rejected: it makes a model call mandatory for a decision that is a one-line
   set operation once written as data, and it leaves the notes unvalidatable. The
   opposite trade is the whole thesis of the kernel — turn prose into data first,
   then spend the model only on what is left.
6. **Put the escalation branch in `hooks/route-before-change.sh`.** Rejected: it
   is `PreToolUse` on an edit and has no prompt text, so `route-intent` cannot
   run there. Also wrong timing — by the first edit, the fan-out decision has
   already been made badly.
7. **Have the hook dispatch the router itself.** Rejected because it is
   impossible in this codebase's hook system: hooks are command processes with
   stdin/stdout and no tool access. The honest mechanism is announcement plus a
   model that invokes the agent, and the announcement text says exactly that.
8. **Give the router `Write` so it can persist the plan under `.engineos/`.**
   Rejected: A1 (`rules/risk-autonomy.md`) is enforced by the absence of the
   tool, and a plan is session state, not a durable artifact
   (`rules/memory.md`: session-only context dies with the session). The plan
   travels to the next session through `templates/handoff.md`, which is P4's
   subject.

---

## Verification

- `scripts/test-kernel.sh` green, including the new `route-escalate` cases and
  every `policy.json.router.fixtures` entry.
- `hooks/test-route-advisor.sh` green (new).
- `hooks/test-route.sh`, `hooks/test-gate-advisor.sh`,
  `hooks/test-task-scale.sh` green **unchanged** — proof P3 touched no existing
  hook behavior.
- `scripts/validate-engineos.sh` green with C18; `scripts/test-validate-engineos.sh`
  green with the seven new planted-breakage cases.
- `scripts/gen-agent-registry.sh` and `scripts/gen-agent-commands.sh` re-run and
  their output committed; re-running them a second time produces no diff (the
  drift guard).
- `bash -n` on every changed shell file; `jq empty` on every changed registry.
- Manual smoke, output shown in the change record:
  `scripts/kernel.sh route-escalate --prompt "add a paginated orders endpoint to the API and mirror the screen to mobile"`
  returns `escalate: true` with `multi-agent-dispatch`, and
  `printf '{"prompt":"..."}' | hooks/route-advisor.sh` emits the escalation
  notice and exits 0.

## Rollback

`git revert` of the P3 commits. The three registries return to their 1.0.0/1.1.0
shapes, `kernel.sh` loses `route-escalate`, and the new agent, command and hook
disappear together. Nothing else consumes them, so revert is complete: the
deterministic P2 behavior is what remains, and every pre-P3 hook and test is
untouched by design. Because the surface is purely additive, no deprecation
window is owed under `docs/COMPATIBILITY.md`.
