# shellcheck shell=bash
# Template-and-registry contracts: the handoff template (C19*) and the change
# record (C21*). Both follow the same discipline — the required-section list is
# registry data, the template is the checked surface, the prose is the checked
# mirror.

# ------------- C19: handoff template <-> registry section contract (P4)
# The handoff intent's required-sections list is data (required_sections /
# required_fields); templates/handoff.md is the checked surface; the CLAUDE.md
# row is the checked human mirror. Same prose/data discipline as C16-C18.
# Spec: docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md
have_handoff_inputs() {
  [ -f "$IJ" ] && [ -f "$TPL" ] && return 0
  skip_once handoff "intents.json or templates/handoff.md missing — handoff checks skipped"
  return 1
}

check_C19() {
  have_jq || return 0
  have_handoff_inputs || return 0
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
}

check_C19b() {
  have_jq || return 0
  have_handoff_inputs || return 0
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
}

check_C19c() {
  have_jq || return 0
  have_handoff_inputs || return 0
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
}

# ------------- C21: change-record contract — template, archive, mirrors (P6)
# The change record is where delivered work claims conformance with its spec
# (spec: link, verification evidence, registered diff). Schema is data on the
# record-change intent; _template.md is the checked scaffold; archived
# instances are the checked claims; the prose homes are checked mirrors.
# Spec: docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md
RC='.intents[] | select(.id=="record-change")'

have_change_record_inputs() {
  [ -f "$IJ" ] && [ -f "$CT" ] && return 0
  skip_once change-record "intents.json or .engineos/changes/_template.md missing — change-record checks skipped"
  return 1
}

check_C21() {
  have_jq || return 0
  have_change_record_inputs || return 0
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
}

check_C21b() {
  have_jq || return 0
  have_change_record_inputs || return 0
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
}

check_C21c() {
  have_jq || return 0
  have_change_record_inputs || return 0
  # C21a validates this pattern; C21c only needs its value.
  sxp=$(jq -r "$RC | .archive_contract.spec_exempt_pattern // empty" "$IJ")
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
}

check_C21e() {
  have_jq || return 0
  have_change_record_inputs || return 0
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
}
