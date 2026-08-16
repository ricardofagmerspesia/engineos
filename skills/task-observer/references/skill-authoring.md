# Skill Authoring — adapted from "One Skill to Rule Them All" (CC BY 4.0, Eoghan Henn / rebelytics.com)

Load this before creating a new skill or making substantial changes to an
existing one. EngineOS deltas: skills change via PR to the engineos repo
(never live edits); the taxonomy is `engineos | project`, not
`open-source | internal`.

## Taxonomy

**engineos** — team-shared, methodology-driven, useful across projects.
Lives in `skills/` of the engineos repo, changed via PR. Keep it free of
client/project specifics; strip and generalise when in doubt.

**project** — contains project/client specifics or context only one project
has. Lives in that project's own homes (`CLAUDE.md` deltas, `docs/rules/`),
per `rules/memory.md`. Shorter and less formal is fine — it's a working
document.

When a skill could go either way, default to `engineos` and generalise. If
it is later shared outside the team, add an attribution block and a licence
(CC BY 4.0 is a sound default for methodology skills) — a licence statement
plus credit to any upstream source the skill adapted.

## The pre-flight principle

Rules documented in a skill are not reliably followed during creative flow.
Every skill with explicit rules needs an enforcement mechanism — a
verification step, a checklist, a mandatory write, an unskippable tool call —
where the agent checks its output against the rules before delivery. When
creating or improving any skill ask: "Does it have rules? Does it have a
mechanism to enforce them?" If not, add one. A rule the agent consistently
fails to follow is a simplify signal: convert it to structural enforcement
or remove it.

**Embedded commands are pre-flight items too.** A prose rule is
re-interpreted in context every run; an embedded command runs verbatim,
unattended, forever — and a subtly wrong one reads as correct on every
re-read (`git log -1 --format=%cI --reverse` returns the NEWEST commit,
because `-1` applies before `--reverse`). Execute every command embedded in
a skill once against real data, and inspect the output for plausibility,
before the skill file lands.

## Lean content

A skill should contain only content that changes the agent's behaviour at
execution time. Move changelogs, backstories, and maintainer notes out. Do
NOT cut examples, anti-patterns, or worked scenarios — bare rules get
violated more than rules with context. Test: would removing it change
behaviour? Keep per-session rules in the skill body and episodic material in
reference files loaded on demand — a skill loaded every session is fixed
overhead and should be audited like one.

## Verifying relocations and restructures

When content moves verbatim (splits into core + references, merges,
restructures), "nothing was lost" is checkable mechanically — with a
two-tier check:

1. Enumerate every moved line via `diff` of old base vs new base.
2. Exact-match each non-empty line against the restructured set (`grep -F`).
3. For misses, substance-check via a distinctive mid-line substring before
   concluding loss — most misses are container artifacts (heading levels,
   re-wrapped lines), not real losses.
4. Word-count sanity check per file.

Additionally, inventory the original's enforcement mechanisms (checkpoints,
assertions, invariants, mandatory writes, defaults) as an explicit
checklist — compression preferentially destroys enforcement machinery
because it reads as redundancy. Sweep any "pure restructuring" change for
net-new behaviour, which hides well in a large rewording diff.

## Cross-cutting principles

When an observation's Principle applies to skills in general, log it with
`Skill: All skills`. The `retro` skill is the propagation mechanism: it
clusters such observations and proposes the principle as a rule or registry
delta via PR — there is no separate principles file to maintain.
