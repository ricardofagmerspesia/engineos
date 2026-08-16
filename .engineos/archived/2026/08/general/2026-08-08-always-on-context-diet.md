---
name: 2026-08-08-always-on-context-diet
status: done
date: 2026-08-08
completed: 2026-08-08
branch: feat/subagent-dispatch-rule
spec: n/a — no behavior added; compression plus one always-on demotion, see Scope
domain: general
---

# Always-on context diet

## What
Compressed the always-on context set (`CLAUDE.md` and its `@rules/` imports)
without removing a rule, and demoted `rules/memory.md` from always-on to
router-loaded. Result: 32,390 -> 27,413 bytes (-15.4%) re-sent per request.

## Why

Always-on context (`CLAUDE.md` + its 7 `@rules/` imports) is re-sent with every
request in every project that imports EngineOS. Measured baseline:

| File | Bytes |
|---|---|
| `CLAUDE.md` | 14,558 |
| `rules/parallelism.md` | 4,053 |
| `rules/subagents.md` | 3,366 |
| `rules/base.md` | 2,529 |
| `rules/models.md` | 2,375 |
| `rules/security.md` | 2,285 |
| `rules/memory.md` | 1,666 |
| `rules/git.md` | 1,558 |
| **Total** | **32,390 (~8.1k tokens)** |

`CLAUDE.md` alone is 45% of it. Section breakdown: router table 6,723 B,
router prose 3,154 B, non-negotiables 2,817 B, output artifact 1,135 B.

## Scope

1. **Compress `CLAUDE.md`** — no rule removed, only duplication and prose.
   - Router table cells restated each agent's behavior at length; that text is
     already the `description:` frontmatter of the corresponding `agents/*.md`,
     which is what the harness surfaces in its agent listing. Cells reduced to
     intent signals -> load list -> agent name.
   - Non-negotiables 6/7/8 restated `rules/models.md`, `rules/parallelism.md`,
     and `rules/subagents.md` in paragraph form. Those files are always-on;
     the restatement is duplication. Reduced to the binding claim + pointer.
   - Routing prose bullets merged where they covered one topic (hook mirror +
     multi-match + jq troubleshooting).

2. **Demote `rules/memory.md` from always-on to router-loaded.** It has zero
   inbound and zero outbound cross-references, so the closure invariant is
   unaffected. It answers "where does this knowledge live", which is a
   docs/ADR/spec question, not an every-turn question. Added to the rows that
   ask it: architecture-docs, interview, and `adr`.

## Explicitly NOT done

**`parallelism.md`, `models.md`, `subagents.md` stay always-on.** Demoting them
was considered and rejected on the cross-reference graph:

```
testing.md    -> parallelism.md
parallelism.md -> models.md, testing.md
models.md     -> testing.md
subagents.md  -> models.md, parallelism.md
```

`testing.md` is router-loaded by the backend, frontend, mobile, and test rows.
If `parallelism.md` left always-on, the closure rule ("every row that loads the
first MUST also load the second") would force those four rows to load
`parallelism.md` + `models.md` = +6,428 B — on the four most frequently matched
rows in the table. Net loss. The always-on placement is what keeps those rows
cheap.

## Checklist

- [x] `CLAUDE.md` compressed, every rule preserved
- [x] `rules/memory.md` demoted, added to rows that need it
- [x] Closure invariant checked for every row (3 pre-existing gaps found, 1 fixed, 2 reported)
- [x] All 25 intent rows still present
- [x] All 9 non-negotiables still present
- [x] Hook test suite green — 77 pass / 0 fail
- [x] Before/after byte count recorded

## What was made

### Result

| | Bytes | ~Tokens |
|---|---|---|
| Always-on before | 32,390 | 8,097 |
| Always-on after | 27,413 | 6,853 |
| **Saved** | **4,977 (15.4%)** | **~1,244/request** |

Per file: `CLAUDE.md` 14,558 -> 12,141; `rules/subagents.md` 3,366 -> 2,701;
`rules/memory.md` 1,666 -> 0 (demoted to routed).

### Files changed

- `CLAUDE.md` — router table cells reduced to signals -> load -> agent (6,723 -> 5,953 B);
  non-negotiables 6/7/8 reduced to binding claim + pointer (2,817 -> 1,971 B); routing
  prose bullets merged (hook mirror + multi-match + jq into one). `@rules/memory.md`
  import removed; `rules/memory.md` added to the architecture-docs, interview, and `adr`
  rows.
- `rules/subagents.md` — "Enforcement backstop (Claude Code)" section (834 B of
  implementation history + Cursor caveat) moved to the README hooks table, replaced by a
  two-line pointer. No DO/DON'T removed.
- `README.md` — `rules/memory.md` row restated as routed; new hooks-table row documenting
  `announce-agent-dispatch.sh` / `announce-agent-return.sh` (now their only home).
- `docs/START.md` — always-on list corrected. It was already stale before this change:
  it listed `memory.md` but omitted `parallelism.md`, `models.md`, and `subagents.md`.

### Closure findings (pre-existing, verified against HEAD)

The verification pass ran a closure checker over every row. It found 3 gaps, all present
identically at `HEAD` before this change:

1. **FIXED** — the mobile row loads `backend.md`, which defers logging to
   `observability.md`, but did not load `observability.md`. Added.
2. **OPEN** — `rules/parallelism.md` references `rules/testing.md`.
3. **OPEN** — `rules/models.md` references `rules/testing.md`.

2 and 3 violate the invariant's literal wording ("always-on files ... never point
outward"). Both are *conditional* pointers whose safe default is stated inline ("tests
only when in scope"), so no rule silently disappears — but the invariant as written does
not admit that case. Two ways to close it, both a judgment call for the repo owner:
either amend the closure rule to permit an always-on file pointing at a routed file when
it restates the safe default in place, or reword the two references so they assert the
default without naming `testing.md`. Not changed here — rewriting closure semantics is
out of scope for a compression pass.

### Verification

Promoted to the top-level `## Verification` section below.

```
hooks/test-route.sh           pass=21 fail=0
hooks/test-governance.sh      pass=6  fail=0
hooks/test-layout.sh          pass=10 fail=0 skip=1 (no-jq fallback: symlinks unavailable)
hooks/test-task-scale.sh      pass=8  fail=0
hooks/test-agent-announce.sh  pass=5  fail=0
hooks/test-bypass.sh          pass=18 fail=0
hooks/test-verify.sh          pass=9  fail=0
                              ---------------
                              77 pass, 0 fail
```

Structural checks: 25/25 intent rows, 5/5 artifact options, 9/9 non-negotiables,
6 `@rules/` imports.

## Changes registered

```
M CLAUDE.md
M README.md
M docs/START.md
M rules/subagents.md
```

```
 CLAUDE.md          | 115 ++++++++++++++++++++++-------------------------------
 README.md          |   3 +-
 docs/START.md      |   5 ++-
 rules/subagents.md |  16 +-------
 4 files changed, 70 insertions(+), 68 deletions(-)
```

(Note: `install.sh` shows modified but the change predates this session; not
included in this record.)

## Verification

The hook suite and the structural checks reported above under **What was made**:
77 pass / 0 fail across `hooks/test-{route,governance,layout,task-scale,agent-announce,bypass,verify}.sh`,
plus 25/25 intent rows, 5/5 artifact options, 9/9 non-negotiables and 6 `@rules/`
imports. The two OPEN closure findings (`parallelism.md` and `models.md` pointing
at `rules/testing.md`) were reported, not fixed, and were still open at archive
time.
