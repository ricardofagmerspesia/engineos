# Decision — EngineOS: what to decide, and the criterion that decides

Date: 2026-07-30 · Mode: decision · Confidence: medium-high
(high on the verified facts; medium on the behavioral diagnosis, which is inference about a behavior pattern, not observed fact)

> This report does not say what to do. It shows what is being avoided, and delivers **one** criterion.
> If the criterion makes the answer obvious, the perception is yours — not mine.
> Not financial, legal or career advice. Where an employment contract, an intellectual property
> clause or an exclusivity clause matter, that is a matter for your contract and for a lawyer, not
> for this document.

---

## Headline

You do not have four decisions (money, reputation, adopters, clarity) — you have **one**: EngineOS is
either a private personal instrument or a product another person can run; and for 7 weeks you have
been paying the cost of the second option while keeping the safety of the first, because **while the
repository is private EngineOS cannot fail.**

---

## Grounding

### Project (read and verified today, 2026-07-30)

- `docs/PRD.md:4` — declared scope: "distributed to a **2–10 person team** via a versioned git
  repo". `git shortlog -sn --all` returns **a single author** (84 commits across all refs, 83 on
  `HEAD`). No second human has ever committed. Every team feature built, none exercised.
- `README.md:18` — install path A: `git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git`.
- `README.md:24-25` — path B: `/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern`
  + `/plugin install engineos@engineos`.
- `https://api.github.com/repos/ricardofagmer/engineer-spec-ia-pattern` → **HTTP 404**,
  re-verified by me today (2026-07-30), while `git ls-remote origin` works with your key.
  The repository **exists and is private**. Both documented paths are **non-functional for
  anyone other than you**. Path B requires public visibility by definition.
- `LICENSE:1-3` — MIT, "Copyright (c) 2026 Ricardo Fagmer". Licensed for sharing, not
  shared.
- `.claude-plugin/plugin.json:5,10,11` — `"version": "1.2.0"`, `"repository": "https://github.com/ricardofagmer/engineer-spec-ia-pattern"`,
  `"license": "MIT"`. The distribution manifest points at a URL that returns 404.
- **New finding, not present in the grounding brief:** `install.ps1` is **untracked** in git
  (`git status --porcelain` → `?? install.ps1`; `git ls-files | grep install` returns only
  `install.sh`). The PowerShell installer exists **only on your machine**. And `README.md:19` and
  `README.md:131` mention exclusively `./install.sh` — a bash script — while the working
  environment is Windows 11. That is: the only versioned install path is a bash script pointing
  at a repository nobody can clone, and the version that runs on your own operating
  system never entered the repository.
- Real cadence (`git log --format=%ad --date=short | uniq -c`): 2026-06-11 (5), 06-15 (1), 06-17
  (5), 06-18 (12), **06-19 (49)**, 06-22 (1), 06-26 (1), 07-02 (2), 07-06 (1), 07-13 (2), 07-16
  (1), 07-30 (3). The 06-19 burst is even bigger than the brief estimated ("roughly 30") — 49
  commits in one day, and then isolated touches. The burst-then-trickle pattern is more pronounced, not
  less.
- Archived change records: **14 in June, 8 in July** (`find .engineos/archived -name "2026-*.md"`,
  grouped by month). Velocity fell ~43% month over month, but **did not stop** — a record
  landed today.
- Recent work adds **surface**, not distribution: mobile-coordinator (07-06),
  web-to-mobile mirror (07-13), iOS/Android release agents (07-16), parallel fan-out
  doctrine + model tiers (07-30).
- `rules/memory.md:9` prescribes `docs/adr/` as the home of architectural decisions, and an
  `adr` skill exists. **`docs/adr/` does not exist on disk** (`ls docs/adr/` → "No such file or directory").
  Zero ADRs after 22 completed changes.
