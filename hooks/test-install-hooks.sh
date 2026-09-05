#!/usr/bin/env bash
# Contract for the installers' hook registration: hooks/hooks.json is the single
# hook list, and a symlink install registers exactly it. install.sh writes only
# under $HOME/.claude, so the whole installer runs against a throwaway HOME —
# no stub, no extracted copy of the merge program that could drift from the real
# one. install.sh itself no longer needs jq (it calls `engineos settings-merge`);
# jq below is this suite's own assertion tooling, not an installer dependency.
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

# Every command hooks.json asks for, with the placeholder resolved to this
# checkout. The placeholder now sits INSIDE the quoted script argument of a
# `node "..." hook <name>` command, so only the placeholder itself is replaced —
# the surrounding quotes are part of the command and stay.
expected(){
  jq -r --arg root "$REPO" \
    '[.hooks | to_entries[] | .key as $e | .value[] | (.matcher // "") as $m | .hooks[]
      | $e + " " + $m + " "
        + (.command | sub("\\$\\{CLAUDE_PLUGIN_ROOT\\}"; $root))]
     | sort | join("\n")' "$REPO/hooks/hooks.json"
}

# what is actually registered, in the same shape
registered(){
  jq -r '[.hooks // {} | to_entries[] | .key as $e | .value[] | (.matcher // "") as $m
          | .hooks[] | $e + " " + $m + " " + .command]
         | sort | join("\n")' "$1"
}

# how many hook entries a settings/hooks.json file carries in total
entry_count(){ jq '[.hooks[][] | .hooks[]] | length' "$1"; }

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
  *"hook prompt-advisor"*) ok ;;
  *) no "prompt-advisor is not registered: $GOT" ;;
esac

# Idempotent: a second run must not duplicate or reorder anything.
BEFORE=$(cat "$SETTINGS")
install_run
if [ "$(cat "$SETTINGS")" = "$BEFORE" ]; then ok; else
  no "second install.sh run changed settings.json"
fi

# A retired hook left behind by an older install gets dropped, not kept beside
# the current list: previous versions of this installer registered all four.
# They are planted in the old `<repo>/hooks/<x>.sh` form on purpose — that is
# what an old install left behind, and the hooks-dir half of the scrub is what
# has to catch it.
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

# Reinstall over a bash-era settings.json: a consumer upgrading from 1.6.x
# carries the full `<repo>/hooks/<name>.sh` list. Every one of those must be
# scrubbed and replaced by the node form — if the scrub keyed only on
# dist/engineos.cjs, the old entries would survive and every hook would fire
# twice, once per form.
BASH_ERA=$(jq --arg root "$REPO" \
  '[.hooks | to_entries[] | .key as $e | .value[] | (.matcher // "") as $m | .hooks[]
    | {event: $e, matcher: $m,
       cmd: ($root + "/hooks/" + (.command | capture("hook (?<n>[a-z-]+)$").n) + ".sh")}]' \
  "$REPO/hooks/hooks.json")
jq --argjson adds "$BASH_ERA" '
  reduce $adds[] as $a (.;
    .hooks[$a.event] = ((.hooks[$a.event] // [])
      + [{matcher: $a.matcher, hooks: [{type: "command", command: $a.cmd}]}]))
' "$SETTINGS" > "$SETTINGS.t" && mv "$SETTINGS.t" "$SETTINGS"
install_run
GOT=$(registered "$SETTINGS")
[ "$GOT" = "$WANT" ] && ok || no "bash-era entries were not replaced by the node form
--- want ---
$WANT
--- got ---
$GOT"
GOT_N=$(entry_count "$SETTINGS")
WANT_N=$(entry_count "$REPO/hooks/hooks.json")
[ "$GOT_N" = "$WANT_N" ] && ok \
  || no "reinstall left $GOT_N hook entries, hooks.json declares $WANT_N"

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
