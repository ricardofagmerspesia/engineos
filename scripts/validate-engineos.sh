#!/usr/bin/env bash
# EngineOS self-integrity check (gap G11 of docs/specs/2026-08-02-ai-methodology-integration-analysis.md).
#
# CLAUDE.md states several invariants and enforces them by human diligence:
#   - "A row's load list must be closed" (deferred rules must travel together);
#   - "this table is the human mirror, keep them in sync" (router vs routing-map.sh);
#   - "The hooks need jq" (four hooks no-op silently without it).
# Every one of those is checkable. This script checks them.
#
# Run: scripts/validate-engineos.sh     Exit: 0 all clear, 1 any violation.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

pass=0; fail=0
ok()  { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

# Always-on rules are loaded on every session, so a row need not list them as
# deferral targets. Source of truth: the "Always-on rules" @-imports in CLAUDE.md.
ALWAYS_ON=$(sed -n 's|^@rules/\([a-z-]*\)\.md.*|\1|p' CLAUDE.md | sort -u)
is_always_on() { case " $(echo "$ALWAYS_ON" | tr '\n' ' ') " in *" $1 "*) return 0 ;; esac; return 1; }

RULE_NAMES=$(cd rules && ls ./*.md 2>/dev/null | sed 's|^\./||; s|\.md$||')

echo "== EngineOS integrity =="

# ---------------------------------------------------------------- C1: tooling
if command -v jq >/dev/null 2>&1; then
  ok "jq present (route-before-change, mark-unrecorded, record-verify, task-scale-advisor need it)"
else
  bad "jq missing — those four hooks will exit 0 silently and routing/change-record gates will not fire"
fi

# ------------------------------------------------- C2: always-on imports exist
if [ -z "$ALWAYS_ON" ]; then
  bad "CLAUDE.md declares no @rules/*.md always-on imports"
else
  miss=""
  for r in $ALWAYS_ON; do [ -f "rules/$r.md" ] || miss="$miss $r"; done
  [ -z "$miss" ] && ok "always-on imports resolve ($(echo "$ALWAYS_ON" | tr '\n' ' '))" \
                 || bad "always-on imports point at missing files:$miss"
fi

# ---------------------------------- C3/C4: every rules/X.md reference resolves
broken=""
for f in CLAUDE.md rules/*.md agents/*.md skills/*/SKILL.md skills/*/references/*.md commands/*.md; do
  [ -f "$f" ] || continue
  for ref in $(grep -oE 'rules/[a-z0-9-]+\.md' "$f" 2>/dev/null | sort -u); do
    [ -f "$ref" ] || broken="$broken $f->$ref"
  done
done
[ -z "$broken" ] && ok "all rules/*.md cross-references resolve" \
                 || bad "dangling rule references:$broken"

# ------------------------------------------------------ C5: router row closure
# Build the deferral graph: rule R defers to S when R's text names S.md and S is
# not always-on. Then every router row loading R must also load S.
deferrals_of() {
  local r="$1" out=""
  for s in $RULE_NAMES; do
    [ "$s" = "$r" ] && continue
    is_always_on "$s" && continue
    grep -qE "(rules/)?\`?${s}\.md" "rules/$r.md" 2>/dev/null && out="$out $s"
  done
  echo "$out"
}

violations=""
row=0
while IFS= read -r line; do
  case "$line" in
    '|'*'|'*) ;;
    *) continue ;;
  esac
  case "$line" in *'---'*) continue ;; esac
  case "$line" in *'| Load |'*|*'Intent (signals)'*) continue ;; esac
  loaded=$(printf '%s' "$line" | grep -oE 'rules/[a-z0-9-]+\.md' | sed 's|rules/||; s|\.md$||' | sort -u)
  [ -z "$loaded" ] && continue
  row=$((row+1))
  for r in $loaded; do
    is_always_on "$r" && continue
    for d in $(deferrals_of "$r"); do
      case " $(echo "$loaded" | tr '\n' ' ') " in
        *" $d "*) ;;
        *) violations="$violations\n  row $row loads '$r' which defers to '$d' — '$d' is not in the row" ;;
      esac
    done
  done
done < CLAUDE.md
if [ -z "$violations" ]; then
  ok "router load lists are closed ($row rows with rule loads checked)"
else
  bad "router closure rule violated:$(printf '%b' "$violations")"
fi

# ------------------------- C5b: always-on files reference only always-on rules
# CLAUDE.md: "Always-on files ... may point only at other always-on files, at repo
# templates, or at registries/*.json." Enforced here rather than trusted.
ao_viol=""
for r in $ALWAYS_ON; do
  for s in $RULE_NAMES; do
    [ "$s" = "$r" ] && continue
    is_always_on "$s" && continue
    grep -qE "(rules/)?\`?${s}\.md" "rules/$r.md" 2>/dev/null && ao_viol="$ao_viol $r->$s"
  done
done
[ -z "$ao_viol" ] && ok "always-on rules reference only always-on rules" \
                  || bad "always-on rule points at a route-loaded rule:$ao_viol"

# ------------------- C6/C7/C8: guidance-string targets all exist (registry)
# Pre-P2 these grepped hooks/routing-map.sh's echo literals; the map is now a
# shim over kernel.sh and guidance lives ONLY in registries/routing.json —
# so the same three checks read the registry's hook_guidance strings instead.
map=hooks/routing-map.sh
RJSON=registries/routing.json
missing_agents=""; missing_skills=""; missing_rules=""
if command -v jq >/dev/null 2>&1 && [ -f "$RJSON" ]; then
  GUIDANCE=$(jq -r '.domains[].hook_guidance' "$RJSON")
  for a in $(printf '%s' "$GUIDANCE" | grep -oE 'agent:[a-z-]+' | sed 's/agent://' | sort -u); do
    [ -f "agents/$a.md" ] || missing_agents="$missing_agents $a"
  done
  for s in $(printf '%s' "$GUIDANCE" | grep -oE 'skill:[a-z-]+' | sed 's/skill://' | sort -u); do
    [ -f "skills/$s/SKILL.md" ] || missing_skills="$missing_skills $s"
  done
  # guidance writes chained rule lists: "rules/backend.md+architecture.md+data.md"
  for r in $(printf '%s' "$GUIDANCE" | grep -oE '(rules/|\+)[a-z0-9-]+\.md' | sed 's|^rules/||; s|^+||; s|\.md$||' | sort -u); do
    [ -f "rules/$r.md" ] || missing_rules="$missing_rules $r"
  done
  [ -z "$missing_agents" ] && ok "guidance agents all exist" || bad "hook_guidance names missing agents:$missing_agents"
  [ -z "$missing_skills" ] && ok "guidance skills all exist" || bad "hook_guidance names missing skills:$missing_skills"
  [ -z "$missing_rules"  ] && ok "guidance rules all exist"  || bad "hook_guidance names missing rules:$missing_rules"
fi

# ------------------------------------------- C9/C10/C11: agent contract checks
bad_fm=""; bad_ret=""; bad_cmd=""
for f in agents/*.md; do
  base=$(basename "$f" .md)
  name=$(sed -n 's/^name: *//p' "$f" | head -1)
  desc=$(sed -n 's/^description: *//p' "$f" | head -1)
  tools=$(sed -n 's/^tools: *//p' "$f" | head -1)
  [ "$name" = "$base" ] || bad_fm="$bad_fm ${base}(name='$name')"
  [ -n "$desc"  ] || bad_fm="$bad_fm ${base}(no-description)"
  [ -n "$tools" ] || bad_fm="$bad_fm ${base}(no-tools)"

  grep -q '^## Return format' "$f" || bad_ret="$bad_ret $base(section)"
  grep -q '^status: OK | DEGRADED | CRITICAL | BLOCKED | FAILED$' "$f" || bad_ret="$bad_ret $base(enum)"

  [ -f "commands/agents/$base.md" ] || bad_cmd="$bad_cmd $base"
  # "Alias: <x> (invocable by this name)" must also have a slash command
  for al in $(printf '%s' "$desc" | grep -oE 'Alias(es)?: [a-z-]+' | sed 's/.*: //'); do
    [ -f "commands/agents/$al.md" ] || bad_cmd="$bad_cmd $base->alias:$al"
  done
done
[ -z "$bad_fm"  ] && ok "agent frontmatter complete and name matches filename ($(ls agents/*.md | wc -l | tr -d ' ') agents)" || bad "agent frontmatter problems:$bad_fm"
[ -z "$bad_ret" ] && ok "every agent declares the canonical Return format envelope"                                        || bad "agent return-format problems:$bad_ret"
[ -z "$bad_cmd" ] && ok "every agent and alias has a slash command"                                                        || bad "missing slash commands:$bad_cmd"

# ------------------------------------------------------- C12: skill contracts
bad_skill=""
for d in skills/*/; do
  s=$(basename "$d")
  [ -f "$d/SKILL.md" ] || { bad_skill="$bad_skill $s(no-SKILL.md)"; continue; }
  n=$(sed -n 's/^name: *//p' "$d/SKILL.md" | head -1)
  dsc=$(sed -n 's/^description: *//p' "$d/SKILL.md" | head -1)
  [ "$n" = "$s" ] || bad_skill="$bad_skill $s(name='$n')"
  [ -n "$dsc" ]   || bad_skill="$bad_skill $s(no-description)"
done
[ -z "$bad_skill" ] && ok "every skill has SKILL.md with matching name and a description" || bad "skill problems:$bad_skill"

# ----------------------------------------------- C14: registries are coherent
# The point of registries/routing.json is that the CLAUDE.md table, the hook map
# and the registry can no longer drift apart in silence.
if ! command -v jq >/dev/null 2>&1; then
  bad "registry checks skipped — jq missing"
else
  reg_bad=""
  for f in registries/*.json; do
    jq empty "$f" >/dev/null 2>&1 || reg_bad="$reg_bad $f"
  done
  [ -z "$reg_bad" ] && ok "registries are valid JSON" || bad "malformed registries:$reg_bad"

  R=registries/routing.json
  if [ -f "$R" ]; then
    # Pre-P2, two checks grepped routing-map.sh's echo literals against the
    # registry. The map is a shim now — guidance is emitted FROM the registry
    # via kernel.sh, so that drift class is structurally dead. Its successors
    # are the C17 behavioral checks below (sample paths route correctly, the
    # shim contains no literals).

    # the rules list must agree with the rules named inside the guidance string
    mism=""
    while IFS= read -r id; do
      declared=$(jq -r --arg i "$id" '.domains[] | select(.id==$i) | .rules[]' "$R" | sort | tr '\n' ' ')
      g=$(jq -r --arg i "$id" '.domains[] | select(.id==$i) | .hook_guidance' "$R")
      infrom=$(printf '%s' "$g" | grep -oE '(rules/|\+)[a-z0-9-]+\.md' | sed 's|^rules/||; s|^+||; s|\.md$||' | sort | tr '\n' ' ')
      [ "$declared" = "$infrom" ] || mism="$mism $id(declared='$declared' guidance='$infrom')"
    done < <(jq -r '.domains[].id' "$R")
    [ -z "$mism" ] && ok "registry rules[] match the rules named in each hook_guidance" \
                   || bad "registry rules/guidance mismatch:$mism"

    # precedence must list every domain exactly once, in routing-map.sh arm order
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

    # risk floors must be a known tier
    rf=$(jq -r '.domains[] | select(.risk_floor|test("^(low|medium|high)$")|not) | .id' "$R")
    [ -z "$rf" ] && ok "every registry domain declares a valid risk floor" || bad "invalid risk_floor on:$rf"
  else
    bad "registries/routing.json missing"
  fi

  D=registries/decision-rules.json
  if [ -f "$D" ]; then
    dupes=$(jq -r '[.rules[].id] | group_by(.) | map(select(length>1)) | flatten | join(" ")' "$D")
    [ -z "$dupes" ] && ok "decision rule ids are unique" || bad "duplicate decision rule ids: $dupes"

    empty_then=$(jq -r '.rules[] | select((.then.require // [] | length)==0 and (.then.prefer // "")=="") | .id' "$D")
    [ -z "$empty_then" ] && ok "every decision rule requires or prefers something" \
                         || bad "decision rules with an empty then:$empty_then"

    # a signal that is not a valid ERE would silently never match in gate-advisor.sh
    badsig=""
    while IFS= read -r s; do
      printf 'x' | grep -qE "$s" 2>/dev/null || [ $? -eq 1 ] || badsig="$badsig [$s]"
    done < <(jq -r '.rules[].signals[]?' "$D")
    [ -z "$badsig" ] && ok "every decision rule signal is a valid regex" || bad "invalid signals:$badsig"
  else
    bad "registries/decision-rules.json missing"
  fi

  # ------------------------------------- C15: capability/agent registries
  # registries/capabilities.json + registries/agents.json (Phase 1
  # registry-kernel, docs/specs/2026-08-05-phase1-registry-kernel-design.md).
  # JSON-validity is already covered by the registries/*.json loop above.
  C=registries/capabilities.json
  A=registries/agents.json
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

  # --------------------- C16: decision-kernel registries (P1: policy as data)
  # models.json, intents.json, policy.json are the machine-readable form of
  # rules/models.md, the CLAUDE.md router table, and the always-on policy prose
  # (risk-autonomy/gates/parallelism). Prose stays the human mirror; these
  # checks are what keeps mirror and data from drifting apart in silence —
  # same discipline as routing.json above.
  # Spec: docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md
  MJ=registries/models.json
  IJ=registries/intents.json
  PJ=registries/policy.json

  if [ -f "$MJ" ]; then
    # escalation_order is a permutation of tiers[].id
    eo=$(jq -r '.escalation_order | sort | join(" ")' "$MJ")
    ti=$(jq -r '[.tiers[].id] | sort | join(" ")' "$MJ")
    [ "$eo" = "$ti" ] && ok "models.json escalation_order covers every tier exactly once" \
                      || bad "models.json escalation_order '$eo' != tier ids '$ti'"

    # escalates_to follows escalation_order: each tier points at its successor,
    # the strongest at null
    chain_bad=$(jq -r '
      .escalation_order as $o
      | [ .tiers[] | . as $t
          | ($o | index($t.id)) as $i
          | (if $i == (($o|length)-1) then null else $o[$i+1] end) as $want
          | select($t.escalates_to != $want) | $t.id ] | join(" ")' "$MJ")
    [ -z "$chain_bad" ] && ok "models.json escalates_to chain follows escalation_order" \
                        || bad "models.json escalates_to breaks the order on:$chain_bad"

    # every work_type's tier resolves
    wt_bad=$(jq -r '[.tiers[].id] as $t | [.work_types[] | select(.tier as $x | $t | index($x) | not) | .id] | join(" ")' "$MJ")
    [ -z "$wt_bad" ] && ok "models.json work_type tiers all resolve" \
                     || bad "models.json work_types with unknown tier:$wt_bad"

    # model bindings unique
    dupm=$(jq -r '[.tiers[].model] | group_by(.) | map(select(length>1)) | flatten | unique | join(" ")' "$MJ")
    [ -z "$dupm" ] && ok "models.json model bindings are unique" || bad "models.json duplicate model bindings: $dupm"

    # prose mirror: every tier's model appears in rules/models.md, and the two
    # anchorable rows (ADR, code review) bind the model the registry says
    pm=""
    for m in $(jq -r '.tiers[].model' "$MJ"); do
      grep -q "\`$m\`" rules/models.md || pm="$pm $m"
    done
    [ -z "$pm" ] && ok "every models.json model appears in rules/models.md" \
                 || bad "models.json models missing from rules/models.md prose:$pm"

    adr_tier=$(jq -r '.work_types[] | select(.id=="adr") | .tier' "$MJ")
    adr_model=$(jq -r --arg t "$adr_tier" '.tiers[] | select(.id==$t) | .model' "$MJ")
    grep -E '^\|' rules/models.md | grep -i 'ADR' | grep -q "\`$adr_model\`" \
      && ok "rules/models.md ADR row binds the registry's tier model ($adr_model)" \
      || bad "rules/models.md ADR row does not bind '$adr_model' (models.json adr tier's model)"

    cr_tier=$(jq -r '.work_types[] | select(.id=="code-review") | .tier' "$MJ")
    cr_model=$(jq -r --arg t "$cr_tier" '.tiers[] | select(.id==$t) | .model' "$MJ")
    grep -E '^\|' rules/models.md | grep -i 'code review' | grep -q "\`$cr_model\`" \
      && ok "rules/models.md code-review row binds the registry's tier model ($cr_model)" \
      || bad "rules/models.md code-review row does not bind '$cr_model' (models.json code-review tier's model)"

    # every agent's frontmatter model is a model models.json binds — this is
    # what replaced the removed "no agent declares fable" prose ban
    known_models=$(jq -r '[.tiers[].model] | join(" ")' "$MJ")
    am_bad=""
    for f in agents/*.md; do
      m=$(sed -n 's/^model: *//p' "$f" | head -1)
      [ -z "$m" ] && continue
      case " $known_models " in *" $m "*) ;; *) am_bad="$am_bad $(basename "$f" .md)($m)" ;; esac
    done
    [ -z "$am_bad" ] && ok "every agent frontmatter model is bound in models.json" \
                     || bad "agent frontmatter models unknown to models.json:$am_bad"
  else
    bad "registries/models.json missing"
  fi

  if [ -f "$IJ" ]; then
    dupi=$(jq -r '[.intents[].id] | group_by(.) | map(select(length>1)) | flatten | unique | join(" ")' "$IJ")
    [ -z "$dupi" ] && ok "intent ids are unique" || bad "duplicate intent ids: $dupi"

    # unqualified rules/agents resolve; unqualified skills resolve unless the
    # intent's note marks them external (spec deviation 2: code-review)
    ir=""
    for r in $(jq -r '.intents[].rules[]?' "$IJ" | sort -u); do
      [ -f "rules/$r.md" ] || ir="$ir rule:$r"
    done
    for a in $(jq -r '.intents[].agents[]?' "$IJ" | sort -u); do
      [ -f "agents/$a.md" ] || ir="$ir agent:$a"
    done
    while IFS=$'\t' read -r s note; do
      case "$s" in *:*) continue ;; esac
      [ -f "skills/$s/SKILL.md" ] && continue
      # exemption is case-insensitive: notes write "EXTERNAL" for emphasis
      case "$(printf '%s' "$note" | tr '[:upper:]' '[:lower:]')" in
        *external*) ;;
        *) ir="$ir skill:$s" ;;
      esac
    done < <(jq -r '.intents[] | .note as $n | .skills[]? | [., ($n // "")] | @tsv' "$IJ")
    [ -z "$ir" ] && ok "intents.json rules, skills and agents all resolve" \
                 || bad "intents.json names missing targets:$ir"

    # hook_mirrored <=> domain, both directions
    hm_bad=$(jq -r '[.intents[] | select((.hook_mirrored == true) != (has("domain") and .domain != null)) | .id] | join(" ")' "$IJ")
    [ -z "$hm_bad" ] && ok "hook_mirrored and domain agree on every intent" \
                     || bad "hook_mirrored/domain mismatch on:$hm_bad"

    # every domain FK resolves; mirrored rules[] and risk_floor equal routing.json's
    fk_bad=""
    while IFS= read -r id; do
      dom=$(jq -r --arg i "$id" '.intents[] | select(.id==$i) | .domain' "$IJ")
      jq -e --arg d "$dom" '.domains[] | select(.id==$d)' "$R" >/dev/null 2>&1 || { fk_bad="$fk_bad $id->$dom"; continue; }
      irules=$(jq -r --arg i "$id" '.intents[] | select(.id==$i) | .rules | join(",")' "$IJ")
      drules=$(jq -r --arg d "$dom" '.domains[] | select(.id==$d) | .rules | join(",")' "$R")
      [ "$irules" = "$drules" ] || fk_bad="$fk_bad $id(rules:'$irules'!='$drules')"
      ifloor=$(jq -r --arg i "$id" '.intents[] | select(.id==$i) | .risk_floor' "$IJ")
      dfloor=$(jq -r --arg d "$dom" '.domains[] | select(.id==$d) | .risk_floor' "$R")
      [ "$ifloor" = "$dfloor" ] || fk_bad="$fk_bad $id(floor:'$ifloor'!='$dfloor')"
    done < <(jq -r '.intents[] | select(.hook_mirrored == true) | .id' "$IJ")
    [ -z "$fk_bad" ] && ok "every hook-mirrored intent matches its routing.json domain (rules, floor)" \
                     || bad "intent/routing mismatches:$fk_bad"

    # every routing domain claimed exactly once
    claim_bad=""
    while IFS= read -r d; do
      n=$(jq -r --arg d "$d" '[.intents[] | select(.domain==$d)] | length' "$IJ")
      [ "$n" = "1" ] || claim_bad="$claim_bad $d(x$n)"
    done < <(jq -r '.domains[].id' "$R")
    [ -z "$claim_bad" ] && ok "every routing.json domain is claimed by exactly one intent" \
                        || bad "routing domains not claimed exactly once:$claim_bad"

    # model_tier and risk_floor from closed sets
    it_bad=$(jq -r --slurpfile m "$MJ" '[.intents[] | select(.model_tier != null) | select(.model_tier as $t | $m[0].tiers | map(.id) | index($t) | not) | .id] | join(" ")' "$IJ")
    [ -z "$it_bad" ] && ok "every intent model_tier resolves in models.json" || bad "intents with unknown model_tier:$it_bad"
    if_bad=$(jq -r '[.intents[] | select(.risk_floor != null) | select(.risk_floor | test("^(low|medium|high)$") | not) | .id] | join(" ")' "$IJ")
    [ -z "$if_bad" ] && ok "every intent risk_floor is a valid tier" || bad "intents with invalid risk_floor:$if_bad"

    # drift alarm, exact: intents == CLAUDE.md router data rows + 1 (the
    # store-release row is two intents — spec deviation 1). Exact on purpose:
    # a prose row added or removed without a registry update fails either way.
    prose_rows=$(( $(sed -n '/^| Intent (signals) | Load |/,/^## /p' CLAUDE.md | grep -c '^|') - 2 ))
    reg_rows=$(jq -r '.intents | length' "$IJ")
    [ "$reg_rows" -eq $((prose_rows + 1)) ] \
      && ok "intent count matches the CLAUDE.md router table ($prose_rows rows + store-release split)" \
      || bad "intent drift: registry has $reg_rows, CLAUDE.md table has $prose_rows rows (expected registry = rows+1)"
  else
    bad "registries/intents.json missing"
  fi

  if [ -f "$PJ" ]; then
    [ "$(jq -r '.risk.aggregation' "$PJ")" = "max" ] \
      && ok "policy.json risk aggregation is max (risk never averages)" \
      || bad "policy.json risk.aggregation is not 'max'"

    pin=$(jq -r '[.risk.inputs[].id] | sort | join(" ")' "$PJ")
    want_in="blast-radius contract-surface data-sensitivity reversibility spend"
    [ "$pin" = "$want_in" ] && ok "policy.json carries the five risk inputs" \
                            || bad "policy.json risk inputs '$pin' != '$want_in'"

    plv=$(jq -r '[.autonomy.levels[].id] | join(" ")' "$PJ")
    [ "$plv" = "A0 A1 A2 A3 A4" ] && ok "policy.json autonomy levels are A0..A4 in order" \
                                  || bad "policy.json autonomy levels '$plv' != 'A0 A1 A2 A3 A4'"

    ceil_bad=$(jq -r '[.autonomy.levels[].id] as $l | .autonomy.ceiling_by_risk | to_entries | [.[] | select((.key|test("^(low|medium|high)$")|not) or (.value as $v | $l | index($v) | not)) | .key] | join(" ")' "$PJ")
    ceil_n=$(jq -r '.autonomy.ceiling_by_risk | length' "$PJ")
    [ -z "$ceil_bad" ] && [ "$ceil_n" = "3" ] && ok "policy.json autonomy ceiling covers low/medium/high with valid levels" \
                                              || bad "policy.json ceiling_by_risk problems:$ceil_bad (entries: $ceil_n)"

    glad=$(jq -r '.gates.ladder | join(" ")' "$PJ")
    [ "$glad" = "discovery design implementation validation release" ] \
      && ok "policy.json gate ladder matches rules/gates.md" \
      || bad "policy.json gate ladder '$glad' unexpected"

    gcov=$(jq -r '.gates.ladder as $l | .gates.by_risk | to_entries | [.[] | select((.value | keys | sort) != ($l | sort)) | .key] | join(" ")' "$PJ")
    [ -z "$gcov" ] && ok "policy.json gates.by_risk covers every ladder gate for every tier" \
                   || bad "policy.json by_risk incomplete for:$gcov"

    nr=$(jq -r '.retry.never_retry | length' "$PJ")
    [ "$nr" -ge 4 ] && ok "policy.json never_retry list intact ($nr entries)" \
                    || bad "policy.json never_retry has only $nr entries"

    # prose-number mirrors: the numbers live in the prose sentences below; a
    # prose edit that changes them without a registry bump fails here, and a
    # registry edit without the prose fails the same check from the other side
    cap_prose=$(grep -o 'Cap concurrency at ~[0-9]*' rules/parallelism.md | grep -o '[0-9]*$')
    cap_reg=$(jq -r '.parallelism.wave_concurrency_cap' "$PJ")
    [ -n "$cap_prose" ] && [ "$cap_prose" = "$cap_reg" ] \
      && ok "wave cap agrees: policy.json=$cap_reg, rules/parallelism.md=~$cap_prose" \
      || bad "wave cap drift: policy.json=$cap_reg vs rules/parallelism.md='~${cap_prose:-missing}'"

    grep -qi 'two attempts per unit, one escalation' rules/parallelism.md \
      && [ "$(jq -r '.retry.max_attempts_per_unit' "$PJ")" = "2" ] \
      && [ "$(jq -r '.retry.escalations' "$PJ")" = "1" ] \
      && ok "retry bound agrees: 2 attempts + 1 escalation in both prose and policy.json" \
      || bad "retry-bound drift between rules/parallelism.md and policy.json"

    spec_prose=$(grep -o 'touching >[0-9]* files' CLAUDE.md | grep -o '[0-9]*')
    spec_reg=$(jq -r '.gates.spec_threshold.files_greater_than' "$PJ")
    [ -n "$spec_prose" ] && [ "$spec_prose" = "$spec_reg" ] \
      && ok "spec threshold agrees: >$spec_reg files in both CLAUDE.md and policy.json" \
      || bad "spec-threshold drift: policy.json=$spec_reg vs CLAUDE.md '>${spec_prose:-missing}'"

    fan_prose=$(grep -o '\*\*>[0-9]* files\*\*' rules/parallelism.md | grep -o '[0-9]*')
    fan_reg=$(jq -r '.parallelism.fanout_signals.files_greater_than' "$PJ")
    [ -n "$fan_prose" ] && [ "$fan_prose" = "$fan_reg" ] \
      && ok "fan-out threshold agrees: >$fan_reg files in both rules/parallelism.md and policy.json" \
      || bad "fan-out threshold drift: policy.json=$fan_reg vs rules/parallelism.md '>${fan_prose:-missing}'"
  else
    bad "registries/policy.json missing"
  fi

  # ------------------------ C17: kernel resolver + routing patterns (P2)
  # scripts/kernel.sh is the one implementation of path->domain matching;
  # routing.json carries the patterns and a self-validating sample_path per
  # domain. These behavioral checks replace the pre-P2 string-grepping of
  # routing-map.sh's case ladder (see C14 note above).
  # Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
  KSH=scripts/kernel.sh
  if [ -f "$KSH" ] && [ -f "$R" ]; then
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

    # C17b: every sample_path actually routes to its own domain through the
    # kernel — validates patterns AND precedence (a shadowed sample fails)
    r_bad=""
    while IFS=$'\t' read -r d sp; do
      got=$(bash "$KSH" route-path "$sp" 2>/dev/null | jq -r '.domain // "null"')
      [ "$got" = "$d" ] || r_bad="$r_bad $d(sample->'$got')"
    done < <(jq -r '.domains[] | [.id, .sample_path] | @tsv' "$R")
    [ -z "$r_bad" ] && ok "every domain sample_path routes to its own domain via kernel.sh" \
                    || bad "sample_path routing failures:$r_bad"

    # C17c: exclusions still exclude
    excl=$(bash "$KSH" route-path "/tmp/some-repo/.engineos/changes/x.ts" 2>/dev/null | jq -r '.excluded')
    excl2=$(bash "$KSH" route-path "/tmp/some-repo/README.md" 2>/dev/null | jq -r '.excluded')
    [ "$excl" = "true" ] && [ "$excl2" = "true" ] \
      && ok "kernel.sh route-path honors the excluded patterns" \
      || bad "kernel.sh exclusion broken (.engineos=$excl, README.md=$excl2)"

    # C17d: routing-map.sh is a shim — it calls the kernel and carries no
    # guidance literal of its own (a reintroduced literal is a second source
    # of truth, the exact drift P2 removed)
    if grep -q 'kernel\.sh' "$map" && ! grep -q 'echo "rules/' "$map"; then
      ok "routing-map.sh is a shim over kernel.sh (no guidance literals)"
    else
      bad "routing-map.sh is not a pure shim: must call kernel.sh and carry no 'echo \"rules/' literal"
    fi

    # C17e: prompt_signals EREs exist and are valid regexes (an invalid one
    # would make kernel.sh scale silently mis-answer, same failure class as
    # decision-rules signals)
    ps_bad=""
    for k in action scale spec design_strong design_weak; do
      s=$(jq -r --arg k "$k" '.parallelism.prompt_signals[$k] // empty' "$PJ")
      if [ -z "$s" ]; then ps_bad="$ps_bad $k(missing)"; continue; fi
      printf 'x' | grep -qE "$s" 2>/dev/null || [ $? -eq 1 ] || ps_bad="$ps_bad $k(invalid)"
    done
    [ -z "$ps_bad" ] && ok "policy.json prompt_signals present and valid EREs" \
                     || bad "policy.json prompt_signals problems:$ps_bad"
  else
    bad "scripts/kernel.sh or registries/routing.json missing — kernel checks skipped"
  fi
fi

# ------------------------------------------------------------ C13: no empties
empties=""
for f in rules/*.md agents/*.md skills/*/SKILL.md; do
  [ -s "$f" ] || empties="$empties $f"
done
[ -z "$empties" ] && ok "no empty rule/agent/skill documents" || bad "empty documents:$empties"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