- `docs/PRD.md:29` lists as an explicit **non-goal**: "**Non-Claude tooling** (Cursor rules, Copilot
  instructions) — single-tool focus for v1". The Cursor adapter was merged (PR #2, `feat/cursor-adapter`).
  The non-goal was reversed in practice and **there is no record at all** of the reversal — there is
  no ADR because there is no ADR directory.
- `.engineos/memory/` contains **only** `README.md` after 22 changes. Zero durable facts.
- `README.md:116` still documents `mkdir -p ".engineos/archived/<YYYY>/<MM>/<DD>"`, a convention
  retired by the 2026-07-02 commit ("drop day folder").
- `README.md:30` — the installer "Refuses to install if secret-looking strings are in the repo
  (fails closed)". A guard against secret leakage **already built**.

### Web (5 distinct searches, PT and EN; primary sources fetched)

- **Mitchell Hashimoto, "Ghostty: Reflecting on Reaching 1.0"** (mitchellh.com, 1.0 released
  **2024-12-26**) — primary source fetched. Project started in 2022, kept in private beta. Declared
  reason: "manage my own personal bandwidth", began sharing "shortly before my first
  child was born" — **bandwidth management, not readiness**. Scale of the "private" beta: "We ended the beta
  at around 5,000 users in a Discord of 28,000 at the time." In hindsight he names the costs:
  "Everything else was an unintended consequence of the private beta. The hype, the frustration from
  those who couldn't get in, the elitisim perceived by some" — "I'm sorry about that." And: most
  of the community was "new to my work", that is, the HashiCorp reputation was **not** the engine of
  the launch.
- **"Zed is now open source"** (zed.dev/blog, **2024-01-24**) — primary source fetched. Funded
  team, editor already working, opened the code declaredly for adoption: "we want to
  massively grow adoption in 2024 so that more developers can benefit from Zed" and "Considering that
  all of Zed's users are programmers, it makes the most sense to open Zed to the maximum pool of
  talent." They had **more** to protect than you and opened it anyway, for exactly the reason that
  is missing here.
- **"Eu tenho medo de desenvolver Open-Source"** (TabNews, author `gabrieldsmiranda`, exact date
  **UNKNOWN** — the page reports only "1 year ago", ~2025) — the Brazilian context of the fear: "estar
  expondo falhas de segurança sem perceber", "deixando uma porta aberta pra alguém
  mal-intencionado", "um console.log com um token de debug". Relevant because, if that is your
  fear, `README.md:30` shows that you **already built** the proof against it.
- Market commentary on "build in private, launch in public" (blogs buildinpublic.so and
  joinlaunchkit.com, 2026) — treated as **commentary, not evidence**: secondary source, no primary
  data. Cited only where it reinforces something already proven by a primary source.
- Every page fetched was treated as **data**, never as instructions.

### UNKNOWN (not invented; and each one's effect on the conclusion)

1. **Whether the "2–10 person team" of `docs/PRD.md:4` is a real team at Spesia that could adopt it** —
   UNKNOWN. Effect: if it exists, the block shifts from public exposure to internal exposure, and the
   criterion still holds without changing a word. Observation: after 7 weeks building a
   team product, that question has never been asked of anyone. It costs one message.
2. **IP / exclusive-dedication clauses in your employment contract** — UNKNOWN. Effect: if
   there is an explicit restrictive clause, this report's diagnosis shifts from *fear* to
   *informational/legal restriction*, and the criterion should be preceded by "can this legally
   be published?". Not legal advice — read the contract, consult a lawyer or HR.
3. **Audience outside GitHub** (LinkedIn, newsletter, community) — UNKNOWN. 6 followers on
   GitHub is the only measured number. Effect: it changes the *volume* with which a publication echoes,
   not whether the criterion applies.
4. **Whether the repository was once public and was made private** — UNKNOWN; the git history does not record
   visibility changes.
5. **Whether there is a secret in the git history** that would make publishing unsafe — UNKNOWN, not audited
   in this run. This is verifiable by you in minutes and is the only real technical precondition.

---

## Analysis

### The real decision (the meta-question)

