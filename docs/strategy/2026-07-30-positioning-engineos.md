# Positioning — perceived authority around EngineOS

**Mode:** positioning · **Date:** 2026-07-30 · **Subject:** Ricardo Fagmer (Londrina/BR, 15+ years JS/TS/Node/Nest, employed, 20+ h/week available)
**Frozen evidence base:** `docs/strategy/2026-07-30-grounding-brief.md`
**Playbook:** `skills/strategy/references/04-positioning.md`

---

## Headline

The public profile does not merely fail to show the strong work — it **actively asserts that his
representative work is Java CRUD from 2013 to 2018**. The six *pinned* repositories are a deliberate
editorial choice, and the most recent public push is from **2025-10-23**, nine months ago, while
83 commits in 7 weeks happened in a private repository. The path of least effort to the largest gain
in perception is not opening EngineOS: it is publishing **one** enforcement artifact extracted from
what already exists on disk and re-pointing the profile at it — without depending on reach, because
the mechanism is depth, not audience.

---

## Grounding

### What was verified today (primary sources, fetched 2026-07-30)

**`https://api.github.com/users/ricardofagmer`** (raw JSON, fetched 2026-07-30):

| Field | Value |
|---|---|
| `bio` | "🚀IT professional for over 15 years working as developer with Javascript, Typescript, Node, Nest and **Angular**." |
| `followers` / `following` | **6** / 11 |
| `public_repos` | 14 |
| `location` | Londrina |
| `company` | `@fagmer` |
| `blog` | `https://www.linkedin.com/in/ricardo-fagmer/` |
| `twitter_username` | `null` |
| `created_at` | 2014-09-15 |

**`https://api.github.com/users/ricardofagmer/repos?sort=pushed`** (fetched 2026-07-30) — the 14
public repositories, with `stargazers_count`:

| Repo | Language | Fork | `pushed_at` | Stars |
|---|---|---|---|---|
| nest-model | TypeScript | no | 2025-10-23 | 0 |
| cuboid-challenge-node | TypeScript | no | 2025-10-23 | 0 |
| graphQL | TypeScript | no | 2024-12-18 | 0 |
| angular-16 | — | no | 2023-10-16 | 0 |
| react-template | — | no | 2022-05-02 | 0 |
| react-adminlte-master-classes | JavaScript | no | 2022-02-04 | 0 |
| some-tests ("interview-tests") | TypeScript | no | 2022-01-20 | 0 |
| base-factory | — | no | 2021-11-26 | 0 |
| treinee | — | no | 2021-10-26 | 0 |
| ecommerce | JavaScript | no | 2021-10-07 | 0 |
| pec | Java | no | 2018-02-07 | 0 |
| equipamento_maven | — | no | 2017-08-28 | 0 |
| agro | — | no | 2016-05-20 | 0 |
| DatabaseAutoCompleteLibrary | Java | **yes** | 2013-11-28 | 0 |

Two facts the brief did not contain and that change the reading:

1. **All 14 repositories have 0 stars.** In 12 years of the account (since 2014-09-15), zero external
   validation recorded on any artifact of his own.
2. **The most recent public push is 2025-10-23** — nine months of public silence, exactly the
   period in which the real activity exploded (first EngineOS commit 2026-06-11, 83 commits in
   7 weeks — brief §2).

**Pinned repositories** (`https://github.com/ricardofagmer`, fetched 2026-07-30), in displayed order:
`DatabaseAutoCompleteLibrary` (Java fork, last push **2013-11-28**), `agro` (2016), `equipamento_maven`
(2017), `pec` (Java, 2018), `cuboid-challenge-node` (interview challenge), `ecommerce` (2021).
Badges displayed: Pair Extraordinaire ×3, Pull Shark ×3, YOLO, Quickdraw.

**`https://www.freelancermap.com/profile/ricardo-fagmer`** (fetched 2026-07-30, **page updated
2024-10-30**): headline "Senior Software Engineer | JavaScript | TypeScript | Node | Nest |
Angular | Nx"; employer listed **Scalio**; availability "**100% available**"; fluent English.

