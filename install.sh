#!/usr/bin/env bash
# EngineOS installer — links the shared engineering environment into ~/.claude.
# Idempotent: safe to re-run after every `git pull`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }

echo "EngineOS install from: $REPO_DIR"

# ---------- 1. Secrets gate: refuse to install a repo containing secrets ----------
SECRET_PATTERNS='sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN( RSA| EC|) PRIVATE KEY-----'
if grep -rIEq "$SECRET_PATTERNS" "$REPO_DIR" --exclude-dir=.git --exclude=install.sh 2>/dev/null; then
  red "ABORT: secret-looking strings found in the repo. Remove + rotate before installing/pushing:"
  grep -rIEl "$SECRET_PATTERNS" "$REPO_DIR" --exclude-dir=.git --exclude=install.sh
  exit 1
fi

# ---------- 2. Warn about secrets in local settings (not repo, but still bad) ----------
if [ -f "$SETTINGS" ] && grep -qE 'sk-ant-[A-Za-z0-9_-]{10,}' "$SETTINGS"; then
  warn "WARNING: literal API key found in $SETTINGS."
  warn "Move it to a shell env var (export ANTHROPIC_API_KEY=...) and ROTATE the key."
fi

# ---------- 3. Import EngineOS constitution into global CLAUDE.md ----------
mkdir -p "$CLAUDE_DIR"
IMPORT_LINE="@$REPO_DIR/CLAUDE.md"
touch "$CLAUDE_DIR/CLAUDE.md"
if grep -qF "$IMPORT_LINE" "$CLAUDE_DIR/CLAUDE.md"; then
  echo "CLAUDE.md import already present."
else
  printf '\n%s\n' "$IMPORT_LINE" >> "$CLAUDE_DIR/CLAUDE.md"
  green "Added EngineOS import to ~/.claude/CLAUDE.md (personal lines untouched)."
fi

# ---------- 4. Symlink skills ----------
mkdir -p "$CLAUDE_DIR/skills"
for skill in "$REPO_DIR"/skills/*/; do
  name=$(basename "$skill")
  target="$CLAUDE_DIR/skills/$name"
  if [ -L "$target" ] || [ ! -e "$target" ]; then
    ln -sfn "$skill" "$target"
    echo "skill linked: $name"
  else
    warn "skip: $target exists and is not a symlink (local skill with same name?)"
  fi
done

# ---------- 5. Hooks: merge into settings.json (requires jq) ----------
chmod +x "$REPO_DIR"/hooks/*.sh
if command -v jq >/dev/null 2>&1; then
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  cp "$SETTINGS" "$SETTINGS.engineos.bak"

  POST="$REPO_DIR/hooks/post-edit-check.sh"
  STOP="$REPO_DIR/hooks/stop-verify.sh"

  jq --arg post "$POST" --arg stop "$STOP" '
    .hooks //= {} |
    .hooks.PostToolUse //= [] |
    (if ([.hooks.PostToolUse[]? | .hooks[]? | select(.command == $post)] | length) == 0
     then .hooks.PostToolUse += [{matcher: "Edit|Write", hooks: [{type: "command", command: $post}]}]
     else . end) |
    .hooks.Stop //= [] |
    (if ([.hooks.Stop[]? | .hooks[]? | select(.command == $stop)] | length) == 0
     then .hooks.Stop += [{matcher: "", hooks: [{type: "command", command: $stop}]}]
     else . end)
  ' "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
  green "Hooks merged into settings.json (backup: settings.json.engineos.bak)."
else
  warn "jq not found — add hooks manually to $SETTINGS:"
  warn "  PostToolUse matcher 'Edit|Write' -> $REPO_DIR/hooks/post-edit-check.sh"
  warn "  Stop -> $REPO_DIR/hooks/stop-verify.sh"
fi

# ---------- 6. MCP reminder ----------
echo ""
echo "MCP baseline: see templates/mcp.template.json — add servers with 'claude mcp add'"
echo "or copy entries into settings.json. Use env var references, never literal tokens."
echo ""
green "EngineOS installed. Restart Claude Code sessions to pick up changes."
