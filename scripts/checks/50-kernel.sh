# shellcheck shell=bash
# Behavioral checks against the running kernel: path routing and its fixtures
# (C17*), and the router agent's wiring to it (C18*).

# ------------------------ C17: kernel resolver + routing patterns (P2)
# scripts/kernel.sh is the one implementation of path->domain matching;
# routing.json carries the patterns and a self-validating sample_path per
# domain. These behavioral checks replace the pre-P2 string-grepping of the
# hand-written case ladder (see C14's note).
# Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
have_kernel_routing() {
  [ -f "$KSH" ] && [ -f "$R" ] && return 0
  skip_once kernel "scripts/kernel.sh or registries/routing.json missing — kernel checks skipped"
  return 1
}

check_C17() {
  have_jq || return 0
  have_kernel_routing || return 0
  # C17a: every domain declares patterns and a sample fixture
  m_bad=""
  while IFS= read -r d; do
    n=$(jq -r --arg d "$d" '.domains[] | select(.id==$d) | ((.match.paths // []) + (.match.basenames // [])) | length' "$R")
    sp=$(jq -r --arg d "$d" '.domains[] | select(.id==$d) | .sample_path // empty' "$R")
    [ "$n" -gt 0 ] || m_bad="$m_bad $d(no-patterns)"
    [ -n "$sp" ]   || m_bad="$m_bad $d(no-sample)"
  done < <(jq -r '.domains[].id' "$R")
  [ -z "$m_bad" ] && ok "every routing domain declares match patterns and a sample_path" \
                  || bad "routing domains missing patterns/sample:$m_bad"
}

check_C17b() {
  have_jq || return 0
  have_kernel_routing || return 0
  # C17b: every sample_path actually routes to its own domain through the
  # kernel — validates patterns AND precedence (a shadowed sample fails)
  r_bad=""
  while IFS=$'\t' read -r d sp; do
    got=$(bash "$KSH" route-path "$sp" 2>/dev/null | jq -r '.domain // "null"')
    [ "$got" = "$d" ] || r_bad="$r_bad $d(sample->'$got')"
  done < <(jq -r '.domains[] | [.id, .sample_path] | @tsv' "$R")
  [ -z "$r_bad" ] && ok "every domain sample_path routes to its own domain via kernel.sh" \
                  || bad "sample_path routing failures:$r_bad"
}

check_C17c() {
  have_jq || return 0
  have_kernel_routing || return 0
  # C17c: exclusions still exclude — the glob patterns, plus .excluded.self_dirs
  # resolved against this checkout's own root (a consumer project's own
  # hooks/ dir must still route).
  excl=$(bash "$KSH" route-path "/tmp/some-repo/.engineos/changes/x.ts" 2>/dev/null | jq -r '.excluded')
  excl2=$(bash "$KSH" route-path "/tmp/some-repo/README.md" 2>/dev/null | jq -r '.excluded')
  excl3=$(bash "$KSH" route-path "$ROOT/hooks/x.sh" 2>/dev/null | jq -r '.excluded')
  excl4=$(bash "$KSH" route-path "/tmp/some-repo/hooks/x.ts" 2>/dev/null | jq -r '.excluded')
  [ "$excl" = "true" ] && [ "$excl2" = "true" ] && [ "$excl3" = "true" ] && [ "$excl4" = "false" ] \
    && ok "kernel.sh route-path honors the excluded patterns and self_dirs" \
    || bad "kernel.sh exclusion broken (.engineos=$excl, README.md=$excl2, self hooks/=$excl3, foreign hooks/=$excl4)"
}

check_C17e() {
  have_jq || return 0
  have_kernel_routing || return 0
  # C17e: prompt_signals EREs exist and are valid regexes (an invalid one
  # would make kernel.sh scale silently mis-answer, same failure class as
  # decision-rules signals)
  ps_bad=""
  for k in action substantive_action scale spec design_strong design_weak; do
    s=$(jq -r --arg k "$k" '.parallelism.prompt_signals[$k] // empty' "$PJ")
    if [ -z "$s" ]; then ps_bad="$ps_bad $k(missing)"; continue; fi
    printf 'x' | grep -qE "$s" 2>/dev/null || [ $? -eq 1 ] || ps_bad="$ps_bad $k(invalid)"
  done
  [ -z "$ps_bad" ] && ok "policy.json prompt_signals present and valid EREs" \
                   || bad "policy.json prompt_signals problems:$ps_bad"
}

# ---------------------------- C18: router agent wiring (P3)
# scripts/kernel.sh route-escalate decides when the deterministic path is
# not enough and a model (agents/router.md) must produce a dispatch plan.
# Spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md
have_router_inputs() {
  [ -f "$KSH" ] && [ -f "$IJ" ] && [ -f "$C" ] && [ -f "$PJ" ] && [ -f "$MJ" ] && return 0
  skip_once router "kernel.sh, intents.json, capabilities.json, models.json or policy.json missing — router checks skipped"
  return 1
}

