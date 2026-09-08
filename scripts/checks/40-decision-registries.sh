# shellcheck shell=bash
# --------------------- C16: decision-kernel registries (P1: policy as data)
# models.json, intents.json, policy.json are the machine-readable form of
# rules/models.md, the CLAUDE.md router table, and the always-on policy prose
# (risk-autonomy/gates/parallelism). Prose stays the human mirror; these
# checks are what keeps mirror and data from drifting apart in silence —
# same discipline as routing.json in 20-registries.sh.
# Spec: docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md
#
# One Check over three registries because the cross-registry assertions (an
# intent's rules against its routing domain, a prose number against its
# registry field) do not decompose along file lines.
check_C16() {
  have_jq || return 0
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

    # every domain FK resolves and mirrored rules[] equal routing.json's. The
    # floor comparison went with routing.json's domain risk_floor: intents.json
    # is now the one home of the floor, and src/kernel/route.ts derives a
    # domain's floor from the intent that claims it.
    fk_bad=""
    while IFS= read -r id; do
      dom=$(jq -r --arg i "$id" '.intents[] | select(.id==$i) | .domain' "$IJ")
      jq -e --arg d "$dom" '.domains[] | select(.id==$d)' "$R" >/dev/null 2>&1 || { fk_bad="$fk_bad $id->$dom"; continue; }
      irules=$(jq -r --arg i "$id" '.intents[] | select(.id==$i) | .rules | join(",")' "$IJ")
      drules=$(jq -r --arg d "$dom" '.domains[] | select(.id==$d) | .rules | join(",")' "$R")
      [ "$irules" = "$drules" ] || fk_bad="$fk_bad $id(rules:'$irules'!='$drules')"
    done < <(jq -r '.intents[] | select(.hook_mirrored == true) | .id' "$IJ")
    [ -z "$fk_bad" ] && ok "every hook-mirrored intent matches its routing.json domain (rules)" \
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
}
