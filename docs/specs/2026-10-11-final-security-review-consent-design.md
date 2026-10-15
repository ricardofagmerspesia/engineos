# Final security-review timing and visible subagent announcements

Status: approved by the user on 2026-10-11; implementation authorized, final executable checks require separate approval.
Risk: medium. Autonomy: A2. Branch: main. PR: unknown.

## Problem and outcome

The user requested prominent startup information identifying working subagents,
then requested security checks only after every implementation task is complete,
with clickable choices. Current routing identifies security-reviewer immediately;
parallelism and implementation guidance allow early read-only reviews.

## Decision and scope

Use the existing host instruction gate. Route security obligations immediately,
but defer security-reviewer dispatch and automated security scans until every
implementation unit is integrated and the user explicitly chooses to run the
scoped final review and listed scan commands. This changes
instruction policy, not the generic scheduler API or host UI renderer. Hooks inject
guidance and do not launch agents. Generic integration inspection remains available.

Alternative rejected: adding reviewer-specific scheduler fields and a new runtime
approval protocol. No built-in host launcher exists; that would expand the public
contract without being necessary to change the current host's behavior.

Production ownership is one cohesive policy unit over AGENTS.md, CLAUDE.md,
rules/verification.md, rules/parallelism.md, rules/subagents.md,
templates/adapters/codex.md, agents/security-reviewer.md,
skills/engineos-implement-spec/SKILL.md, docs/COMPATIBILITY.md and
registries/intents.json descriptive notes.
Keep registry agent identifiers, routing matches, return envelopes and runtime
interfaces unchanged. Preserve all pre-existing edits and personal settings.

The throwaway preview is templates/adapters/subagent-announcement.prototype.html.
It demonstrates announcements and clickable consent with sample agents only.
An approval must name its exact revision and the production scope above.

## Acceptance obligations

- SEC-1: WHEN routing identifies security-reviewer during implementation, the host
  SHALL record the requirement and defer dispatch, while applying security rules
  to all writes and retaining an appropriate implementation owner.
- SEC-2: WHILE any implementation task is running, returned but not integrated,
  blocked, failed, or has unfinished corrections, the host SHALL keep the final
  security review pending. Cancelled work requires explicit scope removal.
- SEC-3: WHEN all scoped implementation tasks are integrated, the host SHALL ask
  via an available permitted clickable input tool to run, defer or decline review,
  naming the reviewer, exact task/file scope and integrated source revision.
- SEC-4: WHEN the user approves that exact review, the host SHALL show the visible
  startup announcement before dispatch. Silence and preselection grant no consent.
- SEC-5: WHEN the user defers or declines, the host SHALL preserve any required
  security obligation as pending and SHALL NOT claim verified completion or release
  clearance. Delivery of the reviewable implementation may still be reported.
- SEC-6: WHEN reviewer corrections change the source revision, the host SHALL
  integrate those corrections before seeking renewed final-review consent.
- SEC-7: WHERE an approval-capable clickable tool is unavailable, the host SHALL
  explain the limitation and present labeled text choices, without fake controls.
- SEC-8: WHEN automated security scans are proposed, the host SHALL list existing
  exact commands, file scope and expected network or dependency effects before
  requesting approval. Scans SHALL run only at the final integrated approved
  revision. Missing tooling SHALL be reported unavailable, without automatic
  installation, dependency repair or invented passing evidence.
- ANN-1: WHEN an agent is dispatched, the host SHALL show a standalone highlighted
  diff block identifying name/role, startup state, plain-language task, actual model,
  mode and file scope. Color alone SHALL NOT carry identity or status.

## Evidence plan and stop condition

Read-only review will compare the changed policy surfaces and verify that routing
identifiers and security obligations remain intact. Applicable executable integrity
checks require separate final-stage user approval against the integrated revision;
this plan supplies no check or test consent. No runtime code changes are planned.
Stop when policy is consistent, the preview decision is recorded, and evidence is
reported honestly. Do not install new scan tools or bypass the installer secrets gate.

## Rollback and limits

Undo only this task's added policy text, preserving pre-existing dirty edits.
Enforcement remains a host instruction convention; the generic scheduler is not
an authenticated security-consent gate. No external effect or Git write is authorized.
