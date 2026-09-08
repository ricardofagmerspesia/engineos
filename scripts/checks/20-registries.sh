# shellcheck shell=bash
# Checks on registries/routing.json, decision-rules.json, capabilities.json and
# agents.json — the registries the routing hot path and the capability bindings
# read. The decision-kernel registries (models, intents, policy) are C16, in
# 40-decision-registries.sh.

# ------------------- C6/C7/C8: routing targets all exist (registry)
# Pre-P2 these grepped a hand-written case ladder's echo literals; then they
# parsed the registry's hook_guidance strings. That string is now DERIVED by
# src/kernel/route.ts from the structured fields, so the three checks read the
# structured fields themselves — agent, skills[], rules[] — and the guidance
# string can no longer name a target the row does not declare.
scan_guidance_targets() {
  command -v jq >/dev/null 2>&1 && [ -f "$RJSON" ] || return 1
  missing_agents=""; missing_skills=""; missing_rules=""
  for a in $(jq -r '.domains[].agent // empty' "$RJSON" | sort -u); do
    [ -f "agents/$a.md" ] || missing_agents="$missing_agents $a"
  done
  for s in $(jq -r '.domains[].skills[]?' "$RJSON" | sort -u); do
    [ -f "skills/$s/SKILL.md" ] || missing_skills="$missing_skills $s"
  done
  for r in $(jq -r '.domains[].rules[]?' "$RJSON" | sort -u); do
    [ -f "rules/$r.md" ] || missing_rules="$missing_rules $r"
  done
}

check_C6() {
  scan_guidance_targets || return 0
  [ -z "$missing_agents" ] && ok "guidance agents all exist" || bad "routing.json names missing agents:$missing_agents"
}

check_C7() {
  scan_guidance_targets || return 0
  [ -z "$missing_skills" ] && ok "guidance skills all exist" || bad "routing.json names missing skills:$missing_skills"
}

check_C8() {
  scan_guidance_targets || return 0
  [ -z "$missing_rules"  ] && ok "guidance rules all exist"  || bad "routing.json names missing rules:$missing_rules"
}

