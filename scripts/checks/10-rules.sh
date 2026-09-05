# shellcheck shell=bash
# Checks on the constitution and the rule corpus: the tooling this validator and
# the installer need, the always-on imports, cross-reference resolution, and the
# two closure invariants CLAUDE.md states in prose.

# ---------------------------------------------------------------- C1: tooling
# The registered hooks no longer read JSON with jq — every one of them is a shim
# over dist/engineos.cjs and parses tool input natively, so the old "four hooks
# go silent" reason retired with the port. jq is still load-bearing one layer
# out: every registry Check below reads policy/routing JSON through it (lib.sh
# have_jq), install.sh merges hooks into settings.json with it, and
# scripts/gen-agent-registry.sh refuses to run without it.
check_C1() {
  if command -v jq >/dev/null 2>&1; then
    ok "jq present (this validator's registry Checks, install.sh's hook registration and scripts/gen-agent-registry.sh need it)"
  else
    bad "jq missing — every registry Check below skips, install.sh cannot register the hooks, and scripts/gen-agent-registry.sh will not run"
  fi
}

# ------------------------------------------------- C2: always-on imports exist
check_C2() {
  if [ -z "$ALWAYS_ON" ]; then
    bad "CLAUDE.md declares no @rules/*.md always-on imports"
  else
    miss=""
    for r in $ALWAYS_ON; do [ -f "rules/$r.md" ] || miss="$miss $r"; done
    [ -z "$miss" ] && ok "always-on imports resolve ($(echo "$ALWAYS_ON" | tr '\n' ' '))" \
                   || bad "always-on imports point at missing files:$miss"
  fi
}

# ---------------------------------- C3: every rules/X.md reference resolves
# One Check over both halves of the old C3/C4 pair: the loop below walks every
# prose surface and every reference in it, and emits a single verdict.
check_C3() {
  broken=""
  for f in CLAUDE.md rules/*.md agents/*.md skills/*/SKILL.md skills/*/references/*.md commands/*.md; do
    [ -f "$f" ] || continue
    for ref in $(grep -oE 'rules/[a-z0-9-]+\.md' "$f" 2>/dev/null | sort -u); do
      [ -f "$ref" ] || broken="$broken $f->$ref"
    done
  done
  [ -z "$broken" ] && ok "all rules/*.md cross-references resolve" \
                   || bad "dangling rule references:$broken"
}

# ------------------------------------------------------ C5: router row closure
# The deferral graph itself is lib.sh:deferrals_of.
check_C5() {
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
}

# ------------------------- C5b: always-on files reference only always-on rules
# CLAUDE.md: "Always-on files ... may point only at other always-on files, at repo
# templates, or at registries/*.json." Enforced here rather than trusted.
check_C5b() {
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
}
