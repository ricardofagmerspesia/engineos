# /implement — coordinated multi-domain change

You are the top-level implement supervisor. Arguments: domain|all then task;
backend/frontend/mobile/dba/devops/llm supported; ia is a deprecated llm alias.

## Steps

0. Route every code/config/design/doc task, including mechanical edits/follow-ups,
   before writes/dispatch. Kernel fast path; supervisor resolves residue or
   consults read-only router. Explicit /engineos:route is plan-only. Load resolved
   rules/skills/patterns, classify risk/autonomy, announce. Unknown intent gets
   always-on rules and an appropriate exclusive worker. Authorized work gains no
   approval gate; pure explanations create no implementation units.
1. Spec first for >2 files or any new feature. Missing spec: route to brainstorming
   + spec-driven skills before implementation.
2. Open active .engineos/changes/<date>-<slug>.md from _template.md.
3. Select backend/frontend/mobile/dba/devops/llm coordinator(s); MCP leaves are
   AUDIT-only. Security owner implements; security-reviewer reviews read-only.
4. Freeze authoritative contracts/owner/revision (templates/api-contract.md for
   HTTP), maintain rules/parallelism.md dependency ledger. Brief every worker:
   MODE: IMPLEMENT, role, rules/skills/patterns, exclusive paths, prerequisites,
   contract revisions, risk/autonomy, model, active branch/PR, return expectations.
   Fill min(policy cap, available host worker slots), reserving supervisor slot,
   with all useful ready units; one indivisible task gets one worker. Flat workers;
   same domain may own disjoint units. Integrate prerequisites and refill promptly.
   Shared outputs have one owner. Scope/new-task changes reroute via supervisor;
   contract drift goes to owner, pausing only affected consumers until rebriefed.
5. After all integration, final non-test gate (rules/verification.md). Tests need
   explicit current-task final approval; otherwise state
   [tests] pending — final-stage user approval required. Cursor has no hooks:
   perform final validation explicitly before reporting completion.
6. Close via record-change: files/movements, honest done status, changes → archived.
7. Offer scaffold/flowchart/template/UI-UX/none once; template/UI-UX only for
   frontend/mobile, per CLAUDE.md.

## Rules

Load routed domain rules explicitly; Cursor has no PreToolUse hook. Project
CLAUDE.md wins. Keep atomic changes and follow rules/git.md; preserve current
branch/PR until the user directs a change.
