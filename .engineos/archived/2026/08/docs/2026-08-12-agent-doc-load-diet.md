---
name: 2026-08-12-agent-doc-load-diet
status: done
completed: 2026-08-12
owner: Ricardo Fagmer
spec: docs/specs/2026-08-12-agent-doc-load-diet-design.md
domain: docs
---

## What
Removed three classes of duplication from EngineOS's agent-facing documents: named
the verification gate once as **the final gate**, reduced `CLAUDE.md`'s
Non-negotiables to pointers at the files that own them, and stripped body material
out of agent/skill descriptions.

## Why
An audit against the `writing-for-agents` methodology found the gate spelled out
in 12 live documents, seven of nine Non-negotiables paraphrasing always-on rule
files loaded in the same window, and always-loaded descriptions carrying
procedure, mode-inference policy and rule lists that the bodies already hold.
Duplication costs tokens every turn and turns one behaviour change into a
many-place edit.

## Scope
- `rules/testing.md` — definition site for **the final gate**
- `rules/parallelism.md`, `rules/subagents.md` — name the term, drop restatements
- `CLAUDE.md` — Non-negotiables to pointers; archive row reworded
- `commands/implement.md`, `templates/cursor/commands/implement.md`
- `agents/*.md` — 18 descriptions; 5 leaf-specialist bodies gained the dispatch nuance
- `skills/eval-harness/SKILL.md` — ownership boundary moved description to body

Out of scope: `README.md`, `docs/START.md`, `docs/ADOPTION.md` (human-facing
exposition, read once, not loaded per turn).

## Checklist
- [x] Define **the final gate** in `rules/testing.md`
- [x] Replace gate restatements in rules, commands, templates, coordinator bodies
- [x] Non-negotiables reduced to pointers, #1/#4/#5 keeping their bodies
- [x] Agent descriptions: identity + branches + boundary + alias only
- [x] Leaf-specialist bodies carry the coordinator-as-top-level dispatch case
- [x] `eval-harness` ownership boundary moved to body
- [x] Final gate: `hooks/test-*.sh` green + grep shows no remaining restatements

## What was made

**The final gate, defined once.** `rules/testing.md` heading "Verification timing —
lint + typecheck at finalization" became "## The final gate", opening with the
definition and the sentence "This is the only place the gate is defined — every
other document names it and stops." All 11 other agent-consumed restatements now
name the term and point at that file: `rules/parallelism.md` steps 5-6,
`rules/subagents.md`'s return-announcement example (`final gate green`),
`commands/implement.md` step 7, `templates/cursor/commands/implement.md` step 5,
and the method step in the five domain coordinators. `CLAUDE.md`'s archive row
kept its extra demand, reworded as "the final gate plus build + API/Web startup
check". Six coordinator bodies already said "the orchestrator's final gate" while
pointing at `rules/parallelism.md`; those pointers were repointed to
`rules/testing.md`, the new definition site.

**A contradiction found and fixed mid-change.** The first pass at the coordinators'
method step said the final gate belongs to the orchestrator and should not be run
by the agent — which contradicted each file's own parallel-discipline section
("Verify with scoped lint/typecheck runs only"). Resolved in favour of the
existing rule: the method step now says "verified with scoped lint/typecheck" and
says nothing about the gate or about tests, both of which the
parallel-discipline section already owns.

**Non-negotiables became pointers.** Nine items, each a bolded name plus its
owning file. Items 1, 4 and 5 kept their bodies (the spec threshold, the
precedence order and the layout/change-record contract exist nowhere else); items
2, 3, 6, 7, 8 and 9 dropped their restatements of `rules/testing.md`,
`rules/security.md`, `rules/models.md`, `rules/parallelism.md`,
`rules/subagents.md` and the Output-artifact section above them.

**Descriptions state identity, branches, boundary, alias.** All 18 agent
descriptions rewritten: `Dual-mode — AUDIT … or IMPLEMENT … per the MODE given or
inferred` collapsed to `Branches: AUDIT (read-only findings) | IMPLEMENT (writes
code)`; `(invocable by this name)` cut from 16 aliases while the alias tokens
themselves were kept (they are the announcement vocabulary
`rules/subagents.md` mandates, and the mapping exists nowhere else in always-on
context); the iOS/Android pipeline recitals cut (both bodies carry a `## Pipeline`
section and a `NEVER: credentials in code/logs` scope rule); the
`reports findings in the shared specialist format` and
`Dispatched by the audit orchestrator (or by a coordinator when …)` boilerplate
cut from the five leaf specialists, with the coordinator-as-top-level case moved
into each body's opening paragraph. `skills/eval-harness/SKILL.md`'s
ownership-boundary rule moved out of the description into its own body heading.

