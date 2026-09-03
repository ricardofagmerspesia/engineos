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
    prev="$d"
    case "$d" in */*) d="${d%/*}"; [ -n "$d" ] || d="/" ;; *) d="." ;; esac
  done
  return 1
}

# find_up_file <start_dir> <name> -> echoes the FULL PATH of the first match
# (callers that need the matched file itself, not just its directory).
find_up_file() {
  local d="$1" name="$2" prev=""
  while [ "$d" != "/" ] && [ "$d" != "$prev" ] && [ -n "$d" ]; do
    [ -e "$d/$name" ] && { echo "$d/$name"; return 0; }
    prev="$d"
    case "$d" in */*) d="${d%/*}"; [ -n "$d" ] || d="/" ;; *) d="." ;; esac
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
# hooks/lib-runner.sh wraps this as the npm-family half of its runner seam; a
# hook that needs the Nx-vs-package-manager choice sources that file too.
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

# ---------------------------------------------------------------------------
# Hook envelope
#
# Everything below is the part of a hook that is not its decision: reading the
# payload, deciding whether EngineOS is even on, emitting context back to the
# harness, and recording what happened. Each hook used to carry its own copy.
# ---------------------------------------------------------------------------

# Absolute dir of this library, resolved from BASH_SOURCE rather than $0 so it
# is right however the sourcing hook was invoked — hook_telemetry reaches
# scripts/telemetry.sh through it.
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The bypass switch travels with the library: sourcing lib-common.sh is all a
# hook needs to call engineos_bypass_active. bypass.sh defines functions and
# ENGINEOS_BYPASS_FLAG, and sets `set -uo pipefail` — every hook here opens with
# those same options, so the inherited setting is a no-op rather than a
# surprise. Its CLI block is guarded on BASH_SOURCE[0] = $0 and never fires when
# the file is sourced.
# shellcheck source=hooks/bypass.sh
. "$LIB_DIR/bypass.sh"

