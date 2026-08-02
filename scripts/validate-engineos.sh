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

# --------------------------------- C6/C7/C8: routing-map.sh targets all exist
map=hooks/routing-map.sh
missing_agents=""; missing_skills=""; missing_rules=""
for a in $(grep -oE 'agent:[a-z-]+' "$map" | sed 's/agent://' | sort -u); do
  [ -f "agents/$a.md" ] || missing_agents="$missing_agents $a"
done
for s in $(grep -oE 'skill:[a-z-]+' "$map" | sed 's/skill://' | sort -u); do
  [ -f "skills/$s/SKILL.md" ] || missing_skills="$missing_skills $s"
done
# routing-map writes chained rule lists: "rules/backend.md+architecture.md+data.md"
for r in $(grep -oE '(rules/|\+)[a-z0-9-]+\.md' "$map" | sed 's|^rules/||; s|^+||; s|\.md$||' | sort -u); do
  [ -f "rules/$r.md" ] || missing_rules="$missing_rules $r"
done
[ -z "$missing_agents" ] && ok "routing-map.sh agents all exist" || bad "routing-map.sh names missing agents:$missing_agents"
[ -z "$missing_skills" ] && ok "routing-map.sh skills all exist" || bad "routing-map.sh names missing skills:$missing_skills"
[ -z "$missing_rules"  ] && ok "routing-map.sh rules all exist"  || bad "routing-map.sh names missing rules:$missing_rules"

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

# ------------------------------------------------------------ C13: no empties
empties=""
for f in rules/*.md agents/*.md skills/*/SKILL.md; do
  [ -s "$f" ] || empties="$empties $f"
done
[ -z "$empties" ] && ok "no empty rule/agent/skill documents" || bad "empty documents:$empties"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
