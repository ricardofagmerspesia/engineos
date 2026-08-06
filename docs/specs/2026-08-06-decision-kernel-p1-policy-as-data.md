# Decision Kernel — Phase 1: Policy as Data

- **Date:** 2026-08-06
- **Status:** Approved (user-confirmed plan, this file is its P1 slice)
- **Risk:** medium — public surface addition (new registries are versioned surface per `docs/COMPATIBILITY.md`, additive MINOR); reversible by revert; no data. Autonomy A2.
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers Phase 1 only.

## Problem

EngineOS encodes its policy as English prose the model re-reads and re-interprets
every turn. Three specific costs:

1. The model-assignment table (`rules/models.md`), the router table (`CLAUDE.md`)
   and the risk/gates/parallelism/retry policy (`rules/risk-autonomy.md`,
   `rules/gates.md`, `rules/parallelism.md`) have **no machine-readable form** —
   so no hook, script, or external runner can answer "which tier for this work?"
   or "which gates at this risk?" without a model call.
2. Consumers duplicate the policy instead: `ai-se-os/src/workflow/runner.ts`
   hardcodes `ESCALATION_ORDER` and `MAX_ATTEMPTS = 3`, copying
   `rules/parallelism.md` by hand.
3. Two known contradictions live in the prose because nothing checks it:
   `CLAUDE.md` non-negotiable #6 says "no agent declares `fable` in frontmatter"
   while `agents/product-spec.md` declares `model: fable`.

## Scope

In: three new registries + prose-mirror edits + validation checks with planted
breakage. Out: `scripts/kernel.sh` (Phase 2), router agent (Phase 3), everything
else in the parent plan.

### Deliverables

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/models.json`, `rules/models.md`, `CLAUDE.md` | Models table as data + the three user-requested deltas (below) |
| U2 | `registries/intents.json` | The full CLAUDE.md router table as data |
| U3 | `registries/policy.json` | Risk, autonomy, gates, parallelism, retry, budget as data |
| U4 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh` | C16 checks + planted breakage (barrier unit, after U1–U3) |

### User-requested model-table deltas (applied in U1)

1. **ADR authoring moves to most-capable (`fable`)** — from design/`opus` —
   joining spec/PRD. Rationale: an ADR is a recorded decision with long
   half-life; same class as a spec.
2. **A build-tier (`sonnet`) review role is added** (`code-review` work type),
   distinct from `critic`, which stays design/`opus` for adversarial correctness.
3. **The `fable` contradiction resolves in favor of frontmatter:** the sentence
   "The `fable` tier is dispatch-override-only — no agent declares it in
   frontmatter" is removed from CLAUDE.md non-negotiable #6.
   `agents/product-spec.md`'s `model: fable` stands.

## Frozen schemas

All three registries carry the `routing.json` envelope: `version` (semver,
starts `1.0.0`), `description` (what it is + what checks it against what).

### registries/models.json

```json
{
  "version": "1.0.0",
  "description": "…",
  "tiers": [
    { "id": "most-capable", "model": "fable", "escalates_to": null },
    { "id": "design",       "model": "opus",  "escalates_to": "most-capable" },
    { "id": "build",        "model": "sonnet","escalates_to": "design" },
    { "id": "cheap",        "model": "haiku", "escalates_to": "build" }
  ],
  "escalation_order": ["cheap", "build", "design", "most-capable"],
  "work_types": [
    { "id": "spec",               "title": "Spec, PRD, requirements, problem framing, brainstorming", "tier": "most-capable" },
    { "id": "adr",                "title": "Architecture decision records",                            "tier": "most-capable" },
    { "id": "architecture",       "title": "Architecture, design, task decomposition, contract/interface design, fan-out planning", "tier": "design" },
    { "id": "hard-debugging",     "title": "Hard debugging, cross-cutting refactor design",            "tier": "design" },
    { "id": "adversarial-review", "title": "Adversarial/security review (critic, security-reviewer)", "tier": "design" },
    { "id": "code-review",        "title": "Standards/spec code review against an existing diff",     "tier": "build" },
    { "id": "build",              "title": "Writing code, tests, migrations, config — against an existing spec/design", "tier": "build" },
    { "id": "mechanical",         "title": "Renames, boilerplate, file moves, formatting, simple lookups, summaries",   "tier": "cheap" }
  ],
  "degradation_ladder": [
    { "rung": 1, "id": "cache",          "take_when": "…", "not_when": "…" },
    { "rung": 2, "id": "reduce-context", "take_when": "…", "not_when": "…" },
    { "rung": 3, "id": "smaller-model",  "take_when": "…", "not_when": "…" },
    { "rung": 4, "id": "defer-or-batch", "take_when": "…", "not_when": "…" },
    { "rung": 5, "id": "deny",           "take_when": "…", "not_when": null }
  ]
}
```