**LinkedIn `ricardo-fagmer`**: `https://www.linkedin.com/in/ricardo-fagmer/` 301-redirects to
`https://br.linkedin.com/in/ricardo-fagmer`, which answers **HTTP 999** (scraping block).
Nothing was verifiable there.

### UNKNOWN — declared, not invented

| # | Fact | Effect on the conclusion |
|---|---|---|
| 1 | **LinkedIn connection/follower count, current headline, posting activity** — HTTP 999, not fetchable | If there is a relevant engaged audience, the channel priority of Action 3 is inverted. It is the biggest hole in the plan. |
| 2 | **Current employer** — three conflicting public signals: freelancermap says Scalio (page from 2024-10-30); the session context brings the `spesia.com.br` domain; a search snippet (2026-07-30) mentioned "rindus". None verifiable by a primary source | I use the employer in no recommendation. The point that *matters* is that the public record is contradictory and old. |
| 3 | **IP / moonlighting clauses of the current job** (brief §6) | Can block any derivative publication. This is not legal advice — check with the contract. |
| 4 | **Audience outside GitHub** (newsletter, YouTube, X) | `twitter_username` is `null`; nothing else found. I assume zero audience of his own throughout the plan. |
| 5 | **Whether the PRD's 2–10 person team is real at the company** (brief §6) | If it is real, internal adoption is a faster authority route than public writing, and this plan becomes second priority. |
| 6 | **Size/activity of r/brdev** — a PT search (2026-07-30) returned nothing relevant | Dropped as a channel for lack of verification, not by value judgment. |
| 7 | **Traffic/stars history over time** for the repos | Only the current state (0 stars on all) is verifiable. |

### The honest inventory of achievement (what is on disk)

- `hooks/hooks.json` — **6 hooks actually wired**: `task-scale-advisor.sh` (`hooks/hooks.json:9`),
  `route-before-change.sh` (`:20`), `mark-unrecorded.sh` (`:31`), `post-edit-check.sh` (`:35`),
  `stop-verify.sh` (`:46`), `record-verify.sh` (`:50`).
- **13** files in `rules/`, **18** agents in `agents/`, **11** design specs in `docs/specs/`,
  **22** change records archived in `.engineos/archived/` (14 in June, 8 in July).
- Real Cursor adapter: `templates/cursor/` + `docs/specs/2026-06-19-cursor-adapter-design.md`
  (11,005 bytes) — proof of portability across tools.
- `LICENSE:1` — MIT, "Copyright (c) 2026 Ricardo Fagmer".
- Contradictions that matter for positioning: `docs/PRD.md:29` lists non-Claude tools
  (Cursor, Copilot) as an explicit **non-goal**, and the Cursor adapter was merged anyway, with no
  superseding ADR; `.engineos/memory/` contains **only** `README.md` after 22 completed changes.

### Market context (dated sources)

- **AGENTS.md is the industry's neutral baseline.** `https://agents.md` (fetched 2026-07-30): "simple,
  open format for guiding coding agents", **stewarded by the Agentic AI Foundation / Linux Foundation**,
  **60,000+** open-source repositories, 25+ tools supporting it (Codex, Cursor, Copilot Coding
  Agent, Gemini CLI, Jules, Devin, Junie, Zed, Warp, Windsurf…). Repo `agentsmd/agents.md`
  (fetched 2026-07-30): **23.3k stars, 84 open issues, 78 open PRs** — a live discussion, not
  archived. Formalized in August 2025 (OpenAI, Google, Cursor, Factory, Sourcegraph), per 2026
  secondary sources.
