#!/usr/bin/env bash
# Negative tests for scripts/validate-engineos.sh. A validator that only ever
# passes proves nothing: each case below breaks exactly one invariant in a
# throwaway copy of the repo and asserts the validator catches THAT one.
#
# Every case names the Check id it plants breakage for, and the case runs only
# that Check (--only <id>). The id is data on the case, not a phrase mapped back
# to a group: a case whose expected message moves to another Check now fails
# loudly instead of falling through to running everything.
#
# The harness assertions above the cases cover discovery itself — --list, an
# unknown --only id, parent-selects-sub-checks, and a planted Check function.
# Run: scripts/test-validate-engineos.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0
JOBS="${ENGINEOS_TEST_JOBS:-4}"
case "$JOBS" in ''|*[!0-9]*|0) echo "ENGINEOS_TEST_JOBS must be a positive integer" >&2; exit 2 ;; esac
RESULT_DIR=$(mktemp -d) || exit 1
trap 'rm -rf "$RESULT_DIR"' EXIT
BATCH_PIDS=()
BATCH_RESULTS=()
CASE_SEQ=0

# run_case <check-id> <description> <expected-substring> <mutation> <result-file>
run_case() {
  local id="$1" desc="$2" want="$3" mutate="$4" result="$5" tmp out rc
  tmp=$(mktemp -d) || return 1
  ( cd "$ROOT" && tar --exclude=.git -cf - . ) | ( cd "$tmp" && tar -xf - )
  ( cd "$tmp" && eval "$mutate" ) >/dev/null 2>&1
  out=$(cd "$tmp" && bash scripts/validate-engineos.sh --only "$id" 2>&1); rc=$?
  rm -rf "$tmp"

  if [ "$rc" -eq 0 ]; then
    { echo FAIL; printf 'FAIL %s — validator exited 0, expected non-zero\n' "$desc"; } > "$result"
  else
    case "$out" in
      *"$want"*) { echo PASS; printf 'ok   %s\n' "$desc"; } > "$result" ;;
      *) { echo FAIL; printf 'FAIL %s — no "%s" in output:\n%s\n' "$desc" "$want" "$out"; } > "$result" ;;
    esac
  fi
}

flush_batch() {
  local i kind
  for i in "${!BATCH_PIDS[@]}"; do wait "${BATCH_PIDS[$i]}" || true; done
  for i in "${!BATCH_RESULTS[@]}"; do
    IFS= read -r kind < "${BATCH_RESULTS[$i]}" || kind=FAIL
    tail -n +2 "${BATCH_RESULTS[$i]}"
    if [ "$kind" = PASS ]; then pass=$((pass+1)); else fail=$((fail+1)); fi
  done
  BATCH_PIDS=()
  BATCH_RESULTS=()
}

# case_ <check-id> <description> <expected-substring-in-output> <mutation-shell>
# Cases run in bounded parallel batches; every mutation still gets a private
# copy, so planted breakage cannot leak between checks.
case_() {
  local id="$1" desc="$2" want="$3" mutate="$4"
  CASE_SEQ=$((CASE_SEQ + 1))
  result="$RESULT_DIR/$CASE_SEQ"
  run_case "$id" "$desc" "$want" "$mutate" "$result" &
  BATCH_PIDS+=("$!")
  BATCH_RESULTS+=("$result")
  [ "${#BATCH_PIDS[@]}" -lt "$JOBS" ] || flush_batch
}

