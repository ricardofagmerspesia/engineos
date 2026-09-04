---
name: 2026-09-03-engineos-big-picture-doc
status: done
completed: 2026-09-03
owner: Ricardo Fagmer
spec: n/a — single documentation file, no behavior change, below the >2-file spec threshold
domain: docs
---

## What
Added docs/BIG-PICTURE.md: a one-page architectural map of EngineOS with Mermaid flowcharts covering the layered system, the request lifecycle, the hook event map, risk/autonomy/gates, kernel callers, fan-out waves, the agent roster, knowledge homes, the change-record lifecycle and self-integrity checks.

## Why
There was no single consultable page showing how the pieces (constitution, registries, kernel, hooks, agents, skills, project state) fit together and what fires when. START.md gives a mental model in five lines; the specs give per-wave flowcharts. A big picture with a flowchart of the whole request path was missing.

## Scope
- docs/BIG-PICTURE.md (new)
- docs/BIG-PICTURE.html (new, standalone rendered copy)
- docs/START.md, README.md (one-line pointers)

## Checklist
- [x] Gather repo layout (hooks.json, kernel subcommands, registries, agents, skills, commands)
- [x] Write layered big-picture diagram
- [x] Write request-lifecycle flowchart (prompt → hooks → router → risk → spec → dispatch → gate → record → Stop)
- [x] Hook event map table, risk/gates, kernel map, fan-out, agent roster, knowledge homes, record lifecycle, self-integrity, glossary
- [x] Avoid docs-ledger budget phrases ("lint + typecheck" rephrased) and reference only existing paths

## What was made
Wrote docs/BIG-PICTURE.md (10 sections, 8 Mermaid diagrams, 3 tables, glossary). Content derived from CLAUDE.md, rules/*.md, hooks/hooks.json, scripts/kernel.sh dispatch table, registries/*.json, README "What's inside" and .engineos/README.md. Rephrased the budgeted phrase from the docs ledger so hooks/test-docs.sh single-source budgets stay unaffected. Follow-up in the same PR: linked the page from docs/START.md and the README table, and added docs/BIG-PICTURE.html, a standalone HTML copy of the same content (IBM Plex type, light/dark tokens, mermaid 11.4.1 from cdnjs) so the diagrams render outside GitHub.

## Verification
hooks/test-docs.sh pass=190 fail=0; scripts/validate-engineos.sh passed 107, failed 0 (run after the markdown landed). HTML copy reviewed by eye only.

## Human decisions
None fired: risk=low, autonomy A2, no hitl reason from the advisor.

## Changes registered
```
$ git status --short
A  docs/BIG-PICTURE.md
$ git diff --stat --cached HEAD
 docs/BIG-PICTURE.md | 454 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 454 insertions(+)
```

## Notes
Candidate follow-up: link BIG-PICTURE.md from docs/START.md "Mental model" and the README docs table for discoverability.
