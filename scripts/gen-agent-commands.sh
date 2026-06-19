#!/usr/bin/env bash
# EngineOS — generate slash-command entrypoints for every agent.
# One command per agent canonical name AND per alias, so users can invoke an
# agent directly with `/<name>` or `/<alias>`. Each command dispatches the agent
# via the Task tool with the user's text as the prompt; the agent self-infers its
# own mode (AUDIT/IMPLEMENT) per its definition.
# Re-run whenever agents are added/renamed/re-aliased. Usage: ./scripts/gen-agent-commands.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$ROOT/agents"
OUT_DIR="$ROOT/commands/agents"

[ -d "$AGENTS_DIR" ] || { echo "No agents dir at $AGENTS_DIR" >&2; exit 1; }

# Wipe and recreate so renamed/removed aliases don't leave stale files behind.
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

frontmatter_value() { # field, file -> value (first match, after "field: ")
  grep -m1 "^$1:" "$2" | sed "s/^$1: //"
}

emit() { # invoke_name, agent_name, alias, description
  local invoke="$1" agent="$2" alias="$3" desc="$4"
  cat > "$OUT_DIR/$invoke.md" <<EOF
---
description: $desc
argument-hint: [task or question for the agent]
allowed-tools: Task
---

Dispatch the \`$agent\` agent (alias \`$alias\`) via the Task tool, passing
\`\$ARGUMENTS\` as its prompt. If \`\$ARGUMENTS\` is empty, ask the user what they
want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers AUDIT vs
IMPLEMENT where applicable). Relay its report back verbatim; do not re-do its
work yourself.
EOF
}

count=0
for f in "$AGENTS_DIR"/*.md; do
  name="$(frontmatter_value name "$f")"
  [ -n "$name" ] || { echo "skip (no name): $f" >&2; continue; }
  # Alias: from description line "Alias: <slug> (invocable by this name)."
  alias="$(grep -oiE 'Alias: [a-z0-9-]+' "$f" | head -1 | sed -E 's/[Aa]lias: //')"
  desc="Invoke the $name agent${alias:+ (alias $alias)}."

  emit "$name" "$name" "${alias:-$name}" "$desc"
  count=$((count + 1))
  if [ -n "$alias" ] && [ "$alias" != "$name" ]; then
    emit "$alias" "$name" "$alias" "$desc"
    count=$((count + 1))
  fi
done

echo "Generated $count agent command(s) in $OUT_DIR"
