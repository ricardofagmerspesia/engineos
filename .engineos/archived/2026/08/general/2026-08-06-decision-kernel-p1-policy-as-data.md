---
name: 2026-08-06-decision-kernel-p1-policy-as-data
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 1: EngineOS policy becomes machine-readable data. Three
new registries (models.json, intents.json, policy.json) encode what previously
lived only as prose in rules/models.md, the CLAUDE.md router table, and the
always-on risk/gates/parallelism rules — held in sync by 20 new validator
checks with planted-breakage proof.

## Why

Prose-only policy means the model re-reads and re-interprets it every turn, and
consumers (hooks, the ai-se-os runner) duplicate it instead of querying it —
ai-se-os hardcodes the retry ladder and the security-path matcher today. Data
with a validated prose mirror is the precondition for Phase 2's resolver API
(`kernel.sh`) and everything after it. Parent plan: "EngineOS Decision Kernel"
(8 phases), user-approved this session.

## Scope

registries/{models,intents,policy}.json (new), rules/models.md, CLAUDE.md (one
sentence), scripts/validate-engineos.sh, scripts/test-validate-engineos.sh,
docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md (new).

## Checklist

- [x] Spec written with frozen schemas before any registry file
- [x] U1: models.json + prose deltas (ADR to most-capable, build-tier code-review row, fable sentence removed from CLAUDE.md #6)
- [x] U2: intents.json — 28 intents, 10 hook-mirrored with routing.json FKs
- [x] U3: policy.json — risk, autonomy, gates, parallelism, retry
- [x] U4: C16 validator block (20 checks) + 13 planted-breakage cases
- [x] Full verification green

## What was made

Dispatched as a 3-agent parallel wave (U1 sonnet, U2 opus, U3 sonnet) over
disjoint file scopes against frozen schemas, with U4 (validator) as the
barrier, executed by the orchestrator.

- `registries/models.json`: 4 tiers with escalates_to chain + escalation_order,
  8 work types, 5-rung degradation ladder. ADR moved to most-capable (user
  delta 1); new build-tier `code-review` work type (user delta 2).
- `registries/intents.json`: the full CLAUDE.md router table as 28 intents
  (27 rows + store-release split into ios/android to keep domain FKs 1:1).
  Ten hook-mirrored intents carry FKs into routing.json with byte-identical
  rules arrays and matching risk floors.
- `registries/policy.json`: 5 risk inputs (aggregation max) + 6 high floors,
  A0–A4 autonomy levels + per-risk ceilings, 5-gate ladder with the full
  per-tier matrix, fan-out signals + wave cap 6 + depth 1, retry 2+1 with the
  4-item never-retry list.
- `rules/models.md` re-mirrored; CLAUDE.md #6's "no agent declares fable"
  sentence removed (user delta 3) and replaced by a real check: every agent
  frontmatter model must be bound in models.json.
- `scripts/validate-engineos.sh`: C16 block, 20 new checks — FK resolution,
  closed enums, chain ordering, exact intent-count drift alarm against the
  CLAUDE.md table, and prose-number mirrors (wave cap ~6, retry 2+1, spec
  threshold >2 files, fan-out >3 files).
- `scripts/test-validate-engineos.sh`: 13 new planted-breakage cases proving
  each new check family fires.

Three spec deviations found during implementation were recorded in the spec
itself: ten (not eight) hook-mirrored rows; `code-review` is an external skill
exempted by note; mirrored `agents` may be a superset of the routing domain's
single agent. Two validator defects (case-sensitive external-note match, broken
two-file jq `input` trick) were caught by running against the real registries
and fixed before commit.

## Verification

- `scripts/validate-engineos.sh`: passed 54, failed 0 (was 34 checks before).
- `scripts/test-validate-engineos.sh`: passed 33, failed 0 (13 new cases).
- `scripts/run-evals.sh`: passed 11, failed 0 (live tier skipped as designed);
  intent set size 33 within RUBRIC bounds.

## Changes registered

Commit `9d718f9` on `feat/decision-kernel-p1` (branched from `96f9821`):

```
docs/specs/2026-08-06-decision-kernel-p1-policy-as-data.md | new
registries/intents.json                                    | new
registries/models.json                                     | new
registries/policy.json                                     | new
CLAUDE.md                                                  | 1 sentence removed
rules/models.md                                            | table rows + mirror note
scripts/test-validate-engineos.sh                          | +109
scripts/validate-engineos.sh                               | +208
8 files changed, 1144 insertions(+), 3 deletions(-)
```

No renames. The two pre-existing uncommitted mode-only changes
(hooks/layout-manifest.sh, hooks/lib-common.sh, 644→755) belong to the
chore/full-config-audit-fixes work and were deliberately not staged.

## Notes

- Phase 2 (`scripts/kernel.sh` resolver over these registries) is the next
  unit; these registries are its input contract.
- Registries are additive public surface: MINOR bump per docs/COMPATIBILITY.md
  when this merges.