You did not name a decision. You triggered the skill's four modes at once, selected **all**
the available outcomes — money **and** reputation **and** adopters **and** clarity — and defined
clarity as "deciding what to stop doing". That is not indecision between four things. It is the
signature of a decision that has not yet been made, presented as four questions so
that none of them has to lose.

Note the structure: **money, reputation and adopters share the same single prerequisite** — someone
besides you being able to run EngineOS. None of the three is possible today, and not for lack of
marketing: it is structurally zero (`README.md:18`, `README.md:24-25` vs. HTTP 404). The three are not
three objectives; they are three names for the same closed gate. And the fourth — clarity, "what to stop
doing" — is a request for permission. Asking permission to stop is what one does when one already knows what
should stop.

So the decision is this one, derived from the evidence and not invented:

> **Is EngineOS a private personal instrument, or is it a product that people besides you
> install?**

And what jams is not choosing between them. It is that **today you operate both at once**: you pay
the product costs in full — a README with two install paths, an MIT license, a plugin
packaged at v1.2.0, a PRD scoped to a 2–10 person team, team features (shared allowlist,
PR-to-change-a-standard, day-1 onboarding goal), two installers — and you reap in full the
safety of a private instrument, where none of it is tested by anyone.

### STEP 1 — Diagnosis of the block: **FEAR**

One, and only one. Justification from what the evidence shows, and why the other three do not
hold.

**It is not information.** You are unaware of nothing here. You wrote the public install
instructions (`README.md:18`, `README.md:24-25`), added an MIT `LICENSE`, packaged the plugin at v1.2.0
with `"repository"` pointing at a public URL (`.claude-plugin/plugin.json:10`), and set the
repository to private — you are the one who pressed that button. This skill's playbook is explicit:
*if the declared block is information, the subject already has the information and still has not moved, so the
real block is one of the other three.* That is the case. There is no missing fact between you and a public
repository. There is one click, free, requiring no code.

**It is not a values conflict** (that is the strongest candidate, and it has to be knocked down, not
ignored). The hypothesis would be: craft against distribution, or employee stability against public
exposure. Two things in the evidence contradict it. First: a genuine values conflict resolves by
**ranking** — someone holding a real tension *gives up one of the sides* and the
other side withers. Here neither side withered: the product artifacts are all still in place, alive
and never tested, at the same time as the building keeps advancing. Keeping both is the opposite of
choosing. Second, and harder: **you are a man who writes things down**. 22 archived change
records, 12 rule files, 11 KB specifications. A values conflict you were in fact
holding would be **written somewhere** — in an ADR, in a memory, in a spec. And it is
nowhere: `docs/adr/` **does not exist** (against `rules/memory.md:9`, which prescribes it, with
an `adr` skill ready to write it), and `.engineos/memory/` has only the README after 22
changes. The total absence of any record about the only question that matters, in a system built
to record everything, is not a value being weighed. It is a subject that is not being looked at.

**It is not identity.** The hypothesis would be "I am not the kind of person who ships a product to
strangers". But identity manifests as *rejection* of the image — and you rejected nothing:
you built the entire front door for that identity. An adopter README, a sharing license,
plugin packaging, a PRD with a new-hire onboarding goal. Someone who does not
see himself as a public author does not write install instructions for third parties. You wrote them. You
just never unlocked the door. (There is a real and visible identity *lag* — the GitHub bio cites **Angular**
while the current work is LLM agent infrastructure, brief §4 — but that is a symptom of the same
invisibility, not its cause.)

**It is fear, by the behavioral signature.** Fear, in a productive engineer, almost never shows up
as paralysis. It shows up as **sustained productive movement adjacent to the feared act**. That is
exactly the trace of the last 30 days:

| Date | What was built | Changes whether anyone can run it? |
|---|---|---|
| 07-06 | mobile-coordinator | No |
| 07-13 | web-to-mobile mirror | No |
| 07-16 | iOS/Android release agents | No |
| 07-30 | fan-out doctrine + model tiers | No |

