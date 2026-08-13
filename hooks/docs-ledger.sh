#!/usr/bin/env bash
# Declarations for hooks/test-docs.sh. No logic — four lists the probe suite
# reads. Split from the checker for the same reason routing-map.sh is split from
# route-before-change.sh: accepted debt changes on a different clock than the
# assertions that defend it.
#
# Every entry here is a promise: the gap is known, the reason is written down,
# and one more instance of it turns the suite red.

# Rule stems imported by the "Always-on rules" section of CLAUDE.md. These are in
# context on every turn, so any row may rely on them without loading them.
ENGINEOS_ALWAYS_ON="base security git memory parallelism models subagents verification risk-autonomy context gates"

# Accepted closure gaps: "<from>|<to>|<reason>". Pair-scoped, not row-scoped —
# one always-on outward pointer explains the same gap in every router row.
# Retiring an entry means fixing the underlying gap, then deleting the line.
# Empty by design since 2026-08-12: the two gaps this ledger shipped with were
# both parallelism/models -> testing, retired by splitting the policy half of
# rules/testing.md into always-on rules/verification.md.
ENGINEOS_CLOSURE_EXCEPTIONS=''

# Single-source-of-truth budgets: "<phrase>|<max-files>|<owner-file-or-dash>".
# A ratchet — budgets only move down. Coming in under budget passes and prints a
# note telling you to tighten the number. Counts are grep-literal, so a citation
# wrapped across two lines does not register; re-flowing a paragraph can raise a
# count without adding a site.
#
# Budget 0 is the floor: a retired phrasing whose meaning now lives in exactly one
# always-on place under different words. It must not come back anywhere — which is
# why these two keep no owner file.
#   Do not spawn subagents            -> rules/parallelism.md states the flat graph
#                                        orchestrator-side; coordinators are granted
#                                        no Task tool, so the ban was a no-op there.
#   Project `CLAUDE.md` overrides ...  -> CLAUDE.md non-negotiable #4, plus
#                                        rules/subagents.md for dispatched agents.
ENGINEOS_MARKER_BUDGETS='
lint + typecheck|1|rules/verification.md
Tests are opt-in|6|rules/verification.md
MODE: AUDIT|3|rules/subagents.md
Do not spawn subagents|0|-
Project `CLAUDE.md` overrides EngineOS|0|-
'

# Skills referenced by name that live outside this repo (plugins, host skills).
# Declared rather than pattern-matched: the probe cannot tell an external skill
# from a typo, so each one is a deliberate line.
#   claude-api  — host skill, named in skills/llm-engineering for model/pricing lookups
#   code-review — host skill, named in the CLAUDE.md review row as environment-provided
ENGINEOS_EXTERNAL_SKILLS="claude-api code-review"

# Agents that carry no alias by design. The builders are named directly in the
# router row that dispatches them, never by a short name; router is reached through
# /engineos:route, never called by a person's name.
ENGINEOS_ALIAS_EXEMPT="ios-builder android-builder router"
