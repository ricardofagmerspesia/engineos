---
description: Analyze the whole system and generate standardized, code-grounded architecture docs for new developers (uses patterns/1-Analisys via the architecture-analyst agent).
argument-hint: [optional path/scope to focus the analysis]
allowed-tools: Task
---

Dispatch the `architecture-analyst` agent (alias `analyst`) via the Task tool with
`MODE: ANALYZE`, passing `$ARGUMENTS` as the scope (if empty, analyze the whole
repository).

Instruct the agent to:
- Read `patterns/1-Analisys` and treat it as the spec for what to produce.
- Perform a complete, code-grounded analysis (modules, files, dependencies,
  patterns) and generate all required artifacts under the target project's
  `docs/`: `Arquitetura-do-Sistema.md`, `Objetivo-do-Sistema.md`, a `README.md`
  in each relevant module, and an `ONBOARDING.md` for new developers.
- Run fully autonomously — never wait for user input; mark anything unknowable
  from code as **"hipótese"** and continue.

This run is documentation-only (no production code changes). Relay the agent's
report (artifacts written + hypotheses to confirm) back verbatim, and remind the
user they can run `/talk-about-the-system` to resolve the open hypotheses.