# hook_read_envelope -> read the harness payload from stdin ONCE into HOOK_INPUT
# and decode it in a single jq pass, setting:
#   HOOK_CWD HOOK_SID HOOK_PROMPT HOOK_FILE HOOK_TOOL HOOK_TRANSCRIPT
#   HOOK_STOP_ACTIVE
#
# No jq -> exit 0. Hooks are non-blocking by design and none of them can decode a
# payload without it, so staying silent beats guessing. The two hooks that still
# do useful work without jq (stop-verify.sh, ensure-project-layout.sh) keep their
# own fallback decode and deliberately do not call this.
#
# NUL delimiters keep tabs, newlines and quotes inside a prompt intact — no eval,
# no lossy shell requoting. A payload jq cannot parse yields no fields at all,
# leaving the defaults in place, which is the same silent no-op an unparseable
# payload always produced.
#
# The HOOK_* names are the contract hooks code against, so shellcheck's
# unused-variable warning is expected for the fields no hook in this repo reads yet.
# shellcheck disable=SC2034
hook_read_envelope() {
  HOOK_INPUT=$(cat)
  command -v jq >/dev/null 2>&1 || exit 0
  HOOK_CWD=""
  HOOK_SID="nosession"
  HOOK_PROMPT=""
  HOOK_FILE=""
  HOOK_TOOL=""
  HOOK_TRANSCRIPT=""
  HOOK_STOP_ACTIVE="false"
  {
    IFS= read -r -d '' HOOK_CWD || true
    IFS= read -r -d '' HOOK_SID || true
    IFS= read -r -d '' HOOK_PROMPT || true
    IFS= read -r -d '' HOOK_FILE || true
    IFS= read -r -d '' HOOK_TOOL || true
    IFS= read -r -d '' HOOK_TRANSCRIPT || true
    IFS= read -r -d '' HOOK_STOP_ACTIVE || true
  } < <(printf '%s' "$HOOK_INPUT" | jq -j '
      (.cwd // ""), "\u0000",
      (.session_id // "nosession"), "\u0000",
      (.prompt // ""), "\u0000",
      (.tool_input.file_path // ""), "\u0000",
      (.tool_name // ""), "\u0000",
      (.transcript_path // ""), "\u0000",
      ((.stop_hook_active // false) | tostring), "\u0000"' 2>/dev/null)
  # `read` clears its variable on a short stream, so the two fields whose default
  # is not the empty string are restored here rather than trusted from above.
  [ -n "$HOOK_SID" ] || HOOK_SID="nosession"
  [ -n "$HOOK_STOP_ACTIVE" ] || HOOK_STOP_ACTIVE="false"
}

# hook_context <event> <text> -> emit one additionalContext payload for the
# harness. The literal was copy-pasted at every injection site; the event name
# is the only thing that ever differed between them.
hook_context() {
  jq -n --arg e "$1" --arg c "$2" \
    '{hookSpecificOutput:{hookEventName:$e, additionalContext:$c}}'
}

# Memoized answer to "where do this session's telemetry events go, if anywhere".
# Empty means this project is not eligible and will not become eligible mid-run,
# so the two git processes behind the question are paid for once per hook.
HOOK_TELEMETRY_DIR=""
HOOK_TELEMETRY_RESOLVED=""
hook_telemetry_dir() {
  local troot tgit
  if [ -z "$HOOK_TELEMETRY_RESOLVED" ]; then
    HOOK_TELEMETRY_RESOLVED=1
    if [ -n "${HOOK_CWD:-}" ] \
       && troot=$(repo_root "$HOOK_CWD") && [ -d "$troot/.engineos" ] \
       && tgit=$(git_dir "$HOOK_CWD") && [ -n "$tgit" ]; then
      mkdir -p "$tgit/engineos-telemetry" 2>/dev/null || true
      HOOK_TELEMETRY_DIR="$tgit/engineos-telemetry"
    fi
  fi
  [ -n "$HOOK_TELEMETRY_DIR" ]
}

# hook_telemetry <event> <data-json> -> append one event to this session's
# stream. Best-effort in every direction: off when ENGINEOS_TELEMETRY=0, off when
# the payload carried no cwd, and off in any project that has not adopted
# EngineOS (no .engineos/ dir) — telemetry is never written into a repo that did
# not opt in. Always returns 0: evidence must not become a gate.
hook_telemetry() {
  [ "${ENGINEOS_TELEMETRY:-}" = "0" ] && return 0
  hook_telemetry_dir || return 0
  "$LIB_DIR/../scripts/telemetry.sh" append \
    "$HOOK_TELEMETRY_DIR/$HOOK_SID.jsonl" \
    --session "$HOOK_SID" --event "$1" --data "$2" >/dev/null 2>&1 || true
  return 0
}

# ---------------------------------------------------------------------------
# Agent spans
#
# The events above record what EngineOS DECIDED. The helpers below record
# what actually HAPPENED when agents ran: one session is one trace, and every
# dispatched agent, router decision and verification gate is a span in it
# (rules/observability.md "Agent traces"). Same opt-in gates as hook_telemetry,
# a different file — <session>.exec.jsonl, whose schema is scripts/exec-journal.sh.
# ---------------------------------------------------------------------------

# hook_slug <value> -> the value with every character outside the span slug
# class (registries/policy.json telemetry.value_pattern) replaced by '-'. The
# span writer REJECTS anything else, and a rejected span is a silently lost one,
# so a hook sanitizes a harness-supplied value here rather than gambling.
#
# The class is exactly the pattern's: letters, digits, @ _ . / : and '-'. Two
# things it deliberately does NOT contain:
#   - a newline. An earlier version kept one, on the theory that command
#     substitution would strip it anyway — which is true, and therefore made the
#     exception pointless while opening a real hole: a harness value of
#     "agent\nSECRET=... prompt text" survived the tr, and the whole second line
#     rode into the journal. Whitespace is what this class exists to exclude.
#   - a '-' anywhere but last. Written between ':' and the old '\n' it formed the
#     reverse range ':-\012', which GNU coreutils tr rejects outright ("range-
#     endpoints ... in reverse collating sequence order"): rc=1, empty stdout,
#     so hook_slug returned "" and NOT ONE span was written on any glibc host.
#     Trailing '-' is a literal under POSIX, GNU and BSD tr alike.
hook_slug() {
  printf '%s' "${1:-}" | tr -c 'A-Za-z0-9@_./:-' '-'
}

# hook_path_slug <value> -> the value narrowed to the class that is safe as a
# single PATH COMPONENT; non-zero when nothing survives. hook_slug's class
# permits '.' and '/' — correct for a FIELD value, wrong for a file name, where
# a span id of "../x" writes outside the telemetry dir and a newline puts the
# harness's text into a FILENAME, the same content-on-disk leak by another
# route. Narrowing by class makes both impossible by construction, where a
# `case */*|*..*` guard only blocks the shapes someone thought of. Two values
# that differ only in narrowed characters collapse onto one name; every caller
# derives it the same way, so an open/close pair never mismatches.
hook_path_slug() {
  local n
  n=$(printf '%s' "${1:-}" | tr -c 'A-Za-z0-9@_:-' '-')
  [ -n "$n" ] || return 1
  printf '%s' "$n"
}

# hook_now_ms -> epoch milliseconds, through four rungs in order of accuracy:
#   1. bash 5's EPOCHREALTIME — microseconds, no process spawn. Its decimal
#      separator is locale-dependent, hence the [.,] split. Absent on the bash
#      3.2 that ships as /bin/bash on macOS, which is why there are three more.
#   2. GNU `date +%s%3N` — real milliseconds. BSD date has no sub-second format
#      and echoes the literal "%3N" back, so a non-digit in the answer moves on.
#   3. perl's Time::HiRes — real milliseconds, and present on every macOS and
#      effectively every Linux. An earlier version refused an interpreter rung on
#      the grounds that spawning one costs more than the imprecision it removes.
#      That argument holds against rung 2 and collapses against rung 4: without
#      this rung the primary development platform (macOS /bin/bash 3.2, BSD date)
#      lands on WHOLE SECONDS, and a 1.2s dispatch was recorded as dur=1000 while
#      a live router span recorded 0. Two orders of magnitude of noise on a field
#      named `ms` is not worth one process spawn per span boundary.
#   4. whole seconds scaled by 1000, the last resort. A span measured here is
#      accurate to the second, and the trailing zeros make that visible.
#
# Rungs 2 and 3 are accepted only when the answer has at least MS_DIGITS_MIN
# digits. Epoch milliseconds have had 13 digits since 2001 and will until 2286,
# so a 10-digit all-digit answer is SECONDS labelled ms — a silent 1000x error
# that an all-digits test alone waves through. Ruling that out is what makes the
# rung order meaningful: an implausible answer falls through instead of winning.
MS_DIGITS_MIN=12
hook_now_ms() {
  local r="${EPOCHREALTIME:-}" s f n
  if [ -n "$r" ]; then
    s=${r%%[.,]*}
    f=${r#*[.,]}
    f="${f}000000"
    printf '%s%s' "$s" "${f:0:3}"
    return 0
  fi
  n=$(date +%s%3N 2>/dev/null)
  if hook_plausible_ms "$n"; then printf '%s' "$n"; return 0; fi
  n=$(perl -MTime::HiRes -e 'printf "%.0f", Time::HiRes::time() * 1000' 2>/dev/null)
  if hook_plausible_ms "$n"; then printf '%s' "$n"; return 0; fi
  printf '%s000' "$(date +%s)"
}

# hook_plausible_ms <value> -> 0 when the value is all digits and long enough to
# be epoch MILLISECONDS rather than seconds. Split out so both interpreter-free
# rungs above are held to the same bar and neither can drift from the other.
hook_plausible_ms() {
  case "${1:-}" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "${#1}" -ge "$MS_DIGITS_MIN" ]
}

# hook_span_open <span-id> -> record this span's start time so a LATER hook can
# close it. PreToolUse and PostToolUse are separate processes, so the start
# instant has to survive on disk; the file is named by the span id and removed
# by hook_span_close. Silent no-op when the project has not opted in.
hook_span_open() {
  local marker
  [ "${ENGINEOS_TELEMETRY:-}" = "0" ] && return 0
  [ -n "${1:-}" ] || return 0
  # The span id names a file and it arrives from the harness, so the name is
  # narrowed rather than pattern-matched against a list of bad shapes.
  marker=$(hook_path_slug "$1") || return 0
  hook_telemetry_dir || return 0
  mkdir -p "$HOOK_TELEMETRY_DIR/spans" 2>/dev/null || return 0
  hook_now_ms > "$HOOK_TELEMETRY_DIR/spans/$marker" 2>/dev/null || true
  return 0
}

# hook_span_close <span-id> -> echo the span's duration in ms and consume its
# start marker. Non-zero when there is no marker to close, so a PostToolUse
# without a matching PreToolUse writes nothing rather than a fabricated
# duration. The clamp guards a clock that moved backwards (NTP step, DST on a
# non-UTC clock); exec-journal.sh rejects a negative duration outright.
hook_span_close() {
  local start now dur marker
  # Checked here as well as in hook_span_open: this is the half that calls
  # hook_telemetry_dir, which CREATES the telemetry directory, so skipping the
  # switch here would have ENGINEOS_TELEMETRY=0 still touch the repo.
  [ "${ENGINEOS_TELEMETRY:-}" = "0" ] && return 1
  [ -n "${1:-}" ] || return 1
  marker=$(hook_path_slug "$1") || return 1   # same derivation as hook_span_open
  hook_telemetry_dir || return 1
  [ -f "$HOOK_TELEMETRY_DIR/spans/$marker" ] || return 1
  start=$(cat "$HOOK_TELEMETRY_DIR/spans/$marker" 2>/dev/null)
  rm -f "$HOOK_TELEMETRY_DIR/spans/$marker" 2>/dev/null || true
  case "${start:-}" in ''|*[!0-9]*) return 1 ;; esac
  now=$(hook_now_ms)
  dur=$((now - start))
  [ "$dur" -ge 0 ] || dur=0
  printf '%s' "$dur"
}

# hook_span <span-kind> [exec-journal flags...] -> append one span line to this
# session's exec journal. Off when ENGINEOS_TELEMETRY=0 and off in any project
# that never adopted EngineOS, exactly like hook_telemetry; always returns 0,
# because evidence must not become a gate.
#
# run_id and trace_id are both the session id, so every span of one session
# joins without four call sites repeating it, and tokens are 0 because a hook
# cannot see a subagent's usage — a caller that CAN (the headless runner) passes
# its own --tokens-in/--tokens-out after the kind and wins, last flag set.
# Callers supply what only they know: --span-id, --capability-id, --model-tier,
# --status, --duration-ms and the fields specific to their kind.
hook_span() {
  local kind="${1:-}" sid name
  shift || true
  [ "${ENGINEOS_TELEMETRY:-}" = "0" ] && return 0
  [ -n "$kind" ] || return 0
  hook_telemetry_dir || return 0
  sid=$(hook_slug "${HOOK_SID:-nosession}")
  # The journal FILE name is narrowed the same way a span marker's is; the
  # trace_id field keeps the fuller slug class.
  name=$(hook_path_slug "$sid") || name=nosession
  "$LIB_DIR/../scripts/exec-journal.sh" append \
    "$HOOK_TELEMETRY_DIR/$name.exec.jsonl" \
    --run-id "$sid" --trace-id "$sid" \
    --span-kind "$kind" --tokens-in 0 --tokens-out 0 "$@" >/dev/null 2>&1 || true
  return 0
}