- **The "instruction vs. enforcement" frontier is the active debate — and it is already mainstream commentary.**
  "From CLAUDE.md to Hooks: How to Make AI Agents Actually Follow Rules" (Medium, Ilia Popov,
  **Apr 2026**); "Agent Hooks: Deterministic Guardrails for AI-Generated Code" (bitbytebit
  substack); "An Empirical Study: AI Agent Rules Need Context and Layered Enforcement" (eunomia,
  **2026-07-15**). Recurring thesis: markdown instructions reach 70–90% compliance and degrade under
  context pressure; hooks execute outside the model's reasoning chain. `asdlc.io` formulates the
  rule EngineOS already embodies: if a constraint can be enforced deterministically by a repo tool,
  it should **not** be restated in the agents.md — the tool *is* the constraint.
  **Hard consequence, per rule §7 of the brief:** the *thesis* has no timing advantage. What has an
  advantage is the **longitudinal evidence** — 7 weeks, 83 commits, 22 change records under real
  gates. Those who write about the topic argue; he has a corpus.
- **Verified PT-BR channel:** TabNews (`tabnews.com.br`) publishes actively about Claude Code and
  agents — e.g.: "Claude Code vs Codex vs Gemini: Quem Venceu a Batalha dos Agentes de IA para
  Desenvolvedores" and "Criei uma IDE de terminal pra trabalhar com agentes de IA (Claude Code,
  Gemini CLI, Codex)" (search 2026-07-30). The FAQ (`tabnews.com.br/faq`, fetched 2026-07-30)
  describes the "Relevantes" ranking by **time since publication, positive rating and engagement in
  comments** — and **mentions followers nowhere** in the reach mechanism. That qualifies the channel
  under the absolute rule.
- **EN community:** r/ClaudeCode with **4,200+** weekly contributors in early 2026, ~3× that of
  r/Codex (morphllm, "Claude Code Reddit: What Developers Actually Say (2026)"). Secondary source,
  not confirmed by a primary source — treated as indicative.
- **PT-BR discourse about AI governance exists and is generic:** "Engenharia com IA exige mais
  método, não menos. Sem governança, contexto e supervisão humana, o uso de IA tende a amplificar
  erros" (Alura / iMasters / Accurate, 2026). In other words: in Portuguese there is governance
  *thesis* and almost no demonstrable *implementation*. That is the gap he fits into.
- **Channel constraint to respect:** lists of the *awesome-claude-code* type reject PRs whose main
  purpose is promoting one's own project (search 2026-07-30). Participation has to be substantive
  contribution, never a link-drop.

---

## Analysis

### STEP 1 — The perception gap

**Today — what a stranger concludes in 60 seconds** (using only what was verified above):

He opens `github.com/ricardofagmer`. He reads the bio: 15 years, JavaScript, TypeScript, Node, Nest,
**Angular**. He looks at the six pins: a **2013 Java fork**, two projects from 2016–2017, a Java one
from 2018, an interview challenge and an `ecommerce` from 2021. He glances at the activity: last
public push **Oct 2025**. He notes 6 followers and no stars on anything. If he goes to a second
place, he finds the freelancermap from **Oct 2024** saying "100% available" with Angular and Nx in
the headline.

The stranger's conclusion: *Brazilian senior developer, long career, corporate Angular/Node stack,
CRUD and ERP portfolio, public output decelerating since 2025, probably available for contract.*
**Zero** signal of AI, of agents, of architecture, of engineering governance. Nothing to suggest
that this person is one of those who think most deeply about how a team makes coding agents obey
standards.

**The desired position in 12 months — INFERRED, not supplied.**

> ⚠️ **This is inference, not a briefing.** It was derived from two things: (a) he selected
> *reputation* **and** *adopters* **and** *money* as desired outcomes (brief, header), and
> (b) he built a system of **team-scale engineering governance** — `docs/PRD.md:4` explicitly
> scopes "a team of 2–10 people". He did not build a personal productivity tool; he built an
> instrument of collective compliance. That implies a position, and the implied position is:

