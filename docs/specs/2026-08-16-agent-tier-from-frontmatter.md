# Agent tier declared in frontmatter — spec

**Date:** 2026-08-16
**Status:** approved (user-directed fix)
**Risk:** medium — CI gate + registry semantics; reversible via git revert.

## Problem

CI on `main` is red at the "Agent-registry drift guard" step: `agents/*.md`
frontmatter was rebound to `model: opus` (21 of 22 agents), but the committed
`registries/agents.json` still carries `sonnet`/`build` for 16 agents.

Regenerating is not a fix: `scripts/gen-agent-registry.sh` derives `model_tier`
by reverse lookup from the model name (`opus -> design`). Since
`registries/models.json` binds BOTH `design` and `build` to `opus`, the reverse
lookup is ambiguous — regeneration would label 21/22 agents `design`,
contradicting `registries/capabilities.json` (e.g. capability `implement` ->
`backend-coordinator` at `model_tier: build`). No check compares the two
registries, so the contradiction would land silently.

Root cause: **the tier is not derivable from the model while two tiers share a
binding. The tier must be declared by the agent.**

A second, mirrored defect: `install.sh`'s hook-merge jq body references
`$announce`, `$gate`, `$routeadv` with no matching `--arg`, so the merge dies
with `jq: $announce is not defined`; it also never registers
`announce-agent-return.sh` (PostToolUse Agent|Task), which `hooks.json` and
`install.ps1` both carry. (`post-edit-check.sh` is NOT a defect: retired
opt-in, documented in README and change record 2026-08-08.)

## Decision

1. **`tier:` becomes agent frontmatter** — one line per `agents/*.md`, values
   from the committed (pre-drift) `agents.json`, which already agrees with
   `capabilities.json`:
   - `build` (16): android-builder, backend-coordinator, cicd-specialist,
     dba-coordinator, devops-coordinator, docs-writer, frontend-coordinator,
     gcp-specialist, ios-builder, kubernetes-specialist, llm-coordinator,
     mobile-coordinator, oracle-specialist, postgres-specialist, qa-tester,
     test-writer
   - `design` (5): architecture-analyst, audit-consolidator, critic, router,
     security-reviewer
   - `most-capable` (1): product-spec
2. **`gen-agent-registry.sh` reads `tier:`** and drops the `model_tier()`
   reverse lookup. Missing tier, unknown tier, or a `model` that differs from
   the tier's binding in `registries/models.json` is a hard error naming the
   file — fail loud, never guess.
3. **Cross-registry check** in `scripts/validate-engineos.sh` (C15 block):
   every capability's `model_tier` must equal its bound agent's `model_tier`
   in `agents.json`. Planted-breakage case added to
   `scripts/test-validate-engineos.sh`.
4. **Regenerate** `registries/agents.json` (models become `opus`, tiers
   preserved) and `commands/agents/` if the added frontmatter line surfaces
   there.
5. **Fix `install.sh`**: add the four missing `--arg` lines (gate, routeadv,
   announce, annret) and register `announce-agent-return.sh` under
   PostToolUse `Agent|Task`, matching `hooks.json` and `install.ps1`.
6. **Update `scripts/test-gen-agent-registry.sh`** fixtures to declare
   consistent `tier:`+`model:` pairs; add negative cases (missing tier,
   tier/model mismatch) expecting nonzero exit.

## Rejected alternative

Keep reverse lookup and special-case `opus -> build unless the agent is one of
a hardcoded design list`. Rejected: moves the tier table into the generator as
a shadow roster; every new agent silently defaults wrong. The binding
`build=opus` is explicitly temporary (`rules/models.md`), so any
model-to-tier derivation stays ambiguous by design.

## Verification

- `scripts/test-gen-agent-registry.sh` green (incl. new negative cases)
- `scripts/validate-engineos.sh` green (incl. new cross-check)
- `scripts/test-validate-engineos.sh` green (incl. new planted case)
- `bash scripts/gen-agent-registry.sh && git diff --quiet -- registries/agents.json`
  (drift guard reproduction) green
- `shellcheck -S error` on touched scripts; `bash -n install.sh`
