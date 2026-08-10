---
name: 2026-08-06-decision-kernel-p2-resolver-api
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 2: `scripts/kernel.sh`, the resolver API over the P1
registries — ten subcommands answering routing/model/risk/gate/retry/
capability/wave questions deterministically — plus the four hooks rewired to
consume it instead of carrying private policy copies.

## Why

P1 made policy machine-readable; nothing machine-read it. routing-map.sh held
the path patterns as a bash case ladder existing nowhere in the registries,
gate-advisor re-implemented registry matching inline, task-scale-advisor
hardcoded its prompt regexes. The kernel is the single implementation every
consumer (hooks now, the router agent in P3, ai-se-os later) queries.

## Scope

scripts/kernel.sh (new), scripts/test-kernel.sh (new),
registries/routing.json (1.1.0: match/excluded/sample_path),
registries/policy.json (1.1.0: prompt_signals), hooks/routing-map.sh (shim),
hooks/route-before-change.sh, hooks/gate-advisor.sh,
hooks/task-scale-advisor.sh, scripts/validate-engineos.sh (C17),
scripts/test-validate-engineos.sh, the P2 spec.

## Checklist

- [x] Spec with frozen subcommand contracts before code
- [x] Core: kernel.sh + routing.json patterns + policy.json prompt_signals (orchestrator)
- [x] P2-A: four hooks rewired, contract-preserving (sonnet agent)
- [x] P2-C: test-kernel.sh behavioral suite (sonnet agent)
- [x] P2-B: validator C14 rework + C17 + planted breakage (orchestrator, barrier)
- [x] Full verification green, hooks' existing suites unchanged

## What was made

Wave structure: core first (frozen contract), then 2 parallel agents (A hooks,
C tests) while the orchestrator did B (validator) — B depended on A's final
shim shape so it stayed at the barrier.

- `scripts/kernel.sh`: route-path (first-exclusion, precedence-ordered glob
  matching — same bash case engine, patterns now registry data), route-intent
  (boundary-matched literal signals, multi-match, ambiguous flag), model,
  risk (fail-closed max aggregation + floors), gates, retry (never-retry
  first, then per-status ladder), capability (joined with models.json),
  waves (Kahn layering, cycle = error, same-file-in-wave violations, cap-6
  split, generated [fanout] line), decision-rules, scale.
- `registries/routing.json` 1.1.0: per-domain `match` globs moved verbatim
  from the case ladder, `excluded` block, self-validating `sample_path` per
  domain. `registries/policy.json` 1.1.0: `prompt_signals` EREs moved verbatim
  from task-scale-advisor.
- Hooks: routing-map.sh is a pure shim (function contracts intact, no
  guidance literals — validator-enforced); route-before-change calls the
  kernel once; gate-advisor and task-scale-advisor delegate matching and keep
  only formatting. All stay non-blocking, exit 0, jq-guarded.
- Validator: C6/C7/C8 repointed at registry guidance strings; C14's two
  string-grep checks (structurally dead against a shim) replaced by C17a–e —
  including the behavioral check that every domain's sample_path routes to
  its own domain THROUGH the kernel, which also validates precedence.

## Verification

All output shown at the barrier:
- scripts/validate-engineos.sh: passed 57, failed 0
- scripts/test-validate-engineos.sh: passed 36, failed 0 (3 dead cases
  replaced, 4 new)
- scripts/test-kernel.sh: passed 109, failed 0 (new)
- hooks/test-route.sh: pass=38 fail=0 UNCHANGED — behavior-preservation proof
- hooks/test-gate-advisor.sh: pass=16 fail=0; hooks/test-task-scale.sh: 12/0
- scripts/run-evals.sh: passed 11, failed 0

## Changes registered

Commit `cb04a66` on `feat/decision-kernel-p1` (follows P1's `9d718f9`):

```
docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md | new
scripts/kernel.sh                                        | new (executable)
scripts/test-kernel.sh                                   | new (executable)
registries/routing.json                                  | match/excluded/sample_path, 1.1.0
registries/policy.json                                   | prompt_signals, 1.1.0
hooks/routing-map.sh                                     | case ladder -> shim
hooks/route-before-change.sh                             | kernel call
hooks/gate-advisor.sh                                    | kernel call
hooks/task-scale-advisor.sh                              | kernel call
scripts/validate-engineos.sh                             | C6-8 repointed, C14 pruned, C17 added
scripts/test-validate-engineos.sh                        | 3 cases replaced, 4 added
11 files changed, 1315 insertions(+), 268 deletions(-)
```

No renames. hooks/{layout-manifest,lib-common}.sh mode-only changes remain
unstaged (other branch's work).

## Notes

- `waves` shipped in P2 per the plan's own todo; P4 keeps only the
  handoff-template frontmatter work.
- Next: P3 — agents/router.md (design tier) over `kernel.sh route-intent`,
  deciding only what data cannot.
- ai-se-os adoption (deleting its ESCALATION_ORDER/MAX_ATTEMPTS/
  security-sensitive.ts copies in favor of kernel calls) is the follow-on
  runner phase.