**"The person who has a working — and auditable — answer for how a team makes coding agents obey its
engineering standards deterministically."** Not an AI influencer, not a generic senior dev:
**practitioner authority in agent governance**. Operationally: the name a tech lead cites when
defending agent gates in a meeting, and the name a team hires to set that up.

**Testing the inference against the repo.** *Supported in substance:* 6 wired hooks
(`hooks/hooks.json:9,20,31,35,46,50`), 13 rules, 18 agents, 11 specs, 22 change records, a Cursor
adapter proving portability. *Not supported in social proof:* zero external adopters —
structurally zero, because the two documented installation paths (`README.md:18` SSH clone;
`README.md:24-25` plugin marketplace) point at a repository that returns **HTTP 404** (brief §3) —
and no second human has ever exercised the team features (brief §5.1).
**Honest correction of the position:** the 12-month target has to be *authority in the design and
enforcement of agent governance*, **not** "leader of an adopted platform". The second requires
adopters he does not have and cannot obtain while the repo is private. Claiming the second would be
exactly the type of assertion the playbook forbids.

**The gap, in one sentence:** between "Angular contractor whose public output stopped in 2025" and
"reference practitioner in agent governance" — and the distance is **not** one of competence (that
is on disk), it is **entirely one of transmissible evidence**.

#### The ONE most damaging signal

**The six pinned repositories.**

It is not "the good work is private", and it is not the bio. It is the fact that the pins — the only
editorial control GitHub offers — declare that his most representative work is a **Java fork whose
last push is 2013-11-28**, plus projects from 2016–2018 and an interview challenge.

**Why this one costs more than the other two candidates:**

- **vs. "the strongest artifact is invisible / the weakest ones are visible":** this is that
  candidate, but sharpened on the vector that actually transmits. EngineOS being invisible is an
  **absence of evidence** — it costs opportunity, it is neutral in the reading. The pins are a
  **wrong positive assertion** — they cost credibility. A gap leaves the evaluator undecided; a
  mistaken claim makes him decide against. And the effect compounds with the most recent public push
  of 2025-10-23 and the 0 stars: the profile reads as a **decelerating career**, at the exact moment
  the real output is at the career's peak. No amount of private work corrects that, because the
  visible part is the only part that transmits.
- **vs. the bio naming Angular:** it costs, but it is damage from being *out of date*, not from
  disqualification — a stranger who reads "15 years JS/TS/Node/Nest" still reads a competent senior.
  A one-line fix, and I recommend making it; it just is not what hurts most.
- **vs. MIT but private (`LICENSE:1` + HTTP 404):** this one is **invisible to the stranger**. Nobody
  can see the repository, therefore nobody perceives the contradiction. It is a **distribution**
  defect — it belongs to the opportunity/monetization modes — with *perception* damage close to
  zero, because there is nothing to perceive.

The pins are also the most damaging *and* the cheapest to fix among those that cause real damage:
changing what is pinned takes minutes and requires no decision about the private repository, about
IP, or about the job.

### STEP 2 — Three repeatable authority actions

All use raw material **already existing on disk**. None has reach as its mechanism. All survive
skipped weeks by design.

---

#### Action 1 — Enforcement teardown: "the rule nobody obeys vs. the hook nobody bypasses"

| | |
|---|---|
| **Frequency** | 1 publication every 2 weeks, with **6 topics written and queued at once** (one per hook in `hooks/hooks.json`). The buffer is what makes the cadence immune to a skipped week: skipping does not break the series, it only consumes stock. |
| **Channel** | **TabNews** as primary (PT). Verified: publishes actively about Claude Code/agents, and the "Relevantes" ranking is by recency + rating + comments, **with no followers in the mechanism** (`tabnews.com.br/faq`, fetched 2026-07-30). EN mirror on `dev.to` as secondary. |
| **Format** | Teardown with real code. Each post takes **one** rule from `rules/` and shows the three levels of compliance (explanation → reminder → **enforcement**) with the concrete hook that enforces it — `post-edit-check.sh`, `route-before-change.sh`, `stop-verify.sh` etc. Includes what the hook does **not** cover. |
| **Signal** | **"This person converts an engineering standard into a mechanism, not into an opinion."** |

