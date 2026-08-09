#!/usr/bin/env bash
# EngineOS SessionStart: scaffold the standard project layout, non-blocking.
# Creates any missing standard dir in the session's git project and seeds its
# README/_template from templates/project-layout/ (or reuse in-repo files for the
# .engineos/* dirs). Prints ONE warn line listing what it created; silent when the
# layout is already complete. ALWAYS exits 0 — must never break a session start.
#
# Skips: non-git dirs (scratch, $HOME) and the engineos repo itself (its
# .engineos/ is the canonical store, not a consumer).
set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INPUT=$(cat 2>/dev/null || true)

# Parse cwd: prefer jq, fall back to a minimal grep so we never hard-depend on jq.
if command -v jq >/dev/null 2>&1; then
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
else
  CWD=$(printf '%s' "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"cwd"[^"]*"\([^"]*\)".*/\1/')
fi
[ -n "$CWD" ] || exit 0

# Expire any bypass left over from a previous session. Done BEFORE the git and
# engineos-repo skips below, so a forgotten bypass always dies at the next
# session start — including inside the engineos repo itself, which those skips
# would otherwise exempt. A bypass never outlives the session that asked for it.
# shellcheck source=hooks/bypass.sh
. "$(cd "$(dirname "$0")" && pwd)/bypass.sh"
if BYPASS_MARKER=$(engineos_bypass_marker "$CWD"); then rm -f "$BYPASS_MARKER"; fi

# Resolve project root; bail silently if not a git work tree.
ROOT=$(cd "$CWD" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$ROOT" ] || exit 0

# Skip the engineos repo itself (it ships the manifest at its root).
[ -f "$ROOT/hooks/layout-manifest.sh" ] && [ -f "$ROOT/install.sh" ] && exit 0

# shellcheck source=/dev/null
source "$REPO_DIR/hooks/layout-manifest.sh" 2>/dev/null || exit 0

resolve_src() {  # $1 = src token -> absolute path or empty
  case "$1" in
    @*) printf '%s/%s' "$REPO_DIR" "${1#@}" ;;
    *)  printf '%s/templates/project-layout/%s' "$REPO_DIR" "$1" ;;
  esac
}

created=()
for entry in "${LAYOUT_MANIFEST[@]}"; do
  dir="${entry%%|*}"; seeds="${entry#*|}"
  target="$ROOT/$dir"
  [ -d "$target" ] && continue
  mkdir -p "$target" 2>/dev/null || continue
  created+=("$dir")
  IFS=',' read -ra pairs <<< "$seeds"
  for pair in "${pairs[@]}"; do
    src="${pair%%:*}"; dest="${pair#*:}"
    abs=$(resolve_src "$src")
    [ -n "$abs" ] && [ -f "$abs" ] && [ ! -f "$target/$dest" ] \
      && cp "$abs" "$target/$dest" 2>/dev/null || true
  done
done

if [ "${#created[@]}" -gt 0 ]; then
  IFS=', '; printf '[engineos] scaffolded standard layout: %s (review seeded READMEs)\n' "${created[*]}"
fi
exit 0
