---
name: adr
description: Write or update Architecture Decision Records. Use when an architectural choice is being made or discussed — technology selection (X vs Y), structural decisions, cross-cutting conventions — so the decision and its reasoning get recorded, not just chatted. Carve-out: business/career/positioning decisions go to the `strategy` skill.
---

# ADR — Architecture Decision Records

Decisions live in the project repo at `docs/adr/NNNN-short-title.md`. One decision per file, numbered sequentially.

## When to write one

- Choosing between technologies/approaches (queue system, auth strategy, ORM, monorepo layout).
- Any decision someone will ask "why did we do it this way?" about in 6 months.
- Reversing or superseding a previous ADR.

NOT for: trivial choices, code-level decisions a comment covers, decisions already covered by EngineOS rules.

## Procedure

1. Check `docs/adr/` for existing/related ADRs first (create the directory if absent: `mkdir -p docs/adr`) — supersede explicitly, don't contradict silently.
2. Genuinely weigh ≥2 options. If only one option was considered, it's documentation, not a decision — say so.
3. Write the record (template below). Keep it ≤1 page.
4. Status starts `proposed`; flips to `accepted` after team review (PR approval = acceptance).

## Template

```markdown
# NNNN. <Decision title — imperative, e.g. "Use BullMQ for background jobs">

Date: YYYY-MM-DD
Status: proposed | accepted | superseded by NNNN

## Context
What forces are at play — requirements, constraints, problems. 2–5 sentences. Facts, not opinions.

## Options considered
1. **Option A** — one-line description. Pros / cons (bullets, honest).
2. **Option B** — same.

## Decision
What we chose and the 1–3 reasons that actually decided it.

## Consequences
What becomes easier, what becomes harder, what we're committing to maintain,
and what would make us revisit this (explicit revisit triggers).
```

## Quality bar

- Cons of the chosen option are listed honestly — an ADR with a flawless winner is salesmanship, not engineering.
- Revisit triggers are concrete ("if queue volume exceeds X", "if team grows past Y"), not "if needed".
