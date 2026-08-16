# Decision Kernel — Phase 2: The Resolver API

- **Date:** 2026-08-06
- **Status:** Approved (P2 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — hook contracts are versioned public surface
  (`docs/COMPATIBILITY.md`); everything here keeps function names and output
  formats, changing only where answers come from. Reversible by revert.
  Autonomy A2.
- **Depends on:** P1 (`registries/models.json`, `intents.json`, `policy.json`),
  commit `9d718f9`.

## Problem

P1 made policy machine-readable, but nothing machine-reads it yet. The hooks
still carry their own private copies of policy: `routing-map.sh` holds the
path-pattern → domain mapping as a bash `case` ladder (patterns exist NOWHERE
in the registries), `gate-advisor.sh` re-implements registry matching inline,
and `task-scale-advisor.sh` hardcodes its prompt-signal regexes in the hook
body. Every consumer that wants an answer re-derives it.

## Deliverable

`scripts/kernel.sh` — one entry point, JSON out, no model calls, `jq` required
(hard error, not silent no-op: the kernel is explicit where hooks degrade).

```
kernel.sh route-path <file>              -> {domain, rules, skills, agent, risk_floor, hook_guidance, excluded}
kernel.sh route-intent <text>            -> {matches: [{id, rules, skills, agents, commands, mcp, model_tier, risk_floor}], ambiguous}
kernel.sh model --work <type>            -> {work, tier, model, escalates_to: {tier, model} | null}
kernel.sh risk --signals <json>          -> {risk, autonomy_ceiling, gates}
kernel.sh gates --risk <tier>            -> {risk, gates, spec_threshold}
kernel.sh retry --status <s> --attempt <n> [--situation <sit>] -> {action, reason}
kernel.sh capability <id>                -> {id, agent, model_tier, model, risk_floor, bound}
kernel.sh waves --units <json>           -> {waves: [[id]], violations, fanout_line}
kernel.sh decision-rules --prompt <text> -> {matches: [{id, require, prefer, gate, risk}], any_high}
kernel.sh scale --prompt <text>          -> {big_task, spec_authoring, design_work}
```

Exit codes: 0 success (including "no match" — `domain: null` is an answer),
1 usage/malformed input/missing registry/missing jq. Errors are
`{"error": "..."}` on stdout so callers parse one stream.

### Registry changes (inputs to the kernel)

1. `registries/routing.json` (version 1.0.0 → 1.1.0, additive):
   - per-domain `match` object: `paths` (globs matched against the
     leading-slash-normalized path) and `basenames` (globs matched against the
     basename) — moved verbatim from `routing-map.sh`'s case arms;
   - per-domain `sample_path`: a fixture path that MUST resolve to this domain
     (self-validating registry — the validator routes it and checks);
   - top-level `excluded`: `paths` + `basenames` globs that get no routing.
     The EngineOS-self exclusion (own `hooks/`, `docs/` trees) is
     runtime-relative and stays in code.
2. `registries/policy.json` (1.0.0 → 1.1.0, additive): `prompt_signals` block —
   `action`, `scale`, `spec`, `design_strong`, `design_weak` EREs moved verbatim
   from `task-scale-advisor.sh`.

### Matching semantics

- **route-path:** first exclusion wins; then domains in `precedence` order,
  first matching glob (paths, then basenames) wins — identical to the case
  ladder it replaces. Glob matching uses bash `case` with unquoted pattern
  expansion, same engine as before.
- **route-intent:** case-insensitive word-boundary match of each intent's
  `signals[]` against the prompt (signals are literal phrases — regex-escaped
  before matching). Multi-match by design; `ambiguous: true` when zero match.
  Suppression/tiebreak notes stay in `note` for Phase 3's router agent.
- **risk:** input `{"inputs": {<input-id>: <tier>}, "floors": [<floor-id>]}`.
  Tier = max over inputs; any recognized floor forces high. Unknown input ids
  or tier values are errors, not ignored (fail-closed).
- **retry:** `--situation` in `never_retry` → `never-retry` (before anything
  else); `BLOCKED` → `no-retry`; `DEGRADED` → `accept-carry`; `FAILED` +
  attempt 1 → `retry-same-tier`, attempt 2 → `escalate-one-tier`, attempt ≥3 →
  `stop`; `OK` → `none`.
- **waves:** input `[{id, files: [], depends_on: []}]`. Kahn layering over
  `depends_on` (cycle → error); within a wave, two units sharing a file is a
  violation (reported, wave still emitted so the caller can re-plan); waves
  larger than `wave_concurrency_cap` split in input order; `fanout_line` is the
  `[fanout] waves=N wave1=(...)` announcement string.

### Consumers rewired (contract-preserving)

| File | Before | After |
|---|---|---|
| `hooks/routing-map.sh` | authoritative case ladder | thin shim: `route_excluded`/`route_for_path` call `kernel.sh route-path`; same function names, same output strings (now sourced from the registry's `hook_guidance`) |
| `hooks/route-before-change.sh` | sources routing-map | calls `kernel.sh route-path` once, reads `hook_guidance` + `excluded`; rest of the hook (project-CLAUDE.md note, change-record note) unchanged |
| `hooks/gate-advisor.sh` | inline jq over decision-rules.json | calls `kernel.sh decision-rules --prompt`; formatting stays in the hook |
| `hooks/task-scale-advisor.sh` | hardcoded regexes | calls `kernel.sh scale --prompt`; message texts stay in the hook |

Non-blocking behavior is preserved: hooks still exit 0 always, still emit
`hookSpecificOutput.additionalContext`, still no-op without jq (the hook checks
jq before calling the kernel; the kernel's own hard error is for direct
callers).

### Validator rework (C14 + new C17)

The C14 checks "every registry hook_guidance is emitted by routing-map.sh" /
"every routing-map.sh arm is declared in the registry" die structurally — the
shim contains no guidance literals. Replaced by:

- C17a: every domain has a non-empty `match` and a `sample_path`.
- C17b (behavioral): `kernel.sh route-path <sample_path>` returns that domain,
  for every domain — this is the check that replaces string-grepping the case
  ladder, and it validates precedence too (a sample that another domain
  shadows fails loudly).
- C17c: `kernel.sh route-path` on an `excluded` fixture returns
  `excluded: true`.
- C17d: `routing-map.sh` is a shim — it invokes `kernel.sh` and contains no
  `echo "rules/` guidance literal.
- C17e: `policy.json.prompt_signals` EREs are valid regexes (same proof as
  decision-rules signals).
- C14's registry-internal check (rules[] ↔ hook_guidance string agreement)
  stays — both sides live in the registry.

Planted-breakage updates in `test-validate-engineos.sh`: the two dead cases
(guidance-drift, arm-missing) are replaced by: a `sample_path` that routes to
the wrong domain is caught; an emptied `match` is caught; a guidance literal
reintroduced into routing-map.sh is caught; an invalid `prompt_signals` ERE is
caught.

### New test surface

`scripts/test-kernel.sh` — behavioral cases per subcommand against the real
registries: every domain's sample path routes correctly (shared with C17b);
route-intent matches a known prompt per intent family and flags an ambiguous
one; model/gates/retry/capability answer known cases; risk aggregates max and
honors floors; waves layers a 3-unit dependency graph, flags a same-file
collision, splits an 8-unit wave at 6, and rejects a cycle.

`hooks/test-route.sh` (35 existing behavioral cases) must pass UNCHANGED — it
is the proof the shim preserves behavior.

## Out of scope

Router agent (P3), handoff frontmatter (P4), repair loop (P5). `waves` ships
here because the P2 todo names it; P4 keeps only the handoff-template work.

## Verification

- `scripts/test-kernel.sh` green (new).
- `hooks/test-route.sh`, `test-gate-advisor.sh`, `test-task-scale.sh` green
  unchanged — behavior-preservation proof.
- `scripts/validate-engineos.sh` green with C17; `test-validate-engineos.sh`
  green with the updated planted breakage.
- `scripts/run-evals.sh` unaffected.

## Rollback

`git revert` of the P2 commits; registries return to 1.0.0 shapes, hooks to
their inline implementations.
