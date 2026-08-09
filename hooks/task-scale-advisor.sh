#!/usr/bin/env bash
# EngineOS UserPromptSubmit: detect big-task prompts and inject the fan-out +
# model-assignment reminder. NON-BLOCKING — guidance only, via
# hookSpecificOutput.additionalContext (exit 0).
#
# Fires only when the prompt carries BOTH an action verb (work is being requested)
# AND a scale marker (the work is plausibly parallelizable), or when it explicitly
# asks for a spec/PRD (model-tier reminder). Canonical rules: rules/parallelism.md
# and rules/models.md.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# Bypass switch. Every other hook goes silent; this one speaks instead. A
# governance system that is off must SAY it is off on every turn, or the user
# forgets and reads unguarded work as guarded.
# shellcheck source=hooks/bypass.sh
. "$(cd "$(dirname "$0")" && pwd)/bypass.sh"
if engineos_bypass_active_for_payload "$INPUT"; then
  jq -n --arg c "[engineos] BYPASS ACTIVE — routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness's own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run \`/engineos:bypass off\` to restore EngineOS." \
    '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
  exit 0
fi

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' | tr '[:upper:]' '[:lower:]')
[ -z "$PROMPT" ] && exit 0

has() { printf '%s' "$PROMPT" | grep -qE "$1"; }

ACTION='\b(add|build|create|implement|develop|refactor|migrate|port|mirror|rewrite|redesign|extract|split|backfill|integrate|scaffold|modernize)\b'
# Countable nouns are PLURAL-ONLY on purpose: "add a component" / "new service" is a
# one-unit change and must not trip the fan-out advice. Only "components"/"services"
# (or an explicit breadth word like "all"/"across") signals parallelizable scale.
SCALE='\b(all|every|entire|whole|across|full stack|fullstack|end.to.end|end2end|multiple|several|both|system.wide|codebase|monorepo|modules|services|endpoints|screens|pages|components|features|epic|milestone|phase|roadmap|suite)\b'
SPEC='\b(spec|specification|prd|requirement[s]?|product brief|design doc|rfc|adr)\b'
DESIGN='\b(architect|architecture|design|decompose|trade.?off|should we use)\b'

NOTES=""

if has "$ACTION" && has "$SCALE"; then
  NOTES="[engineos] big-task signal — apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself."
fi

if has "$SPEC"; then
  NOTES="${NOTES:+$NOTES
}[engineos] spec/PRD authoring — rules/models.md: use the most-capable tier (model: fable). If the session model is lower, delegate the authoring to a subagent with that model."
fi

if has "$DESIGN"; then
  NOTES="${NOTES:+$NOTES
}[engineos] design/architecture work — rules/models.md: design tier (model: opus) for the design pass, build tier (model: sonnet) for the code that follows."
fi

[ -z "$NOTES" ] && exit 0

jq -n --arg c "$NOTES" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
exit 0
