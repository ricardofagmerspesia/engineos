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

# Resolve project root; bail silently if not a git work tree.
ROOT=$(cd "$CWD" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$ROOT" ] || exit 0

# Reap stale unrecorded-change gate flags (>7 days). The record-change skill clears
# these per-session on completion; a crashed/abandoned session can otherwise leave
# one behind indefinitely and block the Stop gate for good. Runs for every session,
# including the engineos repo itself, ahead of the skip check below.
GITDIR=$(cd "$CWD" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || GITDIR=""
if [ -n "$GITDIR" ] && [ -d "$GITDIR" ]; then
  find "$GITDIR" -maxdepth 1 -name 'ENGINEOS_UNRECORDED.*' -mtime +7 -exec rm -f {} + 2>/dev/null || true
fi

# Reap kernel-telemetry event files past their retention window (registries/
# policy.json telemetry.retention_days — read at runtime, never hardcoded, so
# a private-copy window can't drift from the registry). No jq -> no reap this
# session; files persist until a jq-present session runs, never a stale
# hardcoded window.
if command -v jq >/dev/null 2>&1 && [ -n "$GITDIR" ] && [ -d "$GITDIR/engineos-telemetry" ]; then
  RET=$(jq -r '.telemetry.retention_days // empty' "$REPO_DIR/registries/policy.json" 2>/dev/null)
  case "$RET" in ''|*[!0-9]*) : ;; *)
    find "$GITDIR/engineos-telemetry" -maxdepth 1 -name '*.jsonl' -mtime "+$RET" -exec rm -f {} + 2>/dev/null || true ;;
  esac
fi

# Skip the engineos repo itself (it ships the manifest at its root).
[ -f "$ROOT/hooks/layout-manifest.sh" ] && [ -f "$ROOT/install.sh" ] && exit 0

# Opt-in gate: scaffolding dirties the worktree, so it never runs on repos that
# haven't adopted EngineOS. Adopted = `.engineos/` already present, or the user
# opts a new project in with ENGINEOS_SCAFFOLD=1. ENGINEOS_SCAFFOLD=0 disables
# even for adopted repos. One hint line tells new projects how to opt in.
[ "${ENGINEOS_SCAFFOLD:-}" = "0" ] && exit 0
if [ ! -d "$ROOT/.engineos" ] && [ "${ENGINEOS_SCAFFOLD:-}" != "1" ]; then
  printf '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1\n'
  exit 0
fi

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
  if [ ! -d "$target" ]; then
    mkdir -p "$target" 2>/dev/null || continue
    created+=("$dir")
  fi
  IFS=',' read -ra pairs <<< "$seeds"
  for pair in "${pairs[@]}"; do
    src="${pair%%:*}"; dest="${pair#*:}"
    abs=$(resolve_src "$src")
    [ -n "$abs" ] && [ -f "$abs" ] && [ ! -f "$target/$dest" ] \
      && cp "$abs" "$target/$dest" 2>/dev/null || true
  done
done

if [ "${#created[@]}" -gt 0 ]; then
  # subshell scopes IFS to this one printf — must not leak into the rest of the script
  ( IFS=', '; printf '[engineos] scaffolded standard layout: %s (review seeded READMEs)\n' "${created[*]}" )
fi
exit 0
