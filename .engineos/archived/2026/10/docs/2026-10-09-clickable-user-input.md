---
name: 2026-10-09-clickable-user-input
status: done
completed: 2026-10-09
owner: codex
spec: n/a — two-file guidance adjustment; no runtime feature or public interface rename
domain: docs
---

## What
Preview clickable choices when EngineOS awaits user input, before adjusting shared guidance and the Codex adapter.

## Why
Make required decisions actionable instead of ending with a passive waiting notice.

## Scope
Throwaway artifact: templates/adapters/clickable-input.prototype.html. Approved production scope: rules/base.md and templates/adapters/codex.md. Preview and this administrative record are excluded from the two-file production scope. Existing unrelated working-tree changes remain outside this task. Branch: main; PR: unknown.

## Checklist
- [x] Deliver a self-contained throwaway logic preview.
- [x] Obtain approval of its exact revision and proposed production scope.
- [x] Apply approved guidance changes.
- [x] Obtain scoped final validation approval after integration and run the approved check.

## What was made
Created the self-contained throwaway logic preview with selectable choices, explicit submission, guided scenarios, text fallback and visible decision state. Added the shared Awaiting user input rule and the Codex tool mapping, including host restrictions, actionable text fallback and explicit-submission consent. Preserved the adapter's pre-existing working-tree edits.

## Verification
Source inspected read-only after worker return. Browser behavior remains unverified; no executable checks were run. Preview submits no real approvals or commands. Preview SHA-256: f4afe0604a1f563a74f03b423d0f1bd0c79dc3b22e6d1ede02a3822b697fe338.

Integrated guidance reviewed read-only. Source revision: 36c142f3c480b5fd-56aad89b4f35519f (prefixes of the two file SHA-256 values, in listed order). Hashes still matched before validation. Package build/tests/startup are outside this prose-only change. Kernel final admission returned productionAllowed=true, validationAllowed=true, reasons=[].

Approved command: `git diff --check -- rules/base.md templates/adapters/codex.md`.
Actual output: empty; exit code: 0. Executed once at the approved revision. Browser behavior of the throwaway preview remains unverified.

## Human decisions
2026-10-09 | developer | no HITL reason ids fired (low risk, A2) | preview chosen | Asked: “For the clickable user-input change, would you like a throwaway preview before implementation?” Answer: “Create a throwaway preview first.” Scope: clickable user-input guidance in rules/base.md and templates/adapters/codex.md.

2026-10-09 | developer | preview-approved | Approved preview revision f4afe0604a1f and implementation in rules/base.md and templates/adapters/codex.md through the submitted answer “Approve preview and implement this scope.” Full artifact hash recorded above.

2026-10-09 | developer | final validation approved | Submitted “Approve and run this check” for the exact whitespace command and source revision 36c142f3c480b5fd-56aad89b4f35519f after integration.

## Changes registered
Added templates/adapters/clickable-input.prototype.html and this active record; changed rules/base.md and templates/adapters/codex.md. No Git or forge writes performed. Existing unrelated changes are excluded. Production diff adds 6 shared-rule lines and 25 adapter lines over the task's starting working tree.

Scoped `git status --short` before archival:

```text
 M rules/base.md
 M templates/adapters/codex.md
?? .engineos/changes/2026-10-09-clickable-user-input.md
?? templates/adapters/clickable-input.prototype.html
```

Scoped `git diff --stat HEAD`:

```text
 rules/base.md               |  6 +++++
 templates/adapters/codex.md | 55 ++++++++++++++++++++++++++++++++++++++++++---
 2 files changed, 58 insertions(+), 3 deletions(-)
```

The adapter's HEAD diff includes pre-existing changes; this task added only its User input presentation section. Record archived to .engineos/archived/2026/10/docs/2026-10-09-clickable-user-input.md using filesystem tools. No session-specific Stop marker was identified in this Codex session; unrelated markers are preserved.

## Notes
The host's actual tool availability and restrictions govern choice presentation. Selection, defaults, silence and timeouts never substitute for submitted answers. Approval tools must be used only where the host allows them.
