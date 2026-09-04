---
name: 2026-09-04-ts-runtime-migration-design
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What
Design package for replacing the bash runtime with a TypeScript runtime compiled to a
committed `dist/engineos.cjs`: two ADRs, one design spec, one implementation plan.
Also records the decision to keep Mermaid and reject a LangGraph workflow.

## Why
The owner asked to evaluate two proposals: replace Mermaid with a LangGraph workflow,
and replace bash scripts with a better execution strategy. The first is a category
error (EngineOS has no runtime of its own; Claude Code is the executor). The second is
real: jq, Git Bash, bash 3.2/BSD baseline and per-hook subprocess cost are a tax on
JSON-in/JSON-out logic.

## Scope
docs/adr/2026-09-04-keep-mermaid-reject-langgraph.md
docs/adr/2026-09-04-typescript-runtime-over-bash.md
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md

## Checklist
- [x] ADR 1: keep Mermaid, reject LangGraph (3 options, revisit triggers)
- [x] Design spec, two sections approved by the owner
- [x] ADR 2: TypeScript runtime over bash (6 options)
- [x] Architecture review by `critic` (rule-large-change requirement)
- [x] Fold the 10 critic findings into spec, ADRs and plan
- [x] Implementation plan (writing-plans format; waves 0 and 1a with full code, 46 port contracts)

## What was made
Wrote ADR 1 (Mermaid kept; LangGraph rejected as source of truth and as headless-runner
substrate). Wrote the design spec: goals, decisions taken by the owner (Node +
committed bundle, full migration in one plan, trunk-based with shims), src/ layout,
CLI surface, two-floor node guard (own floor 18 with re-exec; runner floor 20 as a PATH
fix), shims and compatibility (kernel.sh, init-project.sh shims; scaffold-layout.sh
frozen bash because a sourced function cannot be shimmed), byte-for-byte invariants,
three deliberate deviations, testing, seven waves, rollback. Wrote ADR 2 (TS+Node
chosen over Bun compile, build-at-install, Go, Python, stay-bash). Dispatched
`critic`; verdict REFUTED on the first draft with 3 blockers, 5 major, 2 minor; every
finding folded in (source-text checks re-pointed per PR, guard silent set vs
systemMessage set, ensure_modern_node PATH port, settings-merge subcommand replacing
jq in installers and fixing the reinstall duplicate, init moved to wave 3, compat list,
Windows claim scoped, counts corrected). Wrote the 59-task plan.

## Verification
Unverified by tooling. Per the owner's verification rule no lint/typecheck/tests ran;
the applicable check is `scripts/validate-engineos.sh` (docs-only change; C3 rule-path
references in new docs), offered to the owner at the end of the task.
Independent review: `critic` pass, findings folded (see above).

## Human decisions
Risk classified medium (reversible per PR; contract surface for plugin consumers).
No hitl.reasons fired. Owner decisions taken via clickable options on 2026-09-04:
ADR + plan deliverable; Node + committed dist/*.cjs; full migration in one plan (over
the recommended kernel-only phase 1); trunk-based with shims; design parts 1 and 2
approved.

## Changes registered
```
?? docs/adr/2026-09-04-keep-mermaid-reject-langgraph.md
?? docs/adr/2026-09-04-typescript-runtime-over-bash.md
?? docs/specs/2026-09-04-typescript-runtime-migration-design.md
?? docs/specs/2026-09-04-typescript-runtime-migration-plan.md
```
Branch `docs/ts-runtime-migration-design` from origin/main e4966e9. No renames.

## Notes
Plan convention: tasks 1-9 carry complete code; tasks 10-59 are port contracts (source
file, signatures, invariants, acceptance suite, commit). Wave 0 measures node startup
cost; that number decides whether the Bun revisit trigger in ADR 2 fires.
