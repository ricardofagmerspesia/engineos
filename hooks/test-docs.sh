#!/usr/bin/env bash
# Probes the EngineOS PROSE layer — the CLAUDE.md router table, rules/, agents/,
# commands/ and skills/. Not a hook: it lives here because hooks/test-*.sh is the
# glob everyone already runs. Four families:
#   1 referential integrity  2 hook<->table parity  3 closure  4 marker budgets
# Accepted debt is declared in hooks/docs-ledger.sh, never hidden here.
# Pure bash + grep: no jq, no node, no python.
# Run: hooks/test-docs.sh [repo-root]
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${1:-$DIR/..}" && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=/dev/null
. "$ROOT/hooks/docs-ledger.sh"

pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }
note(){ echo "note: $1"; }
has(){ printf '%s\n' "$2" | grep -qxF "$1"; }

# ---------------------------------------------------------------- inventories
RULES=$(for f in rules/*.md; do b=${f##*/}; echo "${b%.md}"; done)
AGENTS=$(grep -h '^name:' agents/*.md | sed 's/^name:[[:space:]]*//')
SKILLS=$(for d in skills/*/; do b=${d%/}; echo "${b##*/}"; done)

# "<alias> <agent>" per declared alias
ALIAS_PAIRS=$(for f in agents/*.md; do
  n=$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')
  grep -o 'Alias[a-z]*:[^.]*' "$f" | sed 's/^Alias[a-z]*:[[:space:]]*//' | tr ',' '\n' |
    sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | while read -r a; do
      [ -n "$a" ] && echo "$a $n"
    done
done)

# Prose corpus — what a reader/agent actually consumes.
CORPUS=$( { echo CLAUDE.md; find rules agents commands skills templates -type f -name '*.md' | sort; } )
# Reference scan adds the executable layer: a hook or generator naming an agent
# or skill makes it reachable just as a doc does.
REFSCAN=$( { printf '%s\n' "$CORPUS"; ls hooks/*.sh scripts/*.sh registries/*.json 2>/dev/null; } )

# ------------------------------------------- family 1: referential integrity
echo "--- family 1: referential integrity"

# Match .mdc too, then drop it: the Cursor mirror ships rules/*.mdc, and an
# unanchored .md pattern reads those as missing EngineOS rules.
for r in $(grep -hoE 'rules/[a-z-]+\.mdc?' $CORPUS | grep -v '\.mdc$' | sed 's|rules/||;s|\.md$||' | sort -u); do
  has "$r" "$RULES" && ok || no "rules/$r.md is referenced but not on disk"
done

# Backticked references only: plain prose is ambiguous ("per-specialist" looks
# like an agent and is not one). Backticks are the convention; trusting only
# them is what enforces it.
for a in $(grep -hoE '`[a-z][a-z-]*-(coordinator|reviewer|writer|tester|analyst|builder|consolidator|specialist)`' $CORPUS | tr -d '`' | sort -u); do
  has "$a" "$AGENTS" && ok || no "agent \`$a\` is referenced but no agents/*.md declares it"
done

for s in $(grep -hoE '(skills?[[:space:]]+`[a-z-]+`|`[a-z-]+`[[:space:]]+skill)' $CORPUS | grep -oE '`[a-z-]+`' | tr -d '`' | sort -u); do
  case " $ENGINEOS_EXTERNAL_SKILLS " in *" $s "*) continue ;; esac
  has "$s" "$SKILLS" && ok || no "skill \`$s\` is referenced but skills/$s/ does not exist"
done

# Orphans. commands/agents/** is generated from the roster, so counting it as a
# reference would make this check vacuous.
for a in $AGENTS; do
  n=$(grep -lF -- "$a" $REFSCAN 2>/dev/null | grep -Ecv '^(agents/|commands/agents/)')
  [ "$n" -gt 0 ] && ok || no "agent $a exists but is named nowhere — unreachable"
done
for s in $SKILLS; do
  n=$(grep -lF -- "$s" $REFSCAN 2>/dev/null | grep -cv "^skills/$s/")
  [ "$n" -gt 0 ] && ok || no "skill $s exists but is named nowhere — unreachable"
done

dups=$(printf '%s\n' "$ALIAS_PAIRS" | awk 'NF{print $1}' | sort | uniq -d)
[ -z "$dups" ] && ok || no "alias collision: $(printf '%s' "$dups" | tr '\n' ' ')"

for a in $AGENTS; do
  case " $ENGINEOS_ALIAS_EXEMPT " in *" $a "*) continue ;; esac
  printf '%s\n' "$ALIAS_PAIRS" | awk -v n="$a" 'NF && $2==n {found=1} END{exit !found}' &&
    ok || no "agent $a declares no alias and is not in ENGINEOS_ALIAS_EXEMPT"
done

# commands/agents/ is a bijection with agents + aliases.
EXPECTED=$( { printf '%s\n' "$AGENTS"; printf '%s\n' "$ALIAS_PAIRS" | awk 'NF{print $1}'; } | grep -v '^$' | sort -u)
ACTUAL=$(for f in commands/agents/*.md; do b=${f##*/}; echo "${b%.md}"; done | sort -u)
while read -r e; do
  [ -z "$e" ] && continue
  has "$e" "$ACTUAL" && ok || no "no commands/agents/$e.md — run scripts/gen-agent-commands.sh"
done < <(printf '%s\n' "$EXPECTED")
while read -r a; do
  [ -z "$a" ] && continue
  has "$a" "$EXPECTED" && ok || no "commands/agents/$a.md maps to no agent name or alias"
done < <(printf '%s\n' "$ACTUAL")

# -------------------------------------------- family 2: hook <-> table parity
echo "--- family 2: hook <-> table parity"

for a in $(grep -oE 'agent:[a-z-]+' hooks/routing-map.sh | sed 's/agent://' | sort -u); do
  has "$a" "$AGENTS" && ok || no "routing-map.sh routes to unknown agent $a"
  grep -qF "$a" CLAUDE.md && ok || no "routing-map.sh routes to $a but the CLAUDE.md router table never names it"
done
for r in $(grep -oE '(rules/)?[a-z-]+\.md' hooks/routing-map.sh | sed 's|rules/||;s|\.md$||' | sort -u); do
  has "$r" "$RULES" && ok || no "routing-map.sh names rules/$r.md, which is not on disk"
done

# ---------------------------------------------------- family 3: closure
echo "--- family 3: router-row closure"

xrefs(){ grep -hoE 'rules/[a-z-]+\.md' "rules/$1.md" 2>/dev/null | sed 's|rules/||;s|\.md$||' | sort -u | grep -vx "$1"; }
excepted(){ printf '%s\n' "$ENGINEOS_CLOSURE_EXCEPTIONS" | grep -q "^$1|$2|"; }
always_on(){ case " $ENGINEOS_ALWAYS_ON " in *" $1 "*) return 0 ;; esac; return 1; }

