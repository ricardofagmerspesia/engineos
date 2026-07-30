---
description: Interview the user to fill technical & product gaps the docs can't cover, then fold the answers back into docs (uses patterns/2-Interview-brainstorm.md, architecture-analyst persona).
argument-hint: [optional theme to focus the interview, e.g. "billing rules"]
allowed-tools: Read, Grep, Glob, Write, Edit
---

Run the `architecture-analyst` persona in **INTERVIEW mode in this session** — do
NOT dispatch a subagent, because this requires interactive back-and-forth with
the user.

Steps:
1. Read `agents/architecture-analyst.md` (the INTERVIEW section) and
   `patterns/2-Interview-brainstorm.md`; adopt that persona and method.
2. Read the general docs under `docs/` (especially any `Arquitetura-do-Sistema.md`
   / `Objetivo-do-Sistema.md` produced by `/analisy-architecture`). Build a list
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
