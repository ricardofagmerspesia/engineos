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

case_ "guidance naming a nonexistent agent is caught" \
      "hook_guidance names missing agents" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='test': x['hook_guidance']=x['hook_guidance'].replace('agent:test-writer','agent:ghost-writer')
json.dump(d,open(p,'w'),indent=2)\""

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

case_ "a sample_path that routes to the wrong domain is caught" \
      "sample_path routing failures" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='dba': x['sample_path']='/tmp/web/src/Button.tsx'
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

case_ "a routing domain deleted out from under its intent FK is caught" \
      "intent/routing mismatches" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
d['domains']=[x for x in d['domains'] if x['id']!='llm']
d['precedence']=[x for x in d['precedence'] if x!='llm']
json.dump(d,open(p,'w'),indent=2)\""

case_ "a domain with its match patterns emptied is caught" \
      "routing domains missing patterns/sample" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='frontend': x['match']={'paths':[],'basenames':[]}
json.dump(d,open(p,'w'),indent=2)\""

case_ "a guidance literal reintroduced into the routing-map shim is caught" \
      "not a pure shim" \
      "printf '\necho \"rules/ghost.md | agent:nobody\"\n' >> hooks/routing-map.sh"

case_ "an invalid prompt_signals regex is caught" \
      "prompt_signals problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['prompt_signals']['scale']='([unclosed'
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

# ---- C16: decision-kernel registries (P1) ----

case_ "models.json escalates_to chain break is caught" \
      "escalates_to breaks the order" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
for t in d['tiers']:
    if t['id']=='build': t['escalates_to']='cheap'
json.dump(d,open(p,'w'),indent=2)\""

case_ "models.json work_type with an unknown tier is caught" \
      "work_types with unknown tier" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
d['work_types'][0]['tier']='turbo'
json.dump(d,open(p,'w'),indent=2)\""

case_ "moving ADR back off the most-capable tier without editing the prose is caught" \
      "ADR row does not bind" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
for w in d['work_types']:
    if w['id']=='adr': w['tier']='design'
json.dump(d,open(p,'w'),indent=2)\""

case_ "agent declaring a model models.json does not bind is caught" \
      "agent frontmatter models unknown to models.json" \
      "sed -i.bak 's|^model: fable\$|model: gpt|' agents/product-spec.md"

case_ "duplicate intent id is caught" \
      "duplicate intent ids" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
d['intents'].append(dict(d['intents'][0]))
json.dump(d,open(p,'w'),indent=2)\""

case_ "hook-mirrored intent losing its domain FK is caught" \
      "hook_mirrored/domain mismatch" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='backend': i.pop('domain', None)
json.dump(d,open(p,'w'),indent=2)\""

case_ "mirrored intent rules drifting from routing.json is caught" \
      "intent/routing mismatches" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='backend': i['rules'].remove('testing')
json.dump(d,open(p,'w'),indent=2)\""

case_ "a routing.json domain left unclaimed by intents is caught" \
      "routing domains not claimed exactly once" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
d['intents']=[i for i in d['intents'] if i['id']!='android-release']
json.dump(d,open(p,'w'),indent=2)\""

case_ "a CLAUDE.md router row added without a registry update is caught" \
      "intent drift" \
      "python3 - <<'EOF'
import re
p='CLAUDE.md'; s=open(p).read()
anchor='| Claiming done / complete / fixed'
row='| Fake new intent (made up) | nothing |\n'
s=s.replace(anchor, row+anchor, 1)
open(p,'w').write(s)
EOF"

case_ "policy.json wave cap drifting from the parallelism prose is caught" \
      "wave cap drift" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['wave_concurrency_cap']=4
json.dump(d,open(p,'w'),indent=2)\""

case_ "policy.json losing an autonomy level is caught" \
      "autonomy levels" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['autonomy']['levels']=[l for l in d['autonomy']['levels'] if l['id']!='A4']
json.dump(d,open(p,'w'),indent=2)\""

case_ "policy.json gate matrix missing a gate for a tier is caught" \
      "by_risk incomplete" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['gates']['by_risk']['medium'].pop('release')
json.dump(d,open(p,'w'),indent=2)\""

case_ "spec threshold drifting between CLAUDE.md and policy.json is caught" \
      "spec-threshold drift" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['gates']['spec_threshold']['files_greater_than']=5
json.dump(d,open(p,'w'),indent=2)\""

# ---- C18: router agent wiring (P3) ----

