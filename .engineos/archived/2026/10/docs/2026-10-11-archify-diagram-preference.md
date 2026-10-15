---
name: 2026-10-11-archify-diagram-preference
status: done
completed: 2026-10-11
owner: codex
spec: n/a — one shared guidance file, no new runtime feature
domain: docs
---

## What
Prefer Archify for flows and diagrams, with traditional Mermaid fallback when unavailable.

## Why
The user requested a shared framework preference rather than generating a particular diagram.

## Scope
rules/parallelism.md; preserve existing dirty edits. Branch main; PR unknown.

## Checklist
- [x] Read the installed Archify skill and identify the shared guidance owner.
- [x] Resolve eligible direct execution and obtain the preview choice.
- [x] Add the shared preference and explicit fallback.
- [x] Obtain final integrity-check approval and record passing results.

## What was made
Added an Archify-first diagram section to the always-on parallelism rule. It covers requested diagrams and Output artifact choices, preserves actual skill discovery and delivery requirements, and falls back to Mermaid when unavailable without automatic installation or invented success.

## Verification
Read-only review of the added section; approved final integrity validation passed. Archify's SKILL.md was present and read. No diagram, build, test, security scan or Git write was executed.

Approved command: `bash scripts/validate-engineos.sh --only C3,C5,C16`
Source revision matched approval: sha256:aee2b29f05cf7df5b1ab573f48de4ec32e90ac2c1f89f2c9b7544961f5e77e62. Kernel final gate allowed validation.
Output: `passed 32, failed 0`; exit code 0. This verifies policy integrity, not a generated Archify diagram.

## Human decisions
2026-10-11 | user | preview choice | declined | Selected Skip preview and apply the rule via the clickable prompt for rules/parallelism.md.
Risk low, autonomy A2; no HITL reason ids fired. Final-check consent was separately submitted: Run the integrity check for the displayed command, scope and revision on 2026-10-11.

## Changes registered
Task scope: added section in rules/parallelism.md and this record. Prior file revision sha256:1ecd29b4433d440dbf022dfb984181643e63986e8d61094b09b1364a864fe231. Existing unrelated changes were preserved.

### Scoped Git evidence

The working tree already contained earlier edits; this task added only the diagram preference section.

```text
 M rules/parallelism.md
?? .engineos/changes/2026-10-11-archify-diagram-preference.md
```

```text
 rules/parallelism.md | 129 +++++++++++++++++++++++++++++++++++++++++++++++----
 1 file changed, 121 insertions(+), 8 deletions(-)
```

## Notes
The user-approved traditional fallback is Mermaid. No new skill registry ID, host UI, public runtime schema or installation procedure was added.

The user previously declined the optional retrospective and additional artifacts for this framework-adjustment session; those choices remain respected.
