# shellcheck shell=bash
# Checks on the runtime's own policy plumbing: the check-level repair loop
# (C20*), telemetry (C22*), the constitution preamble mirrors (C23*), the
# dispatch loop's backpressure (C24*), the per-resource circuit breaker (C25*),
# human-in-the-loop (C26*), the agent-span exec journal (C27*), the
# retrieval-metrics prose/data pair (C28) and the adoption entrypoints (C29).

# Three of the families below gate on the same pair — the policy registry and
# an executable kernel — and each carried a verbatim copy of this body until
# the third one triggered rules/base.md's rule of three. The label stays the
# skip_once token, so a missing precondition is still one FAIL per family
# rather than one per Check.
have_kernel_inputs() {
  [ -f "$PJ" ] && [ -x "$KSH" ] && return 0
  skip_once "$1" "$2"
  return 1
}

# ------------- C20: check-level repair policy — data, ladder, mirrors (P5)
# The check-level fix loop's bound ("2 fix attempts, 1 escalation, then stop
# and report red") is data (policy.json.repair), answered by kernel.sh
# repair, and stated (never hardcoded) in the Stop-gate hook and the two
# prose homes that used to say only "until clean". Same discipline as
# C16-C19 applied to a fourth prose/data pair.
# Spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md
have_repair_inputs() {
  have_kernel_inputs repair "policy.json or kernel.sh missing — repair checks skipped"
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
  # written_by is an ARRAY: one event can have several producing hooks. A bare
  # string is a named finding rather than something the loop below iterates
  # character by character.
  while IFS=$'\t' read -r eid keys_n nwb nstr; do
    [ "${keys_n:-0}" -ge 1 ] || t_bad="$t_bad [$eid:keys-missing-or-empty]"
    if [ "${nwb:-0}" -lt 1 ]; then
      t_bad="$t_bad [$eid:written_by-not-a-non-empty-array]"
    else
      [ "${nwb:-0}" = "${nstr:-0}" ] || t_bad="$t_bad [$eid:written_by-has-a-non-string-entry]"
      while IFS= read -r wb; do
        [ -n "$wb" ] || continue
        [ -f "$wb" ] || t_bad="$t_bad [$eid:written_by-names-a-missing-file:$wb]"
      done < <(jq -r --arg e "$eid" '.telemetry.events[] | select(.id==$e) | .written_by[]? | select(type=="string")' "$PJ")
    fi
    skeys=$(jq -r --arg e "$eid" '[.telemetry.events[] | select(.id==$e) | .sample | keys[]?] - (.telemetry.events[] | select(.id==$e) | .keys) | length' "$PJ" 2>/dev/null)
    [ "${skeys:-0}" -eq 0 ] || t_bad="$t_bad [$eid:sample-keys-not-a-subset-of-keys]"
  done < <(jq -r '.telemetry.events[]
    | [.id, (.keys | length),
       (if (.written_by | type) == "array" then (.written_by | length) else 0 end),
       ([.written_by[]? | select(type == "string")] | length)] | @tsv' "$PJ")
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
  # Forward: every hook the registry names as a writer really appends the
  # event. written_by is an array, so an event with two producers gets both
  # checked instead of only whichever one a scalar field could hold.
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
  done < <(jq -r '.telemetry.events[] | .id as $i | .written_by[]? | select(type=="string") | [$i, .] | @tsv' "$PJ")
  # Reverse: every hook that appends a registered event is declared as one of
  # that event's writers. Without this half, a second hook could start emitting
  # `route` and the registry — which skills/retro and usage-report.sh read to
  # know where events come from — would never say so.
  #
  # hooks/test-*.sh are excluded: a test that names an event id asserts on it,
  # it does not produce it. hooks/lib-common.sh passes the id through as "$1"
  # and so never matches a literal.
  for eid in $(jq -r '.telemetry.events[].id' "$PJ"); do
    for hk in hooks/*.sh; do
      case "$hk" in hooks/test-*) continue ;; esac
      grep -qE -- "(--event|hook_telemetry)[[:space:]]+$eid([[:space:]]|\$)" "$hk" || continue
      jq -e --arg e "$eid" --arg h "$hk" \
        '.telemetry.events[] | select(.id==$e) | .written_by | index($h)' "$PJ" >/dev/null 2>&1 \
        || w_bad="$w_bad [$hk:appends-$eid-but-is-not-in-its-written_by]"
    done
  done
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
  [ -z "$w_bad" ] && ok "telemetry wiring is complete in both directions (every declared writer appends its event, every appending hook is declared), private-copy-free and prompt-text-free" \
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

# ------------- C24: backpressure — data, canary, prose mirror
# Admission control for the orchestrator's dispatch loop is data
# (policy.json.parallelism.backpressure), answered by kernel.sh admit, and
# stated in rules/parallelism.md "Backpressure". Same discipline as C20/C22
# applied to a fifth prose/data pair.
#
# Capacity is wave_concurrency_cap itself, never a second copy of the number:
# a duplicate under backpressure would be a mirror nobody checks, so C24a
# fails on any max_inflight* key instead of reading one.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 2
# ADR: docs/adr/2026-09-03-backpressure-reuses-wave-cap.md
have_backpressure_inputs() {
  have_kernel_inputs backpressure "policy.json or kernel.sh missing — backpressure checks skipped"
}

# The queue bound C24a validates and C24b/C24c consume. Prints nothing unless
# the field is an integer >= 1 — the same condition C24a fails on — so a bound
# C24a has already condemned can never silently reach the checks downstream.
backpressure_maxq() {
  local v
  v=$(jq -r '.parallelism.backpressure.max_queued_units' "$PJ" 2>/dev/null)
  case "$v" in ''|*[!0-9]*) return 0 ;; esac
  [ "$v" -ge 1 ] || return 0
  printf '%s' "$v"
}

check_C24() {
  have_jq || return 0
  have_backpressure_inputs || return 0
  # C24a: the backpressure block is well-formed
  b_bad=""
  maxq=$(jq -r '.parallelism.backpressure.max_queued_units' "$PJ" 2>/dev/null)
  case "$maxq" in
    ''|*[!0-9]*) b_bad="$b_bad max_queued_units-not-a-nonneg-integer"; maxq="" ;;
    # A bound of 0 makes the overload action unreachable — the kernel would go
    # straight from dispatch to reject and `defer` would be dead data.
    *) [ "$maxq" -ge 1 ] || b_bad="$b_bad max_queued_units-below-1" ;;
  esac
  oa=$(jq -r '.parallelism.backpressure.overload_action // ""' "$PJ")
  jq -e --arg a "$oa" '.parallelism.backpressure.actions | index($a)' "$PJ" >/dev/null 2>&1 \
    || b_bad="$b_bad overload_action-not-in-actions"
  jq -e '.parallelism.backpressure | keys[] | select(test("max_inflight"))' "$PJ" >/dev/null 2>&1 \
    && b_bad="$b_bad has-a-max_inflight-copy-of-wave_concurrency_cap"
  [ -z "$b_bad" ] && ok "policy.json.parallelism.backpressure is well-formed" \
                   || bad "backpressure block problems:$b_bad"
}

check_C24b() {
  have_jq || return 0
  have_backpressure_inputs || return 0
  # C24b: canary — the kernel rejects exactly when the registry says the queue
  # is full, and still admits an idle orchestrator. Both ends are asserted so a
  # kernel that answered one action unconditionally cannot pass. Cap and bound
  # come from the registry, never from a literal here.
  d_bad=""
  cap=$(jq -r '.parallelism.wave_concurrency_cap' "$PJ")
  maxq=$(backpressure_maxq)
  got=$(bash "$KSH" admit --inflight "$cap" --queued "${maxq:-0}" 2>/dev/null | jq -r '.action // empty')
  [ "$got" = "reject" ] || d_bad="$d_bad expected-reject-at-cap-with-full-queue-got:${got:-none}"
  idle=$(bash "$KSH" admit --inflight 0 --queued 0 2>/dev/null | jq -r '.action // empty')
  [ "$idle" = "dispatch" ] || d_bad="$d_bad expected-dispatch-when-idle-got:${idle:-none}"
  [ -z "$d_bad" ] && ok "kernel.sh admit dispatches when idle and rejects at cap with a full queue" \
                  || bad "admit canary:$d_bad"
}

check_C24c() {
  have_jq || return 0
  have_backpressure_inputs || return 0
  # C24c: prose mirror — rules/parallelism.md names the subcommand an
  # orchestrator is supposed to call, quotes the registry's queue bound, and
  # carries a table row for every action the registry declares.
  p_bad=""
  maxq=$(backpressure_maxq)
  grep -q 'kernel.sh admit' rules/parallelism.md 2>/dev/null \
    || p_bad="$p_bad parallelism.md-does-not-name-kernel.sh-admit"
  # An empty bound would make the grep below match vacuously — "[^0-9]*\b"
  # hits any mention of the field name — so an unusable bound is its own
  # finding rather than a silent pass.
  if [ -z "$maxq" ]; then
    p_bad="$p_bad queue-bound-unusable-see-C24a"
  elif ! grep -qE "max_queued_units[^0-9]*${maxq}\b" rules/parallelism.md 2>/dev/null; then
    p_bad="$p_bad parallelism.md-queue-bound-disagrees-with-registry(${maxq})"
  fi
  for act in $(jq -r '.parallelism.backpressure.actions[]?' "$PJ"); do
    grep -qE "^\| \`$act\`" rules/parallelism.md 2>/dev/null \
      || p_bad="$p_bad parallelism.md-has-no-table-row-for-action:$act"
  done
  # and the overload action is the row that explains the queue bound
  oa=$(jq -r '.parallelism.backpressure.overload_action // ""' "$PJ")
  { [ -n "$oa" ] && grep -qE "^\| \`$oa\`.*max_queued_units" rules/parallelism.md 2>/dev/null; } \
    || p_bad="$p_bad parallelism.md-overload-row-does-not-explain-the-bound:${oa:-none}"
  [ -z "$p_bad" ] && ok "rules/parallelism.md mirrors backpressure: names kernel.sh admit, quotes the queue bound, one row per declared action" \
                   || bad "backpressure prose-mirror problems:$p_bad"
}

# ------------- C25: circuit breaker — data, canary, prose mirror
# The per-resource circuit breaker is data (policy.json.breaker), answered by
# kernel.sh breaker, and stated in rules/parallelism.md "Circuit breaker".
# Same three-part shape as C24 applied to a sixth prose/data pair.
#
# The breaker is the THIRD failure-policy block, not a variant of retry (agent
# units) or repair (checks) — C25a therefore pins the state machine's shape so
# a later reader cannot quietly collapse the three into one.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 3
# ADR: docs/adr/2026-09-03-circuit-breaker-separate-from-retry.md
have_breaker_inputs() {
  have_kernel_inputs breaker "policy.json or kernel.sh missing — circuit-breaker checks skipped"
}

# The failure threshold C25a validates and C25b/C25c consume. Prints nothing
# unless the field is an integer >= 1 — the same condition C25a fails on — so a
# threshold C25a has already condemned can never silently reach the checks
# downstream.
breaker_threshold() {
  local v
  v=$(jq -r '.breaker.failure_threshold' "$PJ" 2>/dev/null)
  case "$v" in ''|*[!0-9]*) return 0 ;; esac
  [ "$v" -ge 1 ] || return 0
  printf '%s' "$v"
}

check_C25() {
  have_jq || return 0
  have_breaker_inputs || return 0
  # C25a: the breaker block is well-formed. The three numeric fields are read
  # through jq -r and matched as digit strings, so a JSON string "3" passes
  # here exactly as 3 does — the assertion is "reads as a whole number >= 1",
  # not "is a JSON number", and the verdict below says so rather than
  # overclaiming a type check nobody performs.
  b_bad=""
  thr=$(jq -r '.breaker.failure_threshold' "$PJ" 2>/dev/null)
  case "$thr" in
    ''|*[!0-9]*) b_bad="$b_bad failure_threshold-does-not-read-as-a-nonneg-whole-number" ;;
    # A threshold of 0 opens the breaker before anything has failed, so the
    # closed state would be unreachable and the whole machine dead data.
    *) [ "$thr" -ge 1 ] || b_bad="$b_bad failure_threshold-below-1" ;;
  esac
  cw=$(jq -r '.breaker.cooldown_waves' "$PJ" 2>/dev/null)
  case "$cw" in
    ''|*[!0-9]*) b_bad="$b_bad cooldown_waves-does-not-read-as-a-nonneg-whole-number" ;;
    *) [ "$cw" -ge 1 ] || b_bad="$b_bad cooldown_waves-below-1" ;;
  esac
  # cmd_breaker interpolates this straight into the half-open reason, so an
  # absent or zero value ships "allow null probe call(s)" to a caller rather
  # than failing anywhere.
  hp=$(jq -r '.breaker.half_open_probes' "$PJ" 2>/dev/null)
  case "$hp" in
    ''|*[!0-9]*) b_bad="$b_bad half_open_probes-does-not-read-as-a-nonneg-whole-number" ;;
    *) [ "$hp" -ge 1 ] || b_bad="$b_bad half_open_probes-below-1" ;;
  esac
  # The three states are the contract kernel.sh breaker implements as a case
  # arm each; a fourth state, or a missing one, is a kernel the registry no
  # longer describes. Compared as a sorted join, so the stored order is free.
  st=$(jq -r '[.breaker.states[]?] | sort | join(",")' "$PJ" 2>/dev/null)
  [ "$st" = "closed,half-open,open" ] \
    || b_bad="$b_bad states-are-not-exactly-closed+half-open+open(got:${st:-none})"
  jq -e '(.breaker.scopes | type == "array") and (.breaker.scopes | length > 0)' "$PJ" >/dev/null 2>&1 \
    || b_bad="$b_bad scopes-missing-or-empty"
  [ -z "$b_bad" ] && ok "policy.json.breaker is well-formed: failure_threshold, cooldown_waves and half_open_probes each read as a whole number >= 1, states are exactly closed/half-open/open, scopes is a non-empty array" \
                   || bad "breaker block problems:$b_bad"
}

# One canary call, reported as state/allow. `allow` is the field a caller
# actually gates on, so asserting the state alone would let a kernel that
# answered {"state":"open","allow":true} through the integrity gate.
breaker_answer() {
  bash "$KSH" breaker "$@" 2>/dev/null | jq -r '[(.state // "none"), (.allow | tostring)] | join("/")'
}

check_C25b() {
  have_jq || return 0
  have_breaker_inputs || return 0
  # C25b: canary — every state arm is exercised, and each is pinned on both
  # answer fields, so neither a kernel that answers one transition
  # unconditionally nor one with an inverted boolean in an unvisited arm can
  # pass. Includes the outcome that must NOT trip (one failure below the
  # threshold). The threshold comes from the registry, never a literal here.
  d_bad=""
  thr=$(breaker_threshold)
  if [ -z "$thr" ]; then
    d_bad="$d_bad failure-threshold-unusable-see-C25a"
  else
    got=$(breaker_answer --state closed --failures "$thr")
    [ "$got" = "open/false" ] || d_bad="$d_bad at-threshold-expected-open/false-got:${got:-none}"
    got=$(breaker_answer --state closed --failures "$((thr - 1))")
    [ "$got" = "closed/true" ] || d_bad="$d_bad one-below-threshold-expected-closed/true-got:${got:-none}"
  fi
  got=$(breaker_answer --state open --cooldown-elapsed true)
  [ "$got" = "half-open/true" ] || d_bad="$d_bad cooldown-elapsed-expected-half-open/true-got:${got:-none}"
  got=$(breaker_answer --state open --cooldown-elapsed false)
  [ "$got" = "open/false" ] || d_bad="$d_bad cooldown-pending-expected-open/false-got:${got:-none}"
  got=$(breaker_answer --state half-open --probe-result ok)
  [ "$got" = "closed/true" ] || d_bad="$d_bad successful-probe-expected-closed/true-got:${got:-none}"
  got=$(breaker_answer --state half-open --probe-result failed)
  [ "$got" = "open/false" ] || d_bad="$d_bad failed-probe-expected-open/false-got:${got:-none}"
  [ -z "$d_bad" ] && ok "kernel.sh breaker answers the expected state and allow for all six transitions across the three state arms" \
                  || bad "breaker canary:$d_bad"
}

check_C25c() {
  have_jq || return 0
  have_breaker_inputs || return 0
  # C25c: prose mirror — rules/parallelism.md carries a "Circuit breaker"
  # section, names the subcommand an orchestrator is supposed to call, quotes
  # the registry's failure threshold, and mentions every state and every scope
  # the registry declares. scopes is the only breaker field with no kernel
  # consumer and no canary, so this grep is its only guard — and it is the one
  # field that has already drifted from the frozen ids once.
  p_bad=""
  thr=$(breaker_threshold)
  # Anchored, because every other assertion here is a claim about that section
  # and a passing grep elsewhere in the file would not be a mirror.
  grep -qE '^## Circuit breaker$' rules/parallelism.md 2>/dev/null \
    || p_bad="$p_bad parallelism.md-has-no-Circuit-breaker-section"
  grep -q 'kernel.sh breaker' rules/parallelism.md 2>/dev/null \
    || p_bad="$p_bad parallelism.md-does-not-name-kernel.sh-breaker"
  # An empty threshold would make the grep below match vacuously —
  # "[^0-9]*\b" hits any bare mention of the field name — so an unusable
  # threshold is its own finding rather than a silent pass.
  if [ -z "$thr" ]; then
    p_bad="$p_bad failure-threshold-unusable-see-C25a"
  elif ! grep -qE "failure_threshold[^0-9]*${thr}\b" rules/parallelism.md 2>/dev/null; then
    p_bad="$p_bad parallelism.md-threshold-disagrees-with-registry(${thr})"
  fi
  for st in $(jq -r '.breaker.states[]?' "$PJ"); do
    grep -qE "^\| \`$st\`" rules/parallelism.md 2>/dev/null \
      || p_bad="$p_bad parallelism.md-has-no-table-row-for-state:$st"
  done
  # Anchored on the scope-vocabulary SENTENCE, not on the section. Scoping to
  # the section is not narrow enough to be a mirror, and the comment that used
  # to sit here had the reason backwards: the exec-journal paragraph it blamed
  # ("same `tool`/`provider`") is INSIDE this section, so `provider` and `tool`
  # matched it whether or not the breaker's own vocabulary survived, and `mcp`
  # and `agent` passed only by being unique strings in the section. Deleting the
  # vocabulary outright while naming both ids in the span-kind list beside it —
  # a plausible documentation edit, since `agent` is a real span_kind — left
  # this Check reporting ok on a tree that defined no breaker scope at all.
  # scopes has no kernel consumer and no canary, so a vacuous grep here is the
  # whole guard gone.
  #
  # The claim is about one sentence, so one sentence is what gets read: the
  # section is flattened to a line, split on sentence boundaries, and only the
  # fragment enumerating the scopes is searched. That fragment is identified by
  # the phrase "scopes over" — rewording it is a prose change that must keep the
  # anchor — and its absence is its own finding rather than a silent pass.
  bsec=$(sed -n '/^## Circuit breaker$/,/^## /p' rules/parallelism.md 2>/dev/null)
  bvocab=$(printf '%s' "$bsec" | tr '\n' ' ' | tr '.' '\n' | grep -F 'scopes over')
  if [ -z "$bvocab" ]; then
    p_bad="$p_bad parallelism.md-has-no-breaker-scope-vocabulary-sentence"
  else
    for sc in $(jq -r '.breaker.scopes[]?' "$PJ"); do
      printf '%s' "$bvocab" | grep -qE "\`$sc\`" 2>/dev/null \
        || p_bad="$p_bad parallelism.md-does-not-name-scope:$sc"
    done
  fi
  [ -z "$p_bad" ] && ok "rules/parallelism.md mirrors the breaker: a Circuit breaker section naming kernel.sh breaker, the registry's failure threshold, a row per declared state, and a scope-vocabulary sentence naming every declared scope" \
                   || bad "breaker prose-mirror problems:$p_bad"
}

# ------------- C26: human-in-the-loop — data, canary, prose mirror, coupling
# HITL is data (policy.json.hitl), answered by kernel.sh hitl, folded into
# resolve-task, and stated in rules/risk-autonomy.md "Human-in-the-loop".
# The same three-part shape as C24/C25 applied to a seventh prose/data pair,
# plus a fourth part C24/C25 had no need for: C26d couples the reason id that
# Task 2 left as a bare literal inside cmd_admit's reject message back to this
# vocabulary, so the two cannot be renamed apart.
#
# reasons is a CLOSED vocabulary — a gate may cite nothing else — which is why
# C26b asserts not only that the kernel demands a human when it should, but
# that every reason it cites is declared here.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 4
# ADR: docs/adr/2026-09-03-hitl-as-kernel-entity.md
have_hitl_inputs() {
  have_kernel_inputs hitl "policy.json or kernel.sh missing — human-in-the-loop checks skipped"
}

# The frozen floor on the reason vocabulary. Named once so C26a's condition and
# its message cannot disagree.
HITL_REASONS_MIN=8

check_C26() {
  have_jq || return 0
  have_hitl_inputs || return 0
  # C26a: the hitl block is well-formed
  h_bad=""
  nr=$(jq -r '[.hitl.reasons[]? | select(type == "string") | select(. != "")] | length' "$PJ" 2>/dev/null)
  ur=$(jq -r '[.hitl.reasons[]? | select(type == "string") | select(. != "")] | unique | length' "$PJ" 2>/dev/null)
  case "$nr" in
    ''|*[!0-9]*) h_bad="$h_bad reasons-missing-or-not-an-array-of-strings" ;;
    *) [ "$nr" -ge "$HITL_REASONS_MIN" ] \
         || h_bad="$h_bad reasons-below-$HITL_REASONS_MIN-non-empty-strings(got:$nr)"
       [ "$nr" = "${ur:-0}" ] || h_bad="$h_bad reasons-have-duplicates" ;;
  esac
  jq -e '(.hitl.situations | type == "array") and (.hitl.situations | length > 0)' "$PJ" >/dev/null 2>&1 \
    || h_bad="$h_bad situations-missing-or-empty"
  # cmd_hitl returns record_home verbatim, so an absent value ships a null home
  # to the one caller that was just told to write the decision down somewhere.
  rh=$(jq -r '.hitl.record_home // ""' "$PJ")
  [ -n "$rh" ] || h_bad="$h_bad record_home-missing-or-empty"
  # The two situation vocabularies must stay disjoint: cmd_hitl looks a
  # situation up in `retry.never_retry + hitl.situations`, so an id in both
  # would emit two reasons for one input.
  ov=$(jq -r '(.retry.never_retry // []) as $n
              | [(.hitl.situations // [])[] | select(. as $s | $n | index($s))] | join(",")' "$PJ" 2>/dev/null)
  [ -z "$ov" ] || h_bad="$h_bad situations-overlap-retry.never_retry:$ov"
  [ -z "$h_bad" ] && ok "policy.json.hitl is well-formed: reasons is $HITL_REASONS_MIN+ unique non-empty strings, situations is a non-empty array disjoint from retry.never_retry, record_home is set" \
                   || bad "hitl block problems:$h_bad"
}

# One canary call, reported as required/autonomy_after. Those are the two
# fields an orchestrator actually gates on, so asserting either alone would let
# a kernel through — required alone misses a bogus autonomy drop, and
# autonomy_after alone misses a kernel that never demands a human.
hitl_answer() {
  bash "$KSH" hitl "$@" 2>/dev/null | jq -r '[(.required | tostring), (.autonomy_after // "none")] | join("/")'
}

check_C26b() {
  have_jq || return 0
  have_hitl_inputs || return 0
  # C26b: canary — a required:false case AND a required:true case, each pinned
  # on both answer fields, so neither a kernel that always demands a human nor
  # one that always drops to A1 can pass. Then the thin-evidence drop against
  # the registry's own target, the two flag-driven reasons, every declared
  # situation, and the resolve-task fold. Every tier, ceiling and situation
  # comes from the registry, never a literal here.
  d_bad=""
  low_ceil=$(jq -r '.autonomy.ceiling_by_risk.low // ""' "$PJ")
  med_ceil=$(jq -r '.autonomy.ceiling_by_risk.medium // ""' "$PJ")
  high_ceil=$(jq -r '.autonomy.ceiling_by_risk.high // ""' "$PJ")
  thin_target=$(jq -r '.autonomy.high_with_thin_evidence // ""' "$PJ")
  if [ -z "$low_ceil" ] || [ -z "$med_ceil" ] || [ -z "$high_ceil" ]; then
    d_bad="$d_bad autonomy-ceilings-unusable-see-C16"
  else
    # low risk with adequate evidence needs no human, and must hand back the
    # ceiling it was given rather than inventing one
    got=$(hitl_answer --risk low --autonomy "$low_ceil")
    [ "$got" = "false/$low_ceil" ] || d_bad="$d_bad low-risk-expected-false/$low_ceil-got:${got:-none}"
    got=$(hitl_answer --risk high --autonomy "$high_ceil")
    [ "$got" = "true/$high_ceil" ] || d_bad="$d_bad high-risk-expected-true/$high_ceil-got:${got:-none}"
    # An external effect is unreachable below A3, so it must NOT be a reason
    # there — without the negative half a kernel ignoring --autonomy passes.
    got=$(hitl_answer --risk medium --autonomy "$med_ceil" --external-effect true)
    [ "$got" = "true/$med_ceil" ] || d_bad="$d_bad external-effect-at-$med_ceil-expected-true/$med_ceil-got:${got:-none}"
    # The low tier's ceiling is the registry's own "below A3" value, so the
    # negative half needs no literal. If a future policy raises it to A3+, an
    # external effect IS reachable there and the case stops being about that
    # boundary — skipped rather than asserted wrongly.
    case "$low_ceil" in
      A3|A4) ;;
      *) got=$(hitl_answer --risk medium --autonomy "$low_ceil" --external-effect true)
         [ "$got" = "false/$low_ceil" ] \
           || d_bad="$d_bad external-effect-below-A3-expected-false/$low_ceil-got:${got:-none}" ;;
    esac
    got=$(hitl_answer --risk low --autonomy "$low_ceil" --conflict true)
    [ "$got" = "true/$low_ceil" ] || d_bad="$d_bad policy-conflict-expected-true/$low_ceil-got:${got:-none}"
    # The thin-evidence DROP, tier by tier. Every case in this family used to
    # pass --autonomy A2 and only A2 — the one input where an unconditional
    # "A1" was right — so a field that RAISED A0 to A1 and dropped medium/A3
    # two levels passed clean. The expectations here are derived from the rule
    # in rules/risk-autonomy.md (drop one level, never raise), not from the
    # kernel, so this stays a canary rather than a second implementation.
    for tcase in low/A2/A1 medium/A2/A1 medium/A3/A2 low/A4/A3 medium/A1/A1 low/A0/A0 high/A0/A0; do
      t_tier=${tcase%%/*}; t_rest=${tcase#*/}; t_in=${t_rest%%/*}; t_want=${t_rest##*/}
      got=$(hitl_answer --risk "$t_tier" --autonomy "$t_in" --evidence thin)
      [ "$got" = "true/$t_want" ] \
        || d_bad="$d_bad thin-$t_tier-$t_in-expected-true/$t_want-got:${got:-none}"
    done
    # Risk high is the one tier whose landing is a registry value, so it is read
    # rather than spelled. An empty target would make the comparison pass on
    # "true/" for any answer, and a target of A4 would not be a drop at all —
    # both are their own findings.
    case "$thin_target" in
      "") d_bad="$d_bad autonomy.high_with_thin_evidence-unusable" ;;
      A4) d_bad="$d_bad autonomy.high_with_thin_evidence-is-A4-which-cannot-be-a-drop" ;;
      *)  got=$(hitl_answer --risk high --autonomy A4 --evidence thin)
          [ "$got" = "true/$thin_target" ] \
            || d_bad="$d_bad thin-high-A4-expected-true/$thin_target-got:${got:-none}" ;;
    esac
    # Every declared situation must demand a human and cite only declared
    # reasons. A situation the kernel accepts and then drops would answer
    # required:false — "no human needed" for an input it did not act on.
    for sit in $(jq -r '((.retry.never_retry // []) + (.hitl.situations // []))[]' "$PJ"); do
      ans=$(bash "$KSH" hitl --risk low --autonomy "$low_ceil" --situation "$sit" 2>/dev/null)
      req=$(printf '%s' "$ans" | jq -r '.required // "none"' 2>/dev/null)
      [ "$req" = true ] || d_bad="$d_bad situation-$sit-expected-required-true-got:${req:-none}"
      undecl=$(printf '%s' "$ans" | jq -r --slurpfile pol "$PJ" \
        '[.reasons[]? | select(. as $r | $pol[0].hitl.reasons | index($r) | not)] | join(",")' 2>/dev/null)
      [ -z "$undecl" ] || d_bad="$d_bad situation-$sit-cites-undeclared-reason:$undecl"
    done
    # An unknown situation is an error, not an ignored flag: a silently dropped
    # situation would read as "no human needed".
    bash "$KSH" hitl --risk low --autonomy "$low_ceil" --situation engineos-no-such-situation >/dev/null 2>&1 \
      && d_bad="$d_bad unknown-situation-was-not-rejected"
  fi
  # The fold, both halves. resolve-task must carry the answer when a tier was
  # actually CLASSIFIED, or hooks/prompt-advisor.sh has nothing to announce:
  # this prompt trips rule-destructive-ddl, whose risk=high is the
  # classification.
  rt=$(bash "$KSH" resolve-task --prompt "drop the users table in production" 2>/dev/null \
       | jq -r '.hitl.required // "none"' 2>/dev/null)
  [ "$rt" = true ] || d_bad="$d_bad resolve-task-does-not-carry-hitl.required-got:${rt:-none}"
  # And it must NOT carry one off a bare risk floor: a floor is an input to
  # classification, not a classification, so announcing a human gate on every
  # auth-guard edit is the gate theatre rules/gates.md names. task_contract's
  # own risk_floor is read alongside, because `hitl == null` on a prompt that
  # stopped resolving a high floor would satisfy this for the wrong reason. The
  # expected floor comes from intents.json; an intent whose floor is not high
  # would make the case assert nothing, so that is its own finding.
  sec_floor=$(jq -r '.intents[] | select(.id == "security-files") | .risk_floor // ""' "$IJ" 2>/dev/null)
  if [ "$sec_floor" != high ]; then
    d_bad="$d_bad intents.json-security-files-risk_floor-is-not-high-got:${sec_floor:-none}"
  else
    rt=$(bash "$KSH" resolve-task --prompt "fix the auth guard bug" 2>/dev/null \
         | jq -r '"\(.hitl // "null")/\(.task_contract.risk_floor // "none")"' 2>/dev/null)
    [ "$rt" = "null/$sec_floor" ] \
      || d_bad="$d_bad resolve-task-on-a-bare-floor-expected-null/$sec_floor-got:${rt:-none}"
  fi
  [ -z "$d_bad" ] && ok "kernel.sh hitl answers the expected required and autonomy_after for the low/high tiers, drops autonomy exactly one level on thin evidence at low and medium and to autonomy.high_with_thin_evidence at high without ever raising it, cites both flag-driven reasons and every declared situation, rejects an unknown situation, and resolve-task carries the answer for a classified tier while claiming none off a bare risk floor" \
                  || bad "hitl canary:$d_bad"
}