**Measured:** agent + skill descriptions 10,708 -> 7,109 bytes (-34%);
`CLAUDE.md` + all `rules/` 48,404 -> 47,458 bytes; the always-on subset
(`CLAUDE.md` + six always-on rule files) dropped ~978 bytes.

## Changes registered

```
$ git status --short
 M CLAUDE.md
 M agents/android-builder.md
 M agents/architecture-analyst.md
 M agents/audit-consolidator.md
 M agents/backend-coordinator.md
 M agents/cicd-specialist.md
 M agents/dba-coordinator.md
 M agents/devops-coordinator.md
 M agents/frontend-coordinator.md
 M agents/gcp-specialist.md
 M agents/ios-builder.md
 M agents/kubernetes-specialist.md
 M agents/llm-coordinator.md
 M agents/mobile-coordinator.md
 M agents/oracle-specialist.md
 M agents/postgres-specialist.md
 M agents/qa-tester.md
 M agents/security-reviewer.md
 M agents/test-writer.md
 M commands/implement.md
 M rules/parallelism.md
 M rules/subagents.md
 M rules/testing.md
 M skills/eval-harness/SKILL.md
 M templates/cursor/commands/implement.md
?? .engineos/changes/2026-08-12-agent-doc-load-diet.md
?? docs/specs/2026-08-12-agent-doc-load-diet-design.md

$ git diff --stat HEAD
 25 files changed, 96 insertions(+), 106 deletions(-)
```

No renames or `git mv`. 202 lines changed, within the 400-line PR limit
(`rules/git.md`). Two new files: this record and its spec.

## Verification

The final gate for this repo (no `package.json`, so no npm lint/typecheck):

```
$ for f in hooks/*.sh; do bash -n "$f"; done
bash -n: all 19 hooks OK

$ for t in hooks/test-*.sh; do bash "$t"; done
test-agent-announce.sh           pass=5 fail=0
test-bypass.sh                   pass=18 fail=0
test-governance.sh               pass=6 fail=0
test-layout.sh                   pass=10 fail=0 skip=1
test-route.sh                    pass=21 fail=0
test-task-scale.sh               8 passed, 0 failed
test-verify.sh                   pass=9 fail=0

$ grep -rn "lint + typecheck" --include=*.md agents commands rules templates skills CLAUDE.md
rules/testing.md:38:**The final gate** is EngineOS's single verification point: lint + typecheck, run
```

77 hook assertions pass, 0 fail. The one skip in `test-layout.sh` is
pre-existing and environmental (no-jq fallback needs symlinks). The grep proves a
single definition site. Frontmatter parse status is unchanged from HEAD (18 of 18
agent files fail *strict* YAML both before and after, because descriptions contain
`": "` — Claude Code's frontmatter parser is lenient and has always accepted this;
this change neither introduced nor fixed it).

`[tests] skipped — not requested` — no test suite exists for the prose layer;
adding one is item 7 of the audit backlog below.

## Notes

Deliberately excluded from this change (same audit, higher risk or larger diff):

- Router rows still prescribe conflicting fan-out mechanisms — "New feature",
  "Big/multi-domain sweep" and "Refactor" can all fire on one request and name
  three different mechanisms. `rules/parallelism.md` already has the authoritative
  resolver table; the rows should defer to it.
- `rules/base.md` still caches lint-enforceable rules (no `any`, no type
  assertions, import merging, `Number.parseInt`, ~300-line files, no emojis).
  Candidate for an EngineOS lint preset.
- The closure invariant in `CLAUDE.md` still claims always-on files never point
  outward, while `parallelism.md` and `models.md` point at the non-always-on
  `rules/testing.md`. See [[always-on-context-diet]]. The proposed fix is to split
  `rules/testing.md` into always-on policy + disclosed craft.
- DO/DON'T pairs are unconverted; steering by prohibition makes the forbidden
  behaviour more available, but the diff is large and only a probe suite could
  confirm the benefit.
- **No probe suite for the prose layer.** `hooks/test-*.sh` covers the hook layer;
  nothing measures whether a router row actually fires or whether a rule is a
  no-op. This is the blocker for every remaining item above.

Unrelated pre-existing defect spotted while editing: a stray `</content>` tag at
`agents/mobile-coordinator.md:99`, present at HEAD. Left in place to keep this
diff single-purpose (`rules/git.md`).
