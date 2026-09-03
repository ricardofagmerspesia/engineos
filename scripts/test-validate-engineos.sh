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

flush_batch
echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
