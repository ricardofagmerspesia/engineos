#!/usr/bin/env bash
# EngineOS UserPromptSubmit adapter. One kernel call resolves routing, task
# scale, policy loads and decision gates; this hook only formats that contract
# and records best-effort telemetry. Non-blocking by design.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

hook_read_envelope

if engineos_bypass_active "$HOOK_CWD"; then
  hook_context UserPromptSubmit "[engineos] BYPASS ACTIVE — routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness's own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run \`/engineos:bypass off\` to restore EngineOS."
  exit 0
fi

[ -n "$HOOK_PROMPT" ] || exit 0
RESULT=$("$DIR/../scripts/kernel.sh" resolve-task --prompt "$HOOK_PROMPT" 2>/dev/null) || exit 0
printf '%s' "$RESULT" | jq -e . >/dev/null 2>&1 || exit 0

# Telemetry is best-effort and stores registry ids only, never prompt text.
ROUTE_DATA=$(printf '%s' "$RESULT" | jq -c \
  '{escalate: (.route.escalate // false), reasons: .route.reasons,
    intents: .route.intents, suppressed: [.route.suppressed[]?.id],
    agents: .route.agents}' 2>/dev/null)
hook_telemetry route "$ROUTE_DATA"

if printf '%s' "$RESULT" | jq -e '.decision_rules.matches | length > 0' >/dev/null 2>&1; then
  DECISION_DATA=$(printf '%s' "$RESULT" | jq -c \
    '{rules: [.decision_rules.matches[].id], any_high: (.decision_rules.any_high // false)}' \
    2>/dev/null)
  hook_telemetry decision-rules "$DECISION_DATA"
fi

# Build a single context payload. The task_contract is the stable interface;
# route and decision_rules remain attached only so this adapter can preserve
# the existing human-readable guidance during the compatibility window.
NOTES=$(printf '%s' "$RESULT" | jq -r '
  def csv($xs): if ($xs | length) == 0 then "-" else ($xs | join(",")) end;
  def scale_notes:
    [if .task_contract.scale.big_task then
       "[engineos] big-task signal — apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '\''[fanout] waves=... '\''. Do not do independent units sequentially yourself."
     else empty end,
     if .task_contract.scale.spec_authoring then
       "[engineos] spec/PRD authoring — rules/models.md: use the most-capable tier (model: fable). If the session model is lower, delegate the authoring to a subagent with that model."
     else empty end,
     if .task_contract.scale.design_work then
       "[engineos] design/architecture work — rules/models.md: design tier (model: opus) for the design pass, build tier (model: opus) for the code that follows."
     else empty end];
  def decision_note:
    if (.decision_rules.matches | length) == 0 then [] else
      (.decision_rules.any_high) as $any_high
      | ([.decision_rules.matches[] |
        "  - \(.id)"
        + (if (.require | length) > 0 then " — require: \(.require | join(", "))" else "" end)
        + (if (.prefer // "") != "" then " — prefer: \(.prefer)" else "" end)
        + (if (.gate // "") != "" then " [gate: \(.gate)]" else "" end)
        + (if (.risk // "") != "" then " [risk: \(.risk)]" else "" end)]
       | ["[engineos] decision rules matched this prompt (registries/decision-rules.json).\n"
          + join("\n")
          + "\nConfirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md."
          + (if $any_high then
               "\n[engineos] a matched rule sets risk=high — autonomy ceiling A3 per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release."
             else "" end)])
    end;
  def route_note:
    if .route.escalate then
      ["[engineos] route escalation — the kernel could not fully resolve this request: \(.route.reasons | join(", ")). Dispatch the `router` agent (agents/router.md, model opus) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=\(csv(.route.intents)) agents=\(csv(.route.agents)) scale=(\(.route.scale | to_entries | map("\(.key)=\(.value)") | join(" "))). A hook cannot dispatch an agent — you must invoke it."]
    elif .task_contract.substantive then
      ["[engineos] task contract (kernel, deterministic): intents=\(csv(.task_contract.intents)) agents=\(csv(.task_contract.agents)) rules=\(csv(.task_contract.rules)) policy_rules=\(csv(.task_contract.policy_rules)) skills=\(csv(.task_contract.skills)) commands=\(csv(.task_contract.commands)) mcp=\(csv(.task_contract.mcp)) model_tier=\(.task_contract.model_tier // "-") risk_floor=\(.task_contract.risk_floor // "-") autonomy_ceiling_at_floor=\(.task_contract.autonomy_ceiling_at_floor // "-") — load these before acting; the risk floor is a floor, not the final tier. No router dispatch needed."]
    else [] end;
  (scale_notes + decision_note + route_note) as $notes
  | if ($notes | length) == 0 then empty else ($notes | join("\n")) end')
[ -n "$NOTES" ] || exit 0
hook_context UserPromptSubmit "$NOTES"
exit 0
