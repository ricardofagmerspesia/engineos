#!/usr/bin/env bash
# Runner adapters for EngineOS hooks. Sourced only — no independent execution,
# no exec bit. The shebang exists only so shellcheck (SC2148) knows the target
# shell; it is never invoked directly. Matches lib-common.sh's header.
#
# Source with: . "$(dirname "${BASH_SOURCE[0]}")/lib-runner.sh"
# Requires lib-common.sh sourced first — has_script, runner_detect and TO come
# from there.
#
# A runner is the tool that executes a project's verification targets (lint,
# typecheck, tests): Nx, or a package-manager script runner. Two adapters live
# here, chosen once per repo by runner_select. Callers see one ladder —
# handle -> has_target -> run -> infra_skip — and never branch on the runner
# themselves, so the timeout table and the infra-vs-red judgment are stated once
# at the call site instead of once per adapter.
#
# Globals owned by this file: RUNNER_KIND, RUNNER_ROOT. RUN and EXEC come from
# lib-common's runner_detect, which runner_select calls.

# runner_select <root> <have_jq> -> choose the adapter for root and set
# RUNNER_KIND (nx|npm-family) + RUNNER_ROOT, plus RUN/EXEC via runner_detect.
# Nx needs jq: both of its probes read JSON. A repo carrying nx.json on a
# machine without jq is therefore driven through the package-manager adapter —
# the same fallback the hook made inline before this seam existed.
runner_select() {
  RUNNER_ROOT="$1"
  runner_detect "$RUNNER_ROOT"
  if [ -f "$RUNNER_ROOT/nx.json" ] && [ "${2:-0}" = "1" ]; then
    RUNNER_KIND="nx"
  else
    RUNNER_KIND="npm-family"
  fi
}

# runner_handle <pkg_dir> -> echo the identifier this runner addresses the
# package by, or return non-zero when it has none (an Nx dir with no resolvable
# project name — nothing to run, so the caller skips it). The handle is opaque
# to the caller and is also what a failure summary names, which is why it
# differs per adapter: Nx addresses projects by name, a package manager by
# directory.
runner_handle() {
  local proj=""
  case "$RUNNER_KIND" in
    nx)
      [ -f "$1/project.json" ] && proj=$(jq -r '.name // empty' "$1/project.json" 2>/dev/null)
      [ -z "$proj" ] && [ -f "$1/package.json" ] && \
        proj=$(jq -r '.name // empty' "$1/package.json" 2>/dev/null | sed 's/^@[^/]*\///')
      [ -n "$proj" ] || return 1
      echo "$proj"
      ;;
    *) echo "$1" ;;
  esac
}

# runner_has_target <handle> <target> -> true when this runner knows that target
# for that handle. Each adapter asks its own question: `nx show project` for Nx,
# a declared package.json script for a package manager.
runner_has_target() {
  local shown
  case "$RUNNER_KIND" in
    nx)
      shown=$( (cd "$RUNNER_ROOT" && $EXEC nx show project "$1" --json 2>/dev/null) ) || return 1
      printf '%s' "$shown" | jq -e --arg t "$2" '.targets[$t] // empty' >/dev/null 2>&1
      ;;
    *) has_script "$1" "$2" ;;
  esac
}

# runner_run <handle> <target> <timeout_seconds> -> run the target under TO, echo
# its combined output, exit with the target's status. The caller passes the
# budget, so one timeout table governs both adapters.
runner_run() {
  case "$RUNNER_KIND" in
    nx) (cd "$RUNNER_ROOT" && TO "$3" $EXEC nx run "${1}:${2}" 2>&1) ;;
    *)  (cd "$1"           && TO "$3" $RUN -s "$2" 2>&1) ;;
  esac
}

# runner_infra_skip <target> <output> -> true when a non-zero run means the
# target was never really there, rather than red code. runner_has_target already
# said yes, so this is a last-resort guard against a stale probe: an Nx cache
# answering for a target that has gone, or has_script's jq-free grep matching the
# word somewhere else in package.json. Anchored to each runner's own "no such
# target" wording and, where the runner names it, to this target — a missing
# binary or a genuinely failing check matches nothing here and stays red.
# `npm run -s` suppresses npm's own report, so in practice the npm-family arm
# fires for pnpm and yarn (and for any runner invoked without silencing).
runner_infra_skip() {
  case "$RUNNER_KIND" in
    nx) printf '%s' "$2" | grep -qiE \
        "cannot find (project|target) |does not have (a|an) .* target|cannot find configuration for task" ;;
    *)  printf '%s' "$2" | grep -qiE \
        "missing script:|command \"$1\" not found|find a script named \"$1\"" ;;
  esac
}
