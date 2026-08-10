#!/usr/bin/env bash
# THIS FILE IS NOW A SHIM. It used to be the authoritative case ladder for
# EngineOS path-pattern -> domain routing; that data now lives as machine-
# readable match/excluded globs in registries/routing.json, resolved by
# scripts/kernel.sh route-path. This file only preserves the function names
# and contracts existing callers rely on (route-before-change.sh sourced this
# directly until P2; hooks/test-route.sh still sources it to unit-test
# route_excluded). CLAUDE.md's stack/domain table stays the human mirror of
# the registry, not of this file.
#
# Both functions degrade to a silent no-op when jq is missing — the kernel's
# own jq check is a hard error meant for direct callers, not for a hook that
# must stay non-blocking.

_EOS_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_EOS_KERNEL="$_EOS_HOOKS_DIR/../scripts/kernel.sh"

# route_excluded <path> -> exit 0 if the path is a meta/non-code file that should
# get NO routing (prevents recursive/noisy routing on our own scaffolding).
route_excluded() {
  command -v jq >/dev/null 2>&1 || return 1
  "$_EOS_KERNEL" route-path "$1" 2>/dev/null | jq -e '.excluded' >/dev/null 2>&1
}

# route_for_path <path> -> echo a guidance string (rules | skill | agent), or
# nothing for the base-only default. Assumes the path is NOT excluded.
route_for_path() {
  command -v jq >/dev/null 2>&1 || return 0
  "$_EOS_KERNEL" route-path "$1" 2>/dev/null | jq -r '.hook_guidance // empty'
}
