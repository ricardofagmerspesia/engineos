---
name: 2026-08-02-wave1-self-verification
status: done
completed: 2026-08-02
owner: Ricardo Fagmer
spec: docs/specs/2026-08-02-ai-methodology-integration-analysis.md
domain: general
---

## What

Wave 1 of the methodology integration plan: EngineOS now verifies itself. Adds an
integrity check over its own corpus (G11), a golden eval set for router and agent
behaviour (G4), and a machine-parseable return envelope on every agent (G6). All
three run in CI.

## Why

The analysis of the supplied AI-engineering knowledge bundles found that EngineOS
was ahead of the source material on parallelism, model tiering and knowledge
placement, but had no way to check its own invariants. Three specifics:

- `CLAUDE.md` states the router closure rule, the "keep the table in sync with
  routing-map.sh" rule, and the jq dependency — all enforced by human diligence.
- `rules/llm-apps.md` forbids vibes-driven development and requires a golden set
  before iterating on any prompt or agent. EngineOS had none for its own router.
- `rules/parallelism.md` requires honest partial-failure reporting from agents,
  but agent output was free prose, so "honest" was a matter of intent.

Wave 3 (moving routing to data) is gated on this work: rewriting the router
without a regression net is the one change in the plan that can break everything
else silently.

## Scope

- `scripts/validate-engineos.sh` — new, 12 invariants
- `scripts/test-validate-engineos.sh` — new, 9 planted-breakage tests
- `scripts/run-evals.sh` — new, deterministic tier + opt-in live tier
- `evals/intent-routing-cases.jsonl` — new, 26 cases
- `evals/agent-cases.jsonl` — new, 14 cases
- `evals/RUBRIC.md` — new
- `agents/*.md` — 18 files, appended `## Return format`
- `.github/workflows/ci.yml` — 3 new steps
- `docs/specs/2026-08-02-ai-methodology-integration-analysis.md` — new (analysis)
- `docs/specs/2026-08-02-wave1-flowcharts.md` — new (diagrams)

## Checklist

- [x] Analyze the 17 supplied archives; establish which are redundant
- [x] G11 — integrity check over rules, agents, skills, commands, routing map
- [x] G11 — negative tests proving each check fires
- [x] G4 — intent-routing and agent-behaviour case sets
- [x] G4 — runner with a deterministic tier that gates CI
- [x] G4 — grading rubric
- [x] G6 — canonical return envelope on all 18 agents
- [x] Wire all three into CI
- [x] Flowcharts for the plan, the CI chain, and the status decision

## What was made

**G11 — `scripts/validate-engineos.sh`.** Twelve checks: jq present; always-on
`@rules` imports resolve; every `rules/X.md` cross-reference in CLAUDE.md, rules,
agents, skills and commands resolves; router row load lists are closed; every
agent, skill and rule named by `hooks/routing-map.sh` exists; agent frontmatter
complete with `name` matching the filename; every agent declares the return
envelope; every agent and alias has a slash command; every skill's `SKILL.md`
name matches its directory; no empty documents.

The closure check derives the deferral graph at runtime rather than hardcoding
it: rule R defers to S when R's text names `S.md` and S is not always-on. Current
graph — `backend.md` defers to `architecture.md` and `observability.md`;
`data.md` defers to `architecture.md`. Thirteen router rows carry rule loads and
all thirteen are closed today.

**`scripts/test-validate-engineos.sh`.** A validator that only ever passes proves
nothing. Nine cases each break one invariant in a throwaway copy (`tar` clone,
`.git` excluded) and assert the validator exits non-zero with the matching FAIL
line: dangling reference, deleted always-on rule, router row dropping a deferred
rule, routing-map naming a ghost agent, agent name drift, missing return
envelope, missing alias command, skill name drift, emptied rule file.

**G4 — `evals/`.** 26 intent-routing cases and 14 agent-behaviour cases. Intent
cases cover plain rows, multi-intent, precedence (store-release beating generic
mobile), the carve-outs (audit vs system-comprehension, adr vs strategy), the
sweep trigger, and two negative cases where routing must NOT fire (a pure
question, a README typo). Agent cases encode must / must_not per agent, including
one for the scope-collision case and one for "cannot complete" that forbids `OK`.

`scripts/run-evals.sh` runs a deterministic tier unconditionally — valid JSONL,
asserted rules and agents exist, no contradictory expectations, no assertions on
always-on rules (they are implicit and would always match), every `must_load` set
closed under the same deferral graph as the validator, and a 25-case coverage
floor. That tier is what catches eval-set rot, which is how golden sets die: the
suite keeps passing while the thing it describes moves. The live tier grades
against a real model via `claude -p`, comparing the mandated `[router] … loaded=`
line to the expected sets; it is opt-in via `ENGINEOS_EVAL_LIVE=1` and reports
SKIPPED with a count when not run — never as passed.

