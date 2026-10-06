---
description: Interview the user to fill technical & product gaps the docs can't cover, then fold the answers back into docs (uses patterns/2-Interview-brainstorm.md, architecture-analyst persona).
argument-hint: [optional theme to focus the interview, e.g. "billing rules"]
allowed-tools: Read, Grep, Glob, Write, Edit
---

Use architecture-analyst INTERVIEW in-session; live answers preclude subagent dispatch.

Steps:
1. Read `agents/architecture-analyst.md` (the INTERVIEW section) and
   `patterns/2-Interview-brainstorm.md` — both resolved from the EngineOS
   install root (`${CLAUDE_PLUGIN_ROOT}` in plugin mode, the engineos repo
   otherwise, since this command runs with the target project as cwd); adopt
   that persona and method.
2. Read the general docs under the target project's `docs/architecture/`
   (especially any `Arquitetura-do-Sistema.md` / `Objetivo-do-Sistema.md`
   produced by `/analyze-architecture`). Build a list
   of concrete unknowns and every point marked **"hipótese"**. If `$ARGUMENTS`
   names a theme, focus there first.
3. Interview the user in focused rounds of 3–5 sharp, specific questions grouped
   by theme (product intent, business rules, actors/permissions, integrations,
   constraints, ops). Reference `file:line` or doc sections so the user knows
   exactly what you mean. Wait for real answers; follow the thread.
4. After the material gaps are closed, fold the answers back into `docs/`: turn
   confirmed hypotheses into stated facts (drop the "hipótese" label), add newly
   learned rules/flows, and log the questions the user deferred.
5. End with a summary: what was learned (by theme), the exact doc edits made, and
   the still-open questions.

Match the language of the existing docs (the patterns are pt-BR; mirror that
unless the project standard is English). Never write secrets into docs.
