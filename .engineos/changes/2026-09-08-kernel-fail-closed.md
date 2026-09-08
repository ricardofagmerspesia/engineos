---
name: 2026-09-08-kernel-fail-closed
status: active
owner: ricardo.fagmer
spec: docs/specs/2026-09-08-kernel-fail-closed.md
domain: devops
---

## What
Audit U7: `routing.json`/`intents.json` loaders fail closed; C14 joins `capability_ids` to capabilities.json, capability agents to agents.json and decision-rule `source` paths to files; `skill-state` withholds a skill whose frontmatter it cannot read (reason `unreadable`); `ENGINEOS_REQUIRE_PARITY=1` turns parity skips into failures and CI sets it; result count pinned.

## Why
`.engineos/audits/2026-09-08-all.md` lines 37-41: a malformed routing registry silently removed security routing; dangling capability ids and missing sources passed the validator; parity evidence could vanish without notice; a 64 KiB head bound failed open.

## Scope
Two disjoint units (spec "Frozen contracts"). Lands after PR #85 merges (shared dist / count-pin / COMPATIBILITY edits).

## Checklist
- [ ] Unit A loaders + context typing + C14 joins + count pin (devops-coordinator)
- [ ] Unit B skill-state fail closed + parity opt-in + ci env (devops-coordinator)
- [ ] Barrier: COMPATIBILITY rows for Unit B, dist rebuild, final gate
- [ ] Re-cut off main after #85 merges, PR

## What was made
<filled on completion>

## Verification
<filled on completion>

## Human decisions
2026-09-08 | owner | none required (risk medium, A2, PR-gated) | approved | picked U7 as next unit

## Changes registered
<filled on completion>

## Notes
Work branch cut from feat/prose-truth-checks on purpose; see spec "Dependency".