# ----------------------------------------------- C14: registries are coherent
# The point of registries/routing.json is that the CLAUDE.md table, the hook map
# and the registry can no longer drift apart in silence.
check_C14() {
  have_jq || return 0
  reg_bad=""
  for f in registries/*.json; do
    jq empty "$f" >/dev/null 2>&1 || reg_bad="$reg_bad $f"
  done
  [ -z "$reg_bad" ] && ok "registries are valid JSON" || bad "malformed registries:$reg_bad"

  if [ -f "$R" ]; then
    # Pre-P2, two checks grepped a hand-written case ladder's echo literals
    # against the registry. Guidance is emitted FROM the registry via kernel.sh
    # now, so that drift class is structurally dead. Its successor is the C17
    # behavioral check below (every sample path routes correctly).

    # precedence must list every domain exactly once, in the registry's own domain order
    p_reg=$(jq -r '.precedence | join(" ")' "$R")
    p_dom=$(jq -r '[.domains[].id] | join(" ")' "$R")
    [ "$p_reg" = "$p_dom" ] && ok "registry precedence covers every domain in map order" \
      || bad "precedence '$p_reg' does not match domain order '$p_dom'"

    # every named agent and skill resolves
    ra=""
    for a in $(jq -r '.domains[].agent' "$R" | sort -u); do [ -f "agents/$a.md" ] || ra="$ra $a"; done
    for s in $(jq -r '.domains[].skills[]?' "$R" | sort -u); do [ -f "skills/$s/SKILL.md" ] || ra="$ra skill:$s"; done
    for r in $(jq -r '.domains[].rules[]' "$R" | sort -u); do [ -f "rules/$r.md" ] || ra="$ra rule:$r"; done
    [ -z "$ra" ] && ok "registry agents, skills and rules all exist" || bad "registry names missing targets:$ra"
  else
    bad "registries/routing.json missing"
  fi

  if [ -f "$D" ]; then
    dupes=$(jq -r '[.rules[].id] | group_by(.) | map(select(length>1)) | flatten | join(" ")' "$D")
    [ -z "$dupes" ] && ok "decision rule ids are unique" || bad "duplicate decision rule ids: $dupes"

    empty_then=$(jq -r '.rules[] | select((.then.require // [] | length)==0 and (.then.prefer // "")=="") | .id' "$D")
    [ -z "$empty_then" ] && ok "every decision rule requires or prefers something" \
                         || bad "decision rules with an empty then:$empty_then"

    # a signal that is not a valid ERE would silently never match in the kernel's keyword tier
    badsig=""
    while IFS= read -r s; do
      printf 'x' | grep -qE "$s" 2>/dev/null || [ $? -eq 1 ] || badsig="$badsig [$s]"
    done < <(jq -r '.rules[].signals[]?' "$D")
    [ -z "$badsig" ] && ok "every decision rule signal is a valid regex" || bad "invalid signals:$badsig"

    # Verification policy is deliberately conditional on task scope. A plain
    # referential check cannot catch the registry saying "always test" while
    # the owning rule says tests are opt-in, so pin the behavioral agreement.
    verify_source=$(jq -r '.rules[] | select(.id=="rule-verification") | .source' "$D")
    verify_require=$(jq -r '[.rules[] | select(.id=="rule-verification") | .then.require[]] | sort | join(" ")' "$D")
    verify_expected="lint output-shown tests-when-in-scope typecheck"
    if [ "$verify_source" = "rules/verification.md" ] \
      && [ "$verify_require" = "$verify_expected" ] \
      && grep -q 'Tests join the gate ONLY when tests were ON' rules/verification.md \
      && grep -q '`rules/verification.md` owns which checks are in' rules/gates.md; then
      ok "verification policy agrees across registry, verification rule and gate"
    else
      bad "verification policy semantic drift: source='$verify_source' require='$verify_require'"
    fi
  else
    bad "registries/decision-rules.json missing"
  fi
}

# ------------------------------------- C15: capability/agent registries
# registries/capabilities.json + registries/agents.json (Phase 1
# registry-kernel, docs/specs/2026-08-05-phase1-registry-kernel-design.md).
# JSON-validity is already covered by C14's registries/*.json loop.
check_C15() {
  have_jq || return 0
  VALID_TIERS='^(cheap|build|design|most-capable)$'
  if [ -f "$C" ]; then
    ca=""
    for a in $(jq -r '.capabilities[].agent | select(. != null)' "$C" | sort -u); do
      [ -f "agents/$a.md" ] || ca="$ca $a"
    done
    [ -z "$ca" ] && ok "every capabilities.json agent binding resolves" || bad "capabilities.json names missing agents:$ca"

    ct=$(jq -r --arg re "$VALID_TIERS" '.capabilities[] | select(.model_tier|test($re)|not) | .id' "$C")
    [ -z "$ct" ] && ok "every capabilities.json entry declares a valid model tier" || bad "invalid model_tier on capability:$ct"
  else
    bad "registries/capabilities.json missing"
  fi

  if [ -f "$A" ]; then
    at=$(jq -r --arg re "$VALID_TIERS" '.agents[] | select(.model_tier|test($re)|not) | .name' "$A")
    [ -z "$at" ] && ok "every agents.json entry declares a valid model tier" || bad "invalid model_tier on agent:$at"

    aa=""
    for n in $(jq -r '.agents[].name' "$A"); do
      [ -f "agents/$n.md" ] || aa="$aa $n"
    done
    [ -z "$aa" ] && ok "every agents.json entry resolves to a file under agents/" || bad "agents.json names missing agent files:$aa"
  else
    bad "registries/agents.json missing"
  fi
}

# ------------------------------------- C15b: capability tier <-> agent tier
# A capability's model_tier must agree with its bound agent's tier in
# agents.json — the tier is declared by the agent (tier: frontmatter), and
# nothing else was comparing the two registries when they drifted apart.
# Ran unconditionally inside the old registry block; it is its own id now.
check_C15b() {
  have_jq || return 0
  [ -f "$C" ] && [ -f "$A" ] || return 0
  tm=$(jq -r --slurpfile ag "$A" '
    ($ag[0].agents | map({key: .name, value: .model_tier}) | from_entries) as $tiers
    | .capabilities[]
    | select(.agent != null and $tiers[.agent] != null and .model_tier != $tiers[.agent])
    | "\(.id)(\(.model_tier)!=\($tiers[.agent]))"' "$C" | tr '\n' ' ' | sed 's/ *$//')
  [ -z "$tm" ] && ok "every capability model_tier agrees with its agent's tier" || bad "capability/agent tier mismatch: $tm"
}
