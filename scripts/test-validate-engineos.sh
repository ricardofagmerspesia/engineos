#!/usr/bin/env bash
# Negative tests for scripts/validate-engineos.sh. A validator that only ever
# passes proves nothing: each case below breaks exactly one invariant in a
# throwaway copy of the repo and asserts the validator catches THAT one.
# Run: scripts/test-validate-engineos.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0

# case <description> <expected-substring-in-output> <mutation-shell>
# The mutation runs with CWD = a fresh copy of the repo.
case_() {
  local desc="$1" want="$2" mutate="$3" tmp out rc
  tmp=$(mktemp -d) || return 1
  # -a would also copy .git; the validator never reads it and the copy is slower.
  ( cd "$ROOT" && tar --exclude=.git -cf - . ) | ( cd "$tmp" && tar -xf - )
  ( cd "$tmp" && eval "$mutate" ) >/dev/null 2>&1
  out=$(cd "$tmp" && bash scripts/validate-engineos.sh 2>&1); rc=$?
  rm -rf "$tmp"

  if [ "$rc" -eq 0 ]; then
    fail=$((fail+1)); printf 'FAIL %s — validator exited 0, expected non-zero\n' "$desc"; return
  fi
  case "$out" in
    *"$want"*) pass=$((pass+1)); printf 'ok   %s\n' "$desc" ;;
    *) fail=$((fail+1)); printf 'FAIL %s — no "%s" in output:\n%s\n' "$desc" "$want" "$out" ;;
  esac
}

echo "== validate-engineos negative tests =="

case_ "dangling rule reference is caught" \
      "dangling rule references" \
      "printf '\nSee \`rules/does-not-exist.md\`.\n' >> rules/base.md"

case_ "deleted always-on rule is caught" \
      "always-on imports point at missing files" \
      "rm rules/memory.md"

case_ "router row dropping a deferred rule is caught" \
      "router closure rule violated" \
      "sed -i.bak 's| + \`rules/observability.md\` (closure: \`backend.md\` defers to it)||' CLAUDE.md"

case_ "routing-map naming a nonexistent agent is caught" \
      "routing-map.sh names missing agents" \
      "sed -i.bak 's|agent:test-writer|agent:ghost-writer|' hooks/routing-map.sh"

case_ "agent whose frontmatter name drifts from filename is caught" \
      "agent frontmatter problems" \
      "sed -i.bak 's|^name: test-writer\$|name: test-writer-renamed|' agents/test-writer.md"

case_ "agent missing the Return format envelope is caught" \
      "agent return-format problems" \
      "sed -i.bak 's|^## Return format\$|## Output notes|' agents/security-reviewer.md"

case_ "agent alias without a slash command is caught" \
      "missing slash commands" \
      "rm commands/agents/leo-ely.md"

case_ "skill whose name drifts from its directory is caught" \
      "skill problems" \
      "sed -i.bak 's|^name: adr\$|name: adr-v2|' skills/adr/SKILL.md"

case_ "emptied rule file is caught" \
      "empty documents" \
      ": > rules/testing.md"

case_ "always-on rule pointing at a route-loaded rule is caught" \
      "always-on rule points at a route-loaded rule" \
      "printf '\nDefer to \`rules/frontend.md\`.\n' >> rules/context.md"

case_ "registry guidance drifting from routing-map is caught" \
      "registry guidance not found in routing-map.sh" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='test': x['hook_guidance']='rules/testing.md | agent:ameer'
json.dump(d,open(p,'w'),indent=2)\""

case_ "registry rules[] disagreeing with its guidance string is caught" \
      "registry rules/guidance mismatch" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='frontend': x['rules'].remove('testing')
json.dump(d,open(p,'w'),indent=2)\""

case_ "registry precedence out of map order is caught" \
      "does not match domain order" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
d['precedence'][0], d['precedence'][1] = d['precedence'][1], d['precedence'][0]
json.dump(d,open(p,'w'),indent=2)\""

case_ "a routing-map arm missing from the registry is caught" \
      "routing-map.sh arms missing from the registry" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
d['domains']=[x for x in d['domains'] if x['id']!='llm']
d['precedence']=[x for x in d['precedence'] if x!='llm']
json.dump(d,open(p,'w'),indent=2)\""

case_ "duplicate decision rule id is caught" \
      "duplicate decision rule ids" \
      "python3 -c \"
import json
p='registries/decision-rules.json'; d=json.load(open(p))
d['rules'].append(dict(d['rules'][0]))
json.dump(d,open(p,'w'),indent=2)\""

case_ "decision rule that requires nothing is caught" \
      "decision rules with an empty then" \
      "python3 -c \"
import json
p='registries/decision-rules.json'; d=json.load(open(p))
d['rules'].append({'id':'rule-noop','priority':1,'when':{},'then':{}})
json.dump(d,open(p,'w'),indent=2)\""

case_ "capabilities.json binding a nonexistent agent is caught" \
      "capabilities.json names missing agents" \
      "sed -i.bak 's|\"backend-coordinator\"|\"ghost-writer\"|' registries/capabilities.json"

case_ "capabilities.json with an invalid model tier is caught" \
      "invalid model_tier on capability" \
      "sed -i.bak 's|\"build\"|\"medium\"|' registries/capabilities.json"

case_ "agents.json with an invalid model tier is caught" \
      "invalid model_tier on agent" \
      "python3 -c \"
import json
p='registries/agents.json'; d=json.load(open(p))
d['agents'][0]['model_tier']='fast'
json.dump(d,open(p,'w'),indent=2)\""

case_ "agents.json naming a file that does not exist under agents/ is caught" \
      "agents.json names missing agent files" \
      "python3 -c \"
import json
p='registries/agents.json'; d=json.load(open(p))
d['agents'][0]['name']='ghost-writer'
json.dump(d,open(p,'w'),indent=2)\""

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
