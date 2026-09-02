# shellcheck shell=bash
# Checks on the agent and skill documents themselves — frontmatter, the return
# envelope, slash-command coverage, and the no-empty-document floor.

# ------------------------------------------- C9/C10/C11: agent contract checks
scan_agent_contracts() {
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
}

check_C9() {
  scan_agent_contracts
  [ -z "$bad_fm"  ] && ok "agent frontmatter complete and name matches filename ($(ls agents/*.md | wc -l | tr -d ' ') agents)" || bad "agent frontmatter problems:$bad_fm"
}

check_C10() {
  scan_agent_contracts
  [ -z "$bad_ret" ] && ok "every agent declares the canonical Return format envelope"                                        || bad "agent return-format problems:$bad_ret"
}

check_C11() {
  scan_agent_contracts
  [ -z "$bad_cmd" ] && ok "every agent and alias has a slash command"                                                        || bad "missing slash commands:$bad_cmd"
}

# ------------------------------------------------------- C12: skill contracts
check_C12() {
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
}

# ------------------------------------------------------------ C13: no empties
check_C13() {
  empties=""
  for f in rules/*.md agents/*.md skills/*/SKILL.md; do
    [ -s "$f" ] || empties="$empties $f"
  done
  [ -z "$empties" ] && ok "no empty rule/agent/skill documents" || bad "empty documents:$empties"
}