check_C26c() {
  have_jq || return 0
  have_hitl_inputs || return 0
  # C26c: prose mirror — rules/risk-autonomy.md carries a "Human-in-the-loop"
  # section, names the subcommand an orchestrator is supposed to call, and
  # carries a table row for every reason the registry declares; the gates.md
  # release checklist and the change-record template carry the home the
  # decision is written to.
  #
  # Every grep is scoped to its own section rather than run over the file:
  # "high", "evidence", "budget" and "human approval" all appear elsewhere in
  # risk-autonomy.md, and a file-wide grep would still pass with the mirror
  # section deleted — which is not a mirror.
  p_bad=""
  hsec=$(sed -n '/^## Human-in-the-loop$/,/^## /p' rules/risk-autonomy.md 2>/dev/null)
  if [ -z "$hsec" ]; then
    p_bad="$p_bad risk-autonomy.md-has-no-Human-in-the-loop-section"
  else
    printf '%s' "$hsec" | grep -q 'kernel.sh hitl' \
      || p_bad="$p_bad risk-autonomy.md-does-not-name-kernel.sh-hitl"
    for r in $(jq -r '.hitl.reasons[]?' "$PJ"); do
      printf '%s' "$hsec" | grep -qE "^\| \`$r\`" \
        || p_bad="$p_bad risk-autonomy.md-has-no-table-row-for-reason:$r"
    done
    # record_home is the field with no kernel branch and no canary of its own,
    # so this is the only thing holding it to the prose.
    home_anchor=$(jq -r '.hitl.record_home // "" | split("#") | last' "$PJ")
    if [ -z "$home_anchor" ]; then
      p_bad="$p_bad record_home-unusable-see-C26a"
    else
      # ".engineos/changes/<record>.md#human-decisions" -> the "Human decisions"
      # heading the other two mirrors carry.
      home_heading=$(printf '%s' "$home_anchor" | tr '-' ' ')
      printf '%s' "$hsec" | grep -qi "$home_heading" \
        || p_bad="$p_bad risk-autonomy.md-does-not-name-the-record-home:$home_anchor"
      rsec=$(sed -n '/^## Release gate — exit criteria$/,/^## /p' rules/gates.md 2>/dev/null)
      { [ -n "$rsec" ] && printf '%s' "$rsec" | grep -qi "$home_heading"; } \
        || p_bad="$p_bad gates.md-release-checklist-does-not-name:$home_anchor"
      grep -qix "## $home_heading" "$CT" \
        || p_bad="$p_bad change-template-has-no-section:$home_heading"
    fi
  fi
  [ -z "$p_bad" ] && ok "rules/risk-autonomy.md mirrors hitl: a Human-in-the-loop section naming kernel.sh hitl, a row per declared reason and the record home, which the rules/gates.md release checklist and the change-record template also carry" \
                   || bad "hitl prose-mirror problems:$p_bad"
}

