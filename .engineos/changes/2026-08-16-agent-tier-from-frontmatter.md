# Change: agent tier declared in frontmatter; registry drift + install.sh hook merge fixed

**Date:** 2026-08-16
**Spec:** docs/specs/2026-08-16-agent-tier-from-frontmatter.md
**Risk:** medium — CI gate + registry semantics; reversible via git revert.
**Status:** in progress

## Problem

- CI red on main: agent-registry drift guard (16 agents drifted after the
  model rebind to opus).
- Regenerating was wrong: gen-agent-registry.sh reverse-derived tier from
  model, ambiguous while build and design both bind opus — 21/22 agents would
  be labeled design, contradicting capabilities.json, with no cross-check.
- install.sh hook merge references $announce/$gate/$routeadv without --arg
  (jq dies: "$announce is not defined") and never registers
  announce-agent-return.sh. Regression from 2799c7f, which rewrote the jq
  invocation and dropped four --arg that 61558b9 had added; "|| true" +
  "&& mv" swallow the failure, so install reports success while installing
  zero hooks. CI misses it because it only checks exit 0. install.ps1 intact.
  (post-edit-check.sh reported as the mirrored defect is NOT one — retired
  opt-in, documented.)

## Checklist

- [x] Spec written (docs/specs/2026-08-16-agent-tier-from-frontmatter.md)
- [x] `tier:` frontmatter added to all 22 agents/*.md (16 build, 5 design,
      1 most-capable — values from the pre-drift committed registry, which
      agrees with capabilities.json)
- [x] gen-agent-registry.sh reads tier from frontmatter; hard error on
      missing/unknown/model-inconsistent tier; reverse lookup removed
- [x] validate-engineos.sh: capability model_tier must equal its agent's tier
      (C15 block); planted-breakage case added to test-validate-engineos.sh
- [x] test-gen-agent-registry.sh: fixtures declare tier; negative cases added
- [x] install.sh: missing --arg gate/routeadv/announce/annret added;
      PostToolUse Agent|Task -> announce-agent-return.sh registered
- [ ] registries/agents.json regenerated (models opus, tiers preserved)
- [ ] Final gate: generator tests, validator, validator-breakage harness,
      shellcheck -S error, drift-guard reproduction green

## Files changed

- agents/*.md (22 — one `tier:` line each)
- scripts/gen-agent-registry.sh
- scripts/test-gen-agent-registry.sh
- scripts/validate-engineos.sh
- scripts/test-validate-engineos.sh
- install.sh
- registries/agents.json (regenerated)
- docs/specs/2026-08-16-agent-tier-from-frontmatter.md (new)

## What was made

Tier is now declared by the agent (`tier:` frontmatter) and only validated —
never derived — by the generator, since two tiers legitimately share a model
binding. A new integrity check keeps capabilities.json and agents.json from
contradicting each other silently. install.sh's hook merge is complete and
executable again, matching hooks.json and install.ps1.