Why it works at 6 followers: the value is not in how many people read, it is in that **the text
exists and is specific enough to be cited**. A teardown with the real `.sh` is a reference; a thesis
post is noise. The raw material is ready — the 6 hooks are written, tested and in use.

---

#### Action 2 — Maintained comparison: the EngineOS governance model against the AGENTS.md baseline

| | |
|---|---|
| **Frequency** | **Monthly** touch — a living page, not a series. Update when the spec or a tool changes. A skipped week is irrelevant for a maintained document. |
| **Channel** | A **new public repository of his own** (e.g.: `agent-governance-notes`) — **not** the private EngineOS. Plus substantive participation in the issues of `agentsmd/agents.md` (23.3k stars, 84 issues, 78 open PRs — fetched 2026-07-30), where the instruction-vs-enforcement frontier is under open debate. |
| **Format** | Maintained comparison table + documented position on **what AGENTS.md deliberately does not cover**: deterministic enforcement, team change lifecycle, durable decision record. Anchored in the 6 hooks and the 22 change records. |
| **Signal** | **"This person knows the standards landscape and knows where its edges are."** |

Mandatory guardrails: *awesome-** lists reject promotional PRs (search 2026-07-30) — therefore,
content contribution, never a link-drop. And **never** claim adoption that does not exist: the
comparison is about *design*, not about an installed base.

---

#### Action 3 — Longitudinal case study with numbers — including the ones that discredit him

| | |
|---|---|
| **Frequency** | **Quarterly** (2–3 in 12 months). Low frequency, high weight; immune to skipped weeks by construction. |
| **Channel** | LinkedIn article + copy in Action 2's public repository. ⚠️ Audience size on LinkedIn is **UNKNOWN** (#1) — and that is precisely why the format is an *article* and not a *post*: the value is being findable and citable by a specific lead, not being distributed. |
| **Format** | Real data: 7 weeks, 83 commits, 22 change records, 11 specs, 1 author — what the governance cost and what changed. **Including the failures:** `.engineos/memory/` with only `README.md` after 22 changes; the non-goal of `docs/PRD.md:29` reversed by the Cursor adapter with no superseding ADR; docs drift about its own archiving convention. |
| **Signal** | **"This person reports evidence against himself."** |

Everybody who publishes about agent governance shows the rosy happy path. An account that opens up
the three places where his own system failed is rare enough to be **the** differentiator — and it is
the only way to build trust without social proof.

---

**Distinct-signal check (playbook requirement).** Actions 1 and 3 are both "write about my own
system" and could collide — they do not: **1** is *mechanism-level, prospective*, it teaches a
reproducible technique; **3** is *outcome-level, retrospective*, it reports evidence including the
negative kind. Rigor ≠ honesty. The three signals — **mechanism builder · literate in the landscape ·
auditor of himself** — compose exactly the inferred position: practitioner authority. None of them
is "has an audience".

---

## The one action

> ## Publish ONE public artifact: the teardown of the 6 enforcement hooks — and re-point the profile at it.
> **Deadline: 2026-08-13** (14 days from 2026-07-30).

One deliverable, indivisible, in three parts that only work together:

1. **Create a new public repository** with the enforcement teardown: the 6 hooks of
   `hooks/hooks.json`, what each one prevents, the real `.sh`, and the instruction-vs-enforcement
   frontier demonstrated on top of them. It publishes **the pattern and the reasoning** — not the
   whole of EngineOS (no decision about the private repo, no IP exposure).
2. **Re-point the profile:** unpin `DatabaseAutoCompleteLibrary` (2013), `agro`, `equipamento_maven`,
   `pec`; pin this artifact first.
3. **Rewrite the bio:** swap "Angular" for the real work (Node/Nest, React/Next, LLM agent
   infrastructure).