check_C26d() {
  have_jq || return 0
  have_hitl_inputs || return 0
  # C26d: the backpressure coupling. cmd_admit's reject message embeds
  # "hitl: budget-exhausted" as prose, and nothing tied that string to this
  # vocabulary — so renaming the reason id would have left Task 2's reject
  # message citing a reason that no longer exists, in the one place a caller
  # reads to find out why a human is needed. Three things must agree: the
  # registry declares the id in BOTH reasons and situations, cmd_admit cites
  # it, and kernel.sh hitl --situation reject answers with exactly it.
  #
  # The id is spelled once, here, because something has to say WHICH reason
  # backpressure exhaustion maps to. A rename in the registry fails the first
  # assertion by name, and the greps below are skipped rather than left to
  # match an empty string.
  k_bad=""
  bx=budget-exhausted
  if jq -e --arg b "$bx" \
       '((.hitl.reasons // []) | index($b)) and ((.hitl.situations // []) | index($b))' "$PJ" >/dev/null 2>&1; then
    grep -q "hitl: $bx" "$KSH" \
      || k_bad="$k_bad kernel.sh-reject-message-does-not-cite-hitl:-$bx"
    low_ceil=$(jq -r '.autonomy.ceiling_by_risk.low // ""' "$PJ")
    got=$(bash "$KSH" hitl --risk low --autonomy "$low_ceil" --situation reject 2>/dev/null \
          | jq -r '[.reasons[]?] | join(",")' 2>/dev/null)
    [ "$got" = "$bx" ] || k_bad="$k_bad hitl--situation-reject-answered:${got:-none}-expected:$bx"
  else
    k_bad="$k_bad hitl-does-not-declare-$bx-in-both-reasons-and-situations"
  fi
  [ -z "$k_bad" ] && ok "the backpressure/hitl coupling holds: policy.json.hitl declares $bx in both reasons and situations, kernel.sh admit's reject message cites 'hitl: $bx', and kernel.sh hitl --situation reject answers with exactly that id" \
                   || bad "hitl/backpressure coupling problems:$k_bad"
}

