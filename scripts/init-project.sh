#!/usr/bin/env bash
# EngineOS — adopt EngineOS in ONE project, in one command.
#
# install.sh is machine-scoped (links skills/agents/hooks into ~/.claude and
# imports the constitution). This script is project-scoped: it creates the
# .engineos/ + docs/ layout (which is also the opt-in signal every EngineOS
# hook reads), drops a deltas-only CLAUDE.md if the project has none, and
# prints the optional follow-ups. Idempotent; never overwrites user files.
#
# Usage: scripts/init-project.sh [--dir PATH] [--dry-run]
# Exit:  0 ok | 1 machine install missing | 2 not a git work tree | 3 refused (engineos repo itself)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$PWD"; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) [ $# -ge 2 ] || { echo "--dir needs a path" >&2; exit 64; }; TARGET="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "usage: $0 [--dir PATH] [--dry-run]" >&2; exit 64 ;;
  esac
done

# 1. Machine install present? Same regex install.sh uses for its own import line.
IMPORT_RE='^@[^[:space:]]+[/\\]CLAUDE\.md[[:space:]]*$'
if ! grep -Eq "$IMPORT_RE" "$HOME/.claude/CLAUDE.md" 2>/dev/null; then
  echo "[engineos] machine install not found in ~/.claude/CLAUDE.md — run once: $REPO_DIR/install.sh" >&2
  exit 1
fi

# 2. A git work tree?
ROOT=$(cd "$TARGET" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || { echo "[engineos] $TARGET is not inside a git work tree" >&2; exit 2; }

# 3. Not the engineos repo itself (its .engineos/ is the canonical store).
if [ -f "$ROOT/hooks/layout-manifest.sh" ] && [ -f "$ROOT/install.sh" ]; then
  echo "[engineos] refusing to init inside the EngineOS repo" >&2; exit 3
fi

echo "[engineos] adopting EngineOS in $ROOT"
[ "$DRY" -eq 1 ] && echo "(dry run — nothing written)"

# 4. Layout — the same function the SessionStart hook uses.
# shellcheck source=hooks/scaffold-layout.sh
. "$REPO_DIR/hooks/scaffold-layout.sh"
if [ "$DRY" -eq 0 ]; then
  created=$(engineos_scaffold_layout "$ROOT" "$REPO_DIR" | paste -sd, -)
  [ -n "$created" ] && echo "  created: ${created//,/, }" || echo "  layout: already complete"
else
  echo "  would ensure: $(sed -n 's/^  "\([^|]*\)|.*/\1/p' "$REPO_DIR/hooks/layout-manifest.sh" | paste -sd, -)"
fi

# 5. Project CLAUDE.md — deltas only, never overwrite.
if [ -f "$ROOT/CLAUDE.md" ]; then
  echo "  CLAUDE.md: exists, left untouched (declare your stack there — see templates/project-claude.md)"
elif [ "$DRY" -eq 0 ]; then
  cp "$REPO_DIR/templates/project-claude.md" "$ROOT/CLAUDE.md"
  echo "  CLAUDE.md: created from templates/project-claude.md — fill in the Stack and Commands sections"
else
  echo "  would create CLAUDE.md from templates/project-claude.md"
fi

cat <<EOF

Done. EngineOS is now the default methodology for this project:
  - routing, risk, gates and the change-record Stop gate are active on the next Claude Code session
  - commit .engineos/ and CLAUDE.md so teammates get the same behaviour

Optional next steps (docs/ADOPTION.md sections 4-6):
  - MCP servers for the read-only specialists: $REPO_DIR/templates/mcp.template.json
  - CI agents:                                  $REPO_DIR/docs/ADOPTION.md#5
  - confirm the gates are live:                 open a session, edit a file, expect a [router] line
EOF