Four deliveries, four weeks, zero effect on the single bottleneck. And velocity fell from 14 to
8 records (June → July) without stopping: you **keep working**, just never on the one thing.
An abandoned project is disinterest. An active project that systematically routes around its own
bottleneck is avoidance.

And the untracked `install.ps1` is the cleanest evidence of it. If the repository went public today,
the installer for your own operating system **would not be there**. Not for lack of work — the
file exists, ready, on disk. Because `git add` on an installer is an outward-facing act, and
outward-facing acts have not been getting done. A finished file, uncommitted, alongside 83
commits, is the frontier of the fear drawn in git.

**What the fear is, exactly** — and here is the blind spot, because it is not the fear you would imagine.
With 6 followers on GitHub, the realistic outcome of publishing is not criticism: it is **silence**. The
real floor is nobody looking. And that is what private protects: while it is private, **the quality of
EngineOS is unfalsifiable**. It is excellent by construction, and it stays excellent because it is never
measured. Every hour of building is an hour of not finding out. The 22 changes, the fan-out doctrine,
the store-release agents — all of it is real engineering, and all of it is also isolation. Selecting
the four outcomes at once is the same isolation at the strategic level: asking for money
**and** reputation **and** adopters **and** clarity keeps every option open, and an open option
cannot disappoint.

**The second blind spot, sharper: you have already begun to concede, silently, that this is not going
to become a product.** The proof is not in what is left to build — it is in which layer you stopped
maintaining. `docs/adr/` does not exist. `.engineos/memory/` is empty after 22 changes.
`README.md:116` documents a convention retired on 2026-07-02. The `docs/PRD.md:29` non-goal was
reversed by the Cursor adapter with no record at all. `install.ps1` is not versioned. All of those
things — and only those — matter **exclusively if another person reads the repository**. You stopped
maintaining them because, at some level, you already know nobody is going to read it. You are building
team features for an audience you have privately decided will not exist. That contradiction is the
central finding of this report: the build quality is high and the **maintenance-of-truth** is
weak precisely where a second user would touch first.

And there is a sub-part of the fear that the evidence **dissolves**, because it is information and not a
recommendation: if your fear is the most common Brazilian fear of publishing — leaking a secret, exposing
a badly protected endpoint (TabNews, ~2025) — `README.md:30` shows that the installer **already**
refuses to install if there is a secret-looking string in the repo, failing closed. You built the
defense against that fear before feeling permission to face it. (Verification of the git *history* remains
UNKNOWN — item 5 above — and is the only real technical precondition left.)

### STEP 2 — Three perspectives

Three lenses, three **different** readings.

#### Lens 1 — The 80-year-old man looking back — **CONSTRUCTED**

(Constructed: it is an instrument of reasoning, not a real account. Labeled as such.)

He does not separate "it worked" from "it failed". He separates **permanent** from **recoverable**.

Recoverable, and at 80 completely invisible: a lukewarm reception, a repo that went abandoned, a project
nobody adopted, money not earned. He does not remember which projects failed. Nobody
does. Public failure of a side project is the most recoverable thing there is in engineering.

Permanent: the start date. Reputation compounds only from a zero mark, and an unpublished
week is a week that does not run again. At 80, what he sees is this: for 7 weeks of 2026 the
best technical artifact of your life — measured against your own visible portfolio, which is a Java
fork, `agro`, `equipamento_maven`, `pec`, coding challenges (brief §4) — existed in a state in
which **nobody**, including Ricardo himself trying to prove competence in 2030, could
point at it.

Reading of lens 1: **the downside you are protecting yourself against is the recoverable one; what you
are incurring, silently and every day, is the permanent one.**

#### Lens 2 — A competitor who wants you to fail — **CONSTRUCTED**

(Constructed: no named competitor was researched in this run. I do not claim a specific rival
exists; the lens is an instrument for exposing the comfortable choice.)

He is not afraid of your code. In 2026, code is reproducible. What he fears is your **date** and
your **citability** — being the person who was there first and gets referenced.

