# shellcheck shell=bash
# Shared vocabulary for the Check families in this directory.
#
# scripts/validate-engineos.sh sources this file first, then every other
# scripts/checks/*.sh. It supplies:
#   - the registry and contract-surface paths the families address;
#   - the always-on / task-contract rule sets and the deferral graph the rules
#     family walks;
#   - skip_once, so a family whose shared precondition is missing reports one
#     FAIL for the whole family instead of one per Check.
# ok, bad and ROOT come from the harness and are in scope here.

# Registries and the contract surfaces the Checks read.
R=registries/routing.json
RJSON=registries/routing.json
D=registries/decision-rules.json
C=registries/capabilities.json
A=registries/agents.json
MJ=registries/models.json
IJ=registries/intents.json
PJ=registries/policy.json
KSH=scripts/kernel.sh
TSH=scripts/telemetry.sh
EJSH=scripts/exec-journal.sh
ROUTER_MD=agents/router.md
PROMPT_ADVISOR=hooks/prompt-advisor.sh
HOOKS_JSON=hooks/hooks.json
TPL=templates/handoff.md
CT=.engineos/changes/_template.md

# Always-on rules and the resolver's closed substantive-task policy bundle need
# not be repeated in every row. The latter is asserted behaviorally in C18.
ALWAYS_ON=$(sed -n 's|^@rules/\([a-z-]*\)\.md.*|\1|p' CLAUDE.md | sort -u)
TASK_CONTRACT_RULES="gates models parallelism risk-autonomy verification"
is_always_on() { case " $(echo "$ALWAYS_ON" | tr '\n' ' ') " in *" $1 "*) return 0 ;; esac; return 1; }
is_task_contract_rule() { case " $TASK_CONTRACT_RULES " in *" $1 "*) return 0 ;; esac; return 1; }

RULE_NAMES=$(cd rules && ls ./*.md 2>/dev/null | sed 's|^\./||; s|\.md$||')

# Build the deferral graph: rule R defers to S when R's text names S.md and S is
# not supplied globally. Then every router row loading R must also load S.
deferrals_of() {
  local r="$1" out=""
  for s in $RULE_NAMES; do
    [ "$s" = "$r" ] && continue
    is_always_on "$s" && continue
    is_task_contract_rule "$s" && continue
    grep -qE "(rules/)?\`?${s}\.md" "rules/$r.md" 2>/dev/null && out="$out $s"
  done
  echo "$out"
}

# A missing shared precondition is one defect, not one per Check that trips over
# it. The flat script reported it once because the Checks shared an `if`;
# discovery must not turn that into a dozen identical FAIL lines.
SKIPPED_GUARDS=""
skip_once() {
  local token="$1" message="$2"
  case " $SKIPPED_GUARDS " in *" $token "*) return 0 ;; esac
  SKIPPED_GUARDS="$SKIPPED_GUARDS $token"
  bad "$message"
}

have_jq() {
  command -v jq >/dev/null 2>&1 && return 0
  skip_once jq "registry checks skipped — jq missing"
  return 1
}
