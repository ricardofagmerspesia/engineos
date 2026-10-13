# Skill Authoring — adapted from "One Skill to Rule Them All" (CC BY 4.0, Eoghan Henn / rebelytics.com)

Load before creating/substantially editing skills. Team EngineOS sources change
through the engineos repo/PR, never installed live copies.

## Taxonomy

- **engineos**: reusable team methodology in skills/; generalize client specifics
  and prefer this home when unclear. External sharing needs licence/attribution
  (CC BY 4.0 is suitable for methodology), including upstream credit.
- **project**: project/client-specific conventions in that project's CLAUDE.md or
  docs/rules/, following rules/memory.md; shorter working documents are appropriate.

## Enforcement before delivery

Every explicit rule needs a checkable mechanism: checklist, mandatory write,
assertion or unskippable approved action. If agents consistently ignore it,
structurally enforce or remove it. Inventory original checkpoints/invariants/
defaults/mandatory writes **before compression**; their apparent redundancy is
not permission to drop them.

Inspect embedded commands as code and verify expected meaning/output before landing.
For example, git log -1 --format=%cI --reverse returns the newest commit:
-1 applies before reverse. Safe read-only commands may be inspected against real
data; git writes follow git rules, and tests/evals/behavioral checks execute only
after integrated implementation and explicit current-task final-stage approval.
A documentation pre-flight cannot grant either permission.

## Lean content

Keep material that changes execution behavior. Disclose episodic/reference branches
behind explicit loading conditions; remove irrelevant history/maintainer chatter.
Retain meaningful examples, anti-patterns and worked scenarios that clarify rules.
Per-session obligations remain in the skill body; audit recurring load overhead.

## Relocation/restructure review

For verbatim moves: diff original/current core to enumerate moved lines, exact-match
each nonempty line across the resulting files, then inspect distinctive substrings
for misses (wrapping/headings can differ). Compare per-file word counts. Separately
check all original enforcement mechanisms and inspect for unintended new behavior;
text matches alone cannot prove semantic preservation.

## Cross-cutting principles

Log general skill observations as Skill: All skills. Retro clusters them into
proposed rule/registry changes; there is no separate principles file.