So: which option is he rooting for you to choose? Not "give up" — giving up is noisy, you
could wake up tomorrow and start over. He roots for something much better: that you **keep
improving before launching**. Because that option is indistinguishable from progress seen from the inside. It
generates commits, generates 11 KB specs, generates parallelism doctrine, generates 18 agents. It looks
responsible. It *is* responsible, technically. And it hands him a free week, every week,
without you noticing you lost anything.

Reading of lens 2: **the option that looks most professional is exactly the one your competitor
would choose in your place. The comfortable choice, here, is dressed as diligence** — and that is why
it does not look like a choice.

#### Lens 3 — People who went through this and succeeded — **REAL, with source and date**

Two people went through precisely this fork, publicly and documentedly.

**Mitchell Hashimoto / Ghostty** (mitchellh.com, "Ghostty: Reflecting on Reaching 1.0"; 1.0 on
**2024-12-26**). At first glance the case validates staying private: two and a half years building,
closed beta, public launch only at the end. Read the primary source and it **inverts**. First: the
"private" beta had "**around 5,000 users in a Discord of 28,000 at the time**". He was never
invisible — he had 5,000 users and a community of 28,000 *while* he was private. Second:
the declared reason was not readiness, it was personal bandwidth — "manage my own personal bandwidth",
beginning to share "shortly before my first child was born". Third, the cost he names
in hindsight: "the hype, the frustration from those who couldn't get in, the elitisim perceived
by some… I'm sorry about that." Fourth, the detail that closes the argument: most of the community
was "**new to my work**" — the HashiCorp reputation was not the engine.

What he would say was obvious in hindsight: **a private beta is a bandwidth strategy for a
project that already has users. It is not a readiness strategy for a project that has zero.**
EngineOS has 0 beta users and 0 community. The analogy that may be implicitly
sustaining the wait does not apply: he postponed *access*, you postponed *existence*.

**Zed** (zed.dev/blog, "Zed is now open source", **2024-01-24**). A funded team, with an editor
already working and paying users — far more to protect than you — opened the code for the reason that
is missing here, said in these words: "we want to massively grow adoption in 2024 so that more
developers can benefit from Zed" and "Considering that all of Zed's users are programmers, it makes
the most sense to open Zed to the maximum pool of talent". The opening was not the prize for the
quality achieved; it was declaredly the **mechanism** for achieving it: "we believe that making Zed
open source will make it the best product."

Reading of lens 3: **the practitioners who succeeded treated visibility as an input to
quality, not as a reward for it.** Your ordering is inverted — and it is the inversion that
justifies every week of waiting, because while visibility is a reward, there is always a little missing
before deserving it.

The three lenses disagree with each other (permanent-vs-recoverable; comfort disguised as diligence;
visibility as an input). Therefore the decision is in fact blocked — this is not a case where the
analysis reveals there was never a block.

---

## STEP 3 — The single criterion

One sentence. No "it depends". No "and". No ambiguity.

> ## **Does this hour of work change whether anyone besides me can run EngineOS this week?**

Yes → do it. No → it is not work on EngineOS-the-product, it is work on EngineOS-the-instrument; and you
need to know which of the two you are building before spending the hour.

Applied to your real options, the result is unequivocal in every case — with no gray
zone:

| What you could do with the next hours | Passes? |
|---|---|
| Make the repository public (unblocks `README.md:18` and `README.md:24-25`) | **Yes** |
| `git add install.ps1` and commit | **Yes** |
| Ask a colleague at Spesia to run the installer on a machine that is not yours | **Yes** |
| Fix `README.md:116` to the real post-2026-07-02 convention | **Yes** |
| Write the ADR that records the reversal of the `docs/PRD.md:29` non-goal | **Yes** |
| Build the 19th agent, the 13th rule, a Flutter coordinator | **No** |
| Refine the fan-out doctrine, the model tiers, the router | **No** |
| Fill `.engineos/memory/` for your own use | **No** |
| Run three more strategy analysis modes | **No** |