# ------------- C27: the agent-span exec journal — data, canary, wiring, prose
# The C22* family checks what EngineOS DECIDED; this one checks the record of
# what HAPPENED when agents ran. Same three-part shape as C24/C25/C26 over an
# eighth prose/data pair, plus a wiring part in both directions like C22c.
# Spans live in .git/ on developer machines and a CI clone has none by
# construction, so this validates the registry, the CLI's behaviour and the
# plumbing — never the data.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 5
# ADR: docs/adr/2026-09-03-spans-extend-exec-journal.md
have_exec_journal_inputs() {
  # Deliberately NOT delegating to have_kernel_inputs: this family reads
  # exec-journal.sh, and gating on kernel.sh would be a guard that passes while
  # the real input is missing. Mirrors have_telemetry_inputs, its true analogue.
  [ -f "$PJ" ] && [ -x "$EJSH" ] && return 0
  skip_once exec-journal "policy.json or exec-journal.sh missing — exec-journal span checks skipped"
  return 1
}

# The span vocabulary as the SCRIPT declares it, normalised to a sorted CSV.
# Prints nothing when the constant cannot be read, which is how C27a turns an
# unparseable script into its own named finding instead of a vacuous match
# against an empty list.
ej_constant() { # <constant-name>
  local v
  v=$(sed -n "s/^$1=\"\\(.*\\)\"\$/\\1/p" "$EJSH" 2>/dev/null | head -1)
  [ -n "$v" ] || return 0
  printf '%s' "$v" | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ',' | sed 's/,$//'
}