Invariants (checked by U4): `escalation_order` names every tier exactly once,
weakest→strongest; every `escalates_to` is the next entry in that order (null
for the last); every `work_types[].tier` resolves; `model` values are unique;
prose mirror agreement (below).

### registries/intents.json

One entry per CLAUDE.md router-table row:

```json
{
  "version": "1.0.0",
  "description": "…",
  "multi_match": true,
  "intents": [
    {
      "id": "backend",
      "title": "Backend work",
      "signals": ["NestJS", "API", "service", "controller", "migration", "queue"],
      "rules": ["architecture", "backend", "data", "testing", "observability"],
      "skills": ["nestjs-patterns"],
      "agents": ["backend-coordinator"],
      "commands": [],
      "mcp": ["nestjs"],
      "model_tier": "build",
      "risk_floor": "medium",
      "hook_mirrored": true,
      "domain": "backend",
      "note": "…"
    }
  ]
}
```

Field semantics: `hook_mirrored: true` + `domain` (FK → `routing.json.domains[].id`)
only on the stack/domain rows the PreToolUse hook mirrors; every other row
is request-driven (`hook_mirrored: false`, no `domain`). `skills` may include
plugin-qualified names (`superpowers:brainstorming`) — U4 resolves only
unqualified names against `skills/`. `commands` holds slash commands the row
names (`/engineos:audit`). `model_tier` is the tier of the row's primary work,
`null` when the row delegates tiering to the loaded rules. `risk_floor` mirrors
`routing.json` where a domain exists, else the row's own floor, else `null`.

Invariants (U4): unique ids; every unqualified rule/agent resolves to a file;
every unqualified skill resolves unless the intent's `note` marks it external
(deviation 2 below); every `domain` FK resolves and that row's `rules` equal
`routing.json`'s for the same domain; every `hook_mirrored: true` row has a
`domain` and vice versa; every `routing.json` domain is claimed exactly once;
intent count exactly equals the CLAUDE.md router-table data-row count + 1
(deviation 1 below — the exact form is the drift alarm: a prose row added or
removed without a registry update fails CI in either direction).

### Deviations recorded during implementation (U2)

1. **Ten hook-mirrored rows, not eight.** The first draft of this spec said
   "eight" copying CLAUDE.md's hook-mirror note, but `routing.json` has ten
   domains: the CLAUDE.md "Mobile store release" row splits into `ios-release`
   + `android-release` intents (keeping the domain FK 1:1), and the
   security-files and test-writing rows are hook-mirrored too (domains
   `security`/`test`). Ten is correct; eight was the spec's error.
2. **`code-review` is an external skill.** The review row loads the
   environment-provided `code-review` skill, which has no `skills/code-review/`
   directory in this repo. The intent's `note` flags it external; U4's
   unqualified-skill resolution exempts notes containing "external".
3. **`agents` may be a superset of `routing.json.agent`.** The dba/devops rows
   also name their read-only leaf specialists; U4 checks resolution, not
   equality with the routing domain's single `agent`.

### registries/policy.json