have_router_agent() {
  [ -f "$ROUTER_MD" ] && return 0
  skip_once router-agent "agents/router.md missing"
  return 1
}

check_C18() {
  have_jq || return 0
  have_router_inputs || return 0
  # C18a: capability binding — pinned specifically, not just "some valid tier".
  # Resolved from the registries directly. It used to go through `kernel.sh
  # capability`, deleted in the PR5 of
  # docs/specs/2026-09-02-deepen-runtime-modules-design.md; the property the
  # Check defends never lived in that subcommand. The registry->registry half
  # (a binding resolves, a tier is valid) is C15/C15b's; what survives here and
  # nowhere else is the registry->frontmatter half: the tier the route
  # capability claims must resolve, in models.json, to the model the router
  # agent's own frontmatter declares.
  ra=$(jq -r '.capabilities[] | select(.id=="route") | .agent' "$C")
  rt=$(jq -r '.capabilities[] | select(.id=="route") | .model_tier' "$C")
  if [ "$ra" = "router" ] && [ "$rt" = "design" ] && [ -f "$ROUTER_MD" ]; then
    tmodel=$(jq -r --arg t "$rt" '.tiers[] | select(.id==$t) | .model' "$MJ")
    fmodel=$(sed -n 's/^model: *//p' "$ROUTER_MD" | head -1)
    if [ -n "$tmodel" ] && [ "$tmodel" = "$fmodel" ]; then
      ok "route capability is bound to router (design/$fmodel)"
    else
      bad "route capability binding broken (models.json tier $rt=$tmodel, agent frontmatter model=$fmodel)"
    fi
  else
    bad "route capability is not bound to agent=router/model_tier=design"
  fi
}

check_C18b() {
  have_jq || return 0
  have_router_inputs || return 0
  have_router_agent || return 0
  # The router reaches the kernel through ONE subcommand, `resolve`, whose
  # answer is selected by the facts it declares (Task 13b of
  # docs/specs/2026-09-04-typescript-runtime-migration-plan.md). So the literal
  # to defend is no longer five subcommand names but the single call plus the
  # facts the plan cannot be built without: `escalate` (the route-escalation
  # form), `signals` (the risk tier and its gates), `workType` (the per-unit
  # model) and `waves` (the layering).
  kb_bad=""
  for lit in "kernel.sh resolve --facts" '"escalate": true' '"signals"' '"workType"' '"waves"'; do
    grep -qF -- "$lit" "$ROUTER_MD" || kb_bad="$kb_bad [$lit]"
  done
  [ -z "$kb_bad" ] && ok "agents/router.md resolves the plan through one kernel call declaring every required fact" \
                   || bad "router's kernel resolve call is missing:$kb_bad"
}

check_C18c() {
  have_jq || return 0
  have_router_inputs || return 0
  have_router_agent || return 0
  # C18c: read-only planner by tool absence, not by prompt discipline
  tools_line=$(sed -n 's/^tools: *//p' "$ROUTER_MD" | head -1)
  if printf '%s' "$tools_line" | grep -q 'Bash' \
     && ! printf '%s' "$tools_line" | grep -qE 'Edit|Write|Task'; then
    ok "router must not hold Edit/Write/Task — tools: $tools_line"
  else
    bad "router must not hold Edit/Write/Task (read-only-planner contract): $tools_line"
  fi
}

