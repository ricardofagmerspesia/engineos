#!/usr/bin/env bash
# Shared helpers for EngineOS hooks. Sourced only — no independent execution,
# no exec bit. The shebang exists only so shellcheck (SC2148) knows the target
# shell; it is never invoked directly. Matches layout-manifest.sh's header.
#
# Source with: . "$(dirname "${BASH_SOURCE[0]}")/lib-common.sh"

# find_up <start_dir> <name...> -> echoes the dir containing the first match,
# walking up from start_dir. `prev` guard: on a relative path dirname converges
# to "." and never reaches "/", which would spin forever.
find_up() {
  local d="$1" prev=""; shift
  while [ "$d" != "/" ] && [ "$d" != "$prev" ] && [ -n "$d" ]; do
    for f in "$@"; do [ -e "$d/$f" ] && { echo "$d"; return 0; }; done
    prev="$d"; d=$(dirname "$d")
  done
  return 1
}

# find_up_file <start_dir> <name> -> echoes the FULL PATH of the first match
# (callers that need the matched file itself, not just its directory).
find_up_file() {
  local d="$1" name="$2" prev=""
  while [ "$d" != "/" ] && [ "$d" != "$prev" ] && [ -n "$d" ]; do
    [ -e "$d/$name" ] && { echo "$d/$name"; return 0; }
    prev="$d"; d=$(dirname "$d")
  done
  return 1
}

# has_script <dir> <script> -> true if dir/package.json declares scripts[script]
has_script() {
  command -v jq >/dev/null 2>&1 || { grep -q "\"$2\"" "$1/package.json" 2>/dev/null; return; }
  [ -f "$1/package.json" ] && jq -e --arg s "$2" '.scripts[$s] // empty' "$1/package.json" >/dev/null 2>&1
}

# TO <seconds> <cmd...> -> run cmd with a timeout. Prefers GNU `timeout` /
# Homebrew `gtimeout`; falls back to a portable bash watchdog (background job +
# a sleep-then-kill racer) so budgets are still enforced when neither binary
# is installed — a silent no-timeout fallback lets a hung command block forever.
if   command -v timeout  >/dev/null 2>&1; then TO() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then TO() { gtimeout "$@"; }
else
  TO() {
    local secs="$1"; shift
    "$@" &
    local cmd_pid=$!
    # The watcher must not inherit the caller's stdout/stderr: if it's later
    # SIGTERM'd while `sleep` is still running, `sleep` survives as an orphan
    # (SIGTERM to the subshell doesn't propagate to its already-forked child)
    # and, if it still held the caller's pipe open, any `$(...)` capturing TO's
    # output would block until that orphan's sleep finishes — turning every
    # normal-speed command into a full-timeout wait. Redirect to /dev/null
    # before forking sleep so the watcher never holds that pipe open.
    ( exec >/dev/null 2>&1; sleep "$secs"; kill -TERM "$cmd_pid" 2>/dev/null ) &
    local watcher_pid=$!
    wait "$cmd_pid" 2>/dev/null
    local rc=$?
    kill "$watcher_pid" 2>/dev/null
    wait "$watcher_pid" 2>/dev/null
    return "$rc"
  }
fi

# runner_detect <root_dir> -> sets globals RUN and EXEC based on the lockfile
# present at root_dir (pnpm > yarn > npm). One consistent form ("pnpm run" /
# "yarn run" / "npm run") used by every caller.
runner_detect() {
  local root="$1"
  if   [ -f "$root/pnpm-lock.yaml" ]; then RUN="pnpm run"; EXEC="pnpm exec"
  elif [ -f "$root/yarn.lock" ];      then RUN="yarn run"; EXEC="yarn"
  else                                     RUN="npm run";  EXEC="npx --no-install"; fi
}

# ensure_modern_node -> best-effort PATH fix, then echoes the resolved node
# major version (0 if none). Hooks inherit the launching app's PATH, which can
# resolve an ancient node (observed: an nvm v16 bin dir stacked FIRST on a
# PATH accumulated across years of nvm switches) — under it, npm-run tooling
# dies on missing runtime APIs (structuredClone, util.styleText) and the Stop
# gate misreads that infra gap as a red check. If PATH's node is <20 and an
# nvm default alias exists, prepend that version's bin. Callers decide what
# to do with the returned major (stop-verify skips as infra below 18).
ensure_modern_node() {
  local major def nvm_bin
  major=$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')
  if [ "${major:-0}" -lt 20 ] && [ -f "$HOME/.nvm/alias/default" ]; then
    def=$(cat "$HOME/.nvm/alias/default" 2>/dev/null)
    nvm_bin=$(ls -d "$HOME/.nvm/versions/node/v${def}"*/bin 2>/dev/null | tail -1)
    if [ -n "$nvm_bin" ] && [ -x "$nvm_bin/node" ]; then
      PATH="$nvm_bin:$PATH"
      export PATH
      major=$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')
    fi
  fi
  echo "${major:-0}"
}

# git_dir <cwd> -> echoes the absolute .git dir for cwd. Uses `git rev-parse`
# (not string-gluing "$repo/.git") so linked worktrees — whose .git is a file,
# not a directory — resolve correctly.
git_dir() {
  git -C "$1" rev-parse --absolute-git-dir 2>/dev/null
}

# repo_root <cwd> -> echoes the top-level working tree dir for cwd.
repo_root() {
  git -C "$1" rev-parse --show-toplevel 2>/dev/null
}
