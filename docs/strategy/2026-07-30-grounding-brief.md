# Grounding brief — EngineOS strategy run, 2026-07-30

**Status: FROZEN.** This is the shared evidence base for the four parallel mode analyses
(opportunity, monetization, positioning, decision). Do not renegotiate these facts. If your
mode needs a fact not listed here, research it yourself and cite it with source and date in
your own report.

Subject: **EngineOS as a product.** Owner: Ricardo Fagmer. Today: 2026-07-30.
Owner capacity: **20+ hours/week** beyond existing work (self-reported).
Desired outcomes, all four selected: **money, reputation, adopters, clarity** — including
explicitly "deciding what to stop doing".

---

## 1. What the product is

EngineOS is a shared AI engineering environment for Claude Code: an intent router plus
versioned rules, skills, subagents, and quality-gate hooks, installed with one command.
Positioned in `docs/PRD.md:4` as "Global (`~/.claude`), distributed to a **2–10 person
team** via a versioned git repo". Stacks: TypeScript/Node (NestJS), React/Next, LLM apps,
over a stack-agnostic base (`docs/PRD.md:5`).

The problem it claims to solve (`docs/PRD.md:11`): engineers using Claude Code get
inconsistent results because every prompt starts from zero and conventions live in people's
heads. Stated goals include ≥90% of substantive prompts passing through the router before
Claude touches code, and day-1 on-pattern output from a new hire (`docs/PRD.md:19-23`).

Surface area actually built (all present on disk):

- `CLAUDE.md` — constitution + a ~25-row intent router table
- 12 `rules/*.md` — base, security, git, memory, parallelism, models, architecture,
  backend, frontend, llm-apps, testing, data, observability
- 8 skills — `nestjs-patterns`, `react-patterns`, `llm-engineering`, `adr`,
  `eval-harness`, `release-notes`, `record-change`, `strategy` (added today)
- 18 agents — 6 domain coordinators, 5 MCP-bound leaf specialists, security-reviewer,
  test-writer, architecture-analyst, qa-tester, audit-consolidator, ios/android builders
- 33 generated per-agent slash commands (`commands/agents/`, human-name aliases)
- 6 hooks — task-scale advisor, route-before-change, post-edit-check, mark-unrecorded,
  stop-verify, record-verify — wired via `hooks/hooks.json`
- Governance tree `.engineos/{changes,archived,memory}` with enforced lifecycle
- Templates: MCP baseline, permission allowlist, project CLAUDE.md, project layout,
  GitHub CI review workflows, **Cursor adapter**
- `install.sh` + `install.ps1` (bash and PowerShell), plugin packaging
  (`.claude-plugin/`, v1.2.0)

## 2. Real cadence and authorship (`git log`, `git shortlog`)

