#!/usr/bin/env bash
# EngineOS self-integrity check (gap G11 of docs/specs/2026-08-02-ai-methodology-integration-analysis.md).
#
# CLAUDE.md states several invariants and enforces them by human diligence:
#   - "A row's load list must be closed" (deferred rules must travel together);
#   - "this table is the human mirror, keep them in sync" (router vs routing-map.sh);
#   - "The hooks need jq" (six hooks no-op silently without it).
# Every one of those is checkable. This script checks them, plus the
# decision-kernel era's own checks (C16-C23): registries, kernel.sh, the
# router agent, handoff and change-record contracts, repair and telemetry.
#
# Run: scripts/validate-engineos.sh [--only C1,C2,C17]
# Exit: 0 selected checks clear, 1 any selected violation.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

ONLY="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --only) [ $# -ge 2 ] || { echo "--only requires a comma-separated check list" >&2; exit 2; }; ONLY="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
want() {
  [ "$ONLY" = "all" ] && return 0
  case ",$ONLY," in *",$1,"*) return 0 ;; esac
  return 1
}

pass=0; fail=0
ok()  { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

# Always-on rules and the resolver's closed substantive-task policy bundle need
# not be repeated in every row. The latter is asserted behaviorally in C18.
ALWAYS_ON=$(sed -n 's|^@rules/\([a-z-]*\)\.md.*|\1|p' CLAUDE.md | sort -u)
TASK_CONTRACT_RULES="gates models parallelism risk-autonomy verification"
is_always_on() { case " $(echo "$ALWAYS_ON" | tr '\n' ' ') " in *" $1 "*) return 0 ;; esac; return 1; }
is_task_contract_rule() { case " $TASK_CONTRACT_RULES " in *" $1 "*) return 0 ;; esac; return 1; }

