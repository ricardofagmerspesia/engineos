---
name: 2026-10-06-stack-first-and-feature-artifacts
status: done
completed: 2026-10-06
owner: Ricardo Fagmer
spec: docs/specs/2026-10-06-stack-first-and-feature-artifacts-design.md
domain: general
---

## What
Ask the developer for the stack at the start of a session in a greenfield repo (rule + advisory
hooks), and require PRD + ADR + SPEC + TASKS for every from-scratch feature through a new
`/engineos:new-feature` command built on Matt Pocock's skills and `tlc-spec-lean`, replacing
superpowers in the new-feature row.

## Why
Claude silently chose Python for `~/vtex` (ADR 0001, superseded by ADR 0006 and a TypeScript
rewrite a day later); nothing guaranteed the four planning artifacts existed before code.

## Scope
See spec §3 (C1–C13): src/kernel/stack.ts, src/hooks/{stack-question,ensure-project-layout,
prompt-advisor}.ts, rules/{base,verification}.md, CLAUDE.md, AGENTS.md, registries/intents.json,
commands/new-feature.md, src/init/project.ts, templates/, install.sh, four coordinators, the
agent-design form, docs, one ADR, tlc-spec-lean pinned in skills-lock.json.

## Checklist
- [x] Design decided with the developer (D1–D11) and contracts frozen in the spec
- [x] Wave 1 — six agents, disjoint scopes (hooks, constitution+registry, command, docs+ADR, coordinators, installer+init), plus a seventh (devops: install.ps1 + release zip) from the installer's out_of_scope
- [x] tlc-spec-lean pinned in .agents/skills (+ .claude/.trae/.windsurf mirrors) + skills-lock.json, after the developer's OK (commit 6e8493c)
- [x] Integrate, rebuild dist/engineos.cjs, final gate (typecheck, lint, tests, validator)

## What was made
- Greenfield detection `hasStackSignal` (src/kernel/stack.ts) and a shared `STACK_QUESTION_NOTE`
  (src/hooks/stack-question.ts); SessionStart emits it in a stackless repo (also outside git, never
  in $HOME, silenced by ENGINEOS_SCAFFOLD=0); UserPromptSubmit appends it on stack-dependent intents.
- rules/base.md "New projects — stack first"; non-negotiable #1 amended (PRD, ADR, SPEC, TASKS for
  from-scratch features) and #13 added in CLAUDE.md and AGENTS.md; the new-feature router row and
  registries/intents.json switched from superpowers to `/engineos:new-feature` + `tlc-spec-lean`
  (Matt's skills written without a slash — validator C36); rules/verification.md: tests ON for the flow.
- commands/new-feature.md: seven stages (stack, preconditions, ADR via grill-with-docs, PRD via
  to-spec, SPEC via tlc-spec-lean plan then checks, TASKS via to-tickets, build + fresh Verifier),
  each ending at a developer review gate; `resume`.
- Coordinators return BLOCKED (`missing: stack undeclared` as first next_actions entry) on a
  greenfield scope; llm-coordinator INTERVIEW asks in-session; agent-design form, interview pattern
  and /design-agents settle the runtime first.
- init seeds docs/agents/{issue-tracker,domain}.md from templates/agent-skills/; project CLAUDE.md
  templates carry `## Agent skills` and `## tlc-spec-lean`; install.sh step 4a2 and install.ps1 link
  pinned Matt/TLC skills (EngineOS names win, e.g. retro); default release zip ships them.
- tlc-spec-lean 1.1.0 (tech-leads-club/agent-skills @120b676, 15 files) vendored unchanged and pinned;
  its seven scripts read in full first (stdlib only, no network), its selftest green (46/46).
- ADR 2026-10-06, COMPATIBILITY row, README, CODEBASE_MAP, START, ADOPTION, BIG-PICTURE, docs-ledger.

## Verification
- `npm run build` (dist rebuilt), `npm run typecheck` / `lint`: clean.
- `npm test`: tests 2308, pass 2301, fail 0, skipped 7. Prose-layer e2e re-run after the late doc
  edits: 14/14.
- `scripts/validate-engineos.sh`: passed 113, failed 0.
- Acceptance on the rebuilt bundle: SessionStart in an empty non-git dir returns the note; a build
  prompt in a stackless git repo gets it, a pure question and a repo with package.json do not;
  `resolve-task "create a new orders feature"` → intents new-feature, skills tlc-spec-lean, commands
  new-feature; `init-project.sh` on an empty repo seeds both docs/agents files.
- Not verified: install.ps1 never parsed (no pwsh locally — CI Windows job); install.sh 4a2 run only
  against a scratch CLAUDE_DIR by the installer agent.

## Human decisions
2026-10-06 | Ricardo Fagmer | — (no hitl.reasons fired; risk medium) | approved | Design D1–D11 approved in chat; speed priority: orchestrator wrote the spec instead of product-spec on fable, router agent skipped (decomposition fixed in chat).
2026-10-06 | Ricardo Fagmer | — | approved | Download and vendor tlc-spec-lean 1.1.0 from tech-leads-club/agent-skills.
2026-10-06 | Ricardo Fagmer | — | approved | Licence for redistributing mattpocock/skills in the default release zip confirmed.
2026-10-06 | Ricardo Fagmer | — | approved | Commit this work and record the change (no push, no PR).

## Changes registered
Branch feat/stack-first-and-feature-artifacts, base main (2f84d7c).

`git log --oneline main..HEAD` before the final commit:
```
6e8493c chore(skills): vendor tlc-spec-lean 1.1.0
```

`git status --short` (final commit contents; this record moves to .engineos/archived/2026/10/general/):
```
 M AGENTS.md
 M CLAUDE.md
 M README.md
 M agents/backend-coordinator.md
 M agents/frontend-coordinator.md
 M agents/llm-coordinator.md
 M agents/mobile-coordinator.md
 M commands/design-agents.md
 M dist/engineos.cjs
 M docs/ADOPTION.md
 M docs/BIG-PICTURE.md
 M docs/CODEBASE_MAP.md
 M docs/COMPATIBILITY.md
 M docs/START.md
 M install.ps1
 M install.sh
 M patterns/3-Agent-topology-interview.md
 M registries/docs-ledger.json
 M registries/intents.json
 M rules/base.md
 M rules/verification.md
 M scripts/package-release.sh
 M skills/agent-system-design/references/form.md
 M src/hooks/ensure-project-layout.e2e.test.ts
 M src/hooks/ensure-project-layout.test.ts
 M src/hooks/ensure-project-layout.ts
 M src/hooks/prompt-advisor.test.ts
 M src/hooks/prompt-advisor.ts
 M src/init/project.test.ts
 M src/init/project.ts
 M src/kernel/stack.test.ts
 M src/kernel/stack.ts
 M templates/project-claude-python.md
 M templates/project-claude.md
?? .engineos/changes/2026-10-06-stack-first-and-feature-artifacts.md
?? commands/new-feature.md
?? docs/adr/2026-10-06-from-scratch-artifacts-matt-pocock-and-tlc-spec-lean.md
?? docs/specs/2026-10-06-stack-first-and-feature-artifacts-design.md
?? src/hooks/stack-question.ts
?? templates/agent-skills/
```

`git diff --stat HEAD`: 34 files changed, 1124 insertions(+), 229 deletions(-) (tracked files; plus the new files above). dist/engineos.cjs is the regenerated bundle. Exceeds the 400-line PR guideline: prose + bundle + tests; call out in the PR.

## Notes
Tests in scope for the hook changes only (repo convention: every hook module has a sibling test).
