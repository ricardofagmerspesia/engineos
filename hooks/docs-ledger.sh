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
ENGINEOS_ALWAYS_ON="base security git parallelism models subagents"

# Accepted closure gaps: "<from>|<to>|<reason>". Pair-scoped, not row-scoped —
# one always-on outward pointer explains the same gap in every router row.
# Retiring an entry means fixing the underlying gap, then deleting the line.
ENGINEOS_CLOSURE_EXCEPTIONS='
parallelism|testing|Steps 5-6 name the final gate, which rules/testing.md defines. Retire by splitting testing.md into an always-on policy half and a disclosed craft half.
models|testing|The build-tier row qualifies its test assignment against "Tests are opt-in", which rules/testing.md owns. Same retirement as above.
'

# Single-source-of-truth budgets: "<phrase>|<max-files>|<owner-file-or-dash>".
# A ratchet — budgets only move down. Coming in under budget passes and prints a
# note telling you to tighten the number. Use "-" when the concept has no single
# owner yet; that itself is debt.
ENGINEOS_MARKER_BUDGETS='
lint + typecheck|1|rules/testing.md
Tests are opt-in|9|rules/testing.md
MODE: AUDIT|8|-
Do not spawn subagents|6|-
Project `CLAUDE.md` overrides EngineOS|6|-
'

# Skills referenced by name that live outside this repo (plugins, host skills).
# Declared rather than pattern-matched: the probe cannot tell an external skill
# from a typo, so each one is a deliberate line.
#   claude-api — host skill, named in skills/llm-engineering for model/pricing lookups
ENGINEOS_EXTERNAL_SKILLS="claude-api"

# Agents that carry no alias by design. The builders are named directly in the
# router row that dispatches them, never by a short name.
ENGINEOS_ALIAS_EXEMPT="ios-builder android-builder"
