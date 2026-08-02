# Context Rules — always on

`rules/memory.md` says where knowledge lives. This file says what to load into a
given turn, and what to leave out. Context is a budget, not a bucket.

## The operating rule

**Never sweep the whole repository.** Resolve the intent, load the few documents
the route names, read the files the task touches, and state what you used. An
agent that read 40 files to change 2 has not been thorough — it has been
imprecise, and it has crowded out the context it actually needed.

## Layers, in priority order

1. Permanent instructions — always-on rules, project `CLAUDE.md`.
2. Route-loaded rules and skills for this intent.
3. Task state — the request, the plan, what has been done so far.
4. Retrieved evidence — the specific files, diffs, logs, and outputs consulted.
5. Summarized history — compressed, not replayed.
6. Output contract — the format expected back.

When the budget binds, drop from the bottom. Layer 1 never gets dropped; if it
would have to, the task is too big for one unit and belongs in waves
(`rules/parallelism.md`).

## Rules

- DO separate facts from hypotheses in what you carry forward. "The handler
  returns 500" and "the handler probably throws on null" are different kinds of
  thing, and conflating them is how a wrong fix gets confidently shipped.
- DO preserve origin and date on anything retrieved. A file path, a command and
  its output, a URL with when it was read. Evidence without a source is an
  assertion.
- DO summarize history rather than replay it. Keep decisions and their reasons;
  drop the search that found nothing.
- DO re-read before relying on something you learned many turns ago. Memory of a
  file is not the file — `rules/memory.md`'s recall caveat applies to your own
  working memory too.
- DON'T load a rule the route did not name "just in case". The router's load list
  is closed by design (`CLAUDE.md`); adding to it silently is how the closure
  rule stops meaning anything.
- DON'T paste large files when a range or a grep result answers the question.
- DON'T carry secrets, tokens, or PII into context that will be summarized,
  logged, or handed off. `rules/security.md` owns the prohibition; this is where
  it usually gets violated by accident.
- DON'T treat a summary as the source of truth once the underlying file has
  changed.

## For dispatched sub-agents

A brief is a context budget for someone who cannot ask you a follow-up.

- Give the frozen contracts, the exact file scope, the risk tier, and the return
  format. Do not give the whole conversation.
- Say what NOT to read. "The web app is reference only" saves more context than
  any instruction about what to read.
- An agent that needs context you did not give must report it under
  `out_of_scope` rather than going to find it. Wandering agents collide.
