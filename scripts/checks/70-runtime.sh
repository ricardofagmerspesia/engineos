# shellcheck shell=bash
# Checks on the runtime's own policy plumbing: the check-level repair loop
# (C20*), telemetry (C22*) and the constitution preamble mirrors (C23*).

# ------------- C20: check-level repair policy — data, ladder, mirrors (P5)
# The check-level fix loop's bound ("2 fix attempts, 1 escalation, then stop
# and report red") is data (policy.json.repair), answered by kernel.sh
# repair, and stated (never hardcoded) in the Stop-gate hook and the two
# prose homes that used to say only "until clean". Same discipline as
# C16-C19 applied to a fourth prose/data pair.
# Spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md
have_repair_inputs() {
  [ -f "$PJ" ] && [ -x "$KSH" ] && return 0
  skip_once repair "policy.json or kernel.sh missing — repair checks skipped"
  return 1
}

# The bound C20a validates and C20b/C20c consume. Prints nothing when the field
# is not a non-negative integer, which is exactly how C20a blanks it.
repair_bound() {
  local v
  v=$(jq -r --arg k "$1" '.repair[$k]' "$PJ" 2>/dev/null)
  case "$v" in ''|*[!0-9]*) return 0 ;; esac
  printf '%s' "$v"
}

check_C20() {
  have_jq || return 0
  have_repair_inputs || return 0
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
}

check_C20b() {
  have_jq || return 0
  have_repair_inputs || return 0
  maxfix=$(repair_bound max_fix_attempts_per_check)
  esc=$(repair_bound escalations)
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
}

check_C20c() {
  have_jq || return 0
  have_repair_inputs || return 0
  maxfix=$(repair_bound max_fix_attempts_per_check)
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
}

check_C20d() {
  have_jq || return 0
  have_repair_inputs || return 0
  # C20d: the hook carries no private copy of the numbers — a shim, not a copy
  h_bad=""
  grep -q 'repair\.max_fix_attempts_per_check' hooks/stop-verify.sh 2>/dev/null \
    || h_bad="$h_bad stop-verify.sh-does-not-read-the-registry-field"
  grep -qE '[0-9]+ fix attempts' hooks/stop-verify.sh 2>/dev/null \
    && h_bad="$h_bad stop-verify.sh-has-a-hardcoded-number-literal"
  [ -z "$h_bad" ] && ok "hooks/stop-verify.sh reads the repair bound from the registry, not a private copy" \
                   || bad "stop-verify.sh repair-wiring problems:$h_bad"
}

# ------------- C22: telemetry — policy + plumbing, never the event data (P7)
# Events live in .git/ on developer machines; a CI clone has none by
# construction, so this validates the registry and the wiring only.
# Spec: docs/specs/2026-08-06-decision-kernel-p7-telemetry.md
have_telemetry_inputs() {
  [ -f "$PJ" ] && [ -x "$TSH" ] && return 0
  skip_once telemetry "policy.json or telemetry.sh missing — telemetry checks skipped"
  return 1
}

check_C22() {
  have_jq || return 0
  have_telemetry_inputs || return 0
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
}

check_C22b() {
  have_jq || return 0
  have_telemetry_inputs || return 0
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
}

check_C22c() {
  have_jq || return 0
  have_telemetry_inputs || return 0
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
}

# ------------- C23: constitution preamble mirrors (P8, epic close)
# CLAUDE.md's routing preamble and docs/COMPATIBILITY.md's always-on
# enumeration are prose surfaces no earlier C-check reads. Same discipline
# applied one layer out: the registry/import list is truth, the sentence is
# the checked mirror.
# Spec: docs/specs/2026-08-06-decision-kernel-p8-contradiction-cleanup.md
have_constitution_inputs() {
  [ -f "$R" ] && return 0
  skip_once constitution "registries/routing.json missing — constitution preamble checks skipped"
  return 1
}

# C23a and C23b share one verdict line: they are two halves of "the preamble
# mirrors the registry", and the flat script emitted a single ok for both.
check_C23() {
  have_jq || return 0
  have_constitution_inputs || return 0
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
}

check_C23c() {
  have_jq || return 0
  have_constitution_inputs || return 0
  # C23c: the retired "authoritative for file-pattern routing" claim stays
  # dead. hooks/routing-map.sh is gone; the registry is the canonical map, and
  # CLAUDE.md prose must not crown anything else (a hook, a shim) in its place.
  grep -qi 'authoritative for file-pattern routing' CLAUDE.md 2>/dev/null \
    && bad "CLAUDE.md reintroduced the retired routing-map.sh authority claim" \
    || ok "CLAUDE.md does not reintroduce the retired routing-map.sh authority claim"
}