case_ "route capability repointed at a nonexistent agent is caught" \
      "capabilities.json names missing agents" \
      "sed -i.bak 's|\"agent\": \"router\"|\"agent\": \"ghost-router\"|' registries/capabilities.json"

case_ "route capability model_tier downgraded off design is caught" \
      "route capability" \
      "python3 -c \"
import json
p='registries/capabilities.json'; d=json.load(open(p))
for c in d['capabilities']:
    if c['id']=='route': c['model_tier']='build'
json.dump(d,open(p,'w'),indent=2)\""

case_ "router agent losing a required kernel call is caught" \
      "router does not call the kernel" \
      "sed -i.bak 's|kernel.sh waves|kernel.sh wavez|g' agents/router.md"

case_ "router agent gaining Write is caught" \
      "router must not hold" \
      "sed -i.bak 's|^tools: Read, Grep, Glob, Bash\$|tools: Read, Grep, Glob, Bash, Write|' agents/router.md"

case_ "a self-referencing suppressed_by is caught" \
      "suppression data problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for x in d['intents']:
    if x['id']=='route-planning': x['suppressed_by']=['route-planning']
json.dump(d,open(p,'w'),indent=2)\""

case_ "a flipped router fixture expectation is caught" \
      "route-escalate fixture" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['router']['fixtures'][0]['escalate'] = not d['router']['fixtures'][0]['escalate']
json.dump(d,open(p,'w'),indent=2)\""

case_ "route-advisor.sh removed from hooks.json is caught" \
      "route-advisor" \
      "python3 -c \"
import json
p='hooks/hooks.json'; d=json.load(open(p))
d['hooks']['UserPromptSubmit'][0]['hooks'] = [h for h in d['hooks']['UserPromptSubmit'][0]['hooks'] if 'route-advisor' not in h['command']]
json.dump(d,open(p,'w'),indent=2)\""

# ---- C19: handoff template <-> registry section contract (P4) ----

case_ "a required section removed from the handoff template is caught" \
      "handoff template missing required sections" \
      "sed -i.bak '/^## Evidence\$/d' templates/handoff.md"

case_ "a registry-required section absent from the template is caught" \
      "handoff template missing required sections" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['required_sections'].append('Ghost section')
json.dump(d,open(p,'w'),indent=2)\""

case_ "a template section added without a registry update is caught" \
      "handoff template sections not declared in the registry" \
      "printf '\\n## Scratch notes\\n\\n<anything>\\n' >> templates/handoff.md"

case_ "the Gate field dropped from the handoff template is caught" \
      "handoff template missing required fields" \
      "sed -i.bak 's|^Gate:|Gato:|' templates/handoff.md"

case_ "the section list reintroduced into the handoff note is caught" \
      "handoff intent required_sections problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['note'] += ' Required sections: objective, state, evidence.'
json.dump(d,open(p,'w'),indent=2)\""

case_ "CLAUDE.md handoff row dropping a section name is caught" \
      "CLAUDE.md handoff row does not mirror" \
      "sed -i.bak 's| evidence, known failures| known failures|' CLAUDE.md"

# ---- C20: check-level repair policy (P5) ----

case_ "the repair block deleted from policy.json is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
del d['repair']
json.dump(d,open(p,'w'),indent=2)\""

case_ "max_fix_attempts_per_check set to 0 is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['max_fix_attempts_per_check']=0
json.dump(d,open(p,'w'),indent=2)\""

case_ "an emptied never_repair array is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['never_repair']=[]
json.dump(d,open(p,'w'),indent=2)\""

case_ "the flaky entry dropped from by_situation is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['by_situation']=[s for s in d['repair']['by_situation'] if s['situation']!='flaky']
json.dump(d,open(p,'w'),indent=2)\""

case_ "the stop-report-red ladder literal broken in kernel.sh is caught" \
      "repair ladder canary failed" \
      "sed -i.bak 's|stop-report-red|stop-report|' scripts/kernel.sh"

case_ "until clean reintroduced into the CLAUDE.md verify-done row is caught" \
      "repair prose-mirror problems" \
      "sed -i.bak 's|a bounded fix loop.*reports done\\.|fix loop until clean before reporting done.|' CLAUDE.md"

case_ "the hook's registry read replaced with a hardcoded number is caught" \
      "stop-verify.sh repair-wiring problems" \
      "sed -i.bak 's|MAXFIX=\$(jq -r .\\{0,1\\}\\.repair\\.max_fix_attempts_per_check[^)]*)|MAXFIX=2|' hooks/stop-verify.sh"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