# The same list as the REGISTRY declares it, so the two are compared as data
# and neither side is a literal in this file.
ej_registry_list() { # <field-name>
  jq -r --arg f "$1" '[.telemetry.exec_journal[$f][]? | select(type=="string")] | sort | join(",")' "$PJ" 2>/dev/null
}

check_C27() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27a: the exec_journal block is well-formed and agrees with the script's
  # own constants. need_reg-style file presence proves nothing about the block,
  # so its absence is checked explicitly before anything reads through it —
  # jq sorts null below every value and would answer confidently otherwise.
  x_bad=""
  if ! jq -e '.telemetry.exec_journal' "$PJ" >/dev/null 2>&1; then
    bad "policy.json has no telemetry.exec_journal block"
    return 0
  fi
  home=$(jq -r '.telemetry.exec_journal.home // empty' "$PJ")
  case "$home" in
    '') x_bad="$x_bad home-missing" ;;
    *.exec.jsonl) ;;
    *) x_bad="$x_bad home-does-not-end-in-.exec.jsonl:$home" ;;
  esac
  schema=$(jq -r '.telemetry.exec_journal.schema // empty' "$PJ")
  if [ -z "$schema" ]; then
    x_bad="$x_bad schema-missing"
  elif [ ! -x "$schema" ]; then
    x_bad="$x_bad schema-names-a-non-executable-file:$schema"
  fi
  # Both halves of each pair are read from their own source. A blank on either
  # side is its own finding: comparing two empty strings is the vacuous match
  # that would let a renamed span kind through.
  for pair in "span_kinds:VALID_SPAN_KINDS" "statuses:VALID_STATUSES"; do
    field="${pair%%:*}"; constant="${pair##*:}"
    from_script=$(ej_constant "$constant")
    from_registry=$(ej_registry_list "$field")
    if [ -z "$from_script" ]; then
      x_bad="$x_bad cannot-read-$constant-from-exec-journal.sh"
    elif [ -z "$from_registry" ]; then
      x_bad="$x_bad $field-missing-or-empty-in-the-registry"
    elif [ "$from_script" != "$from_registry" ]; then
      x_bad="$x_bad $field-disagrees-with-$constant(registry:$from_registry script:$from_script)"
    fi
  done
  nwb=$(jq -r '[.telemetry.exec_journal.written_by[]? | select(type=="string")] | length' "$PJ")
  if [ "${nwb:-0}" -lt 1 ]; then
    x_bad="$x_bad written_by-not-a-non-empty-array-of-strings"
  else
    while IFS= read -r wb; do
      [ -n "$wb" ] || continue
      [ -f "$wb" ] || x_bad="$x_bad written_by-names-a-missing-file:$wb"
    done < <(jq -r '.telemetry.exec_journal.written_by[]? | select(type=="string")' "$PJ")
  fi
  helper=$(jq -r '.telemetry.exec_journal.written_by_helper // empty' "$PJ")
  if [ -z "$helper" ]; then
    x_bad="$x_bad written_by_helper-missing"
  elif [ ! -f "$helper" ]; then
    x_bad="$x_bad written_by_helper-names-a-missing-file:$helper"
  fi
  # The per-value length bound is DATA here, not a literal in the CLI. The CLI
  # still carries a fallback so it runs standalone without this registry, and
  # the two must agree — otherwise a tree without policy.json quietly enforces a
  # different bound from the one all three prose homes quote.
  mvl=$(jq -r '.telemetry.exec_journal.max_value_length // empty' "$PJ")
  case "$mvl" in
    ''|*[!0-9]*|0)
      x_bad="$x_bad max_value_length-not-a-positive-integer:${mvl:-missing}" ;;
    *)
      mfb=$(sed -n 's/^MAX_VALUE_LEN_FALLBACK="\(.*\)"$/\1/p' "$EJSH" 2>/dev/null | head -1)
      if [ -z "$mfb" ]; then
        x_bad="$x_bad cannot-read-MAX_VALUE_LEN_FALLBACK-from-exec-journal.sh"
      elif [ "$mfb" != "$mvl" ]; then
        x_bad="$x_bad max_value_length-disagrees-with-MAX_VALUE_LEN_FALLBACK(registry:$mvl script:$mfb)"
      fi ;;
  esac
  [ -z "$x_bad" ] && ok "policy.json.telemetry.exec_journal is well-formed: home ends in .exec.jsonl, schema is executable, span_kinds/statuses/max_value_length match exec-journal.sh's own constants, and every writer exists" \
                   || bad "exec_journal block problems:$x_bad"
}