# Router rows: drop the intent cell and the trailing bar, keep the load cell
# (which may itself contain escaped pipes).
rows(){ awk '/^\| / { s=$0; sub(/^\|[^|]*\|/,"",s); sub(/\|[[:space:]]*$/,"",s); print s }' CLAUDE.md; }

# Always-on files are in context for every row, so an unexcepted outward pointer
# is a gap in every row at once. Checked first and separately for that reason.
for a in $ENGINEOS_ALWAYS_ON; do
  for b in $(xrefs "$a"); do
    always_on "$b" && continue
    excepted "$a" "$b" && ok ||
      no "closure: always-on rules/$a.md points at non-always-on rules/$b.md with no declared exception"
  done
done

NEEDED=$(while read -r load; do
  loaded=$(printf '%s' "$load" | grep -oE 'rules/[a-z-]+\.md' | sed 's|rules/||;s|\.md$||' | sort -u)
  [ -z "$loaded" ] && continue
  for a in $loaded; do
    always_on "$a" && continue
    for b in $(xrefs "$a"); do
      always_on "$b" && continue
      has "$b" "$loaded" && continue
      echo "$a|$b"
    done
  done
done < <(rows) | sort -u)

while read -r pair; do
  [ -z "$pair" ] && continue
  a=${pair%%|*}; b=${pair##*|}
  excepted "$a" "$b" && ok ||
    no "closure: a row loads rules/$a.md, which points at rules/$b.md — neither always-on, nor loaded in the same row, nor a declared exception"
done < <(printf '%s\n' "$NEEDED")

# A stale exception is a lie about the corpus: fail it.
while IFS='|' read -r a b reason; do
  [ -z "${a:-}" ] && continue
  [ -z "${reason:-}" ] && { no "closure exception $a|$b carries no reason"; continue; }
  xrefs "$a" | grep -qx "$b" && ok ||
    no "stale closure exception $a|$b — rules/$a.md no longer points at rules/$b.md; delete the ledger line"
done < <(printf '%s\n' "$ENGINEOS_CLOSURE_EXCEPTIONS")

# ------------------------------------------------ family 4: marker budgets
echo "--- family 4: marker budgets"

while IFS='|' read -r phrase max owner; do
  [ -z "${phrase:-}" ] && continue
  n=$(grep -lF -- "$phrase" $CORPUS 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" -gt "$max" ]; then
    no "marker '$phrase' is in $n files, budget $max — new duplication, put it back in one place"
  else
    ok
    [ "$n" -lt "$max" ] && note "marker '$phrase' is down to $n files (budget $max) — tighten the budget"
  fi
  if [ "$owner" != "-" ]; then
    grep -qF -- "$phrase" "$owner" 2>/dev/null && ok ||
      no "marker '$phrase' is missing from its declared owner $owner"
  fi
done < <(printf '%s\n' "$ENGINEOS_MARKER_BUDGETS")

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
