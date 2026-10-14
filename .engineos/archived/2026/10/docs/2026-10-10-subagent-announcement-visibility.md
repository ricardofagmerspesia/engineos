---
name: 2026-10-10-subagent-announcement-visibility
status: done
completed: 2026-10-11
owner: codex
spec: docs/specs/2026-10-11-final-security-review-consent-design.md
domain: docs
---

## What
Make subagent startup announcements prominent and clear about who is working, their task and scope.

## Why
The user requested highlighted subagent information so users can identify who starts work.

## Scope
Expanded production scope: announcement clarity and final security-review consent,
as listed in docs/specs/2026-10-11-final-security-review-consent-design.md.
Throwaway preview: templates/adapters/subagent-announcement.prototype.html.
Existing unrelated working-tree changes are excluded. Branch: main; PR: unknown.

## Checklist
- [x] Inspect existing shared announcement rule and dispatch hook.
- [x] Resolve eligible direct execution for the two-file guidance change.
- [x] Create requested throwaway preview.
- [x] Obtain approval of the preview revision and production scope.
- [x] Update guidance preserving existing banner fields and hook contracts.
- [x] Obtain approval for applicable final executable validation and run the approved integrity command.

## What was made
Created a standalone HTML preview with three switchable announcement layouts, explicit sample-agent labels and sample security-consent buttons.
Updated ten approved policy files: added a routing timing exception, a central final reviewer/scan consent procedure, aligned worker and implementation guidance, added prominent startup identity/status/task fields, and documented compatibility. Runtime schemas, routing identifiers and the installer secret gate were preserved.

## Verification
Worker and supervisor inspected the complete task diff against the pre-dispatch baseline, including the final wrapped adapter and skill text. All policy work is integrated. Existing linked local rule/skill/agent files pick up these edits without reinstalling.

Approved source revision: sha256:6dd8bcdf7008d64c825709fdf4f34bae4cc5dae74c0c78d40a7511791e1c11c7; matched immediately before execution. Kernel workflow gate allowed final validation.

Command: `bash scripts/validate-engineos.sh --only C2,C3,C5,C9,C10,C11,C12,C13,C14,C16,C36`

Output: `passed 49, failed 0`; exit code 0. No build, tests or security scans ran. The command verifies rule/registry integrity; native host behavior remains governed by instructions rather than security-specific runtime enforcement.

## Human decisions
2026-10-11 | user | optional completion follow-ups | declined | Declined the offered Matt Pocock session retrospective and selected Proceed without any additional artifact. Do not repeat either offer for this same task.
2026-10-10 | user | preview choice | yes | Requested a throwaway preview before production edits.
2026-10-11 | user | scope expansion | requested | Defer final security check until all tasks are complete and present clickable choices.
2026-10-11 | user | security check scope | selected | Security reviewer and automated security scans.
2026-10-11 | user | preview and production scope | approved | Approved preview sha256:a3f60f53ef89aa392f237497fee54a8a2678262ceb39ff26f8eed1cabac3b470 and the listed policy edits via clickable choice. Both submitted choices are incorporated into the scope.
Risk reclassified medium, autonomy A2. No HITL reason ids fired. Production edits authorized; final executable approval was recorded below before execution.
2026-10-11 | user | final validation | approved | Selected Run the integrity check for the displayed command, ten policy files and source revision sha256:6dd8bcdf7008d64c825709fdf4f34bae4cc5dae74c0c78d40a7511791e1c11c7. That approval covered no scans, builds, tests, installation or Git writes.

## Changes registered
Task additions: this record, the revised throwaway preview and the linked approved design. Production changes: AGENTS.md, CLAUDE.md, rules/verification.md, rules/parallelism.md, rules/subagents.md, templates/adapters/codex.md, agents/security-reviewer.md, skills/engineos-implement-spec/SKILL.md, docs/COMPATIBILITY.md and descriptive notes in registries/intents.json. Task diff was inspected against a snapshot of the pre-existing dirty tree; no Git writes or executable checks ran.

### Scoped Git evidence

These outputs include pre-existing edits; the task-only diff was compared against the saved baseline.

```text
 M AGENTS.md
 M CLAUDE.md
 M agents/security-reviewer.md
 M docs/COMPATIBILITY.md
 M registries/intents.json
 M rules/parallelism.md
 M rules/subagents.md
 M rules/verification.md
 M templates/adapters/codex.md
?? .engineos/changes/2026-10-10-subagent-announcement-visibility.md
?? docs/specs/2026-10-11-final-security-review-consent-design.md
?? skills/engineos-implement-spec/SKILL.md
?? templates/adapters/subagent-announcement.prototype.html
```

```text
 AGENTS.md                   |  30 ++++++++---
 CLAUDE.md                   |  27 +++++++---
 agents/security-reviewer.md |  10 +++-
 docs/COMPATIBILITY.md       |  95 ++++++++++++++++++++++++++++++++++
 registries/intents.json     |  22 ++++----
 rules/parallelism.md        | 114 ++++++++++++++++++++++++++++++++++++++---
 rules/subagents.md          |  60 ++++++++++++++++------
 rules/verification.md       | 121 ++++++++++++++++++++++++++++++++------------
 templates/adapters/codex.md |  69 +++++++++++++++++++++++--
 9 files changed, 462 insertions(+), 86 deletions(-)
```

## Notes
The preview models chat output; it does not change the host application's styling or launch agents. Local artifact pointer retained; no Git write authorized or performed.

Task ledger: policy-guidance | exclusive production paths in the linked approved design | prerequisites: approved preview and design | contract: security-final-policy-v1 | owner: security_review_timing, docs-writer role | state: integrated; approved focused validation passed.
Baseline snapshot for preserving pre-existing edits: /var/folders/1v/g7nv72wj1ss4h0z3v90yc4k00000gn/T/engineos-security-policy-5kabla1s.
Kernel admission: delegate, productionAllowed true, validationAllowed false. One cohesive policy unit avoids separate workers competing over shared instruction contracts.