check_C27b() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27b: the writer is live — a behavioural canary against the running CLI,
  # in BOTH directions. The accept half alone would pass against a CLI that
  # accepts everything, and the reject half alone against one that accepts
  # nothing, so each declared span kind is exercised and each malformed value
  # is asserted to be refused. Every field a consumer gates on is asserted,
  # not just the exit code.
  c_bad=""
  cf=$(mktemp)
  base="--run-id canary --capability-id route --model-tier build --status OK --tokens-in 0 --tokens-out 0 --duration-ms 1"
  # Accept: one line with every v2 field set, then read each one back.
  # shellcheck disable=SC2086
  if bash "$EJSH" append "$cf" $base --status FAILED --duration-ms 900 \
       --trace-id canary-session --span-id tu-1 --parent-span-id tu-0 --span-kind tool \
       --tool mcp.postgres --provider anthropic --model claude-opus-5 \
       --cost-micros 1200 --retry-attempt 1 --cache-hit false --route dba --risk medium >/dev/null 2>&1; then
    bash "$EJSH" validate "$cf" >/dev/null 2>&1 || c_bad="$c_bad full-v2-line-did-not-validate"
    tail -1 "$cf" | jq -e '.trace_id=="canary-session" and .span_id=="tu-1" and .parent_span_id=="tu-0"
      and .span_kind=="tool" and .tool=="mcp.postgres" and .provider=="anthropic"
      and .model=="claude-opus-5" and .cost_micros==1200 and .retry_attempt==1
      and .cache_hit==false and .route=="dba" and .risk=="medium" and .status=="FAILED"' >/dev/null 2>&1 \
      || c_bad="$c_bad full-v2-line-did-not-round-trip"
  else
    c_bad="$c_bad full-v2-line-was-rejected"
  fi
  # Accept: every span kind the registry declares, read from the registry so a
  # renamed kind moves this canary with it.
  for k in $(jq -r '.telemetry.exec_journal.span_kinds[]?' "$PJ"); do
    # shellcheck disable=SC2086
    bash "$EJSH" append "$cf" $base --span-kind "$k" >/dev/null 2>&1 \
      || c_bad="$c_bad declared-span-kind-rejected:$k"
  done
  # Accept: a v1 line, carrying no v2 key at all. Backward compatibility is the
  # contract, and a v2 field emitted as an explicit null would still validate,
  # so the SHAPE is asserted and not only the exit code.
  vf=$(mktemp)
  # shellcheck disable=SC2086
  if bash "$EJSH" append "$vf" $base >/dev/null 2>&1; then
    jq -e 'has("span_kind") or has("trace_id") or has("cost_micros") | not' "$vf" >/dev/null 2>&1 \
      || c_bad="$c_bad a-v1-line-now-carries-v2-keys"
  else
    c_bad="$c_bad v1-line-was-rejected"
  fi
  rm -f "$vf"
  # Reject: the outcomes that must NOT be accepted. The whitespace case is the
  # invariant the whole schema exists for — no span field admits a space, so
  # prompt text and PII cannot reach disk through one.
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --trace-id "has space" >/dev/null 2>&1 \
    && c_bad="$c_bad whitespace-trace_id-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --trace-id "$(printf 'clean\nthen arbitrary text')" >/dev/null 2>&1 \
    && c_bad="$c_bad newline-trace_id-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --span-kind bogus-kind >/dev/null 2>&1 \
    && c_bad="$c_bad unknown-span_kind-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --risk critical >/dev/null 2>&1 \
    && c_bad="$c_bad unknown-risk-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --cost-micros 1.5 >/dev/null 2>&1 \
    && c_bad="$c_bad fractional-cost_micros-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --cache-hit yes >/dev/null 2>&1 \
    && c_bad="$c_bad non-boolean-cache_hit-was-not-rejected"
  # Reject: the v1 IDENTIFIER fields, which used to admit a space and pass
  # validate while three prose homes said no field did.
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --run-id "has space" >/dev/null 2>&1 \
    && c_bad="$c_bad whitespace-run_id-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --capability-id "has space" >/dev/null 2>&1 \
    && c_bad="$c_bad whitespace-capability_id-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --agent "$(printf 'agent\nSECRET=leaked prompt text')" >/dev/null 2>&1 \
    && c_bad="$c_bad newline-agent-was-not-rejected"
  # Reject: over the registry's own bound, read from the registry so the canary
  # moves with the number rather than pinning a literal.
  mvl=$(jq -r '.telemetry.exec_journal.max_value_length // 256' "$PJ")
  case "$mvl" in ''|*[!0-9]*|0) mvl=256 ;; esac
  long=$(awk -v n=$((mvl + 1)) 'BEGIN { while (i++ < n) printf "a" }')
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --trace-id "$long" >/dev/null 2>&1 \
    && c_bad="$c_bad over-long-trace_id-was-not-rejected"
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --note "$long" >/dev/null 2>&1 \
    && c_bad="$c_bad over-long-note-was-not-rejected"
  # ACCEPT: note is the one documented free-text field, and a guard that
  # rejected everything would satisfy every reject case above.
  # shellcheck disable=SC2086
  bash "$EJSH" append "$cf" $base --note "a human annotation, with spaces" >/dev/null 2>&1 \
    || c_bad="$c_bad free-text-note-was-rejected"
  rm -f "$cf"
  # Reject on the validate side too: that is the guard for journals this CLI did
  # not write, which is where the headless runner's spans will arrive from.
  bf=$(mktemp)
  printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"bad id","route":"good"}' > "$bf"
  bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
    && c_bad="$c_bad validate-accepted-a-whitespace-span-field"
  # ... and on the v1 identifier fields, which is where a journal written by
  # something other than this CLI would arrive with prompt text in it.
  printf '%s\n' '{"timestamp":"t","run_id":"sess 1","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$bf"
  bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
    && c_bad="$c_bad validate-accepted-a-whitespace-run_id"
  # ... and on the ENUMERATED v1 fields, which append gates through in_list and
  # validate checked for type only: prose in status and a newline in model_tier
  # used to validate clean on a journal this CLI did not write.
  printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"it went fine, mostly","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$bf"
  bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
    && c_bad="$c_bad validate-accepted-free-text-in-status"
  printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build\nSECRET=leaked","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$bf"
  bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
    && c_bad="$c_bad validate-accepted-a-newline-in-model_tier"
  # ACCEPT: every status the registry declares still validates, so the two
  # rejects above cannot be satisfied by a guard that refuses everything.
  for st in $(jq -r '.telemetry.exec_journal.statuses[]?' "$PJ"); do
    printf '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"%s","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}\n' "$st" > "$bf"
    bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
      || c_bad="$c_bad validate-rejected-a-declared-status:$st"
  done
  # ACCEPT on the validate side: a note carrying text is valid, by design.
  printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":"a human annotation, with spaces"}' > "$bf"
  bash "$EJSH" validate "$bf" >/dev/null 2>&1 \
    || c_bad="$c_bad validate-rejected-a-free-text-note"
  rm -f "$bf"
  [ -z "$c_bad" ] && ok "scripts/exec-journal.sh round-trips a full v2 span and every declared span kind, keeps a v1 line's shape, refuses whitespace in every field but note (run_id and agent included), refuses an over-long value, refuses a status or model_tier outside its enumeration on validate as well as on append, and still accepts a free-text note" \
                   || bad "exec-journal span canary failed:$c_bad"
}