check_C18d() {
  have_jq || return 0
  have_router_inputs || return 0
  # C18d: suppression data integrity
  sup_bad=""
  unknown=$(jq -r '[.intents[].id] as $ids | [.intents[] | .suppressed_by[]? | select(. as $s | $ids | index($s) | not)] | unique | join(",")' "$IJ")
  [ -n "$unknown" ] && sup_bad="$sup_bad unknown-target:$unknown"
  selfref=$(jq -r '[.intents[] | select(.suppressed_by != null) | .id as $iid | select(.suppressed_by | index($iid)) | $iid] | join(",")' "$IJ")
  [ -n "$selfref" ] && sup_bad="$sup_bad self-reference:$selfref"
  # 2-cycle (and self, already caught above): A suppressed_by B and B suppressed_by A.
  # `.id as $iid` binds the inner id BEFORE piping into index() — piping
  # $e.sb into index(.id) directly rebinds `.` to $e.sb itself and throws
  # "cannot index array with string id", the same footgun class P3-U2 found.
  twocycle=$(jq -r '
    [.intents[] | select(.suppressed_by != null) | {id, sb: .suppressed_by}] as $edges
    | [ $edges[] as $e | $edges[] | .id as $iid
        | select($iid != $e.id) | select(.sb | index($e.id)) | select($e.sb | index($iid)) | $e.id ]
    | unique | join(",")' "$IJ")
  [ -n "$twocycle" ] && sup_bad="$sup_bad cycle:$twocycle"
  nonsupp=$(jq -r '[.intents[] | select(.suppressible != true)] | length' "$IJ")
  [ "$nonsupp" -lt 1 ] && sup_bad="$sup_bad all-intents-suppressible"
  hasdispatch=$(jq -r '[.intents[] | select(.requires_dispatch_plan == true)] | length' "$IJ")
  [ "$hasdispatch" -lt 1 ] && sup_bad="$sup_bad no-requires_dispatch_plan-intent"
  booltype_bad=$(jq -r '[.intents[] | select((.suppressible != null and (.suppressible|type)!="boolean") or (.requires_dispatch_plan != null and (.requires_dispatch_plan|type)!="boolean")) | .id] | join(",")' "$IJ")
  [ -n "$booltype_bad" ] && sup_bad="$sup_bad non-boolean:$booltype_bad"
  [ -z "$sup_bad" ] && ok "intents.json suppression data is internally consistent" \
                     || bad "suppression data problems:$sup_bad"
}

check_C18e() {
  have_jq || return 0
  have_router_inputs || return 0
  # C18e: behavioral, fixture-driven — same self-validating pattern as
  # routing.json's sample_path (C17b)
  # `intents` is asserted alongside escalate/reasons because escalate=false
  # plus reasons=[] is ALSO what total routing failure looks like: the bug
  # fixture passed for years while matching zero intents, so the check could
  # not tell correct non-escalation from a router that resolved nothing.
  rf_bad=""
  while IFS=$'\t' read -r prompt want_esc want_reasons want_intents; do
    got=$(bash "$KSH" route-escalate --prompt "$prompt" 2>/dev/null)
    got_esc=$(printf '%s' "$got" | jq -r '.escalate')
    got_reasons=$(printf '%s' "$got" | jq -c '.reasons | sort')
    got_intents=$(printf '%s' "$got" | jq -c '.intents | sort')
    want_reasons_sorted=$(printf '%s' "$want_reasons" | jq -c 'sort')
    want_intents_sorted=$(printf '%s' "$want_intents" | jq -c 'sort')
    if [ "$got_esc" != "$want_esc" ] || [ "$got_reasons" != "$want_reasons_sorted" ] \
       || [ "$got_intents" != "$want_intents_sorted" ]; then
      rf_bad="$rf_bad [$prompt](got esc=$got_esc reasons=$got_reasons intents=$got_intents)"
    fi
  done < <(jq -r '.router.fixtures[] | [.prompt, .escalate, (.reasons|tojson), (.intents|tojson)] | @tsv' "$PJ")
  [ -z "$rf_bad" ] && ok "every policy.json.router.fixtures entry matches kernel.sh route-escalate" \
                   || bad "route-escalate fixture mismatches:$rf_bad"
}

check_C18f() {
  have_jq || return 0
  have_router_inputs || return 0
  # C18f: the hot path is one registered adapter and one deep kernel call.
  # Two files, because the adapter is now a shim: hooks.json registers the node
  # form, but a consumer who copied the old entry still executes
  # hooks/prompt-advisor.sh by path, so the registration half reads the shim and
  # its mode bit, while the resolve-task call lives in the TypeScript module.
  if [ -x "$PROMPT_ADVISOR" ] \
     && jq -e '[.hooks.UserPromptSubmit[].hooks[]?.command] as $h | ($h|length)==1 and ($h[0]|test("prompt-advisor"))' "$HOOKS_JSON" >/dev/null 2>&1 \
     && grep -q 'resolve-task' "$PROMPT_ADVISOR_TS" 2>/dev/null; then
    ok "hooks/prompt-advisor.sh is the single registered prompt adapter and src/hooks/prompt-advisor.ts calls resolve-task"
  else
    bad "prompt-advisor registration/wiring incomplete or UserPromptSubmit has duplicate passes"
  fi
}

check_C18g() {
  have_jq || return 0
  have_router_inputs || return 0
  # C18g: substantive routes receive the complete transitive policy closure;
  # pure questions do not pay for it.
  policy_got=$(bash "$KSH" resolve-task --prompt "update the prose in this document" 2>/dev/null \
    | jq -r '.task_contract.policy_rules | map(select(. != "subagents")) | sort | join(" ")')
  policy_want=$(printf '%s\n' $TASK_CONTRACT_RULES | sort | tr '\n' ' ' | sed 's/ $//')
  pure_policy=$(bash "$KSH" resolve-task --prompt "what is the weather" 2>/dev/null \
    | jq -r '.task_contract.policy_rules | length')
  if [ "$policy_got" = "$policy_want" ] && [ "$pure_policy" = "0" ]; then
    ok "resolve-task supplies the closed substantive policy bundle and keeps pure questions lean"
  else
    bad "resolve-task policy closure drift (got='$policy_got' want='$policy_want' pure=$pure_policy)"
  fi
}
