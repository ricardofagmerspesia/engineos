#!/usr/bin/env bash
# Declarations for hooks/test-docs.sh. No logic — four lists the probe suite
# reads. Split from the checker for the same reason routing data is split from
# the hook that consumes it: accepted debt changes on a different clock than the
# assertions that defend it.
#
# Every entry here is a promise: the gap is known, the reason is written down,
# and one more instance of it turns the suite red.

# Rule stems imported by the "Always-on rules" section of CLAUDE.md. These are in
# context on every turn, so any row may rely on them without loading them.
ENGINEOS_ALWAYS_ON="base security git context"

# Closed policy bundle injected by kernel.sh resolve-task for every substantive
# request. These files are not paid for by pure questions, but router rows may
# rely on them exactly as they rely on the always-on core. C18g validates the
# executable contract; this ledger gives the prose probe the same vocabulary.
ENGINEOS_TASK_CONTRACT_RULES="gates models parallelism risk-autonomy verification"

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

# ---------------------------------------------------------------------------
# The DATA above now lives in registries/docs-ledger.json. This file is the
# sourced-library face of it and keeps the six variable names hooks/test-docs.sh
# already reads; the prose behind each list stays here, where a reader looking at
# the ledger finds it. The literals above are the degraded copy, used when jq is
# absent or the registry cannot be read — the JSON is the source of truth, and the
# two must produce byte-identical values.
#
# Loaded as a unit: a partial read would silently narrow a budget list or an
# exemption list, which turns hooks/test-docs.sh red for a reason that has nothing
# to do with the docs. Any failure leaves every literal in place.
# ---------------------------------------------------------------------------
_engineos_docs_ledger_load() {
  local json always contract exceptions budgets skills exempt
  json="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)/registries/docs-ledger.json"
  command -v jq >/dev/null 2>&1 || return 1
  [ -f "$json" ] || return 1
  always=$(jq -r '.always_on | join(" ")' "$json" 2>/dev/null) || return 1
  contract=$(jq -r '.task_contract_rules | join(" ")' "$json" 2>/dev/null) || return 1
  exceptions=$(jq -r '.closure_exceptions[] | "\(.from)|\(.to)|\(.reason)"' "$json" 2>/dev/null) || return 1
  budgets=$(jq -r '.marker_budgets[] | "\(.phrase)|\(.max_files)|\(.owner)"' "$json" 2>/dev/null) || return 1
  skills=$(jq -r '.external_skills | join(" ")' "$json" 2>/dev/null) || return 1
  exempt=$(jq -r '.alias_exempt | join(" ")' "$json" 2>/dev/null) || return 1
  # An empty list here is a real state (no accepted gap); an empty one anywhere
  # else means the read failed, so refuse rather than publish a shorter ledger.
  [ -n "$always" ] && [ -n "$contract" ] && [ -n "$budgets" ] \
    && [ -n "$skills" ] && [ -n "$exempt" ] || return 1

  ENGINEOS_ALWAYS_ON="$always"
  ENGINEOS_TASK_CONTRACT_RULES="$contract"
  ENGINEOS_EXTERNAL_SKILLS="$skills"
  ENGINEOS_ALIAS_EXEMPT="$exempt"
  # Both multi-line lists are newline-delimited records read line by line; the
  # empty form is the empty string, not a blank line, so that a `grep -q '^a|b|'`
  # over an empty ledger matches nothing.
  if [ -n "$exceptions" ]; then
    ENGINEOS_CLOSURE_EXCEPTIONS="
$exceptions
"
  else
    ENGINEOS_CLOSURE_EXCEPTIONS=''
  fi
  ENGINEOS_MARKER_BUDGETS="
$budgets
"
}
_engineos_docs_ledger_load || true
unset -f _engineos_docs_ledger_load