check_C27c() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27c: wiring, in both directions — every declared writer really writes a
  # span, every hook that writes one is declared, the shared append site cannot
  # see prompt text, and the reaper covers the new file.
  w_bad=""
  kinds=$(jq -r '[.telemetry.exec_journal.span_kinds[]?] | join("|")' "$PJ")
  if [ -z "$kinds" ]; then
    # An empty alternation matches every line, so the greps below would pass
    # against a hook that writes nothing at all.
    w_bad="$w_bad span_kinds-empty-cannot-check-wiring"
  else
    # Forward. The append itself lives in hooks/lib-common.sh (hook_span); a
    # writer names its span KIND at that helper rather than spelling out the
    # CLI call, and either form counts as wired.
    while IFS= read -r wb; do
      [ -n "$wb" ] || continue
      [ -f "$wb" ] || continue   # missing file is C27a's finding, not a second one here
      grep -qE 'exec-journal\.sh|hook_span' "$wb" \
        || w_bad="$w_bad [$wb:does-not-write-a-span]"
      grep -qE -- "(hook_span|hook_span_open|hook_span_close)[[:space:]]" "$wb" \
        || w_bad="$w_bad [$wb:names-no-span-helper]"
    done < <(jq -r '.telemetry.exec_journal.written_by[]? | select(type=="string")' "$PJ")
    # The dispatch hook opens a span it cannot close and the return hook closes
    # it; one without the other leaks markers or fabricates durations.
    grep -q 'hook_span_open' hooks/announce-agent-dispatch.sh 2>/dev/null \
      || w_bad="$w_bad announce-agent-dispatch.sh-does-not-open-a-span"
    grep -q 'hook_span_close' hooks/announce-agent-return.sh 2>/dev/null \
      || w_bad="$w_bad announce-agent-return.sh-does-not-close-a-span"
    # Reverse: a hook that emits a span kind is declared as a writer. Without
    # this half a second hook could start writing `router` spans and the
    # registry — which the retro and the breaker count read to know where spans
    # come from — would never say so. test-*.sh assert on a kind, they do not
    # produce it; lib-common.sh passes the kind through as "$kind".
    for hk in hooks/*.sh; do
      case "$hk" in hooks/test-*|hooks/lib-common.sh) continue ;; esac
      grep -qE -- "hook_span[[:space:]]+($kinds)([[:space:]]|\$)" "$hk" || continue
      jq -e --arg h "$hk" '.telemetry.exec_journal.written_by | index($h)' "$PJ" >/dev/null 2>&1 \
        || w_bad="$w_bad [$hk:writes-a-span-but-is-not-in-written_by]"
    done
  fi
  # The shared append site is where a prompt-text leak would actually happen,
  # so the ban is enforced there and not only at the callers (mirrors C22c).
  helper=$(jq -r '.telemetry.exec_journal.written_by_helper // empty' "$PJ")
  if [ -n "$helper" ] && [ -f "$helper" ]; then
    grep -A6 'exec-journal.sh" append' "$helper" \
      | grep -qE '\$PROMPT|\$HOOK_PROMPT|"\$INPUT"|"\$HOOK_INPUT"' \
      && w_bad="$w_bad [$helper:span-append-references-prompt-text]"
  fi
  # The reaper: <session>.exec.jsonl is covered by the existing '*.jsonl' glob,
  # and the span start markers live one level down where that glob never looks.
  grep -q 'exec\.jsonl' hooks/ensure-project-layout.sh 2>/dev/null \
    || w_bad="$w_bad ensure-project-layout.sh-does-not-account-for-.exec.jsonl"
  grep -q 'engineos-telemetry/spans' hooks/ensure-project-layout.sh 2>/dev/null \
    || w_bad="$w_bad ensure-project-layout.sh-does-not-reap-the-span-start-markers"
  [ -z "$w_bad" ] && ok "exec-journal span wiring is complete in both directions (every declared writer writes a span, every span-writing hook is declared), prompt-text-free at the shared append site, and reaped by ensure-project-layout.sh" \
                   || bad "exec-journal wiring problems:$w_bad"
}

check_C27d() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27d: prose mirror — rules/observability.md carries an "Agent traces"
  # section and states the field vocabulary a consumer codes against. Scoped to
  # that section, never the file: `trace_id` and `provider` occur elsewhere in
  # the rules tree, so a file-wide grep would pass with the section deleted.
  p_bad=""
  grep -qE '^## Agent traces$' rules/observability.md 2>/dev/null \
    || p_bad="$p_bad observability.md-has-no-Agent-traces-section"
  asec=$(sed -n '/^## Agent traces$/,/^## /p' rules/observability.md 2>/dev/null)
  if [ -z "$asec" ]; then
    p_bad="$p_bad Agent-traces-section-is-empty"
  else
    for term in trace_id span_kind cost_micros; do
      printf '%s' "$asec" | grep -q "$term" \
        || p_bad="$p_bad Agent-traces-section-does-not-name:$term"
    done
    # Every declared span kind, read from the registry, so a renamed kind has
    # to be renamed in the prose too.
    for k in $(jq -r '.telemetry.exec_journal.span_kinds[]?' "$PJ"); do
      printf '%s' "$asec" | grep -q "$k" \
        || p_bad="$p_bad Agent-traces-section-does-not-name-span-kind:$k"
    done
    # ... and the alternation LINE itself, built from the registry. The loop
    # above is substring-satisfiable: with that line deleted outright it fails
    # only on `coordinator`, because `model` matches `model_tier` and
    # tool/agent/router/verification each match another bullet. One rename away
    # from vacuous, so the line is asserted as a whole and in registry order.
    kalt=$(jq -r '[.telemetry.exec_journal.span_kinds[]?] | join(" | ")' "$PJ")
    if [ -z "$kalt" ]; then
      p_bad="$p_bad span_kinds-empty-see-C27a"
    else
      printf '%s' "$asec" | grep -qF "\`$kalt\`" \
        || p_bad="$p_bad Agent-traces-section-lost-the-span-kind-alternation($kalt)"
    fi
    ehome=$(jq -r '.telemetry.exec_journal.home // empty' "$PJ")
    if [ -z "$ehome" ]; then
      p_bad="$p_bad home-unusable-see-C27a"
    else
      printf '%s' "$asec" | grep -qF "$ehome" \
        || p_bad="$p_bad Agent-traces-section-does-not-name-the-registry-home($ehome)"
    fi
    # The 0-is-not-free caveat: the dispatch hooks cannot see a subagent's
    # usage, and a consumer that reads those zeros as real spend is the one
    # misreading this schema can actually cause. Both the field name and the
    # caveat itself, because the field list without the warning is the exact
    # shape of the misreading.
    printf '%s' "$asec" | grep -q 'tokens_in' \
      || p_bad="$p_bad Agent-traces-section-does-not-name:tokens_in"
    printf '%s' "$asec" | grep -qF '0 as free' \
      || p_bad="$p_bad Agent-traces-section-drops-the-0-is-not-free-caveat"
    # The status FLOOR caveat, asserted the same way and for the same reason as
    # the tokens one: the hooks read only structural sources, so a structured
    # response with no error flag records OK. A consumer that builds the
    # breaker's consecutive-failure count on this field without knowing that
    # would count essentially zero envelope-level failures.
    printf '%s' "$asec" | grep -qF 'FLOOR' \
      || p_bad="$p_bad Agent-traces-section-drops-the-status-is-a-floor-caveat"
    # The containment claim, in its narrow and TRUE form. The broad version
    # ("no free-text field at all") was false while run_id, capability_id and
    # agent admitted one, so the exception is what gets asserted.
    printf '%s' "$asec" | grep -qF 'every field EXCEPT `note`' \
      || p_bad="$p_bad Agent-traces-section-does-not-scope-the-slug-claim-to-all-but-note"
    printf '%s' "$asec" | grep -qF 'max_value_length' \
      || p_bad="$p_bad Agent-traces-section-does-not-state-the-length-bound"
    # ... and the second-order version of the same overclaim. The slug guard
    # bounds shape and size; it does NOT classify content, because the hook
    # boundary sanitizes rather than rejects, so a value's characters still
    # transit dash-joined. The first attempt at this section said a PII value
    # "cannot be written through those" fields, which a two-line subagent_type
    # refuted in one probe. Asserted so the honest form cannot quietly go back.
    printf '%s' "$asec" | grep -qF 'does not classify the content' \
      || p_bad="$p_bad Agent-traces-section-reclaims-the-slug-guard-classifies-content"
  fi
  # rules/parallelism.md's breaker section forward-references this section as
  # the source of its consecutive-failure count; the reference goes live with
  # the section and must not be left dangling in either direction.
  grep -q 'Agent traces' rules/parallelism.md 2>/dev/null \
    || p_bad="$p_bad parallelism.md-lost-its-Agent-traces-reference"
  [ -z "$p_bad" ] && ok "rules/observability.md mirrors the span schema: an Agent traces section naming the registry home, the span-kind alternation in registry order, trace_id/span_kind/cost_micros, the tokens-are-0 and status-is-a-floor caveats, and the all-but-note slug claim with its length bound" \
                   || bad "exec-journal prose-mirror problems:$p_bad"
}

# The set of fields the APPEND path guards as slugs, from its check_slug_flag
# call sites, normalised to a sorted CSV of JSON field names. Prints nothing
# when no call site can be read, which is how C27e turns an unparseable script
# into a named finding instead of a vacuous match of two empty strings.
ej_slug_flags() {
  sed -n 's/^ *check_slug_flag  *--\([a-z-]*\) .*/\1/p' "$EJSH" 2>/dev/null \
    | tr '-' '_' | grep -v '^$' | sort -u | tr '\n' ',' | sed 's/,$//'
}

# The same set as VALIDATE guards, from the one `all(...)` field list in its jq
# program. Read as data from the other side of the file, so neither half is a
# literal here.
ej_validated_fields() {
  sed -n '/^ *(\[\.[a-z_]*,/,/all(\. == null/p' "$EJSH" 2>/dev/null \
    | grep -o '\.[a-z_]\{2,\}' | sed 's/^\.//' \
    | grep -vx 'all' | sort -u | tr '\n' ',' | sed 's/,$//'
}

# The set of fields APPEND gates against an ENUMERATION, from its in_list call
# sites (the _val suffix is the shell variable's, not the field's). Slug shape
# and enum membership are different guards, so they get different set
# comparisons: ej_slug_flags above answers "is it in the class", this one
# answers "is it one of the declared values".
ej_enum_flags() {
  sed -n 's/^ *in_list "\$\([a-z_]*\)".*/\1/p' "$EJSH" 2>/dev/null \
    | sed 's/_val$//' | grep -v '^$' | sort -u | tr '\n' ',' | sed 's/,$//'
}

# The same set as VALIDATE gates, from the enumerated predicates in its jq
# program — `IN(...)` for the vocabularies and the boolean type test for
# cache_hit. Read from the other side of the file so neither half is a literal
# here, and empty is a named finding rather than a vacuous match.
ej_validated_enums() {
  sed -n '/^cmd_validate()/,/^}/p' "$EJSH" 2>/dev/null \
    | grep -E 'IN\(|type == "boolean"' \
    | sed -n 's/^[^.]*\.\([a-z_]\{2,\}\).*/\1/p' \
    | sort -u | tr '\n' ',' | sed 's/,$//'
}

check_C27e() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27e: the containment claim, as a set comparison rather than a sentence.
  # Three prose homes say "every field except note is a slug"; this asserts that
  # the fields APPEND guards and the fields VALIDATE guards are the same set,
  # and that note is in neither. The defect this exists for: --agent was the one
  # string flag with no check_slug_flag call, so the claim was false at the
  # append boundary and again at the validate boundary, and nothing noticed.
  s_bad=""
  appended=$(ej_slug_flags)
  validated=$(ej_validated_fields)
  if [ -z "$appended" ]; then
    s_bad="$s_bad cannot-read-check_slug_flag-call-sites-from-exec-journal.sh"
  elif [ -z "$validated" ]; then
    s_bad="$s_bad cannot-read-the-validate-slug-field-list-from-exec-journal.sh"
  elif [ "$appended" != "$validated" ]; then
    s_bad="$s_bad append-and-validate-guard-different-fields(append:$appended validate:$validated)"
  fi
  # note is the documented exception and must stay out of both sets: adding it
  # would be a silent compatibility event in the other direction.
  case ",$appended,$validated," in
    *,note,*) s_bad="$s_bad note-is-guarded-as-a-slug-but-documented-as-free-text" ;;
  esac
  # The three v1 identifier fields are the half that was missing; naming them
  # explicitly means a future edit that drops one is its own finding rather than
  # a set difference nobody reads.
  for f in run_id capability_id agent; do
    case ",$appended," in *",$f,"*) ;; *) s_bad="$s_bad append-does-not-guard:$f" ;; esac
    case ",$validated," in *",$f,"*) ;; *) s_bad="$s_bad validate-does-not-guard:$f" ;; esac
  done
  # The SECOND half of the same claim, and the one that was false: the slug set
  # is not the whole guard, because status and model_tier are enumerated rather
  # than shape-checked. append gated both through in_list; validate checked them
  # for `type == "string"`, so a hand-forged line carrying prose in status and a
  # newline in model_tier validated clean. Compared as sets for the same reason
  # as above, with both vocabularies named explicitly so dropping one is its own
  # finding.
  appended_enums=$(ej_enum_flags)
  validated_enums=$(ej_validated_enums)
  if [ -z "$appended_enums" ]; then
    s_bad="$s_bad cannot-read-in_list-call-sites-from-exec-journal.sh"
  elif [ -z "$validated_enums" ]; then
    s_bad="$s_bad cannot-read-the-validate-enum-predicates-from-exec-journal.sh"
  elif [ "$appended_enums" != "$validated_enums" ]; then
    s_bad="$s_bad append-and-validate-enumerate-different-fields(append:$appended_enums validate:$validated_enums)"
  fi
  for f in status model_tier; do
    case ",$appended_enums," in *",$f,"*) ;; *) s_bad="$s_bad append-does-not-enumerate:$f" ;; esac
    case ",$validated_enums," in *",$f,"*) ;; *) s_bad="$s_bad validate-does-not-enumerate:$f" ;; esac
  done
  [ -z "$s_bad" ] && ok "exec-journal.sh guards the same field set on append and on validate — slugs ($appended), enumerations ($appended_enums) — with note excluded from both: the containment claim its header, policy.json and rules/observability.md all make" \
                   || bad "exec-journal slug-guard set problems:$s_bad"
}

