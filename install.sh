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
# NOTE: no empty regex alternations — BSD grep (macOS default) aborts the whole
# pattern on an empty branch, which previously made this gate a silent no-op.
# Scans GIT-TRACKED files only (what could be committed) — untracked junk
# (node_modules, build output, stray projects) is irrelevant to "secrets in the
# repo" and would only cause false positives. Falls back to a recursive scan if
# REPO_DIR is not a git work tree. FAILS CLOSED on an invalid pattern.
SECRET_PATTERNS='sk-ant-[A-Za-z0-9_-]{10,}|sk-proj-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|gh[opsu]_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|ATATT[A-Za-z0-9_=.-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|"private_key_id"[[:space:]]*:|[a-z][a-z+]+://[^/[:space:]]+:[^@[:space:]]+@'

set +e
# fail closed if the pattern itself is invalid (grep rc>=2 on a trivial probe)
printf '' | grep -E "$SECRET_PATTERNS" >/dev/null 2>&1
[ "$?" -ge 2 ] && { set -e; red "ABORT: secrets-gate pattern failed to compile. Failing closed."; exit 1; }

if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  SECRET_HITS=$( cd "$REPO_DIR" && git ls-files -z | grep -zv '^install\.sh$' | xargs -0 grep -IlE "$SECRET_PATTERNS" 2>/dev/null )
else
  SECRET_HITS=$(grep -rIlE "$SECRET_PATTERNS" "$REPO_DIR" --exclude-dir=.git --exclude=install.sh 2>/dev/null)
fi
set -e
if [ -n "$SECRET_HITS" ]; then
  red "ABORT: secret-looking strings found in tracked files. Remove + rotate before installing/pushing:"
  printf '%s\n' "$SECRET_HITS"
  exit 1
fi

# ---------- 2. Warn about secrets in local settings (not repo, but still bad) ----------
if [ -f "$SETTINGS" ] && grep -Elq "$SECRET_PATTERNS" "$SETTINGS" >/dev/null 2>&1; then
  warn "WARNING: secret-looking value(s) found in $SETTINGS (API key / token / connection string)."
  warn "Move them to shell env vars (export VAR=...; reference \${VAR} in config) and ROTATE."
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
  [ -d "$skill" ] || continue   # empty glob guard (no nullglob on bash 3.2)
  name=$(basename "$skill")
  target="$CLAUDE_DIR/skills/$name"
  if [ -L "$target" ] || [ ! -e "$target" ]; then
    ln -sfn "$skill" "$target"
    echo "skill linked: $name"
  else
    warn "skip: $target exists and is not a symlink (local skill with same name?)"
  fi
done

# ---------- 4b. Symlink subagents ----------
mkdir -p "$CLAUDE_DIR/agents"
for agent in "$REPO_DIR"/agents/*.md; do
  [ -e "$agent" ] || continue   # empty glob guard
  name=$(basename "$agent")
  target="$CLAUDE_DIR/agents/$name"
  if [ -L "$target" ] || [ ! -e "$target" ]; then
    ln -sfn "$agent" "$target"
    echo "agent linked: ${name%.md}"
  else
    warn "skip: $target exists and is not a symlink"
  fi
done

# ---------- 4c. Symlink commands (mode A: available as /audit, /implement; the
# /engineos: namespace prefix only applies in plugin mode) ----------
if [ -d "$REPO_DIR/commands" ]; then
  mkdir -p "$CLAUDE_DIR/commands"
  for cmd in "$REPO_DIR"/commands/*.md; do
    [ -e "$cmd" ] || continue   # empty glob guard
    name=$(basename "$cmd")
    target="$CLAUDE_DIR/commands/$name"
    if [ -L "$target" ] || [ ! -e "$target" ]; then
      ln -sfn "$cmd" "$target"
      echo "command linked: /${name%.md}"
    else
      warn "skip: $target exists and is not a symlink"
    fi
  done
fi

# ---------- 5. Hooks: merge into settings.json (requires jq) ----------
chmod +x "$REPO_DIR"/hooks/*.sh
if command -v jq >/dev/null 2>&1; then
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  # write-once backup: never clobber the last known-good with an already-bad file
  [ -f "$SETTINGS.engineos.bak" ] || cp "$SETTINGS" "$SETTINGS.engineos.bak"

  POST="$REPO_DIR/hooks/post-edit-check.sh"
  STOP="$REPO_DIR/hooks/stop-verify.sh"
  ROUTE="$REPO_DIR/hooks/route-before-change.sh"
  MARK="$REPO_DIR/hooks/mark-unrecorded.sh"
  RECORD="$REPO_DIR/hooks/record-verify.sh"

  jq --arg post "$POST" --arg stop "$STOP" --arg route "$ROUTE" --arg mark "$MARK" --arg record "$RECORD" '
    # idempotent insert: add {matcher,cmd} under event unless cmd already present anywhere in that event
    def add($event; $matcher; $cmd):
      .hooks[$event] //= []
      | (if ([.hooks[$event][]? | .hooks[]? | select(.command == $cmd)] | length) == 0
         then .hooks[$event] += [{matcher: $matcher, hooks: [{type: "command", command: $cmd}]}]
         else . end);
    .hooks //= {}
    | add("PreToolUse";  "Edit|Write"; $route)
    | add("PostToolUse"; "Edit|Write"; $mark)
    | add("PostToolUse"; "Edit|Write"; $post)
    | add("Stop";        "";           $stop)
    | add("Stop";        "";           $record)
  ' "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
  green "Hooks merged into settings.json (backup: settings.json.engineos.bak)."

  # ---------- 5b. Shared permission allowlist (read-only commands) ----------
  PERMS="$REPO_DIR/templates/permissions.template.json"
  if [ -f "$PERMS" ]; then
    jq -s '
      .[0] as $settings | (.[1].allow // []) as $shared |
      $settings |
      .permissions //= {} |
      .permissions.allow = ((.permissions.allow // []) + $shared | unique)
    ' "$SETTINGS" "$PERMS" > "$SETTINGS.tmp" \
      && mv "$SETTINGS.tmp" "$SETTINGS"
    green "Shared read-only allowlist merged into permissions."
  else
    warn "permissions template missing ($PERMS) — skipped allowlist merge."
  fi
else
  warn "jq not found — add hooks manually to $SETTINGS:"
  warn "  PreToolUse  matcher 'Edit|Write' -> $REPO_DIR/hooks/route-before-change.sh"
  warn "  PostToolUse matcher 'Edit|Write' -> $REPO_DIR/hooks/post-edit-check.sh"
  warn "  PostToolUse matcher 'Edit|Write' -> $REPO_DIR/hooks/mark-unrecorded.sh"
  warn "  Stop -> $REPO_DIR/hooks/stop-verify.sh"
  warn "  Stop -> $REPO_DIR/hooks/record-verify.sh"
fi

# ---------- 6. MCP reminder ----------
echo ""
echo "MCP baseline: see templates/mcp.template.json — add servers with 'claude mcp add'"
echo "or copy entries into settings.json. Use env var references, never literal tokens."
echo ""
green "EngineOS installed. Restart Claude Code sessions to pick up changes."
