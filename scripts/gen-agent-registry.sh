#!/usr/bin/env bash
# EngineOS — generate registries/agents.json from agents/*.md frontmatter.
# Always fully regenerated (unlike gen-agent-commands.sh's per-file customization
# marker) — one JSON file, nothing in it is ever hand-edited, so there is no
# "preserve this" case. CI's drift guard just diffs the committed file against a
# fresh run.
#
# capability_ids is a back-reference computed from registries/capabilities.json:
# every capability whose "agent" names this agent. model_tier is the reverse
# lookup of the frontmatter model alias against rules/models.md's tier table —
# kept here as data so a consumer never has to hardcode that table itself.
#
# Re-run whenever agents/*.md or registries/capabilities.json changes.
# Usage: ./scripts/gen-agent-registry.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$ROOT/agents"
CAPS_FILE="$ROOT/registries/capabilities.json"
OUT_FILE="$ROOT/registries/agents.json"

command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
[ -d "$AGENTS_DIR" ] || { echo "No agents dir at $AGENTS_DIR" >&2; exit 1; }
[ -f "$CAPS_FILE" ] || { echo "No capabilities registry at $CAPS_FILE" >&2; exit 1; }

frontmatter_value() { # field, file -> value (first match, after "field: ")
  grep -m1 "^$1:" "$2" | sed "s/^$1: //"
}

# rules/models.md's tier table — the one place this mapping is allowed to live
# outside that file itself.
model_tier() {
  case "$1" in
    haiku) echo "cheap" ;;
    sonnet) echo "build" ;;
    opus) echo "design" ;;
    fable) echo "most-capable" ;;
    *) echo "unknown" ;;
  esac
}

entries="[]"
for f in "$AGENTS_DIR"/*.md; do
  name="$(frontmatter_value name "$f")"
  [ -n "$name" ] || continue
  desc="$(frontmatter_value description "$f")"
  tools="$(frontmatter_value tools "$f")"
  model="$(frontmatter_value model "$f")"
  alias="$(sed -n '/^---$/,/^---$/p' "$f" | grep -oiE 'Alias: [a-z0-9-]+' | head -1 | sed -E 's/[Aa]lias: //' || true)"
  tier="$(model_tier "$model")"
  capability_ids="$(jq -c --arg a "$name" '[.capabilities[] | select(.agent == $a) | .id]' "$CAPS_FILE")"

  entry=$(jq -n \
    --arg name "$name" \
    --arg alias "$alias" \
    --arg description "$desc" \
    --arg model "$model" \
    --arg model_tier "$tier" \
    --argjson tools "$(printf '%s' "$tools" | jq -R -c 'split(",") | map(gsub("^\\s+|\\s+$";""))')" \
    --argjson capability_ids "$capability_ids" \
    '{name: $name, alias: (if $alias == "" then null else $alias end), description: $description, tools: $tools, model: $model, model_tier: $model_tier, capability_ids: $capability_ids}')
  entries="$(printf '%s' "$entries" | jq --argjson e "$entry" '. + [$e]')"
done

jq -n --argjson agents "$(printf '%s' "$entries" | jq 'sort_by(.name)')" '{
  version: "1.0.0",
  description: "Generated from agents/*.md frontmatter by scripts/gen-agent-registry.sh — do not hand-edit. capability_ids is a back-reference from registries/capabilities.json.",
  agents: $agents
}' > "$OUT_FILE"

echo "Wrote $(jq '.agents | length' "$OUT_FILE") agents to $OUT_FILE"