RULE_NAMES=$(cd rules && ls ./*.md 2>/dev/null | sed 's|^\./||; s|\.md$||')

echo "== EngineOS integrity =="

# ---------------------------------------------------------------- C1: tooling
if want C1; then
if command -v jq >/dev/null 2>&1; then
  ok "jq present (route-before-change, mark-unrecorded, record-verify, prompt-advisor need it)"
else
  bad "jq missing — those four hooks will exit 0 silently and routing/change-record gates will not fire"
fi
fi

# ------------------------------------------------- C2: always-on imports exist
if want C2; then
if [ -z "$ALWAYS_ON" ]; then
  bad "CLAUDE.md declares no @rules/*.md always-on imports"
else
  miss=""
  for r in $ALWAYS_ON; do [ -f "rules/$r.md" ] || miss="$miss $r"; done
  [ -z "$miss" ] && ok "always-on imports resolve ($(echo "$ALWAYS_ON" | tr '\n' ' '))" \
                 || bad "always-on imports point at missing files:$miss"
fi
fi

# ---------------------------------- C3/C4: every rules/X.md reference resolves
if want C3-4; then
broken=""
for f in CLAUDE.md rules/*.md agents/*.md skills/*/SKILL.md skills/*/references/*.md commands/*.md; do
  [ -f "$f" ] || continue
  for ref in $(grep -oE 'rules/[a-z0-9-]+\.md' "$f" 2>/dev/null | sort -u); do
    [ -f "$ref" ] || broken="$broken $f->$ref"
  done
done
[ -z "$broken" ] && ok "all rules/*.md cross-references resolve" \
                 || bad "dangling rule references:$broken"
fi

# ------------------------------------------------------ C5: router row closure
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

violations=""
row=0
if want C5; then
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
    is_task_contract_rule "$r" && continue
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
fi

# ------------------------- C5b: always-on files reference only always-on rules
# CLAUDE.md: "Always-on files ... may point only at other always-on files, at repo
# templates, or at registries/*.json." Enforced here rather than trusted.
if want C5b; then
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
fi

# ------------------- C6/C7/C8: guidance-string targets all exist (registry)
# Pre-P2 these grepped hooks/routing-map.sh's echo literals; the map is now a
# shim over kernel.sh and guidance lives ONLY in registries/routing.json —
# so the same three checks read the registry's hook_guidance strings instead.
map=hooks/routing-map.sh
RJSON=registries/routing.json
if want C6-8; then
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
fi

# ------------------------------------------- C9/C10/C11: agent contract checks
if want C9-11; then
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
fi

# ------------------------------------------------------- C12: skill contracts
if want C12; then
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
fi

# ----------------------------------------------- C14: registries are coherent
# The point of registries/routing.json is that the CLAUDE.md table, the hook map
# and the registry can no longer drift apart in silence.
R=registries/routing.json
D=registries/decision-rules.json
C=registries/capabilities.json
A=registries/agents.json
MJ=registries/models.json
IJ=registries/intents.json
PJ=registries/policy.json
KSH=scripts/kernel.sh
REGISTRY_SELECTED=false
for check in C14 C15 C16 C17 C18 C19 C20 C21 C22 C23; do
  if want "$check"; then REGISTRY_SELECTED=true; break; fi
done
if [ "$REGISTRY_SELECTED" = "true" ]; then
if ! command -v jq >/dev/null 2>&1; then
  bad "registry checks skipped — jq missing"
else
  if want C14; then
  reg_bad=""
  for f in registries/*.json; do
    jq empty "$f" >/dev/null 2>&1 || reg_bad="$reg_bad $f"
  done
  [ -z "$reg_bad" ] && ok "registries are valid JSON" || bad "malformed registries:$reg_bad"

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

    # risk floors must be a known tier
    rf=$(jq -r '.domains[] | select(.risk_floor|test("^(low|medium|high)$")|not) | .id' "$R")
    [ -z "$rf" ] && ok "every registry domain declares a valid risk floor" || bad "invalid risk_floor on:$rf"
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
  fi

  # ------------------------------------- C15: capability/agent registries
  # registries/capabilities.json + registries/agents.json (Phase 1
  # registry-kernel, docs/specs/2026-08-05-phase1-registry-kernel-design.md).
  # JSON-validity is already covered by the registries/*.json loop above.
  if want C15; then
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
  fi

  # A capability's model_tier must agree with its bound agent's tier in
  # agents.json — the tier is declared by the agent (tier: frontmatter), and
  # nothing else was comparing the two registries when they drifted apart.
  if [ -f "$C" ] && [ -f "$A" ]; then
    tm=$(jq -r --slurpfile ag "$A" '
      ($ag[0].agents | map({key: .name, value: .model_tier}) | from_entries) as $tiers
      | .capabilities[]
      | select(.agent != null and $tiers[.agent] != null and .model_tier != $tiers[.agent])
      | "\(.id)(\(.model_tier)!=\($tiers[.agent]))"' "$C" | tr '\n' ' ' | sed 's/ *$//')
    [ -z "$tm" ] && ok "every capability model_tier agrees with its agent's tier" || bad "capability/agent tier mismatch: $tm"
  fi

  # --------------------- C16: decision-kernel registries (P1: policy as data)
  # models.json, intents.json, policy.json are the machine-readable form of
  # rules/models.md, the CLAUDE.md router table, and the always-on policy prose
  # (risk-autonomy/gates/parallelism). Prose stays the human mirror; these
  # checks are what keeps mirror and data from drifting apart in silence —
  # same discipline as routing.json above.
  # Spec: docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md
  if want C16; then
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

    # tier ids unique — a duplicated id makes every lookup below ambiguous
    dupt=$(jq -r '[.tiers[].id] | group_by(.) | map(select(length>1)) | flatten | unique | join(" ")' "$MJ")
    [ -z "$dupt" ] && ok "models.json tier ids are unique" || bad "models.json duplicate tier ids: $dupt"

    # Two tiers MAY share a model binding — build and design do today. The tier is
    # the contract, so a shared binding is legal, but it must be stated in the prose
    # (it makes one escalation step a no-op) rather than left for a reader to notice.
    dupm=$(jq -r '[.tiers[].model] | group_by(.) | map(select(length>1)) | flatten | unique | join(" ")' "$MJ")
    if [ -z "$dupm" ]; then
      ok "models.json model bindings are unique"
    elif grep -q 'bound to the same model' rules/models.md; then
      ok "models.json shares a binding ($dupm) and rules/models.md documents it"
    else
      bad "models.json duplicate model bindings ($dupm) not documented in rules/models.md"
    fi

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

    # Signals are matched as LITERAL phrases by kernel.sh route-intent, so a
    # signal carrying documentation metasyntax can never fire. Ten such signals
    # were copied verbatim out of CLAUDE.md's human-readable router table --
    # "should we use X or Y", "why does X happen", ">3 files" -- and silently
    # made seven intents unroutable. The table may keep its placeholders; the
    # registry is a matching engine and may not. Bare X/Y/N stand for
    # placeholders; > and the comparison glyph mark threshold notation, which
    # belongs in parallelism.fanout_signals, not in a phrase list.
    ms_bad=$(jq -r '
      [ .intents[] | .id as $i | (.signals // [])[]
        | select(test("\\b[XYN]\\b") or test(">") or test("≥"))
        | "\($i):\(.)" ] | join(" ")' "$IJ")
    [ -z "$ms_bad" ] && ok "no intents.json signal carries placeholder metasyntax" \
                     || bad "unmatchable signals (placeholder metasyntax):$ms_bad"

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
  fi

  # ------------------------ C17: kernel resolver + routing patterns (P2)
  # scripts/kernel.sh is the one implementation of path->domain matching;
  # routing.json carries the patterns and a self-validating sample_path per
  # domain. These behavioral checks replace the pre-P2 string-grepping of
  # routing-map.sh's case ladder (see C14 note above).
  # Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
  if want C17; then
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
    for k in action substantive_action scale spec design_strong design_weak; do
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

  # ---------------------------- C18: router agent wiring (P3)
  # scripts/kernel.sh route-escalate decides when the deterministic path is
  # not enough and a model (agents/router.md) must produce a dispatch plan.
  # Spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md
  ROUTER_MD=agents/router.md
  PROMPT_ADVISOR=hooks/prompt-advisor.sh
  HOOKS_JSON=hooks/hooks.json
  if want C18; then
  if [ -f "$KSH" ] && [ -f "$IJ" ] && [ -f "$C" ] && [ -f "$PJ" ]; then
    # C18a: capability binding — pinned specifically, not just "some valid tier"
    ra=$(jq -r '.capabilities[] | select(.id=="route") | .agent' "$C")
    rt=$(jq -r '.capabilities[] | select(.id=="route") | .model_tier' "$C")
    if [ "$ra" = "router" ] && [ "$rt" = "design" ] && [ -f "$ROUTER_MD" ]; then
      bound=$(bash "$KSH" capability route 2>/dev/null | jq -r '.bound')
      kmodel=$(bash "$KSH" capability route 2>/dev/null | jq -r '.model')
      fmodel=$(sed -n 's/^model: *//p' "$ROUTER_MD" | head -1)
      if [ "$bound" = "true" ] && [ "$kmodel" = "$fmodel" ]; then
        ok "route capability is bound to router (design/$fmodel)"
      else
        bad "route capability binding broken (bound=$bound, kernel model=$kmodel, agent frontmatter model=$fmodel)"
      fi
    else
      bad "route capability is not bound to agent=router/model_tier=design"
    fi

    # C18b: the agent actually calls the kernel — grep-checkable proxy for
    # "reasons only about the residue"
    if [ -f "$ROUTER_MD" ]; then
      kb_bad=""
      for lit in "kernel.sh route-escalate" "kernel.sh risk" "kernel.sh gates" "kernel.sh waves" "kernel.sh model"; do
        grep -qF "$lit" "$ROUTER_MD" || kb_bad="$kb_bad [$lit]"
      done
      [ -z "$kb_bad" ] && ok "agents/router.md calls every required kernel subcommand" \
                       || bad "router does not call the kernel for:$kb_bad"

      # C18c: read-only planner by tool absence, not by prompt discipline
      tools_line=$(sed -n 's/^tools: *//p' "$ROUTER_MD" | head -1)
      if printf '%s' "$tools_line" | grep -q 'Bash' \
         && ! printf '%s' "$tools_line" | grep -qE 'Edit|Write|Task'; then
        ok "router must not hold Edit/Write/Task — tools: $tools_line"
      else
        bad "router must not hold Edit/Write/Task (read-only-planner contract): $tools_line"
      fi
    else
      bad "agents/router.md missing"
    fi

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

    # C18f: the hot path is one registered adapter and one deep kernel call.
    if [ -x "$PROMPT_ADVISOR" ] \
       && jq -e '[.hooks.UserPromptSubmit[].hooks[]?.command] as $h | ($h|length)==1 and ($h[0]|test("prompt-advisor"))' "$HOOKS_JSON" >/dev/null 2>&1 \
       && grep -q 'resolve-task' "$PROMPT_ADVISOR" 2>/dev/null; then
      ok "hooks/prompt-advisor.sh is the single registered prompt adapter and calls resolve-task"
    else
      bad "prompt-advisor.sh registration/wiring incomplete or UserPromptSubmit has duplicate passes"
    fi

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
  else
    bad "kernel.sh, intents.json, capabilities.json or policy.json missing — router checks skipped"
  fi
  fi

  # ------------- C19: handoff template <-> registry section contract (P4)
  # The handoff intent's required-sections list is data (required_sections /
  # required_fields); templates/handoff.md is the checked surface; the CLAUDE.md
  # row is the checked human mirror. Same prose/data discipline as C16-C18.
  # Spec: docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md
  TPL=templates/handoff.md
  if want C19; then
  if [ -f "$IJ" ] && [ -f "$TPL" ]; then
    # C19a: the contract is data, not prose — and the prose list stays dead
    h_bad=""
    nsec=$(jq -r '[.intents[] | select(.id=="handoff") | .required_sections[]? | select(type=="string")] | length' "$IJ")
    nfld=$(jq -r '[.intents[] | select(.id=="handoff") | .required_fields[]? | select(type=="string")] | length' "$IJ")
    [ "${nsec:-0}" -ge 1 ] || h_bad="$h_bad required_sections-missing-or-empty"
    [ "${nfld:-0}" -ge 1 ] || h_bad="$h_bad required_fields-missing-or-empty"
    jq -r '.intents[] | select(.id=="handoff") | .note // ""' "$IJ" \
      | grep -qi 'required sections:' && h_bad="$h_bad note-still-carries-the-section-list"
    [ -z "$h_bad" ] && ok "handoff intent carries required_sections/required_fields as data" \
                     || bad "handoff intent required_sections problems:$h_bad"

    # C19b: template <-> registry, both directions, exact-match headings
    miss=""
    while IFS= read -r s; do
      grep -qxF "## $s" "$TPL" || miss="$miss [$s]"
    done < <(jq -r '.intents[] | select(.id=="handoff") | .required_sections[]?' "$IJ")
    [ -z "$miss" ] && ok "handoff template carries every registry-required section" \
                   || bad "handoff template missing required sections:$miss"

    fmiss=""
    while IFS= read -r fld; do
      grep -q "^${fld}:" "$TPL" || fmiss="$fmiss [$fld]"
    done < <(jq -r '.intents[] | select(.id=="handoff") | .required_fields[]?' "$IJ")
    [ -z "$fmiss" ] && ok "handoff template carries every registry-required field line" \
                    || bad "handoff template missing required fields:$fmiss"

    undecl=""
    while IFS= read -r h; do
      jq -e --arg h "$h" '.intents[] | select(.id=="handoff") | .required_sections | index($h)' "$IJ" >/dev/null 2>&1 \
        || undecl="$undecl [$h]"
    done < <(sed -n 's/^## //p' "$TPL")
    [ -z "$undecl" ] && ok "every handoff template section is declared in the registry" \
                     || bad "handoff template sections not declared in the registry:$undecl"

    # C19c: CLAUDE.md handoff row mirrors the list (human mirror, checked)
    hrow=$(grep '^|' CLAUDE.md | grep -F 'templates/handoff.md' | head -1 | tr '[:upper:]' '[:lower:]')
    if [ -z "$hrow" ]; then
      bad "CLAUDE.md has no router row loading templates/handoff.md"
    else
      m_bad=""
      while IFS= read -r name; do
        lc=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
        case "$hrow" in *"$lc"*) ;; *) m_bad="$m_bad [$name]" ;; esac
      done < <(jq -r '.intents[] | select(.id=="handoff") | (.required_sections[]?, .required_fields[]?)' "$IJ")
      [ -z "$m_bad" ] && ok "CLAUDE.md handoff row mirrors every required section and field" \
                      || bad "CLAUDE.md handoff row does not mirror:$m_bad"
    fi
  else
    bad "intents.json or templates/handoff.md missing — handoff checks skipped"
  fi
  fi

  # ------------- C20: check-level repair policy — data, ladder, mirrors (P5)
  # The check-level fix loop's bound ("2 fix attempts, 1 escalation, then stop
  # and report red") is data (policy.json.repair), answered by kernel.sh
  # repair, and stated (never hardcoded) in the Stop-gate hook and the two
  # prose homes that used to say only "until clean". Same discipline as
  # C16-C19 applied to a fourth prose/data pair.
  # Spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md
  if want C20; then
  if [ -f "$PJ" ] && [ -x "$KSH" ]; then
    # C20a: the repair block is well-formed
    r_bad=""
    nchecks=$(jq -r '[.repair.checks[]? | select(type=="string")] | length' "$PJ")
    [ "${nchecks:-0}" -ge 1 ] || r_bad="$r_bad checks-missing-or-empty"
    ndupe=$(jq -r '(.repair.checks | length) - (.repair.checks | unique | length)' "$PJ" 2>/dev/null)
    [ "${ndupe:-0}" -eq 0 ] || r_bad="$r_bad checks-has-duplicates"
    maxfix=$(jq -r '.repair.max_fix_attempts_per_check' "$PJ" 2>/dev/null)
    case "$maxfix" in
      ''|*[!0-9]*) r_bad="$r_bad max_fix_attempts_per_check-not-a-nonneg-integer"; maxfix="" ;;
      *) [ "$maxfix" -ge 1 ] || r_bad="$r_bad max_fix_attempts_per_check-below-1" ;;
    esac
    esc=$(jq -r '.repair.escalations' "$PJ" 2>/dev/null)
    case "$esc" in ''|*[!0-9]*) r_bad="$r_bad escalations-not-a-nonneg-integer"; esc="" ;; esac
    sits=$(jq -r '[.repair.by_situation[]?.situation] | sort | join(",")' "$PJ" 2>/dev/null)
    [ "$sits" = "flaky,infra,red" ] || r_bad="$r_bad by_situation-must-be-exactly-red-infra-flaky:$sits"
    empty_resp=$(jq -r '[.repair.by_situation[]? | select((.response // "") == "")] | length' "$PJ" 2>/dev/null)
    [ "${empty_resp:-0}" -eq 0 ] || r_bad="$r_bad by_situation-entry-with-empty-response"
    nnr=$(jq -r '[.repair.never_repair[]? | select(type=="string")] | length' "$PJ" 2>/dev/null)
    [ "${nnr:-0}" -ge 1 ] || r_bad="$r_bad never_repair-missing-or-empty"
    [ -z "$r_bad" ] && ok "policy.json.repair is well-formed" \
                     || bad "policy.json.repair problems:$r_bad"

    # C20b: the ladder is live — behavioral canary against the running kernel,
    # breakpoint computed from the registry, never hardcoded
    canary_bad=""
    if [ -n "$maxfix" ] && [ -n "$esc" ]; then
      stop_attempt=$((maxfix + esc + 1))
      got_action=$(bash "$KSH" repair --check lint --attempt "$stop_attempt" 2>/dev/null | jq -r '.action // empty')
      [ "$got_action" = "stop-report-red" ] || canary_bad="$canary_bad ladder-did-not-stop-at-attempt-$stop_attempt(got=$got_action)"
    else
      canary_bad="$canary_bad cannot-compute-breakpoint-registry-fields-missing"
    fi
    got_never=$(bash "$KSH" repair --check lint --attempt 1 --situation weaken-the-check 2>/dev/null | jq -r '.action // empty')
    [ "$got_never" = "never-repair" ] || canary_bad="$canary_bad never-repair-situation-did-not-win(got=$got_never)"
    [ -z "$canary_bad" ] && ok "kernel.sh repair's ladder matches policy.json.repair's bound" \
                          || bad "repair ladder canary failed:$canary_bad"

    # C20c: the prose mirrors agree and "until clean" stays dead
    c_bad=""
    grep -qi 'until clean' CLAUDE.md 2>/dev/null && c_bad="$c_bad until-clean-in-CLAUDE.md"
    grep -qi 'until clean' "$IJ" 2>/dev/null && c_bad="$c_bad until-clean-in-intents.json"
    vrow=$(grep '^|' CLAUDE.md | grep -F 'kernel.sh repair' | head -1)
    if [ -z "$vrow" ]; then
      c_bad="$c_bad CLAUDE.md-has-no-verify-done-row-mentioning-kernel.sh-repair"
    else
      rownum=$(printf '%s' "$vrow" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) fix attempts per check.*/\1/p')
      [ -n "$rownum" ] && [ "$rownum" = "$maxfix" ] || c_bad="$c_bad CLAUDE.md-row-number($rownum)-disagrees-with-registry($maxfix)"
    fi
    vnote=$(jq -r '.intents[] | select(.id=="verify-done") | .note // ""' "$IJ" 2>/dev/null)
    case "$vnote" in *"kernel.sh repair"*) ;; *) c_bad="$c_bad verify-done-note-lost-the-kernel.sh-repair-pointer" ;; esac
    [ -z "$c_bad" ] && ok "the until-clean prose mirrors agree with policy.json.repair" \
                     || bad "repair prose-mirror problems:$c_bad"

    # C20d: the hook carries no private copy of the numbers — a shim, not a copy
    h_bad=""
    grep -q 'repair\.max_fix_attempts_per_check' hooks/stop-verify.sh 2>/dev/null \
      || h_bad="$h_bad stop-verify.sh-does-not-read-the-registry-field"
    grep -qE '[0-9]+ fix attempts' hooks/stop-verify.sh 2>/dev/null \
      && h_bad="$h_bad stop-verify.sh-has-a-hardcoded-number-literal"
    [ -z "$h_bad" ] && ok "hooks/stop-verify.sh reads the repair bound from the registry, not a private copy" \
                     || bad "stop-verify.sh repair-wiring problems:$h_bad"
  else
    bad "policy.json or kernel.sh missing — repair checks skipped"
  fi
  fi

  # ------------- C21: change-record contract — template, archive, mirrors (P6)
  # The change record is where delivered work claims conformance with its spec
  # (spec: link, verification evidence, registered diff). Schema is data on the
  # record-change intent; _template.md is the checked scaffold; archived
  # instances are the checked claims; the prose homes are checked mirrors.
  # Spec: docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md
  CT=.engineos/changes/_template.md
  if want C21; then
  if [ -f "$IJ" ] && [ -f "$CT" ]; then
    RC='.intents[] | select(.id=="record-change")'

    # C21a: the contract is data and well-formed
    a_bad=""
    nsec=$(jq -r "[$RC | .required_sections[]? | select(type==\"string\")] | length" "$IJ")
    nfld=$(jq -r "[$RC | .required_fields[]?   | select(type==\"string\")] | length" "$IJ")
    [ "${nsec:-0}" -ge 1 ] || a_bad="$a_bad required_sections-missing-or-empty"
    [ "${nfld:-0}" -ge 1 ] || a_bad="$a_bad required_fields-missing-or-empty"
    ndom=$(jq -r "[$RC | .archive_contract.domains[]? | select(type==\"string\")] | length" "$IJ")
    [ "${ndom:-0}" -ge 1 ] || a_bad="$a_bad archive_contract.domains-missing-or-empty"
    dupdom=$(jq -r "($RC | .archive_contract.domains // [] | length) - ($RC | .archive_contract.domains // [] | unique | length)" "$IJ")
    [ "${dupdom:-0}" -eq 0 ] || a_bad="$a_bad domains-has-duplicates"
    for dkey in grandfathered_before "instance_sections_since.date"; do
      dval=$(jq -r "$RC | .archive_contract.$dkey // empty" "$IJ")
      case "$dval" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) a_bad="$a_bad $dkey-not-a-date" ;; esac
    done
    sxp=$(jq -r "$RC | .archive_contract.spec_exempt_pattern // empty" "$IJ")
    { [ -n "$sxp" ] && printf x | grep -qE "$sxp" >/dev/null 2>&1; [ $? -le 1 ]; } \
      || a_bad="$a_bad spec_exempt_pattern-missing-or-invalid-ERE"
    # every instance section (both lists) is declared in required_sections
    while IFS= read -r s; do
      jq -e --arg s "$s" "$RC | .required_sections | index(\$s)" "$IJ" >/dev/null 2>&1 \
        || a_bad="$a_bad instance-section-not-in-required_sections:[$s]"
    done < <(jq -r "$RC | (.archive_contract.instance_sections[]?, .archive_contract.instance_sections_since.sections[]?)" "$IJ")
    [ -z "$a_bad" ] && ok "record-change intent carries the change-record contract as data" \
                     || bad "record-change contract problems:$a_bad"

    # C21b: template <-> registry, both directions (P4 C19b pattern)
    miss=""
    while IFS= read -r s; do grep -qx "## $s" "$CT" || miss="$miss [$s]"; done \
      < <(jq -r "$RC | .required_sections[]?" "$IJ")
    [ -z "$miss" ] && ok "change template carries every registry-required section" \
                   || bad "change template missing required sections:$miss"
    fmiss=""
    while IFS= read -r f; do grep -q "^${f}:" "$CT" || fmiss="$fmiss [$f]"; done \
      < <(jq -r "$RC | .required_fields[]?" "$IJ")
    [ -z "$fmiss" ] && ok "change template carries every registry-required field line" \
                    || bad "change template missing required fields:$fmiss"
    undecl=""
    while IFS= read -r h; do
      jq -e --arg h "$h" "$RC | .required_sections | index(\$h)" "$IJ" >/dev/null 2>&1 \
        || undecl="$undecl [$h]"
    done < <(sed -n 's/^## //p' "$CT")
    [ -z "$undecl" ] && ok "every change template section is declared in the registry" \
                     || bad "change template sections not declared in the registry:$undecl"

    # C21c + C21d: every checked-era archived record is a well-formed claim
    # with a resolvable spec link (or the explicit n/a escape)
    GF=$(jq -r "$RC | .archive_contract.grandfathered_before" "$IJ")
    SINCE=$(jq -r "$RC | .archive_contract.instance_sections_since.date" "$IJ")
    PFX=$(jq -r "$RC | .archive_contract.spec_path_prefix" "$IJ")
    i_bad=""; s_bad=""
    while IFS= read -r rec; do
      comp=$(sed -n 's/^completed: //p' "$rec" | head -1)
      nm=$(sed -n 's/^name: //p' "$rec" | head -1)
      gate="${comp:-${nm:0:10}}"
      [ "$gate" \< "$GF" ] && continue                      # grandfathered (Decision 4)
      base=$(basename "$rec" .md)
      st=$(sed -n 's/^status: //p' "$rec" | head -1)
      dom=$(sed -n 's/^domain: //p' "$rec" | head -1)
      [ "$st" = "done" ]                          || i_bad="$i_bad [$base:status=$st]"
      case "$comp" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) i_bad="$i_bad [$base:completed-missing-or-malformed]" ;; esac
      [ "$nm" = "$base" ]                         || i_bad="$i_bad [$base:name-drifts-from-filename]"
      jq -e --arg d "$dom" "$RC | .archive_contract.domains | index(\$d)" "$IJ" >/dev/null 2>&1 \
                                                  || i_bad="$i_bad [$base:domain-not-in-enum:$dom]"
      want=".engineos/archived/${comp:0:4}/${comp:5:2}/${dom}/${base}.md"
      [ "$rec" = "$want" ]                        || i_bad="$i_bad [$base:filed-at-wrong-path]"
      grep -q '^- \[ \]' "$rec"                   && i_bad="$i_bad [$base:unresolved-checklist-item]"
      while IFS= read -r s; do grep -qx "## $s" "$rec" || i_bad="$i_bad [$base:missing-section:$s]"; done \
        < <(jq -r "$RC | .archive_contract.instance_sections[]?" "$IJ")
      if [ ! "$comp" \< "$SINCE" ]; then
        while IFS= read -r s; do grep -qx "## $s" "$rec" || i_bad="$i_bad [$base:missing-section:$s]"; done \
          < <(jq -r "$RC | .archive_contract.instance_sections_since.sections[]?" "$IJ")
      fi
      spec=$(sed -n 's/^spec: //p' "$rec" | head -1)
      if [ -z "$spec" ]; then s_bad="$s_bad [$base:spec-field-missing-or-empty]"
      elif printf '%s' "$spec" | grep -qE "$sxp"; then :   # explicit, reasoned exemption
      else
        case "$spec" in "$PFX"*) [ -s "$spec" ] || s_bad="$s_bad [$base:spec-file-missing-or-empty:$spec]" ;;
                        *) s_bad="$s_bad [$base:spec-not-under-$PFX:$spec]" ;; esac
      fi
    done < <(find .engineos/archived -name '*.md' ! -name README.md | sort)
    [ -z "$i_bad" ] && ok "every checked-era archived change record is a well-formed done claim" \
                    || bad "archived change-record problems:$i_bad"
    [ -z "$s_bad" ] && ok "every checked-era archived record's spec link resolves (or is an explicit n/a exemption)" \
                    || bad "archived spec-link problems:$s_bad"

    # C21e: prose mirrors agree and the killed duplicate stays dead
    m_bad=""
    for home in skills/record-change/SKILL.md .engineos/archived/README.md .engineos/changes/_template.md; do
      while IFS= read -r d; do
        grep -q "$d" "$home" || m_bad="$m_bad [$home-missing-domain:$d]"
      done < <(jq -r "$RC | .archive_contract.domains[]?" "$IJ")
    done
    grep -qx 'status: active' .engineos/changes/README.md 2>/dev/null \
      && m_bad="$m_bad [changes/README.md-regrew-the-inline-schema-copy]"
    [ -z "$m_bad" ] && ok "change-record prose mirrors agree with the registry" \
                     || bad "change-record mirror problems:$m_bad"
  else
    bad "intents.json or .engineos/changes/_template.md missing — change-record checks skipped"
  fi
  fi

  # ------------- C22: telemetry — policy + plumbing, never the event data (P7)
  # Events live in .git/ on developer machines; a CI clone has none by
  # construction, so this validates the registry and the wiring only.
  # Spec: docs/specs/2026-08-06-decision-kernel-p7-telemetry.md
  TSH=scripts/telemetry.sh
  if want C22; then
  if [ -f "$PJ" ] && [ -x "$TSH" ]; then
    # C22a: the telemetry block is well-formed
    t_bad=""
    ret=$(jq -r '.telemetry.retention_days // empty' "$PJ")
    case "$ret" in ''|*[!0-9]*) t_bad="$t_bad retention_days-not-a-nonneg-integer" ;; *) [ "$ret" -ge 1 ] || t_bad="$t_bad retention_days-below-1" ;; esac
    vpat=$(jq -r '.telemetry.value_pattern // empty' "$PJ")
    { [ -n "$vpat" ] && printf x | grep -qE "$vpat" >/dev/null 2>&1; [ $? -le 1 ]; } \
      || t_bad="$t_bad value_pattern-missing-or-invalid-ERE"
    nev=$(jq -r '[.telemetry.events[]?] | length' "$PJ")
    [ "${nev:-0}" -ge 1 ] || t_bad="$t_bad events-missing-or-empty"
    dupev=$(jq -r '(.telemetry.events | map(.id) | length) - (.telemetry.events | map(.id) | unique | length)' "$PJ" 2>/dev/null)
    [ "${dupev:-0}" -eq 0 ] || t_bad="$t_bad event-ids-have-duplicates"
    while IFS=$'\t' read -r eid keys_n wb; do
      [ "${keys_n:-0}" -ge 1 ] || t_bad="$t_bad [$eid:keys-missing-or-empty]"
      [ -f "$wb" ] || t_bad="$t_bad [$eid:written_by-names-a-missing-file:$wb]"
      skeys=$(jq -r --arg e "$eid" '[.telemetry.events[] | select(.id==$e) | .sample | keys[]?] - (.telemetry.events[] | select(.id==$e) | .keys) | length' "$PJ" 2>/dev/null)
      [ "${skeys:-0}" -eq 0 ] || t_bad="$t_bad [$eid:sample-keys-not-a-subset-of-keys]"
    done < <(jq -r '.telemetry.events[] | [.id, (.keys|length), .written_by] | @tsv' "$PJ")
    [ -z "$t_bad" ] && ok "policy.json.telemetry is well-formed" \
                     || bad "telemetry policy problems:$t_bad"

    # C22b: the writer is live — behavioral canary against the running CLI
    canary_bad=""
    while IFS=$'\t' read -r eid sample; do
      cf=$(mktemp)
      bash "$TSH" append "$cf" --session canary --event "$eid" --data "$sample" --ts 2026-08-06T00:00:00Z >/dev/null 2>&1 \
        && [ -s "$cf" ] && bash "$TSH" validate "$cf" >/dev/null 2>&1 \
        || canary_bad="$canary_bad [$eid:sample-did-not-round-trip]"
      rm -f "$cf"
    done < <(jq -r '.telemetry.events[] | [.id, (.sample|tojson)] | @tsv' "$PJ")
    cf=$(mktemp)
    bash "$TSH" append "$cf" --session canary --event bogus-event --data '{}' >/dev/null 2>&1 \
      && canary_bad="$canary_bad unknown-event-was-not-rejected"
    bash "$TSH" append "$cf" --session canary --event route --data '{"intents":["two words"]}' >/dev/null 2>&1 \
      && canary_bad="$canary_bad whitespace-value-was-not-rejected"
    rm -f "$cf"
    [ -z "$canary_bad" ] && ok "scripts/telemetry.sh round-trips every registry sample and rejects malformed data" \
                          || bad "telemetry canary failed:$canary_bad"

    # C22c: wiring — each written_by hook calls telemetry.sh with its event id,
    # no hook's append invocation sources $PROMPT/$INPUT, no private retention
    # copy, and both readers still mention the source.
    w_bad=""
    while IFS=$'\t' read -r eid wb; do
      # The append invocation itself now lives in hooks/lib-common.sh
      # (hook_telemetry); a hook names its event at that helper instead of
      # spelling out the CLI call. Either form counts as wired.
      grep -qE 'telemetry\.sh|hook_telemetry' "$wb" \
        || w_bad="$w_bad [$wb:does-not-call-telemetry.sh]"
      grep -qE -- "(--event|hook_telemetry)[[:space:]]+$eid([[:space:]]|\$)" "$wb" \
        || w_bad="$w_bad [$wb:missing-literal---event-$eid]"
      { grep -A2 'telemetry.sh" append' "$wb"; grep 'hook_telemetry ' "$wb"; } \
        | grep -qE '\$PROMPT|\$HOOK_PROMPT|"\$INPUT"|"\$HOOK_INPUT"' \
        && w_bad="$w_bad [$wb:append-invocation-references-prompt-text]"
    done < <(jq -r '.telemetry.events[] | [.id, .written_by] | @tsv' "$PJ")
    # The shared emitter is the real append site now, so the prompt-text ban has
    # to be enforced there too, not only at the hooks that call it.
    grep -A3 'telemetry.sh" append' hooks/lib-common.sh \
      | grep -qE '\$PROMPT|\$HOOK_PROMPT|"\$INPUT"|"\$HOOK_INPUT"' \
      && w_bad="$w_bad [hooks/lib-common.sh:append-invocation-references-prompt-text]"
    grep -q 'telemetry\.retention_days' hooks/ensure-project-layout.sh \
      || w_bad="$w_bad ensure-project-layout.sh-does-not-read-the-registry-field"
    grep -qE '\-mtime "\+[0-9]' hooks/ensure-project-layout.sh \
      && w_bad="$w_bad ensure-project-layout.sh-has-a-hardcoded-retention-literal"
    grep -q 'engineos-telemetry' skills/retro/SKILL.md || w_bad="$w_bad retro-SKILL.md-lost-the-telemetry-source"
    grep -q 'engineos-telemetry' scripts/usage-report.sh || w_bad="$w_bad usage-report.sh-lost-the-telemetry-source"
    [ -z "$w_bad" ] && ok "telemetry wiring is complete, private-copy-free and prompt-text-free" \
                     || bad "telemetry wiring problems:$w_bad"
  else
    bad "policy.json or telemetry.sh missing — telemetry checks skipped"
  fi
  fi

  # ------------- C23: constitution preamble mirrors (P8, epic close)
  # CLAUDE.md's routing preamble and docs/COMPATIBILITY.md's always-on
  # enumeration are prose surfaces no earlier C-check reads. Same discipline
  # applied one layer out: the registry/import list is truth, the sentence is
  # the checked mirror.
  # Spec: docs/specs/2026-08-06-decision-kernel-p8-contradiction-cleanup.md
  if want C23; then
  if [ -f "$R" ]; then
    # C23a: the precedence-chain sentence names every routing.json domain,
    # in registry order
    c_bad=""
    chain=$(grep -A1 'in this precedence chain:' CLAUDE.md 2>/dev/null | tr '\n' ' ' | tr -s ' ' \
      | sed -n 's/.*precedence chain: \(.*\)\. When you route.*/\1/p')
    reg_chain=$(jq -r '.precedence | join(" → ")' "$R")
    [ -n "$chain" ] && [ "$chain" = "$reg_chain" ] \
      || c_bad="$c_bad precedence-sentence-disagrees-with-registry(got=[$chain] want=[$reg_chain])"

    # C23b: every CLAUDE.md always-on @rules/ import is named in
    # COMPATIBILITY.md's always-on enumeration
    while IFS= read -r rf; do
      bn=$(basename "$rf")
      grep -q "$bn\`" docs/COMPATIBILITY.md 2>/dev/null \
        || c_bad="$c_bad [$bn:missing-from-COMPATIBILITY.md-always-on-list]"
    done < <(grep -oE '^@rules/[a-z-]+\.md' CLAUDE.md | sed 's/^@//')
    [ -z "$c_bad" ] && ok "CLAUDE.md's precedence sentence and always-on mirror agree with the registry" \
                     || bad "constitution preamble mirror problems:$c_bad"

    # C23c: the retired routing-map.sh authority claim stays dead
    grep -qi 'authoritative for file-pattern routing' CLAUDE.md 2>/dev/null \
      && bad "CLAUDE.md reintroduced the retired routing-map.sh authority claim" \
      || ok "CLAUDE.md does not reintroduce the retired routing-map.sh authority claim"
  else
    bad "registries/routing.json missing — constitution preamble checks skipped"
  fi
  fi
fi
fi

# ------------------------------------------------------------ C13: no empties
if want C13; then
empties=""
for f in rules/*.md agents/*.md skills/*/SKILL.md; do
  [ -s "$f" ] || empties="$empties $f"
done
[ -z "$empties" ] && ok "no empty rule/agent/skill documents" || bad "empty documents:$empties"
fi

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
