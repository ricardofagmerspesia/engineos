#!/usr/bin/env bash
# EngineOS — generate registries/agents.json from agents/*.md frontmatter.
# Always fully regenerated (unlike gen-agent-commands.sh's per-file customization
# marker) — one JSON file, nothing in it is ever hand-edited, so there is no
# "preserve this" case. CI's drift guard just diffs the committed file against a
# fresh run.
#
# capability_ids is a back-reference computed from registries/capabilities.json:
# every capability whose "agent" names this agent. model_tier comes from the
# agent's own "tier:" frontmatter — it is NOT derivable from the model name,
# because registries/models.json can bind two tiers to the same model (build
# and design both bind opus today). The generator only validates that the
# declared tier exists and that its model binding matches the frontmatter
# model; any mismatch is a hard error, never a guess.
#
# Re-run whenever agents/*.md, registries/capabilities.json or
# registries/models.json changes.
# Usage: ./scripts/gen-agent-registry.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$ROOT/agents"
CAPS_FILE="$ROOT/registries/capabilities.json"
MODELS_FILE="$ROOT/registries/models.json"
OUT_FILE="$ROOT/registries/agents.json"

command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
[ -d "$AGENTS_DIR" ] || { echo "No agents dir at $AGENTS_DIR" >&2; exit 1; }
[ -f "$CAPS_FILE" ] || { echo "No capabilities registry at $CAPS_FILE" >&2; exit 1; }
[ -f "$MODELS_FILE" ] || { echo "No models registry at $MODELS_FILE" >&2; exit 1; }

# field, file -> value (first match, after "field:" and any following spaces —
# [[:space:]]* rather than a literal single space, so a frontmatter line typo'd
# without the space after the colon still strips correctly instead of leaving
# the "field:" prefix stuck to the value). `|| true`: under set -e + pipefail,
# grep finding zero matches (a genuinely absent field, e.g. no tools: line)
# would otherwise make this whole function call fatal via its command
# substitution, before any caller gets a chance to treat "" as "field absent".
frontmatter_value() {
  grep -m1 "^$1:" "$2" | sed -E "s/^$1:[[:space:]]*//" || true
}

entries="[]"
for f in "$AGENTS_DIR"/*.md; do
  name="$(frontmatter_value name "$f")"
  [ -n "$name" ] || continue
  desc="$(frontmatter_value description "$f")"
  tools="$(frontmatter_value tools "$f")"
  model="$(frontmatter_value model "$f")"
  alias="$(sed -n '/^---$/,/^---$/p' "$f" | grep -oiE 'Alias: [a-z0-9-]+' | head -1 | sed -E 's/[Aa]lias: //' || true)"

  tier="$(frontmatter_value tier "$f")"
  if [ -z "$tier" ]; then
    echo "FAIL: $f has no 'tier:' frontmatter — the tier cannot be derived from the model (two tiers may share a binding, registries/models.json). Declare one of: $(jq -r '[.tiers[].id] | join(", ")' "$MODELS_FILE")." >&2
    exit 1
  fi
  tier_model="$(jq -r --arg t "$tier" '.tiers[] | select(.id == $t) | .model' "$MODELS_FILE")"
  if [ -z "$tier_model" ]; then
    echo "FAIL: $f declares unknown tier '$tier' — not a tier id in registries/models.json." >&2
    exit 1
  fi
  if [ "$tier_model" != "$model" ]; then
    echo "FAIL: $f declares tier '$tier' (binds model '$tier_model' in registries/models.json) but model '$model' — fix the frontmatter or rebind the tier." >&2
    exit 1
  fi
  capability_ids="$(jq -c --arg a "$name" '[.capabilities[] | select(.agent == $a) | .id]' "$CAPS_FILE")"

  entry=$(jq -n \
    --arg name "$name" \
    --arg alias "$alias" \
    --arg description "$desc" \
    --arg model "$model" \
    --arg model_tier "$tier" \
    --argjson tools "$(if [ -z "$tools" ]; then echo '[]'; else printf '%s' "$tools" | jq -R -c 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length > 0))'; fi)" \
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