**G6 — return envelope.** All 18 agents gained an identical `## Return format`
section: a YAML envelope with `status` / `agent` / `mode` / `objective` / `scope`
/ `evidence` / `decisions` / `risks` / `out_of_scope` / `next_actions`, emitted
before the existing human-readable output, which is unchanged. Five statuses —
`OK`, `DEGRADED`, `CRITICAL`, `BLOCKED`, `FAILED` — with the rule to pick the
worst that applies. `OK` with an empty `evidence` list is defined as a defect.
Previously five agents had no `### Status:` line at all, so a consolidator had no
uniform signal to read.

## Changes registered

```
$ git status --short
 M .github/workflows/ci.yml
 M agents/android-builder.md
 M agents/architecture-analyst.md
 M agents/audit-consolidator.md
 M agents/backend-coordinator.md
 M agents/cicd-specialist.md
 M agents/dba-coordinator.md
 M agents/devops-coordinator.md
 M agents/frontend-coordinator.md
 M agents/gcp-specialist.md
 M agents/ios-builder.md
 M agents/kubernetes-specialist.md
 M agents/llm-coordinator.md
 M agents/mobile-coordinator.md
 M agents/oracle-specialist.md
 M agents/postgres-specialist.md
 M agents/qa-tester.md
 M agents/security-reviewer.md
 M agents/test-writer.md
 M hooks/layout-manifest.sh
 M hooks/lib-common.sh
?? .engineos/changes/2026-08-02-wave1-self-verification.md
?? docs/specs/2026-08-02-ai-methodology-integration-analysis.md
?? docs/specs/2026-08-02-wave1-flowcharts.md
?? evals/
?? scripts/run-evals.sh
?? scripts/test-validate-engineos.sh
?? scripts/validate-engineos.sh

$ git diff --stat HEAD
 .github/workflows/ci.yml        |  9 +++++++++
 agents/*.md (18 files)          | 34 ++++++++++++++++++++++++++++++++++ each
 hooks/layout-manifest.sh        |  0
 hooks/lib-common.sh             |  0
 21 files changed, 621 insertions(+)
```

No renames or `git mv` in this unit.

**Excluded from the commit:** `hooks/layout-manifest.sh` and `hooks/lib-common.sh`
show as modified but the diff is a mode change only (`100644 => 100755`). Both
predate this work — they were already dirty at session start — and the exec bit
looks wrong on its face: `lib-common.sh` carries the comment "Sourced only — no
independent execution, so no shebang/exec bit". Left untouched for the owner to
decide; not part of this unit.

## Verification

```
scripts/validate-engineos.sh       passed 12, failed 0
scripts/test-validate-engineos.sh  passed 9,  failed 0
scripts/run-evals.sh               passed 10, failed 0, skipped 26 (live tier not opted into)
hooks/test-route.sh                pass=38 fail=0
hooks/test-governance.sh           pass=15 fail=0
hooks/test-task-scale.sh           12 passed, 0 failed
hooks/test-layout.sh               pass=14 fail=0 skip=0
hooks/test-verify.sh               pass=10 fail=0 skip=0
hooks/test-post-edit.sh            pass=4  fail=0
scripts/gen-agent-commands.sh      ok: commands/agents in sync
bash -n on all three new scripts   clean
```

Not verified locally: `shellcheck -S error` — not installed on this machine. CI
runs it over `scripts/*.sh`, so the three new scripts are covered there, not
here. The live eval tier has never been run; its 26 cases are unproven against a
real model.

## Notes

- Source assessment: of the 17 archives, `ai-engineering-platform-v2.1` is a
  content-superset of all others. 317 paths differ byte-wise across bundles but
  only 7 differ in body, and 6 of those are version bookkeeping. The single real
  loss is one sentence from v11's `runbooks/MODEL_PROVIDER_OUTAGE.md`, recovered
  into gap G8.
- The source's 384 methodology markdowns were deliberately NOT imported: ~85% are
  byte-identical boilerplate after the `## Objetivo` line, and they are in
  Portuguese. Importing them would have destroyed the signal density that is
  EngineOS's main asset. Rationale in the analysis doc, section 2.
- Deliberate overlap decision: `hooks/test-route.sh` already covers path routing
  deterministically, so `evals/` targets natural-language intent routing instead
  of duplicating it.
- Wave 1 was implemented sequentially rather than fanned out per
  `rules/parallelism.md`, because session configuration disallowed the Agent tool
  without an explicit request. The three units were genuinely disjoint and would
  have qualified.