check_C27f() {
  have_jq || return 0
  have_exec_journal_inputs || return 0
  # C27f: every capability_id a hook writes into a span resolves against
  # registries/capabilities.json. Two did not — the verification span wrote
  # `verify`, which shadowed the real `validate`, and the agent span wrote
  # `dispatch`, which exists nowhere — so a consumer joining spans to
  # capabilities silently dropped the two highest-volume span kinds. C13 polices
  # the registry's own entries; nothing looked at what the writers pass.
  q_bad=""
  ids=$(jq -r '[.capabilities[]?.id | select(type=="string")] | join(" ")' "$C" 2>/dev/null)
  if [ -z "$ids" ]; then
    q_bad="$q_bad cannot-read-capability-ids-from-$C"
  else
    seen=0
    while IFS= read -r wb; do
      [ -n "$wb" ] || continue
      [ -f "$wb" ] || continue   # missing file is C27a's finding
      while IFS= read -r cid; do
        [ -n "$cid" ] || continue
        seen=$((seen + 1))
        case "$cid" in
          # A computed value defeats this check, so it is a finding rather than
          # a skip: whoever needs one updates this Check in the same change.
          *'$'*|*'"'*) q_bad="$q_bad [$wb:capability-id-is-not-a-literal:$cid]"; continue ;;
        esac
        case " $ids " in
          *" $cid "*) ;;
          *) q_bad="$q_bad [$wb:capability-id-resolves-against-nothing:$cid]" ;;
        esac
      done < <(sed -n 's/.*--capability-id  *\([^ ]*\).*/\1/p' "$wb")
    done < <(jq -r '.telemetry.exec_journal.written_by[]? | select(type=="string")' "$PJ")
    # A writer set that yielded no id at all would pass the loop above without
    # having checked anything.
    [ "$seen" -gt 0 ] || q_bad="$q_bad no-capability-id-found-in-any-declared-writer"
  fi
  [ -z "$q_bad" ] && ok "every capability_id the declared span writers pass is a literal that resolves against $C" \
                   || bad "exec-journal capability_id problems:$q_bad"
}

# ------------- C28: retrieval-metrics prose/data pair
# The eval-harness reference defines how retrieval quality is measured; the
# `## RAG` section of rules/llm-apps.md is the rule that says to measure it.
# Neither half is useful alone: a reference nothing links to is dead, and a rule
# naming metrics nothing defines is a slogan. Both directions are checked.
# No have_jq: nothing here reads a registry, so the pair stays checked on a
# machine without jq rather than skipping with the registry families.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 6
RETRIEVAL_METRICS="Recall@K Precision@K MRR"
RETRIEVAL_REF_DIR=skills/eval-harness/references
RETRIEVAL_REF="$RETRIEVAL_REF_DIR/retrieval-metrics.md"

# The reference and the RAG-section metrics both arrive with Task 6, on its own
# branch, so on this branch every finding below would fire at once and say
# nothing about drift. Gated on the reference DIRECTORY rather than the file:
# `rm` of the file is a planted negative case that must stay refutable, and no
# finding below names the directory, so nothing here becomes vacuous.
have_retrieval_metrics_inputs() {
  [ -d "$RETRIEVAL_REF_DIR" ] && return 0
  skip_pending retrieval-metrics "$RETRIEVAL_REF_DIR/ absent — retrieval-metrics checks skipped until it lands"
  return 1
}

check_C28() {
  have_retrieval_metrics_inputs || return 0
  r_bad=""
  if [ ! -f "$RETRIEVAL_REF" ]; then
    r_bad="$r_bad reference-missing:$RETRIEVAL_REF"
  else
    for m in $RETRIEVAL_METRICS; do
      grep -qF "$m" "$RETRIEVAL_REF" || r_bad="$r_bad reference-does-not-define:$m"
    done
  fi
  if [ ! -f skills/eval-harness/SKILL.md ]; then
    r_bad="$r_bad eval-harness-SKILL.md-missing"
  else
    grep -qF 'references/retrieval-metrics.md' skills/eval-harness/SKILL.md \
      || r_bad="$r_bad SKILL.md-does-not-link-the-reference"
  fi
  # Sliced to the section, never the file: every one of these metric names also
  # occurs in the reference and in prose elsewhere, so a file-wide grep would
  # pass with the `## RAG` section deleted outright.
  if [ ! -f rules/llm-apps.md ]; then
    r_bad="$r_bad llm-apps.md-missing"
  else
    ragsec=$(sed -n '/^## RAG$/,/^## /p' rules/llm-apps.md 2>/dev/null)
    if [ -z "$ragsec" ]; then
      r_bad="$r_bad llm-apps.md-has-no-RAG-section"
    else
      for m in $RETRIEVAL_METRICS; do
        printf '%s' "$ragsec" | grep -qF "$m" \
          || r_bad="$r_bad RAG-section-does-not-name:$m"
      done
    fi
  fi
  [ -z "$r_bad" ] && ok "the retrieval-metrics pair holds: $RETRIEVAL_REF defines Recall@K/Precision@K/MRR, skills/eval-harness/SKILL.md links it, and the RAG section of rules/llm-apps.md names all three" \
                   || bad "retrieval-metrics prose/data problems:$r_bad"
}

# ------------- C29: adoption entrypoint wiring
# Adopting EngineOS in a new project has four moving parts — the script, the
# command that invokes it, the SessionStart hook that keeps the layout in place,
# and the document that tells a human which command to run. Each is its own
# named finding: "adoption is broken" does not tell anyone which half to fix.
# Spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md Task 7
#
# All four parts arrive with Task 7, on its own branch. Gated on the script
# itself, the part the other three wire TO: absent, every finding fires at once
# and none of them is about drift. The negative cases mutate the exec bit and
# the other three parts, never the script's existence, so each stays refutable
# once Task 7 lands. The cost of the gate, stated plainly: while the script is
# absent this family reports a skip, and its own
# `scripts/init-project.sh-missing` finding is therefore folded into the guard's
# message rather than duplicated below.
have_adoption_inputs() {
  [ -f scripts/init-project.sh ] && return 0
  skip_pending adoption "scripts/init-project.sh absent — adoption entrypoint checks skipped until it lands"
  return 1
}

check_C29() {
  have_adoption_inputs || return 0
  a_bad=""
  [ -x scripts/init-project.sh ] || a_bad="$a_bad scripts/init-project.sh-not-executable"
  if [ ! -f commands/init.md ]; then
    a_bad="$a_bad commands/init.md-missing"
  elif ! grep -qF 'scripts/init-project.sh' commands/init.md; then
    a_bad="$a_bad commands/init.md-does-not-name-scripts/init-project.sh"
  fi
  if [ ! -f hooks/scaffold-layout.sh ]; then
    a_bad="$a_bad hooks/scaffold-layout.sh-missing"
  elif ! grep -qF 'scaffold-layout.sh' hooks/ensure-project-layout.sh; then
    a_bad="$a_bad ensure-project-layout.sh-does-not-source-scaffold-layout.sh"
  fi
  if [ ! -f docs/ADOPTION.md ]; then
    a_bad="$a_bad docs/ADOPTION.md-missing"
  elif ! grep -qF '/engineos:init' docs/ADOPTION.md; then
    a_bad="$a_bad docs/ADOPTION.md-does-not-name-the-/engineos:init-command"
  fi
  [ -z "$a_bad" ] && ok "the adoption entrypoints are wired: scripts/init-project.sh is executable, commands/init.md invokes it, ensure-project-layout.sh sources hooks/scaffold-layout.sh, and docs/ADOPTION.md names /engineos:init" \
                   || bad "adoption entrypoint problems:$a_bad"
}