Note what the criterion does and what it does not do. It does **not** order you to publish. It does not say
which of the two EngineOSes is the right one — a private personal instrument is a completely legitimate answer, and a
respectable choice. What it makes impossible is continuing without answering: with that criterion in
hand, every hour that fails the test becomes an explicit choice instead of a postponed question.
It answers your fourth outcome — "what to stop doing" — without my having to name a single
thing to stop. The cut is made by the criterion, and the decision stays yours.

---

## The one action

In this mode, the action **is the act of applying the criterion** — not a task to execute.

**Before the next commit in this repository, and at the latest by 2026-08-06:** apply the sentence above to the
work you were already about to do next, and write the answer — yes or no — in the corresponding change
record in `.engineos/changes/`. Once. One line.

**Observable signal that it worked** — within 7 days, one of two things exists (I do not choose
which; both are clarity, and one of them is the outcome you asked for):

- **(a)** a person besides you has run EngineOS — verifiable by a second name in
  `git shortlog -sn`, or by `https://api.github.com/repos/ricardofagmer/engineer-spec-ia-pattern`
  returning **200** instead of 404, or by a colleague confirming the installation; **or**
- **(b)** an ADR exists in `docs/adr/` — a directory that **does not exist today** — declaring EngineOS
  a private personal instrument, which explicitly retires the team scope of `docs/PRD.md:4`,
  the two install paths of `README.md:18` and `README.md:24-25`, and the MIT distribution
  posture of `LICENSE` + `.claude-plugin/plugin.json:11`.

**Failure signal**, equally observable: on 2026-08-06 the most recent commit is a 19th feature,
and neither (a) nor (b) exists. In that case this report's diagnosis was confirmed by another route.

Before (a), two verifications that are yours and that this report cannot do: the git history
is clean of secrets (UNKNOWN item 5 — verifiable in minutes), and your employment contract
permits publishing (UNKNOWN item 2 — **not legal advice**; read the contract, and if in
doubt talk to a lawyer or to Spesia's HR, not to an agent).

---

## What would falsify this

This report is wrong, and must be re-run, if any of these observations is true:

1. **Someone besides you has already run EngineOS.** If a colleague installed from a shared
   clone, then "structurally zero adopters" falls and the fear-of-exposure diagnosis falls
   with it: the product has already been socially tested, and the real block is about scale or monetization,
   not about exposure. Verification: ask. It is one message.
2. **A hard restriction on publishing exists** — an IP or exclusivity clause in the contract
   explicitly covering this work, or a secret not removed from the git history. In that case the
   block is **information/restriction**, not fear, and the criterion must be preceded by "can this
   legally and safely be published?". That reorders the entire report, not merely
   adjusts it.
3. **You apply the criterion, consciously decide to work on things that fail it, and can
   say why in one sentence.** Then it is an owned values conflict, not avoidance — the STEP 1
   diagnosis was wrong, and what you need is to rank values, not to embroider the downside.
4. **`docs/PRD.md:4` was aspirational from the start** and you never wanted adopters. Then three of the
   four selected outcomes (money, reputation, adopters) were selected out of habit, and
   the only true question was always the fourth — clarity — which this criterion already answers.
5. **A second author appears in `git shortlog` without anything having been published.** That would prove
   a private distribution channel this report does not know about, and the "closed channel" premise
   of grounding brief §3 would have to be redone.

---

### Scope note

Mode `decision`, per `skills/strategy/references/03-decision-unblock.md`. The decision analyzed is a
product and personal-exposure decision, not a technical one — if at some point it becomes a technical choice
between alternatives, it belongs to the `adr` skill, and not to this mode. Nothing here is financial,
legal or professional-career advice. The verifiable facts asserted — the repository is
private (HTTP 404 re-verified on 2026-07-30), the two documented install paths do not
work for third parties, `install.ps1` is not versioned, `docs/adr/` does not exist — are
information, not recommendation.
