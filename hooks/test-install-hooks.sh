#!/usr/bin/env bash
# Contract for the installers' hook derivation: hooks/hooks.json is the single
# hook list, and a symlink install registers exactly it. install.sh writes only
# under $HOME/.claude, so the whole installer runs against a throwaway HOME —
# no stub, no extracted copy of the jq program that could drift from the real one.
# install.ps1 mirrors this logic and is unverified here (no PowerShell on CI).
# Run: hooks/test-install-hooks.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }

FAKE_HOME=$(mktemp -d) || exit 1
trap 'rm -rf "$FAKE_HOME"' EXIT
SETTINGS="$FAKE_HOME/.claude/settings.json"

install_run(){ HOME="$FAKE_HOME" bash "$REPO/install.sh" >/dev/null 2>&1; }

# every command hooks.json asks for, with the placeholder resolved to this checkout
expected(){
  jq -r --arg root "$REPO" \
    '[.hooks | to_entries[] | .key as $e | .value[] | (.matcher // "") as $m | .hooks[]
      | $e + " " + $m + " "
        + (.command | sub("^\"\\$\\{CLAUDE_PLUGIN_ROOT\\}\""; $root))]
     | sort | join("\n")' "$REPO/hooks/hooks.json"
}

# what is actually registered, in the same shape
registered(){
  jq -r '[.hooks // {} | to_entries[] | .key as $e | .value[] | (.matcher // "") as $m
          | .hooks[] | $e + " " + $m + " " + .command]
         | sort | join("\n")' "$1"
}

install_run
if [ -f "$SETTINGS" ]; then ok; else no "install.sh wrote no settings.json"; fi

WANT=$(expected)
GOT=$(registered "$SETTINGS")
if [ "$GOT" = "$WANT" ]; then
  ok
else
  no "registered hooks != hooks.json
--- want ---
$WANT
--- got ---
$GOT"
fi

# The point of deriving: the adapter hooks.json registers is the one installed.
case "$GOT" in
  *"/hooks/prompt-advisor.sh"*) ok ;;
  *) no "prompt-advisor.sh is not registered: $GOT" ;;
esac

# Idempotent: a second run must not duplicate or reorder anything.
BEFORE=$(cat "$SETTINGS")
install_run
if [ "$(cat "$SETTINGS")" = "$BEFORE" ]; then ok; else
  no "second install.sh run changed settings.json"
fi

# A retired hook left behind by an older install gets dropped, not kept beside
# the current list: previous versions of this installer registered all four.
RETIRED="post-edit-check.sh task-scale-advisor.sh gate-advisor.sh route-advisor.sh"
for retired in $RETIRED; do
  jq --arg cmd "$REPO/hooks/$retired" \
     '.hooks.UserPromptSubmit = ((.hooks.UserPromptSubmit // [])
        + [{matcher:"", hooks:[{type:"command", command:$cmd}]}])' \
     "$SETTINGS" > "$SETTINGS.t" && mv "$SETTINGS.t" "$SETTINGS"
done
install_run
GOT=$(registered "$SETTINGS")
STALE=""
for retired in $RETIRED; do
  case "$GOT" in *"$retired"*) STALE="$STALE $retired" ;; esac
done
[ -z "$STALE" ] && ok || no "retired hooks survived the install:$STALE"
[ "$GOT" = "$WANT" ] && ok || no "cleaning retired hooks did not restore hooks.json's list"

# A foreign hook in the same events is somebody else's tool — never scrubbed.
jq '.hooks.Stop = ((.hooks.Stop // [])
      + [{matcher:"", hooks:[{type:"command", command:"/opt/other-tool/on-stop.sh"}]}])' \
   "$SETTINGS" > "$SETTINGS.t" && mv "$SETTINGS.t" "$SETTINGS"
install_run
case "$(registered "$SETTINGS")" in
  *"/opt/other-tool/on-stop.sh"*) ok ;;
  *) no "install.sh dropped a hook it does not own" ;;
esac

printf 'install-hooks: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