- First commit **2026-06-11**. Today 2026-07-30 → the project is **7 weeks old**.
- **83 commits, 100% by Ricardo Fagmer.** Solo. Two PRs (#1, #2), both self-merged.
- Burst-then-trickle shape: roughly 30 commits on 2026-06-19 alone, then discrete touches
  on 06-22, 06-26, 07-02, 07-06, 07-13, 07-16, 07-30. Weekly-to-biweekly since the burst.
- **22 archived change records**: 14 completed in June, 8 in July. Velocity roughly halved
  month over month while remaining live (a record landed today).
- Recent shipped work skews toward *adding surface*: mobile-coordinator (07-06),
  web-to-mobile mirror (07-13), iOS/Android store-release agents (07-16), parallel fan-out
  doctrine + model tiers (07-30). Not toward distribution, docs for outsiders, or adoption.

## 3. Distribution: the channel is closed

**Load-bearing finding — verified 2026-07-30.**

- `README.md:18` instructs adopters to `git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git`.
- `README.md:24-25` instructs `/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern`
  then `/plugin install engineos@engineos`.
- `https://api.github.com/repos/ricardofagmer/engineer-spec-ia-pattern` returns **HTTP 404**
  (checked 2026-07-30), while `git ls-remote origin` succeeds over SSH with the owner's key.
  The repo **exists and is private**.

Therefore: **both documented install paths are non-functional for every person other than
the owner.** The plugin-marketplace path in particular requires public repo visibility.
There are zero possible external adopters today, and the count is not low for lack of
marketing — it is structurally zero. The repo also carries an MIT `LICENSE`, i.e. it is
licensed for sharing but not shared.

Any mode that recommends growth, adoption, or audience must treat this as the binding
constraint, not a detail.

## 4. Public footprint of the owner (verified 2026-07-30)

From `https://github.com/ricardofagmer`:

- Bio: "🌍 ...don't stop dancing! believe." plus "An IT professional with over 15 years of
  experience developing with Javascript, Typescript, Node, Nest, and Angular."
- Location Londrina (Brazil). **6 followers**, following 11, **14 public repositories**.
- Visible/notable public repos are old or unrepresentative: a Java fork
  (`DatabaseAutoCompleteLibrary`), `agro`, `equipamento_maven`, `pec` (Java),
  `cuboid-challenge-node`, `ecommerce`.
- Linked: LinkedIn `ricardo-fagmer`, org `@Fagmer`.
- Work email domain (session context): `spesia.com.br` — employed, so EngineOS is
  side-of-desk relative to a day job.

Consequence: the strongest artifact he has built is invisible, and the visible artifacts
are the weakest. A stranger evaluating him in 60 seconds sees Java forks and coding
challenges, plus a bio naming **Angular** while the actual current work is
NestJS/React/Next/LLM agent infrastructure.

## 5. Contradictions between what the repo says and what it does

Surface these where relevant; they are findings, not housekeeping.

1. **Stated audience vs. actual usage.** `docs/PRD.md:4` scopes EngineOS to a 2–10 person
   team; the git history shows a single author and self-merged PRs. Every team-oriented
   feature (shared allowlist, PR-to-change-a-standard, onboarding-a-new-hire goal) is
   built but unexercised by a second human.
2. **Non-goal already violated.** `docs/PRD.md` lists "Non-Claude tooling (Cursor rules,
   Copilot instructions) — single-tool focus for v1" as an explicit **non-goal**. Yet
   PR #2 `feat/cursor-adapter` merged on 2026-07-30, with
   `docs/specs/2026-06-19-cursor-adapter-design.md` (11 KB) and shipped Cursor mirroring
   (commit 2026-06-22 "feat(cursor): mirror EngineOS slash commands into Cursor"). The PRD
   was never updated to record the reversal — no ADR supersedes it.
3. **Governance built, not used.** `.engineos/memory/` contains only `README.md` after 22
   completed changes. The durable-knowledge store the system enforces elsewhere holds zero
   entries.
4. **Docs drift on its own conventions.** `README.md:116` still documents archiving to
   `.engineos/archived/<YYYY>/<MM>/<DD>/`, but commit 2026-07-02 "fix(archive): drop day
   folder, keep month + domain grouping" replaced that with `<YYYY>/<MM>/<domain>/`, which
   `.engineos/archived/README.md` states as authoritative.
5. **Local install drifts silently.** Skills materialize in `~/.claude/skills/` as plain
   directory copies rather than junctions on this machine, so repo edits do not take
   effect until the installer re-runs. Found live today: the local `record-change` copy
   still taught the retired day-folder convention while the repo copy was correct.

Read items 1–5 together and a pattern emerges that the *clarity* outcome depends on: the
system's build quality is high and its **maintenance-of-truth** discipline is weak precisely
where a second user would first encounter it. That is an adoption defect, not a docs nit.

## 6. What is NOT known (do not invent)

- Revenue from EngineOS: **zero**, structurally (nothing is sold and nothing is public).
- Owner's income, day-job terms, and IP/moonlighting clauses: **UNKNOWN**. Relevant to any
  monetization route — flag it, do not give legal advice.
- Any audience the owner controls outside GitHub (newsletter, YouTube, Twitter/X, LinkedIn
  following size, community membership): **UNKNOWN**. GitHub followers = 6 is the only
  measured number. Do not assume a larger audience exists; do not assume none exists
  either — state the dependency.
- Whether the 2–10 person team in the PRD is a real team at Spesia that could adopt it, or
  aspirational: **UNKNOWN**.
- Portuguese-language market position for AI-engineering content: **UNKNOWN**, worth
  researching for opportunity/positioning given the owner is Brazil-based.

## 7. Rules every mode report must obey

- Every external claim carries source + publication date. Minimum three distinct searches
  per claim family, then fetch the primary source. Search in Portuguese and English.
- Every project claim cites `path:line` from this repo.
- No invented numbers. Unfilled facts are written `UNKNOWN` with their effect on the
  conclusion stated.
- Nothing already obvious: if a trend is mainstream commentary, it has no timing edge.
- End with exactly ONE action under a deadline, plus the observable signal of success.
- Include a "What would falsify this" section.
- Respect 20+ h/week — but do not assume it is infinite or permanent; the owner has a
  day job and a 7-week history whose velocity already halved once.
- Not financial or legal advice; say so where money or contracts are involved.
- Answer in Portuguese (the user writes in Portuguese); keep file paths and identifiers in
  English.
