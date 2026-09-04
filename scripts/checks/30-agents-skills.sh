# shellcheck shell=bash
# Checks on the agent and skill documents themselves — frontmatter, the return
# envelope, slash-command coverage, the no-empty-document floor, and the
# tier/model agreement between an agent and registries/models.json.

# ------------------------------------------- C9/C10/C11: agent contract checks
scan_agent_contracts() {
  bad_fm=""; bad_ret=""; bad_cmd=""
  for f in agents/*.md; do
    base=$(basename "$f" .md)
    # Deliberately the validator's OWN frontmatter reader, not the generator's:
    # sourcing scripts/gen-agent-registry.sh here would make a broken generator
    # invisible — the Check would read the agent files exactly as wrongly as the
    # thing it exists to catch. Two independent readers, on purpose.
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

# ------------------------------- C24: agent tier agrees with the model binding
# The tier is the contract and the model name is only today's binding
# (rules/models.md); registries/models.json is that table's machine-readable
# form. An agent declaring a tier whose registry binding is not the model it
# also declares is claiming to run somewhere it does not — and because two tiers
# can share one binding (build and design both bind opus today), the mismatch is
# not recoverable by inference. scripts/gen-agent-registry.sh refuses to emit
# such an agent; this Check refuses to let one sit in the tree at all, so the
# tree stays correct even when nobody has regenerated the registry.
#
# A fresh id rather than a C13 suffix: a letter suffix in this harness means
# "sub-check of that parent", and --only C13 selecting a tier check would be a
# lie about what C13 ("no empty documents") is.
check_C24() {
  have_jq || return 0
  [ -f "$MJ" ] || { skip_once models "no models registry at $MJ"; return 0; }
  bad_tier=""; pairs=0
  for f in agents/*.md; do
    b=$(basename "$f" .md)
    t=$(sed -n 's/^tier: *//p' "$f" | head -1)
    m=$(sed -n 's/^model: *//p' "$f" | head -1)
    [ -n "$t" ] && [ -n "$m" ] || continue
    pairs=$((pairs + 1))
    bound=$(jq -r --arg t "$t" '.tiers[] | select(.id == $t) | .model' "$MJ")
    if [ -z "$bound" ]; then
      bad_tier="$bad_tier $b(unknown-tier:$t)"
    elif [ "$bound" != "$m" ]; then
      bad_tier="$bad_tier $b(tier:$t-binds-$bound,model:$m)"
    fi
  done
  [ -z "$bad_tier" ] && ok "every agent's tier binds the model it declares ($pairs agents)" \
                     || bad "agent tier/model disagreements:$bad_tier"
}