hok() { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
hno() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

echo "== validate-engineos harness =="

# Discovery is the harness's whole job, so it gets asserted rather than assumed:
# a Check function nobody runs is worse than no Check at all.
DECLARED=$(grep -ho '^check_C[0-9a-z]*' "$ROOT"/scripts/checks/*.sh | sed 's/^check_//' | sort -u)
# Two files defining the same check_* function is a silent failure: bash keeps
# the last definition sourced, --list still prints the id once, and the
# shadowed Check never runs. C24 was exactly that after a merge — the agent-tier
# check in 30-agents-skills.sh vanished behind admit's C24 in 70-runtime.sh
# while every suite stayed green except the one negative case that planted the
# drift. Assert uniqueness on the raw declarations, before the sort -u above
# hides it.
DUPLICATED=$(grep -ho '^check_C[0-9a-z]*' "$ROOT"/scripts/checks/*.sh | sed 's/^check_//' | sort | uniq -d)
if [ -z "$DUPLICATED" ]; then
  hok "every check_* id is declared exactly once across scripts/checks/"
else
  hno "check ids declared in more than one file — the later definition shadows the earlier one: $(printf '%s' "$DUPLICATED" | tr '\n' ' ')"
fi
LISTED=$(cd "$ROOT" && bash scripts/validate-engineos.sh --list | sort -u)
if [ -n "$DECLARED" ] && [ "$DECLARED" = "$LISTED" ]; then
  hok "--list prints every check_* function declared under scripts/checks/ ($(printf '%s\n' "$LISTED" | wc -l | tr -d ' ') Checks)"
else
  hno "--list drifts from the declared Checks — declared=[$(printf '%s' "$DECLARED" | tr '\n' ' ')] listed=[$(printf '%s' "$LISTED" | tr '\n' ' ')]"
fi

H_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C0nope 2>&1); H_RC=$?
case "$H_RC:$H_OUT" in
  2:*"unknown check id"*) hok "--only with an id no Check answers to exits 2" ;;
  *) hno "--only with an unknown id exited $H_RC instead of 2: $H_OUT" ;;
esac

PARENT_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C17 2>&1)
CHILD_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C17c 2>&1)
PARENT=$(printf '%s\n' "$PARENT_OUT" | grep -c '^ok  ')
CHILD=$(printf '%s\n' "$CHILD_OUT" | grep -c '^ok  ')
CHILD_LINE=$(printf '%s\n' "$CHILD_OUT" | grep -m1 '^ok  ')
case "
$PARENT_OUT
" in *"
$CHILD_LINE
"*) PARENT_COVERS_CHILD=true ;; *) PARENT_COVERS_CHILD=false ;; esac
if [ "$CHILD" -eq 1 ] && [ "$PARENT" -gt "$CHILD" ] && [ "$PARENT_COVERS_CHILD" = true ]; then
  hok "--only C17 runs its letter-suffixed sub-checks, --only C17c runs only C17c"
else
  hno "--only parent/sub-check selection is wrong (C17 emitted $PARENT ok lines, C17c emitted $CHILD)"
fi

# A Check is discovered by existing, so a planted one must turn the unfiltered
# run red — this is the property the old inline `if want CN` blocks could lose
# silently when a phrase stopped matching.
H_TMP=$(mktemp -d) || exit 1
( cd "$ROOT" && tar --exclude=.git -cf - . ) | ( cd "$H_TMP" && tar -xf - )
printf '\ncheck_C99() { bad "planted harness failure"; }\n' >> "$H_TMP/scripts/checks/10-rules.sh"
H_OUT=$(cd "$H_TMP" && bash scripts/validate-engineos.sh 2>&1); H_RC=$?
rm -rf "$H_TMP"
case "$H_RC:$H_OUT" in
  0:*) hno "a planted failing Check left the unfiltered run green" ;;
  *"planted harness failure"*) hok "a planted failing Check is discovered and flips the unfiltered exit code" ;;
  *) hno "a planted failing Check never ran (rc=$H_RC)" ;;
esac

echo
echo "== validate-engineos negative tests =="

case_ C3 "dangling rule reference is caught" \
      "dangling rule references" \
      "printf '\nSee \`rules/does-not-exist.md\`.\n' >> rules/base.md"

case_ C2 "deleted always-on rule is caught" \
      "always-on imports point at missing files" \
      "rm rules/context.md"

case_ C5 "router row dropping a deferred rule is caught" \
      "router closure rule violated" \
      "sed -i.bak '/^| Backend work/s| + \`rules/observability.md\`||' CLAUDE.md"

case_ C6 "guidance naming a nonexistent agent is caught" \
      "hook_guidance names missing agents" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='test': x['hook_guidance']=x['hook_guidance'].replace('agent:test-writer','agent:ghost-writer')
json.dump(d,open(p,'w'),indent=2)\""

case_ C9 "agent whose frontmatter name drifts from filename is caught" \
      "agent frontmatter problems" \
      "sed -i.bak 's|^name: test-writer\$|name: test-writer-renamed|' agents/test-writer.md"

case_ C10 "agent missing the Return format envelope is caught" \
      "agent return-format problems" \
      "sed -i.bak 's|^## Return format\$|## Output notes|' agents/security-reviewer.md"

case_ C11 "agent alias without a slash command is caught" \
      "missing slash commands" \
      "rm commands/agents/leo-ely.md"

case_ C12 "skill whose name drifts from its directory is caught" \
      "skill problems" \
      "sed -i.bak 's|^name: adr\$|name: adr-v2|' skills/adr/SKILL.md"

case_ C13 "emptied rule file is caught" \
      "empty documents" \
      ": > rules/testing.md"

# critic declares tier: design, which registries/models.json binds to opus.
# Moving only the model off that binding is the exact drift C31 exists for: the
# frontmatter still reads plausibly, and nothing else in the repo objects.
case_ C31 "agent whose model drifts off its declared tier is caught" \
      "agent tier/model disagreements" \
      "sed -i.bak 's|^model: opus\$|model: haiku|' agents/critic.md"

case_ C5b "always-on rule pointing at a route-loaded rule is caught" \
      "always-on rule points at a route-loaded rule" \
      "printf '\nDefer to \`rules/frontend.md\`.\n' >> rules/context.md"

case_ C17b "a sample_path that routes to the wrong domain is caught" \
      "sample_path routing failures" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='dba': x['sample_path']='/tmp/web/src/Button.tsx'
json.dump(d,open(p,'w'),indent=2)\""

case_ C14 "registry rules[] disagreeing with its guidance string is caught" \
      "registry rules/guidance mismatch" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='frontend': x['rules'].remove('testing')
json.dump(d,open(p,'w'),indent=2)\""

case_ C14 "registry precedence out of map order is caught" \
      "does not match domain order" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
d['precedence'][0], d['precedence'][1] = d['precedence'][1], d['precedence'][0]
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "a routing domain deleted out from under its intent FK is caught" \
      "intent/routing mismatches" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
d['domains']=[x for x in d['domains'] if x['id']!='llm']
d['precedence']=[x for x in d['precedence'] if x!='llm']
json.dump(d,open(p,'w'),indent=2)\""

case_ C17 "a domain with its match patterns emptied is caught" \
      "routing domains missing patterns/sample" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
for x in d['domains']:
    if x['id']=='frontend': x['match']={'paths':[],'basenames':[]}
json.dump(d,open(p,'w'),indent=2)\""

case_ C17c "dropping .excluded.self_dirs stops excluding EngineOS's own hooks/ tree" \
      "exclusion broken" \
      "python3 -c \"
import json
p='registries/routing.json'; d=json.load(open(p))
del d['excluded']['self_dirs']
json.dump(d,open(p,'w'),indent=2)\""

case_ C17e "an invalid prompt_signals regex is caught" \
      "prompt_signals problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['prompt_signals']['scale']='([unclosed'
json.dump(d,open(p,'w'),indent=2)\""

case_ C14 "duplicate decision rule id is caught" \
      "duplicate decision rule ids" \
      "python3 -c \"
import json
p='registries/decision-rules.json'; d=json.load(open(p))
d['rules'].append(dict(d['rules'][0]))
json.dump(d,open(p,'w'),indent=2)\""

case_ C14 "decision rule that requires nothing is caught" \
      "decision rules with an empty then" \
      "python3 -c \"
import json
p='registries/decision-rules.json'; d=json.load(open(p))
d['rules'].append({'id':'rule-noop','priority':1,'when':{},'then':{}})
json.dump(d,open(p,'w'),indent=2)\""

case_ C14 "verification registry drifting back to mandatory tests is caught" \
      "verification policy semantic drift" \
      "python3 -c \"
import json
p='registries/decision-rules.json'; d=json.load(open(p))
for r in d['rules']:
    if r['id']=='rule-verification': r['then']['require'][2]='relevant-tests'
json.dump(d,open(p,'w'),indent=2)\""

case_ C15 "capabilities.json binding a nonexistent agent is caught" \
      "capabilities.json names missing agents" \
      "sed -i.bak 's|\"backend-coordinator\"|\"ghost-writer\"|' registries/capabilities.json"

case_ C15 "capabilities.json with an invalid model tier is caught" \
      "invalid model_tier on capability" \
      "sed -i.bak 's|\"build\"|\"medium\"|' registries/capabilities.json"

case_ C15 "agents.json with an invalid model tier is caught" \
      "invalid model_tier on agent" \
      "python3 -c \"
import json
p='registries/agents.json'; d=json.load(open(p))
d['agents'][0]['model_tier']='fast'
json.dump(d,open(p,'w'),indent=2)\""

case_ C15 "agents.json naming a file that does not exist under agents/ is caught" \
      "agents.json names missing agent files" \
      "python3 -c \"
import json
p='registries/agents.json'; d=json.load(open(p))
d['agents'][0]['name']='ghost-writer'
json.dump(d,open(p,'w'),indent=2)\""

case_ C15b "capability tier drifting from its agent's tier is caught" \
      "capability/agent tier mismatch" \
      "python3 -c \"
import json
p='registries/capabilities.json'; d=json.load(open(p))
for c in d['capabilities']:
    if c['id']=='implement': c['model_tier']='design'
json.dump(d,open(p,'w'),indent=2)\""

# ---- C16: decision-kernel registries (P1) ----

case_ C16 "models.json escalates_to chain break is caught" \
      "escalates_to breaks the order" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
for t in d['tiers']:
    if t['id']=='build': t['escalates_to']='cheap'
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "models.json work_type with an unknown tier is caught" \
      "work_types with unknown tier" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
d['work_types'][0]['tier']='turbo'
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "moving ADR back off the most-capable tier without editing the prose is caught" \
      "ADR row does not bind" \
      "python3 -c \"
import json
p='registries/models.json'; d=json.load(open(p))
for w in d['work_types']:
    if w['id']=='adr': w['tier']='design'
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "agent declaring a model models.json does not bind is caught" \
      "agent frontmatter models unknown to models.json" \
      "sed -i.bak 's|^model: fable\$|model: gpt|' agents/product-spec.md"

case_ C16 "duplicate intent id is caught" \
      "duplicate intent ids" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
d['intents'].append(dict(d['intents'][0]))
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "hook-mirrored intent losing its domain FK is caught" \
      "hook_mirrored/domain mismatch" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='backend': i.pop('domain', None)
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "mirrored intent rules drifting from routing.json is caught" \
      "intent/routing mismatches" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='backend': i['rules'].remove('testing')
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "a routing.json domain left unclaimed by intents is caught" \
      "routing domains not claimed exactly once" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
d['intents']=[i for i in d['intents'] if i['id']!='android-release']
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "a CLAUDE.md router row added without a registry update is caught" \
      "intent drift" \
      "python3 - <<'EOF'
import re
p='CLAUDE.md'; s=open(p).read()
anchor='| Claiming done / complete / fixed'
row='| Fake new intent (made up) | nothing |\n'
s=s.replace(anchor, row+anchor, 1)
open(p,'w').write(s)
EOF"

case_ C16 "policy.json wave cap drifting from the parallelism prose is caught" \
      "wave cap drift" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['wave_concurrency_cap']=4
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "policy.json losing an autonomy level is caught" \
      "autonomy levels" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['autonomy']['levels']=[l for l in d['autonomy']['levels'] if l['id']!='A4']
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "policy.json gate matrix missing a gate for a tier is caught" \
      "by_risk incomplete" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['gates']['by_risk']['medium'].pop('release')
json.dump(d,open(p,'w'),indent=2)\""

case_ C16 "spec threshold drifting between CLAUDE.md and policy.json is caught" \
      "spec-threshold drift" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['gates']['spec_threshold']['files_greater_than']=5
json.dump(d,open(p,'w'),indent=2)\""

# ---- C18: router agent wiring (P3) ----

case_ C15 "route capability repointed at a nonexistent agent is caught" \
      "capabilities.json names missing agents" \
      "sed -i.bak 's|\"agent\": \"router\"|\"agent\": \"ghost-router\"|' registries/capabilities.json"

case_ C18 "route capability model_tier downgraded off design is caught" \
      "route capability" \
      "python3 -c \"
import json
p='registries/capabilities.json'; d=json.load(open(p))
for c in d['capabilities']:
    if c['id']=='route': c['model_tier']='build'
json.dump(d,open(p,'w'),indent=2)\""

case_ C18 "route capability's tier drifting off the router agent's model is caught" \
      "route capability binding broken" \
      "sed -i.bak 's|^model: opus|model: haiku|' agents/router.md"

case_ C18b "router agent losing a required kernel call is caught" \
      "router does not call the kernel" \
      "sed -i.bak 's|kernel.sh waves|kernel.sh wavez|g' agents/router.md"

case_ C18c "router agent gaining Write is caught" \
      "router must not hold" \
      "sed -i.bak 's|^tools: Read, Grep, Glob, Bash\$|tools: Read, Grep, Glob, Bash, Write|' agents/router.md"

case_ C18d "a self-referencing suppressed_by is caught" \
      "suppression data problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for x in d['intents']:
    if x['id']=='route-planning': x['suppressed_by']=['route-planning']
json.dump(d,open(p,'w'),indent=2)\""

case_ C18e "a flipped router fixture expectation is caught" \
      "route-escalate fixture" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['router']['fixtures'][0]['escalate'] = not d['router']['fixtures'][0]['escalate']
json.dump(d,open(p,'w'),indent=2)\""

case_ C18f "prompt-advisor.sh removed from hooks.json is caught" \
      "prompt-advisor" \
      "python3 -c \"
import json
p='hooks/hooks.json'; d=json.load(open(p))
d['hooks']['UserPromptSubmit'][0]['hooks'] = [h for h in d['hooks']['UserPromptSubmit'][0]['hooks'] if 'prompt-advisor' not in h['command']]
json.dump(d,open(p,'w'),indent=2)\""

# ---- C19: handoff template <-> registry section contract (P4) ----

case_ C19b "a required section removed from the handoff template is caught" \
      "handoff template missing required sections" \
      "sed -i.bak '/^## Evidence\$/d' templates/handoff.md"

case_ C19b "a registry-required section absent from the template is caught" \
      "handoff template missing required sections" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['required_sections'].append('Ghost section')
json.dump(d,open(p,'w'),indent=2)\""

case_ C19b "a template section added without a registry update is caught" \
      "handoff template sections not declared in the registry" \
      "printf '\\n## Scratch notes\\n\\n<anything>\\n' >> templates/handoff.md"

case_ C19b "the Gate field dropped from the handoff template is caught" \
      "handoff template missing required fields" \
      "sed -i.bak 's|^Gate:|Gato:|' templates/handoff.md"

case_ C19 "the section list reintroduced into the handoff note is caught" \
      "handoff intent required_sections problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['note'] += ' Required sections: objective, state, evidence.'
json.dump(d,open(p,'w'),indent=2)\""

case_ C19c "CLAUDE.md handoff row dropping a section name is caught" \
      "CLAUDE.md handoff row does not mirror" \
      "sed -i.bak 's| evidence, known failures| known failures|' CLAUDE.md"

# ---- C20: check-level repair policy (P5) ----

case_ C20 "the repair block deleted from policy.json is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
del d['repair']
json.dump(d,open(p,'w'),indent=2)\""

case_ C20 "max_fix_attempts_per_check set to 0 is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['max_fix_attempts_per_check']=0
json.dump(d,open(p,'w'),indent=2)\""

case_ C20 "an emptied never_repair array is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['never_repair']=[]
json.dump(d,open(p,'w'),indent=2)\""

case_ C20 "the flaky entry dropped from by_situation is caught" \
      "policy.json.repair problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['repair']['by_situation']=[s for s in d['repair']['by_situation'] if s['situation']!='flaky']
json.dump(d,open(p,'w'),indent=2)\""

case_ C20b "the stop-report-red ladder literal broken in kernel.sh is caught" \
      "repair ladder canary failed" \
      "sed -i.bak 's|stop-report-red|stop-report|' scripts/kernel.sh"

case_ C20c "until clean reintroduced into the CLAUDE.md verify-done row is caught" \
      "repair prose-mirror problems" \
      "sed -i.bak 's|a bounded fix loop.*reports done\\.|fix loop until clean before reporting done.|' CLAUDE.md"

case_ C20d "the hook's registry read replaced with a hardcoded number is caught" \
      "stop-verify.sh repair-wiring problems" \
      "sed -i.bak 's|MAXFIX=\$(jq -r .\\{0,1\\}\\.repair\\.max_fix_attempts_per_check[^)]*)|MAXFIX=2|' hooks/stop-verify.sh"

# ---- C21: change-record contract — template, archive, mirrors (P6) ----

case_ C21b "a required section removed from the change template is caught" \
      "change template missing required sections" \
      "sed -i.bak '/^## Verification\$/d' .engineos/changes/_template.md"

case_ C21b "a template section added without a registry update is caught" \
      "change template sections not declared" \
      "printf '\\n## Scratch\\n\\n<x>\\n' >> .engineos/changes/_template.md"

case_ C21b "a registry-required section absent from the template is caught" \
      "change template missing required sections" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='record-change': i['required_sections'].append('Ghost section')
json.dump(d,open(p,'w'),indent=2)\""

case_ C21 "an invalid spec_exempt_pattern ERE is caught" \
      "record-change contract problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='record-change': i['archive_contract']['spec_exempt_pattern']='('
json.dump(d,open(p,'w'),indent=2)\""

case_ C21c "an archived record's spec link pointing at a nonexistent file is caught" \
      "archived spec-link problems" \
      "sed -i.bak 's|^spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md|spec: docs/specs/ghost.md|' .engineos/archived/2026/08/general/2026-08-06-decision-kernel-p5-repair-loop.md"

case_ C21c "an archived record's n/a exemption stripped of its reason is caught" \
      "archived spec-link problems" \
      "sed -i.bak 's|^spec: n/a — .*|spec: n/a|' .engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md"

case_ C21c "an archived record losing its completed date is caught" \
      "archived change-record problems" \
      "sed -i.bak '/^completed: 2026-08-06\$/d' .engineos/archived/2026/08/general/2026-08-06-decision-kernel-p4-handoff-frontmatter.md"

case_ C21c "an unresolved checklist item in an archived record is caught" \
      "archived change-record problems" \
      "printf -- '- [ ] leftover\\n' >> .engineos/archived/2026/08/general/2026-08-06-decision-kernel-p3-router-agent.md"

case_ C21c "an archived record's domain drifting off the enum is caught" \
      "archived change-record problems" \
      "sed -i.bak 's|^domain: general|domain: platform|' .engineos/archived/2026/08/general/2026-08-06-decision-kernel-p2-resolver-api.md"

case_ C21e "a domain dropped from the SKILL.md mirror or the killed README copy regrowing is caught" \
      "change-record mirror problems" \
      "sed -i.bak 's|\`dba\`, ||' skills/record-change/SKILL.md && printf 'status: active\\n' >> .engineos/changes/README.md"

# ---- C22: telemetry — policy + plumbing, never the event data (P7) ----

case_ C22 "the telemetry block deleted from policy.json is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
del d['telemetry']
json.dump(d,open(p,'w'),indent=2)\""

case_ C22 "retention_days set to 0 is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['telemetry']['retention_days']=0
json.dump(d,open(p,'w'),indent=2)\""

case_ C22 "an invalid value_pattern ERE is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['telemetry']['value_pattern']='('
json.dump(d,open(p,'w'),indent=2)\""

case_ C22 "the route event's keys emptied is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
for e in d['telemetry']['events']:
    if e['id']=='route': e['keys']=[]
json.dump(d,open(p,'w'),indent=2)\""

case_ C22b "a two-word string in the decision-rules sample is caught by the live canary" \
      "telemetry canary failed" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
for e in d['telemetry']['events']:
    if e['id']=='decision-rules': e['sample']['rules']=['two words']
json.dump(d,open(p,'w'),indent=2)\""

case_ C22c "the route telemetry event removed from prompt-advisor.sh is caught" \
      "telemetry wiring problems" \
      "sed -i.bak 's|hook_telemetry route|hook_telemetry route-missing|' hooks/prompt-advisor.sh"

case_ C22c "prompt-advisor's append reading the prompt instead of \$ROUTE_DATA is caught" \
      "telemetry wiring problems" \
      "sed -i.bak 's|hook_telemetry route \"\$ROUTE_DATA\"|hook_telemetry route \"\$HOOK_PROMPT\"|' hooks/prompt-advisor.sh"

case_ C22c "ensure-project-layout's registry read replaced with a hardcoded retention window is caught" \
      "telemetry wiring problems" \
      "sed -i.bak 's|-mtime \"+\$RET\"|-mtime \"+90\"|' hooks/ensure-project-layout.sh"

case_ C22 "written_by demoted from an array back to a bare string is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
for e in d['telemetry']['events']:
    if e['id']=='route': e['written_by']=e['written_by'][0]
json.dump(d,open(p,'w'),indent=2)\""

case_ C22 "a written_by entry naming a file that does not exist is caught" \
      "telemetry policy problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
for e in d['telemetry']['events']:
    if e['id']=='hitl': e['written_by']=e['written_by']+['hooks/no-such-hook.sh']
json.dump(d,open(p,'w'),indent=2)\""

# The reverse half of C22c: a hook that appends a registered event without
# being declared as one of its writers. Named zz- rather than test-, because
# hooks/test-*.sh are excluded by design (a test asserts on an event, it does
# not produce one).
case_ C22c "a hook appending a registered event without being declared its writer is caught" \
      "telemetry wiring problems" \
      "printf '#!/usr/bin/env bash\\nhook_telemetry hitl \"\$DATA\"\\n' > hooks/zz-fake-writer.sh"

case_ C22c "the hitl telemetry event removed from prompt-advisor.sh is caught" \
      "telemetry wiring problems" \
      "sed -i.bak 's|hook_telemetry hitl|hook_telemetry hitl-missing|' hooks/prompt-advisor.sh"

# ---- C23: constitution preamble mirrors (P8, epic close) ----

case_ C23 "a reordered precedence domain in CLAUDE.md's sentence is caught" \
      "constitution preamble mirror problems" \
      "sed -i.bak 's|security → test → backend|test → security → backend|' CLAUDE.md"

case_ C23 "context.md dropped from COMPATIBILITY.md's always-on enumeration is caught" \
      "constitution preamble mirror problems" \
      "sed -i.bak 's|\`context.md\`) load|) load|' docs/COMPATIBILITY.md"

case_ C23c "the retired \"authoritative for file-pattern routing\" claim restored in CLAUDE.md is caught" \
      "reintroduced the retired routing-map.sh authority claim" \
      "sed -i.bak 's|resolved by \`scripts/kernel.sh route-path\`|which is authoritative for file-pattern routing, resolved by \`scripts/kernel.sh route-path\`|' CLAUDE.md"

# ---- C24: backpressure — data, canary, prose mirror ----

case_ C24 "max_queued_units set to a word is caught" \
      "backpressure block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['backpressure']['max_queued_units']='many'
json.dump(d,open(p,'w'),indent=2)\""

case_ C24 "a max_inflight copy of the wave cap added under backpressure is caught" \
      "backpressure block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['parallelism']['backpressure']['max_inflight']=d['parallelism']['wave_concurrency_cap']
json.dump(d,open(p,'w'),indent=2)\""

# ---- C25: circuit breaker — data, canary, prose mirror ----

case_ C25 "a breaker state dropped from policy.json is caught" \
      "breaker block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['breaker']['states']=['closed','open']
json.dump(d,open(p,'w'),indent=2)\""

case_ C25 "failure_threshold set to 0 is caught" \
      "breaker block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['breaker']['failure_threshold']=0
json.dump(d,open(p,'w'),indent=2)\""

case_ C25c "the breaker threshold changed in policy.json without the prose is caught" \
      "breaker prose-mirror problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['breaker']['failure_threshold']=d['breaker']['failure_threshold']+4
json.dump(d,open(p,'w'),indent=2)\""

# A scope id dropped from the vocabulary sentence. The three cases above mutate
# the state list, the threshold and the threshold prose; none of them touches a
# scope id, which is the one breaker field with no kernel consumer and no
# canary — its prose mirror is the entire guard.
case_ C25c "a scope id removed from the breaker's vocabulary sentence is caught" \
      "parallelism.md-does-not-name-scope:mcp" \
      "python3 - <<'EOF'
p='rules/parallelism.md'
s=open(p).read()
s=s.replace('\`mcp\` (an MCP server), ', '')
open(p,'w').write(s)
EOF"

# The vacuity proof itself: delete the scope vocabulary outright and extend the
# span-kind list in the SAME section so every id still appears somewhere inside
# it — a plausible documentation edit, since `agent` is a real span_kind. While
# the scope grep was scoped to the section rather than to the sentence, C25c
# reported ok on this tree, which defines no breaker scope at all.
case_ C25c "deleting the scope vocabulary while every id survives elsewhere in the section is caught" \
      "parallelism.md-has-no-breaker-scope-vocabulary-sentence" \
      "python3 - <<'EOF'
import re
p='rules/parallelism.md'
s=open(p).read()
i=s.index('## Circuit breaker')
j=s.index('## ', i + 5)
sec=s[i:j]
sec=re.sub(r'The breaker is per resource.*?\.\s', '', sec, flags=re.S)
sec=re.sub(r'Those scope ids.*?\n\n', '', sec, flags=re.S)
sec=sec.replace('\`span_kind\` \`tool\` or \`model\`',
                '\`span_kind\` \`tool\`, \`mcp\`, \`agent\`, \`provider\` or \`model\`')
open(p,'w').write(s[:i] + sec + s[j:])
EOF"

# ---- C26: human-in-the-loop — data, canary, prose mirror, coupling ----

case_ C26 "a reason removed from policy.json's hitl vocabulary is caught" \
      "hitl block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['hitl']['reasons']=[r for r in d['hitl']['reasons'] if r!='destructive-action']
json.dump(d,open(p,'w'),indent=2)\""

case_ C26 "an emptied record_home is caught" \
      "hitl block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['hitl']['record_home']=''
json.dump(d,open(p,'w'),indent=2)\""

case_ C26 "a situation that also sits on retry.never_retry is caught" \
      "hitl block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['hitl']['situations']=d['hitl']['situations']+[d['retry']['never_retry'][0]]
json.dump(d,open(p,'w'),indent=2)\""

# A situation the kernel accepts and then silently drops answers required:false
# -- "no human needed" for an input it did not act on.
case_ C26b "a declared situation the kernel no longer maps to a reason is caught" \
      "hitl canary" \
      "sed -i.bak 's|if \$s == \"breaker-open\" then \"breaker-open\"|if false then \"breaker-open\"|' scripts/kernel.sh"

case_ C26b "the high-risk reason removed from the kernel is caught" \
      "hitl canary" \
      "sed -i.bak 's@if \$r == \"high\" then \"high-risk\"@if false then \"high-risk\"@' scripts/kernel.sh"

# The ruling, pinned from the failing side: a resolve-task that folds hitl off a
# bare route.risk_floor again would announce a human gate on every auth-guard
# edit. Widening the guard from the classified signal back to any floor is
# exactly that regression, so C26b has to catch it.
case_ C26b "resolve-task folding hitl off a bare risk floor is caught" \
      "hitl canary" \
      "sed -i.bak 's@if \[ \"\$any_high\" = true \]; then@if [ -n \"\$floor\" ]; then@' scripts/kernel.sh"

# The other ruling, same treatment: restoring the unconditional "A1" makes
# autonomy_after RAISE A0 to A1 on weaker evidence and drop medium/A3 two
# levels. Every fixture in that family used to pass --autonomy A2 and only A2,
# where the literal happened to be right, so this is the case that proves the
# tier-scoped assertions are load-bearing.
case_ C26b "autonomy_after reverting to an unconditional A1 is caught" \
      "hitl canary" \
      "sed -i.bak 's@autonomy_after: \$after,@autonomy_after: (if \$e == \"thin\" then \"A1\" else \$a end),@' scripts/kernel.sh"

case_ C26c "a reason row deleted from rules/risk-autonomy.md is caught" \
      "hitl prose-mirror problems" \
      "sed -i.bak '/^| \`never-retry-situation\`/d' rules/risk-autonomy.md"

case_ C26c "the Human-in-the-loop section renamed in rules/risk-autonomy.md is caught" \
      "hitl prose-mirror problems" \
      "sed -i.bak 's|^## Human-in-the-loop\$|## HITL|' rules/risk-autonomy.md"

case_ C26c "the record home dropped from the gates.md release checklist is caught" \
      "hitl prose-mirror problems" \
      "sed -i.bak 's|\`## Human decisions\` in the change record|the change record|' rules/gates.md"

case_ C26d "the reason id renamed in the registry without kernel.sh is caught" \
      "hitl/backpressure coupling problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['hitl']['reasons']=['budget-spent' if r=='budget-exhausted' else r for r in d['hitl']['reasons']]
d['hitl']['situations']=['budget-spent' if s=='budget-exhausted' else s for s in d['hitl']['situations']]
json.dump(d,open(p,'w'),indent=2)\""

case_ C26d "admit's reject message losing the hitl reason id is caught" \
      "hitl/backpressure coupling problems" \
      "sed -i.bak 's|(hitl: budget-exhausted)|(ask a human)|' scripts/kernel.sh"

# ---- C27: the agent-span exec journal ----
# The registry half and the script half declare the same span vocabulary, so
# either one moving alone is drift. Both directions get a case: a check that
# only reads the registry would pass against a renamed constant.
case_ C27 "a span kind renamed in the registry without exec-journal.sh is caught" \
      "exec_journal block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['telemetry']['exec_journal']['span_kinds']=[('verify' if k=='verification' else k) for k in d['telemetry']['exec_journal']['span_kinds']]
json.dump(d,open(p,'w'),indent=2)\""

case_ C27 "a span kind renamed in exec-journal.sh without the registry is caught" \
      "exec_journal block problems" \
      "sed -i.bak 's|^VALID_SPAN_KINDS=\"router |VALID_SPAN_KINDS=\"routing |' scripts/exec-journal.sh"

case_ C27 "a home that no longer names the .exec.jsonl journal is caught" \
      "exec_journal block problems" \
      "python3 -c \"
import json
p='registries/policy.json'; d=json.load(open(p))
d['telemetry']['exec_journal']['home']='.git/engineos-telemetry/<session_id>.jsonl'
json.dump(d,open(p,'w'),indent=2)\""

case_ C27 "the length bound removed from policy.json is caught" \
      "exec_journal block problems" \
      "python3 -c \"
import json,collections
p='registries/policy.json'; d=json.load(open(p),object_pairs_hook=collections.OrderedDict)
del d['telemetry']['exec_journal']['max_value_length']
json.dump(d,open(p,'w'),indent=2)\""

case_ C27 "the length bound drifting from the script's fallback is caught" \
      "exec_journal block problems" \
      "sed -i.bak 's|^MAX_VALUE_LEN_FALLBACK=\"256\"|MAX_VALUE_LEN_FALLBACK=\"512\"|' scripts/exec-journal.sh"

# The invariant the whole schema exists for. is_slug weakened to accept
# whitespace is a prompt-text channel straight to disk, and it is a one-line
# edit, so it gets its own behavioral case rather than trusting the unit suite.
case_ C27b "is_slug weakened to accept whitespace is caught by the live canary" \
      "exec-journal span canary failed" \
      "python3 -c \"
p='scripts/exec-journal.sh'; s=open(p).read()
s=s.replace(\\\"''|*[!A-Za-z0-9@_./:-]*) return 1 ;;\\\", \\\"'') return 1 ;;\\\")
open(p,'w').write(s)\""

case_ C27b "an unknown span_kind silently accepted is caught by the live canary" \
      "exec-journal span canary failed" \
      "sed -i.bak 's|in_list \"\$span_kind_val\" \"\$VALID_SPAN_KINDS\"|true|' scripts/exec-journal.sh"

case_ C27b "the agent field losing its slug guard is caught by the canary" \
      "exec-journal span canary failed" \
      "sed -i.bak '/^  check_slug_flag --agent /d' scripts/exec-journal.sh"

case_ C27b "the length bound no longer enforced on append is caught" \
      "exec-journal span canary failed" \
      "sed -i.bak '/^    check_len \"\$1\" \"\$2\"\$/d' scripts/exec-journal.sh"

case_ C27c "the router span removed from prompt-advisor.sh is caught" \
      "exec-journal wiring problems" \
      "sed -i.bak '/^hook_span router /,+1d' hooks/prompt-advisor.sh"

case_ C27c "the verification span removed from stop-verify.sh is caught" \
      "exec-journal wiring problems" \
      "sed -i.bak '/^  hook_span verification /,+2d' hooks/stop-verify.sh"

case_ C27c "the span start marker no longer opened at dispatch is caught" \
      "exec-journal wiring problems" \
      "sed -i.bak '/hook_span_open/d' hooks/announce-agent-dispatch.sh"

case_ C27c "the span start markers no longer reaped is caught" \
      "exec-journal wiring problems" \
      "sed -i.bak '/engineos-telemetry\/spans/d' hooks/ensure-project-layout.sh"

case_ C27d "the Agent traces section renamed in rules/observability.md is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|^## Agent traces\$|## Traces|' rules/observability.md"

case_ C27d "a span kind dropped from the Agent traces section is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|\`router \| coordinator \| agent \| tool \| model \| verification\`|\`router \| agent\`|' rules/observability.md"

case_ C27d "the 0-is-not-free caveat dropped from the Agent traces section is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|; do not read 0 as free||' rules/observability.md"

case_ C27d "tokens_in dropped from the Agent traces field list is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|\`tokens_in\`, \`tokens_out\`, ||' rules/observability.md"

case_ C27d "the span-kind alternation line deleted from the prose is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak '/router | coordinator | agent | tool | model | verification/d' rules/observability.md"

case_ C27d "the status-is-a-floor caveat dropped from the prose is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|is a FLOOR|is a count|' rules/observability.md"

case_ C27d "the slug claim re-broadened past note is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|every field EXCEPT \`note\` is a slug|every field is a slug|' rules/observability.md"

case_ C27d "the slug guard re-claiming that it classifies content is caught" \
      "exec-journal prose-mirror problems" \
      "sed -i.bak 's|it does not classify the content|a PII value cannot be written through those|' rules/observability.md"

case_ C27e "append and validate guarding different field sets is caught" \
      "exec-journal slug-guard set problems" \
      "sed -i.bak '/^  check_slug_flag --agent /d' scripts/exec-journal.sh"

case_ C27e "note becoming a guarded slug field is caught" \
      "exec-journal slug-guard set problems" \
      "python3 -c \"
p='scripts/exec-journal.sh'; s=open(p).read()
old='  check_slug_flag --route          '
open(p,'w').write(s.replace(old, '  check_slug_flag --note           \\\"\\\$note_set\\\"           \\\"\\\$note_val\\\"\\n'+old, 1))\""

# The case the previous round could not have written, because the check could
# not have caught it. Both of C27e's original comparisons derive their halves
# from the guards, so removing a field's guard from BOTH boundaries leaves the
# two halves equal and the check green — which is how `timestamp` stayed a
# newline-and-control-character channel to disk after `agent` was fixed. Two
# edits, one invariant: "a declared string field guarded on neither boundary".
# Removing only one of them would fire the parity comparison instead and prove
# nothing about the coverage one, so the expected string names the finding only
# the declaration-driven comparison can produce.
case_ C27e "a declared string field guarded on NEITHER boundary is caught" \
      "declared-slug-field-not-guarded-on-append:timestamp" \
      "sed -i.bak '/^  check_slug_flag --timestamp /d' scripts/exec-journal.sh; sed -i.bak 's|(\[\.timestamp, \.run_id,|([.run_id,|' scripts/exec-journal.sh"

# ... and the declaration is only worth having if it cannot fall behind the
# code, so it is pinned against the object append actually emits. Otherwise the
# blind spot would just move: a field added to the writer and forgotten in
# EJ_SCHEMA_FIELDS would be invisible again.
case_ C27e "a field the writer emits but the schema declaration drops is caught" \
      "emitted-but-not-declared-in-EJ_SCHEMA_FIELDS:route" \
      "sed -i.bak 's| route:slug||' scripts/exec-journal.sh"

case_ C27f "a span writer passing an unregistered capability_id is caught" \
      "exec-journal capability_id problems" \
      "sed -i.bak 's|--capability-id validate|--capability-id verify|' hooks/stop-verify.sh"

# ---- C28 / C29: the pairs Tasks 6 and 7 land ----
# Those artifacts live on other branches until the stack merges, and their
# Checks skip on absent inputs (70-runtime.sh have_retrieval_metrics_inputs /
# have_adoption_inputs). A case registered here anyway would assert a FAIL the
# validator correctly does not emit, so registration is gated on the same
# predicate: on the merged tree every case below runs and each is refutable on
# its own mutation. Nothing here plants breakage in the guard input itself.
tskip() { printf 'skip %s\n' "$1"; }

if [ -d "$ROOT/skills/eval-harness/references" ]; then
  case_ C28 "the RAG section deleted from rules/llm-apps.md is caught" \
        "retrieval-metrics prose/data problems" \
        "python3 -c \"
import re
p='rules/llm-apps.md'; s=open(p).read()
open(p,'w').write(re.sub(r'## RAG\n(.*\n)*?(?=## )', '', s))\""

  case_ C28 "a metric name dropped from the RAG section is caught" \
        "retrieval-metrics prose/data problems" \
        "sed -i.bak 's| and \*\*MRR\*\*||' rules/llm-apps.md"

  case_ C28 "the retrieval-metrics reference deleted is caught" \
        "retrieval-metrics prose/data problems" \
        "rm -f skills/eval-harness/references/retrieval-metrics.md"
else
  tskip "C28 cases — skills/eval-harness/references/ is not in this tree yet"
fi

if [ -f "$ROOT/scripts/init-project.sh" ]; then
  # One mutation per case. This one used to remove commands/init.md as well,
  # which meant it passed on `commands/init.md-missing` and never on the exec
  # bit it is named for.
  case_ C29 "init-project.sh losing its exec bit is caught" \
        "adoption entrypoint problems" \
        "chmod -x scripts/init-project.sh"

  case_ C29 "ensure-project-layout no longer sourcing scaffold-layout.sh is caught" \
        "adoption entrypoint problems" \
        "sed -i.bak '/scaffold-layout.sh/d' hooks/ensure-project-layout.sh"

  case_ C29 "docs/ADOPTION.md losing the /engineos:init command is caught" \
        "adoption entrypoint problems" \
        "sed -i.bak 's|/engineos:init|/engineos:setup|g' docs/ADOPTION.md"

  case_ C29 "commands/init.md no longer naming init-project.sh is caught" \
        "adoption entrypoint problems" \
        "sed -i.bak 's|scripts/init-project.sh|scripts/setup-project.sh|g' commands/init.md"
else
  tskip "C29 cases — scripts/init-project.sh is not in this tree yet"
fi

# ---- C30: hook file modes ----
# hooks.json registers hooks BY PATH, so an entry point without +x dies with
# "permission denied" on every fire — a guardrail lost silently and for good.
# All four directions get a case: the two mode bits, the list the installer
# reads, and the installer going back to reading each file's own header for the
# answer. That last one is the anchor itself, and it is the only case here whose
# breakage a tree with correct modes cannot hide.
case_ C30 "a hook entry point losing its exec bit is caught" \
      "hook-entry-point-is-not-executable:prompt-advisor.sh" \
      "chmod -x hooks/prompt-advisor.sh"

case_ C30 "a sourced-only library carrying the exec bit is caught" \
      "library-carries-the-executable-bit:lib-common.sh" \
      "chmod +x hooks/lib-common.sh"

case_ C30 "a library dropped from install.sh's list is caught" \
      "introduces-itself-as-a-library-but-is-not-listed:lib-runner.sh" \
      "sed -i.bak 's| lib-runner.sh||' install.sh"

case_ C30 "install.sh going back to deciding executability from a file's own header is caught" \
      "install.sh-decides-executability-from-the-file's-own-text-again" \
      "sed -i.bak \"s#^  case .*ENGINEOS_HOOK_LIBRARIES.*#  head -8 \\\"\\\$_hook\\\" | grep -q 'Sourced only' \\&\\& continue#\" install.sh"

flush_batch
echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
