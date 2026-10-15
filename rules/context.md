# Context Rules — always on

Load task-relevant sources, not the whole repository. Resolve intent, load only
route-named guidance, read affected files and identify evidence used.

## The operating rule

Use focused ranges/search results instead of large-file pastes. Broad inventory
is appropriate only when the task explicitly requires it; otherwise load the
smallest evidence sufficient for the scoped change.

## Layers, in priority order

1. Permanent instructions: always-on rules, project `CLAUDE.md`.
2. Route-loaded rules/skills.
3. Task state: request, plan, progress.
4. Retrieved files/diffs/logs/output.
5. Summarized history.
6. Output contract.

When budget binds, drop from the bottom; never drop layer 1. If it cannot fit,
decompose into waves using loaded parallel-work policy.

## What the decision layer may decide

The prompt hook's decision layer (`keyword`, `llm` or `jev`, configured in
`registries/policy.json` `router_decision`) decides one thing: which intents
apply, chosen among those the repository's stack allows. It never decides which
rules an intent loads, the risk tier, the autonomy ceiling or the gates — those
stay deterministic kernel answers, and a decision-layer pick that seems to
contradict them loses. A repository whose `.engineos/config.json` caps
`router.mode` at `keyword` or `llm` sends no prompt to TypeSafe, whatever the
personal setting says.

## Rules

- Distinguish facts from hypotheses; retain source and date for retrieved evidence
  (path, command/output, URL and access date).
- Summarize history into decisions/reasons; discard unproductive searches.
- Reuse already-loaded unchanged sources with their exact path/revision. Re-read
  only changed or uncertain ranges; summaries never replace source authority.
- Resolve known skill ids via `engineos kernel skill-reference --id <id>` and its
  bounded registry, not repeated broad discovery. Check origin/availability once,
  report missing prerequisites once, and install nothing implicitly. Consult
  existing CLI usage before calls; never invent kernel flags.
- Follow the router's closed load list (`CLAUDE.md`); no just-in-case rule loading.
- Keep secrets/tokens/PII out of summarized, logged or handed-off context;
  `rules/security.md` owns that guardrail.

## For dispatched sub-agents

Use fresh/no-history delegation where supported. Give a minimal task brief with
binding policies, route-loaded sources, contracts/revisions, exclusive files,
risk/autonomy, branch/PR, task state and return format; omit full conversation and
other domains. Never omit obligations to save context. Load branch-specific
references/history/indexes only on demand. Name reference-only/excluded scopes. Missing or outside context is
reported under `out_of_scope` for supervisor routing, not pursued unassigned.
