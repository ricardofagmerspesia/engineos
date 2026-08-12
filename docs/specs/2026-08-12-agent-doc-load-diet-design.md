# Agent-doc load diet — design

Date: 2026-08-12
Status: approved
Driver: audit of EngineOS's agent-facing docs against the `writing-for-agents` methodology

## Problem

Three defects in the documents agents consume, all of the same family — a meaning
living in more than one place:

1. **The verification gate is scattered.** `lint + typecheck, run ONCE, after the
   last unit of work is integrated, with output shown` is spelled out in 12 live
   documents. Changing the gate is a 12-place edit, and every site is a drift
   candidate.
2. **`CLAUDE.md`'s Non-negotiables restate the always-on rule files loaded in the
   same context window.** Seven of nine items paraphrase a file already in
   context; item 9 restates a section twenty lines above it. Duplication inflates
   a meaning's rank on the information hierarchy past its real one, and costs
   tokens on every turn.
3. **Agent and skill descriptions carry body material.** A description is a
   context pointer: resident on every turn, whether or not it fires. Today they
   also carry procedure (the iOS/Android pipelines), mode-inference policy
   (5 coordinators, verbatim), dispatch policy (5 leaf specialists, verbatim),
   rule lists the router row already names, and an ownership-boundary rule
   (`eval-harness`).

## Approach

### 1. `the final gate` as a leading word

`rules/testing.md` becomes the single definition site: one heading, one paragraph
defining **the final gate**. Every other agent-consumed document names the term
and stops.

Human-facing docs (`README.md`, `docs/START.md`, `docs/ADOPTION.md`) keep their
prose explanation — they are read once by a person, not loaded every turn by an
agent, so exposition there is legitimate and out of scope for this change.

`CLAUDE.md`'s archive row keeps its extra demand (build + API/Web startup check)
because that gate is a genuine superset, not a restatement — it is reworded as
"the final gate plus build + startup check".

### 2. Non-negotiables become pointers

Each item reduces to a bolded name plus the file that owns it. Items 1, 4 and 5
keep their bodies: #1's threshold and #4's precedence order exist nowhere else,
and #5's layout + change-record contract has no rule file of its own.

The `#8` sentence establishing the standing user request for sub-agent use stays,
because `rules/subagents.md` states it as a DO for the agent while `CLAUDE.md`
states it as the user's authorization — but it is trimmed to one clause.

### 3. Descriptions state identity and branches only

Pointer shape: what the agent is, its branches, its hard boundary, its alias.

- **Aliases stay.** The alias token is load-bearing: it is the vocabulary
  `rules/subagents.md` mandates for announcements, and the mapping exists nowhere
  else in always-on context. Only the parenthetical wording
  (`(invocable by this name)`) is cut.
- **Mode prose → `Branches: AUDIT | IMPLEMENT`.** Mode *inference* already lives
  in each agent's `## Mode` section.
- **Rule lists cut.** The router row names the rules; the agent body repeats them.
- **Pipelines cut** from the iOS/Android descriptions — both bodies carry a
  `## Pipeline` section already.
- **Leaf-specialist dispatch nuance moves to the body.** The description keeps a
  short dispatch hint; the "or by a coordinator when the coordinator is itself the
  top-level agent" case moves into each body's opening paragraph, where it is
  read only after invocation.
- `skills/eval-harness/SKILL.md`'s ownership-boundary rule moves from the
  description into the body under its own heading.

## Non-goals

- Converting DO/DON'T pairs to positive phrasing (a large diff whose benefit only
  a prose-layer probe suite could confirm).
- Splitting `rules/testing.md` into policy + craft files.
- Moving `rules/base.md`'s mechanical rules into a lint preset.
- Changing which rules are always-on, or any hook behaviour.

## Verification

The final gate for this repo is the hook test suite (`hooks/test-*.sh`) plus a
grep proving no agent-consumed document restates the gate. No code paths change.