**Why this one and not "make EngineOS public":** opening the repo is bigger in theory, but it is
blocked by an UNKNOWN I cannot resolve — IP/moonlighting clauses (#3) — and it is not mine to give
legal advice on. This artifact crosses 14 days without that decision, and corrects **the most
damaging signal (the pins) in the same move**. Estimated effort 8–12 h, within 20+ h/week even with
one week lost, because the raw material is already written and in production.

**Why it is not reach-dependent:** the artifact needs **one** right person reading it. At 6
followers, a specific and technical repository is findable by search and citable by whoever is
already in the problem. The mechanism is specificity.

### Observable signals of success

1. **Qualified inbound (the deciding signal):** at least **one** contact — issue, comment or DM —
   from someone who **operates an agent setup for a team** (tech lead, staff, platform eng), with a
   question about hook behavior, config precedence or gate order. "Cool repo" does **not** count. One
   such contact at 6 followers **is** success.
2. **A specific type of person engaging:** someone from outside Brazil, or someone from the
   `agentsmd/agents.md` orbit, referencing the artifact.
3. **A query starting to surface him:** searching `Claude Code hooks enforcement` or
   `hooks vs CLAUDE.md compliance` with his name, or searching `ricardofagmer`, returns this artifact
   — and not the 2013 Java fork.
4. **Measurable baseline milestone:** the **first non-zero star** on a repository of his own
   authorship. A low bar, but it would be the first external validation data point in 12 years of the
   account (today: 0 stars on 14 of 14).

---

## What would falsify this

1. **If LinkedIn has a substantive engaged audience** (UNKNOWN #1 — HTTP 999 prevented verifying):
   the channel priority is inverted. LinkedIn becomes primary, TabNews secondary, and Action 3 goes
   from quarterly to monthly. **This is the hole most likely to take down the plan — resolve it
   first, in 5 minutes, by looking at his own logged-in profile.**
2. **If the employment contract forbids publishing derivative work** (UNKNOWN #3): even the hooks
   teardown is blocked. Then only generic writing without a code artifact remains, and the whole plan
   loses the leg that holds it up — because the differentiator *is* the artifact. This is not legal
   advice: check the contract.
3. **If the PRD's 2–10 person team is real** (UNKNOWN #5): internal adoption generates social proof
   faster than any publication, and this external plan drops to second priority. A second human
   using the system is worth more than three articles.
4. **If the "instruction vs. enforcement" thesis saturates by Q4/2026:** it is **already** mainstream
   commentary (Medium Apr 2026; eunomia 2026-07-15). If authors with more credentials occupy the
   space, only the **longitudinal data** survives as an advantage — and if 22 change records turn out
   to be too small a corpus to interest third parties, Action 3 fails and the position does not hold
   up in writing.
5. **If after 3 artifacts in 90 days there is zero qualified inbound:** the central hypothesis — that
   depth beats reach at 6 followers in this niche — is wrong. Pivot: substantive contribution
   **inside** an existing high-traffic repository (issues of `agentsmd/agents.md`), where
   distribution is borrowed instead of built.
6. **If an external adopter appears without any of the actions:** then the bottleneck was never
   perception, but pure visibility (the 404) — and the distribution mode, not this one, has the
   answer.

---

**Confidence: medium-high.**

*High* on STEP 1: the public footprint was verified against primary sources today (GitHub API,
profile, freelancermap), and the 0 stars + push of 2025-10-23 + the 2013 pins are facts, not a
reading. The choice of the *one* most damaging signal is defensible judgment, not measurement.
*Medium* on STEPs 2 and 3: channel behavior and inbound response are predictions; the LinkedIn
UNKNOWN is a real hole in the channel prioritization; and r/ClaudeCode came in through a secondary
source only. It lowers the overall confidence, and that is why falsification #1 comes first.

Nothing here is legal or financial advice; where it touches the employment contract and IP, check
with the contract and with whoever is properly qualified.