```json
{
  "version": "1.0.0",
  "description": "…",
  "risk": {
    "aggregation": "max",
    "inputs": [
      { "id": "reversibility", "low": "…", "medium": "…", "high": "…" }
    ],
    "high_floors": ["destructive-ddl-dml", "secret-rotation-or-exposure", "auth-authz-changes", "production-deploys", "payments", "acting-on-anothers-behalf"]
  },
  "autonomy": {
    "levels": [ { "id": "A0", "permitted": "…", "typical": "…" } ],
    "ceiling_by_risk": { "low": "A2", "medium": "A3", "high": "A3" },
    "high_with_thin_evidence": "A1",
    "a4_granted": false
  },
  "gates": {
    "ladder": ["discovery", "design", "implementation", "validation", "release"],
    "by_risk": {
      "low":    { "discovery": "skip", "design": "skip", "implementation": "required", "validation": "required", "release": "n/a-unless-ships" },
      "medium": { "discovery": "if-problem-vague", "design": "required-at-spec-threshold", "implementation": "required", "validation": "required", "release": "required-if-ships" },
      "high":   { "discovery": "required", "design": "required", "implementation": "required", "validation": "required-plus-critic", "release": "required-plus-human-approval" }
    },
    "spec_threshold": { "files_greater_than": 2, "or_any_new_feature": true }
  },
  "parallelism": {
    "fanout_signals": { "files_greater_than": 3, "domains_greater_than": 1, "independent_tasks_at_least": 3, "sweep": true, "read_heavy_exploration": true },
    "do_not_fanout": ["single-file", "fewer-than-3-units", "goal-still-vague", "every-step-feeds-the-next"],
    "wave_concurrency_cap": 6,
    "subagent_depth": 1,
    "disjoint_file_scopes": true
  },
  "retry": {
    "max_attempts_per_unit": 2,
    "escalations": 1,
    "by_situation": [
      { "situation": "transient",           "response": "retry-once-same-model" },
      { "situation": "failed-again-or-substantive", "response": "escalate-one-tier-retry-once" },
      { "situation": "failed-at-escalated-tier",    "response": "stop-report-incomplete" },
      { "situation": "returned-blocked",    "response": "no-retry-supply-input-or-drop" },
      { "situation": "returned-degraded",   "response": "accept-carry-caveat" }
    ],
    "never_retry": ["security-risk", "possible-data-loss", "irreversible-action-unclear-gate", "unresolved-ambiguity"]
  }
}
```

Invariants (U4): `aggregation` = "max"; five risk inputs; five autonomy levels
A0–A4; `ceiling_by_risk` keys exactly low/medium/high with valid level values;
gates.by_risk covers every ladder entry for every tier; wave cap = 6; retry
`never_retry` non-empty; every enum value used anywhere is from its closed set.

## Prose-mirror rule

Prose stays the human mirror (same discipline as `routing.json` ↔ CLAUDE.md
table): `rules/models.md` keeps its table but the table must agree with
`models.json` (U4 greps tier/model pairs); `rules/risk-autonomy.md`,
`rules/gates.md`, `rules/parallelism.md` are NOT edited in P1 — their numbers
(cap 6, attempts 2+1, threshold >2/>3) are extracted by U4 and compared against
`policy.json`, so a future prose edit that diverges fails CI.

## Rejected alternative

Encoding everything in one `policy.json`: rejected — `models.json` and
`intents.json` have different consumers (model toggle vs router) and different
change cadences (model rebind happens at every model release; router rows change
with team practice). Three files match the existing per-concern registry layout.

## Verification (definition of done)

- `scripts/validate-engineos.sh` green, including new C16 checks.
- `scripts/test-validate-engineos.sh` green, with planted breakage proving each
  new check fires (same proof discipline as the existing 27 checks).
- `scripts/run-evals.sh` unaffected (no eval cases change in P1).

## Rollback

`git revert` of the P1 commits. Registries are additive; the only prose edits
are `rules/models.md` (table rows) and one sentence in CLAUDE.md #6.
