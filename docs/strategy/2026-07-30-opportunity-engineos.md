# Opportunity — EngineOS as a product

Date: 2026-07-30 · Mode: opportunity · Confidence: medium

> Not financial or legal advice. These are strategic framings based on dated
> sources and on files in this repository.

## Headline

The *rules* layer EngineOS built is already a first-party commodity (Anthropic
shipped `.claude/rules/` with `paths:` on 2025-12-10, six months before this repo's first commit
on 2026-06-11), but on 2026-03-04 Anthropic shipped the `InstructionsLoaded` hook and
**zero of the 2,283 plugins in the official community catalog mention that hook** — conformance
evidence ("which standards actually governed this change") is the only empty space
that the owner's already-proven competence can reach in 7 days.

## Grounding

### Project (files read in this repo)

- `CLAUDE.md:31-33` — the router declares that the stack/domain rows are mirrored
  deterministically by the `PreToolUse` hook `hooks/route-before-change.sh`, whose canonical
  map is `hooks/routing-map.sh`.
- `hooks/hooks.json:14-24` — `PreToolUse` with matcher `Edit|Write` → `route-before-change.sh`.
- `hooks/hooks.json:40-53` — `Stop` gate → `stop-verify.sh` + `record-verify.sh`.
- `hooks/routing-map.sh:1-6` — file declared authoritative for routing by path pattern.
- `.claude-plugin/plugin.json:5` — `"version": "1.2.0"`; `.claude-plugin/marketplace.json:12`
  — `"version": "1.0.0"`. **Version drift between the two manifests of the same plugin.**
- `.claude-plugin/plugin.json:10` — `repository` points at the private repo (public 404,
  brief §3).
- `README.md:18` and `README.md:24-25` — the two documented install paths
  (`git clone` over SSH and `/plugin marketplace add ricardofagmer/...`), both inoperative for
  third parties (brief §3).
- Measured today: 13 `rules/*.md` files = **492 lines in total**; `CLAUDE.md` = **85 lines**;
  **there is no `AGENTS.md`** at the root; **there is no `.claude/rules/` directory** (only
  `.claude/settings.local.json`).
- `.engineos/archived/2026/06/17` and `.../06/19` (day folders) coexist with
  `.engineos/archived/2026/07/{docs,general,mobile}` (grouping by domain) — materially
  confirms the convention drift of brief §5.4.
- The 6 hooks cover `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`
  (`hooks/hooks.json:1-56`). **`InstructionsLoaded` is not used.**

### Web (source — title, publisher, date — what it proved)

1. **code.claude.com/docs/en/memory** (Anthropic, docs, accessed 2026-07-30) — "Claude Code
   reads `CLAUDE.md`, not `AGENTS.md`"; memory scopes including *managed policy*
   (`/Library/Application Support/ClaudeCode/CLAUDE.md`, `/etc/claude-code/CLAUDE.md`,
   `C:\Program Files\ClaudeCode\CLAUDE.md`) and the `claudeMd` key in `managed-settings.json`;
   `.claude/rules/` with `paths:` frontmatter; and the explicit tip to use the
   `InstructionsLoaded` hook "to log exactly which instruction files are loaded, when they load,
   and why".
2. **registry.npmjs.org/@anthropic-ai/claude-code** (npm registry, queried 2026-07-30) —
   primary publication dates: **v2.0.64 = 2025-12-10** (changelog entry "Added
   support for .claude/rules/"), **v2.1.69 = 2026-03-04** (entry "Added `InstructionsLoaded`
   hook event that fires when CLAUDE.md or `.claude/rules/*.md` files are loaded into
   context"), **v2.1.33 = 2026-02-06** (agent teams research preview), **v2.1.178 =
   2026-06-15** (agent teams simplified), **v2.1.219 = 2026-07-24** (Opus 5 default, 1M
   context, fast mode at $10/$50 per Mtok).
3. **anthropics/claude-code issue #23478** (GitHub, created 2026-02-05, **closed as not
   planned**) — rules with `paths:` load only on *Read*, not on *Write*; file-creation
   conventions are silently ignored; the community workaround is a `PostToolUse`
   hook.
4. **anthropics/claude-code issue #6235** (GitHub, opened 2025-08-21, **still open**, no
   assignee) — request for AGENTS.md support in Claude Code.
5. **code.claude.com/docs/en/plugins** (Anthropic, docs, accessed 2026-07-30) — there are two
   public marketplaces: `claude-plugins-official` (curated, "There is no application
   process", inclusion "at Anthropic's discretion") and `claude-community`
   (`anthropics/claude-plugins-community`, where third-party submissions land after
   review). Submission by **individual authors outside a Team/Enterprise org** via
   `platform.claude.com/plugins/submit`. `claude plugin validate ./your-plugin` runs the same
   check as the pipeline; approved plugins are pinned to a commit SHA and the public catalog
   syncs **nightly**.
6. **code.claude.com/docs/en/plugin-marketplaces** + **support.claude.com art. 13837433**
   (accessed 2026-07-30) — for a marketplace distributed via *Organization settings >
   Plugins*: "The marketplace repository must be private or internal" / "public repos aren't
   allowed for organization marketplaces"; read via the Claude GitHub App or GHE App; requires a
   Team/Enterprise plan and Cowork + Skills enabled in the org.
7. **anthropics/claude-plugins-community/.claude-plugin/marketplace.json** (measured
   directly on 2026-07-30) — **2,283 plugins**. Search over name+description: 193 mention
   `hook`; 30 mention audit trail/provenance/attestation; **0 mention
   `InstructionsLoaded`**. Direct competitors already listed: `dod-guard` ("Definition of Done
   as an executable barrier for Claude Code. Stops AI agents from declaring tasks done…"),
   `agentops` ("Enterprise guardrails, delivery lifecycle… 7 security layers"), `kauri`
   ("Deterministic decision records for agents and humans"), `genesis-governance-claude`,
   `mo-es-governance`, `carryall-policy-enforcement`, `civic`, `memoriant-llm-gateway-skill`.
   No entry called `engineos`.
8. **github.com/anthropics/claude-plugins-official** (accessed 2026-07-30) — **32.9k stars**;
   accepts external plugins in `/external_plugins`; official directory launched **2026-05-22**
   (TechTimes, 2026-05-25).
9. **Endor Labs, "Introducing Coding Agent Governance: Using Hooks to Bring Visibility to the
   ADLC"**, Robert Haynes, published **2026-05-12**, updated **2026-07-22** — `endorctl
   ai-audit claudecode` wired to six hook events (SessionStart, UserPromptSubmit,
   PreToolUse, PostToolUse, PostToolUseFailure, Stop), with deterministic policy and a forensic
   trail in SIEM: "a forensic record of what the agent did, on whose machine, against which
   repo".
10. **Torii, "8 Tools to Track and Govern Claude Code Extensions in 2026"**, published
    **2026-06-16** — eight vendors (Torii, Zenity, Pillar Security, Reco, Prompt Security,
    Lasso Security, Nudge Security, Wing Security). All of them govern **actions, identity and
    data** (MCP allowlists, injection, OAuth, DLP, shadow-LLM). None governs conformance to
    engineering standards.
11. **Anthropic Compliance API** (platform.claude.com/docs/en/manage-claude/compliance-api) +
    **Help Net Security, "Anthropic adds 28 security and compliance integrations for Claude",
    2026-05-25** — released on 2026-05-21; per-event logs of prompt/response/attachment for
    SIEM/DLP/identity.
12. **Council of the EU, "Artificial Intelligence: Council gives final green light to simplify
    and streamline rules"**, consilium.europa.eu, **2026-06-29** — Digital Omnibus on AI;
    Parliament adopted it 2026-06-16; act signed 2026-07-08; postpones high-risk obligations.
13. **artificialintelligenceact.eu/implementation-timeline** (accessed 2026-07-30) — on
    **2026-08-02** the rest of the AI Act starts to apply **except Art. 6(1)**, which moves to
    **2027-08-02**.
14. **Presidio Achieves ISO/IEC 42001 Certification**, GlobeNewswire, **2026-07-15** —
    certification framed as a commercial enabler: "Supports vendor evaluations and
    security reviews as more businesses add AI governance to their buying criteria".
15. **Linux Foundation press release** + **TechCrunch**, both **2025-12-09** — formation of the
    Agentic AI Foundation (AAIF) with MCP (Anthropic), AGENTS.md (OpenAI) and goose (Block).
    **agents.md** (accessed 2026-07-30) — 60,000+ repos, 20+ tools.
16. **github.com/buildermethods/agent-os** + **buildermethods.com/agent-os** (accessed
    2026-07-30) — 5.1k stars, 812 forks, v3, free and open source, "injecting your codebase
    standards"; works with Claude Code, Cursor, Antigravity. **No hooks, no subagents, no
    audit/compliance.** The author's monetization is through paid courses and membership, not
    through the OSS.
17. **Anthropic, "Technical Specialist, Claude Code"** (job-boards.greenhouse.io/anthropic/
    jobs/5198999008, accessed 2026-07-30) — London, **£180,000–£225,000**; explicit
    responsibility to drive adoption of "sub-agents, skills, hooks, MCP, headless mode, managed
    settings" and to build "Claude Code plugins, agents, and MCP integrations as customer
    deliverables".
18. **news.cognizant.com, 2026-07-27** — Cognizant/Anthropic expand their partnership; Claude Code
    embedded in the **Spec-Driven Development** module of Flowsource™; 30,000+ employees
    trained on Claude.
19. **2pc.com.br** (accessed 2026-07-30) — Brazilian boutique (São Paulo/Miami, PT+EN) that
    already sells "Spec-Driven Development from scratch — foundation, constitution, PRDs and ADRs as
    persistent context for Claude Code"; claims 80+ companies with critical systems.
20. **Alura, "Engenharia de software na era da IA: context engineering, workflows e controle de
    custo"** (accessed 2026-07-30, **updated 2026-07-24**) — 10h, in Portuguese, covers the
    context window, sub-agents/teams, caching. **Does not cover** CLAUDE.md, AGENTS.md, rules,
    hooks or team standards.
21. **PL 2338/2023** (Senate, telesintese.com.br) — approved in the Senate on **2024-12-10**;
    report/vote in the Chamber of Deputies scheduled for 2026-05-19/2026-05-27; senator Eduardo Gomes
    states it may slip to **2027**. **Not law as of 2026-07-30.**

### UNKNOWN (and how it would change the conclusion)

- **Primary number of ISO/IEC 42001 certificates worldwide.** I only found secondary sources
  ("350+ in April 2026"). There is no citable primary ISO survey. → If the real number is much
  smaller, Movement 3 loses its "purchased requirement" force and becomes an "announced
  requirement", and the urgency of conformance evidence drops from 2 to 4+ quarters.
- **Publication date of the Anthropic job posting** (the job board does not expose it). → If it is
  old (2025), the hiring signal is weaker than it appears.
- **Whether any of the 8 vendors in the Torii article already delivers conformance to
  engineering standards** (I audited the descriptions, not the complete documentation of the 8
  products). → If one already delivers it, the Movement 1 window is closed and the recommended
  action loses its point.
- **Whether the 2–10 person team of `docs/PRD.md:4` actually exists at Spesia** (brief §6). → It is
  the variable that decides whether the strong success signal ("a receipt generated on a machine
  that is not his") is reachable in 14 days or not.
- **Audience controlled by the owner outside GitHub** (brief §6). Only 6 followers measured. → If
  an audience exists, catalog submission stops being the only channel; if none exists, it is
  the only channel and the signal must be measured there.
- **IP/moonlighting clauses of the current employment** (brief §6). → It makes public a repo that
  today is private; that is his contractual decision, not my recommendation, and it is a blocking
  precondition of the action.
- **Real rate of hook adoption across teams** — I only found qualitative statements, no
  survey with a number. → If hooks are already a market standard, the differentiator shrinks.

---

## Analysis

### STEP 1 — Three emerging movements

#### Movement 1 — The hook became the agent-audit primitive, and the "conformance to standards" half is unoccupied

**What is changing (dated fact).** Commercial security vendors have started
instrumenting Claude Code through hooks, not through prompts. Endor Labs published on **2026-05-12**
(updated **2026-07-22**) the wiring of `endorctl ai-audit claudecode` to six hook events,
turning the agent into "governed systems with deterministic policy, centralized audit, and
defense in depth", with streaming to SIEM. By **2026-06-16** there was already an article mapping
**eight** vendors in that niche (Torii). All eight govern **what the agent did** —
shell commands, sensitive files, MCP allowlists, OAuth scopes, DLP. None governs **which
standards the agent was instructed with**.

**Why NOW (specific trigger, two parts in the same quarter).**
1. On **2026-03-04** (v2.1.69, npm publication date) Anthropic shipped the
   `InstructionsLoaded` event, which fires when `CLAUDE.md` or `.claude/rules/*.md` enter the
   context. Before that, "the agent followed the team's standards" was an
   **unfalsifiable** claim; after it, it is a log event.
2. On **2026-02-05** issue #23478 was opened and it was **closed as *not planned***: rules
   with `paths:` load on *Read* and **not** on *Write*. Anthropic gave the observability
   primitive and, in the same quarter, explicitly declined to close the *enforcement* gap
   at file creation — which means a `PreToolUse` hook with an `Edit|Write` matcher
   is not redundancy with the native product, it is the supplement Anthropic itself
   said it will not build.

**The window that opens.** Emitting, per change, a machine-readable artifact that answers
"which rules were loaded, which gates ran, what was produced" — exactly the
question a procurement questionnaire asks (see Movement 3) and that none of the eight
vendors answers. That was not possible 12 months ago because the event did not exist.
**Closing horizon: ~2 quarters.** Endor Labs already has the six hook events plumbed and
the SIEM pipeline; adding "were the required rules loaded?" is a feature on top of existing
infrastructure, not a new product.

**Falsifier.** Any of the eight vendors (or Anthropic, via the Claude Code Analytics
API) publishing an *instruction-adherence* report — not only a security-policy one — before
~Q1/2027. Or issue #23478 being reopened and implemented, making the `Edit|Write` gate
native.

---

#### Movement 2 — Agent-configuration distribution bifurcated: the public channel saturated and the channel with value now *requires* a private repository

**What is changing (dated and measured fact).** I measured the official community catalog on
**2026-07-30**: `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` has
**2,283 plugins**. There is a direct analogue already listed for almost every EngineOS component —
`dod-guard` for the "done" gate, `kauri` for decision records, `agentops` for lifecycle
guardrails, `genesis-governance-claude`/`mo-es-governance` for "constitution". In parallel,
Anthropic's documentation (accessed 2026-07-30) establishes that a marketplace distributed
via *Organization settings > Plugins* **has to be private or internal**: "public repos aren't
allowed for organization marketplaces", read via the Claude GitHub App, on a Team/Enterprise plan.

**Why NOW (default inverted, in a single quarter).** On **2026-05-22** Anthropic
launched the first-party official directory (`anthropics/claude-plugins-official`, **32.9k
stars** today), explicitly **with no application process** — "Anthropic decides which plugins
to include at its discretion". In the same period the third channel consolidated, the organization
one, with the requirement **opposite** to that of the public channel. That is: since ~May 2026 there are
three legitimate channels with incompatible visibility rules — the community one (public, saturated,
automated review, nightly sync), the official one (curated, no front door) and the corporate one
(**private mandatory**, with admin sync).

**The window that opens.** The finding that reframes brief §3: **being private is not the defect, it is
the requirement of the only channel where the artifact still has a price.** What 12 months ago was "publish
on GitHub and wait for stars" splits today into two different bets — reputation (public channel,
already saturated) and revenue (private organization channel, with a plan gate and an admin gate).
Choosing both at once is impossible for the same marketplace repository. **Horizon: 1–2
quarters** until the community channel goes from saturated to noisy enough that a listing
means nothing (it is already close to that at 2,283 entries).

**Falsifier.** Anthropic starting to allow public repositories in organization marketplaces
(unifying the channels), or the community catalog gaining real curation/ranking that
returns discovery value to the public listing.

---

#### Movement 3 — The regulatory deadline everyone priced in was postponed; the real buyer became the procurement questionnaire

**What is changing (dated fact).** The Digital Omnibus on AI was adopted by Parliament on
**2026-06-16**, received the Council's final green light on **2026-06-29** and the act was signed on
**2026-07-08**, postponing high-risk obligations. The official timeline (accessed 2026-07-30)
records that on **2026-08-02** the rest of the AI Act applies **except Art. 6(1)**, pushed
to **2027-08-02**. In Brazil, PL 2338/2023 was approved in the Senate on **2024-12-10** and remains
without a final vote in the Chamber of Deputies — the report/vote scheduled for May 2026 did not conclude and
there is a statement that it may slip to **2027**.

**Why NOW (two dated events pointing in opposite directions within 7 days).** On
**2026-07-08** the EU signed the removal of the high-risk deadline. On **2026-07-15** a vendor
published an ISO/IEC 42001 certification justified as a commercial enabler: "Supports vendor
evaluations and security reviews **as more businesses add AI governance to their buying
criteria**". And on **2026-05-21** Anthropic itself launched the Compliance API with 28 security/compliance
integrations. Buying pressure **migrated from the regulator to the customer** — and the rest
of the market keeps selling urgency based on a deadline that stopped existing.

**The window that opens.** Selling evidence to the **vendor questionnaire**, which is alive
today, instead of to a deadline that is now 2027-08-02. Important: the Compliance API logs
**prompt, response and attachment** — usage activity. It does **not** log which engineering standard
governed the change. That is the concrete, dated gap. **Horizon: until ISO 42001 audit
checklists standardize what counts as "AI-assisted SDLC control"** — the certification bodies
are scaling now, and from then on the right answer becomes prescribed and commoditized.
Estimate: 2–4 quarters, with the caveat of the UNKNOWN about the real number of certificates.

**Falsifier.** The EU reinstating the August 2026 date for high risk; or corporate
security questionnaires stopping asking about the audit trail of AI-written code; or
Anthropic extending the Compliance API to cover instruction adherence (which would solve the
problem first-party).

---

#### Cut for already being mainstream (declared, per the mode's rule)

- **"AGENTS.md vs CLAUDE.md / convergence between tools".** A real and verified fact (Anthropic
  docs, 2026-07-30: "Claude Code reads `CLAUDE.md`, not `AGENTS.md`"; issue #6235 open
  since 2025-08-21; AAIF formed on 2025-12-09; 60,000+ repos). **But it is saturated blog
  literature** — the search returns dozens of "AGENTS.md 2026" guides from February to May 2026.
  No timing advantage. Cut.
- **"Context engineering as a new discipline".** Cut: it already has a Gartner definition, salary
  data on ZipRecruiter (July 2026), job listicles and — decisive for the Brazilian
  case — a **10h Alura course in Portuguese updated on 2026-07-24**. It is keynote material, not a
  window.
- **"Brazil is behind, there is a language gap to exploit".** Cut **because the evidence
  falsifies it**: Alura has already published the content in Portuguese (2026-07-24); **2pc.com.br** (São
  Paulo/Miami) already sells exactly "Spec-Driven Development from scratch — foundation,
  constitution, PRDs and ADRs as persistent context for Claude Code"; and Cognizant embedded
  Claude Code in Flowsource's Spec-Driven Development module on **2026-07-27** with 30,000+
  people trained. The Brazilian market is not an empty space — it is a space already occupied by
  those with a brand and salespeople. (Brief §6 asked for research on this point; the result is negative, and
  recording that is worth more than inventing a movement.)

I did not cut a fourth candidate to get to three: the three above are the ones that survived the
dated-trigger requirement.

---

### STEP 2 — Cross the proven competence with the movements

**The proven competence (by shipped code, not by self-description).** What this repo proves
the owner knows how to do is not writing rules — that is 492 lines of prose in 13 files
(`rules/*.md`), copyable in an afternoon. What it proves is **building an enforcement layer
that fails closed on top of the agent lifecycle**: six hooks distributed across four
events (`hooks/hooks.json:1-56`), a deterministic path→domain map in bash declared
authoritative (`hooks/routing-map.sh:1-6`, `CLAUDE.md:31-33`), and a double `Stop` gate that refuses
to end the session until a change record exists (`hooks/hooks.json:40-53`) — with **22
archived records** as proof that the cycle really ran (brief §2). Direct comparison:
**Agent OS** (5.1k stars, v3, free) does standards injection and spec shaping and **has no
hooks, no subagents and no audit**; the eight vendors in the Torii article have hooks and audit and
**have no engineering standards**.

**The ONE opportunity with the greatest advantage over a later entrant.**
Crossing Movement 1 (the hook is the audit primitive; the conformance half is empty)
with Movement 3 (the buyer is the questionnaire, not the regulator):

> **Be the *conformance evidence* layer of Claude Code: an `InstructionsLoaded` →
> "receipt" per change, which records which instruction files entered the context, which
> gates ran and with what result, reconciled with the change record the `Stop` gate
> already requires.**

Why this is where he has the greatest advantage, and not elsewhere:
- **The infrastructure already exists and it is the hard part.** The `Stop` gate that refuses "done" without a
  record (`hooks/hooks.json:40-53`) and the `PreToolUse` routing on `Edit|Write`
  (`hooks/hooks.json:14-24`) are exactly the skeleton of a receipt. What is missing is the 7th hook and the
  serialization — the system is not what is missing.
- **The `Edit|Write` covers a gap Anthropic declared it will not close.** Issue #23478,
  *closed as not planned* (opened 2026-02-05): `paths:` rules do not load on Write. The matcher
  at `hooks/hooks.json:16` covers Write. That is durable by vendor decision, not by luck.
- **The slot is literally empty.** **0 of 2,283** community-catalog descriptions
  mention `InstructionsLoaded` (measured 2026-07-30), while 193 already mention `hook` and 30 already
  mention audit trail — that is, the adjacent space is crowded and this specific point is
  not.

**Why that advantage decays — and how fast.**

| Layer of the asset | What a copier replicates | How fast |
|---|---|---|
| 13 `rules/*.md` (492 lines), the router table (`CLAUDE.md`, 85 lines), 33 generated slash commands | Everything. It is prose and mechanical generation. And native `.claude/rules/` (shipped **2025-12-10**, v2.0.64) already replaces half the function — six months **before** this repo's first commit (2026-06-11) | **Days** |
| 18 agents + 8 skills | Everything. The ecosystem already lists thousands of skills and hundreds of agents; `agentops`, `dod-guard` and `kauri` cover equivalent functions | **2–6 weeks** |
| The receipt hook itself | Everything, once seen. It is ~100 lines of shell over a documented event | **A weekend**, once someone publishes the idea |
| **The shape of the cycle that survives a real team** — which gates fail closed vs merely warn, what a record needs to contain to be auditable, where the false positives are | Not replicable by reading. Only learned by running it | **3–6 months, and only with real use** |

The uncomfortable conclusion: **the only durable layer is the one for which he has the least
evidence.** `docs/PRD.md:4` scopes EngineOS to a 2–10 person team, and the history
shows a single author with self-merged PRs (brief §2 and §5.1). A competitor with **one** real
8-person team gets there in a quarter. And Endor Labs, which has had the six events and the SIEM
since 2026-05-12, gets there in less. **Decay clock: ~2 quarters.** Nothing in this repo
lengthens that clock — only use by a second human lengthens it.

---

## The one action

**Action (one), deadline 2026-08-06 (7 days):** package the *conformance receipt* as a
single-purpose plugin and submit it to the official community catalog through the individual-author
form.

Concretely, and only this:

1. Add the 7th hook in `hooks/hooks.json`: `InstructionsLoaded` event → a script that writes
   `.engineos/receipts/<YYYY-MM-DD>-<change-id>.json` with the loaded instruction files,
   timestamp, commit SHA and repo.
2. Extend `hooks/record-verify.sh` to reconcile the receipt with the change record the
   `Stop` gate already requires — if the record cites a spec and the receipt does not show the
   corresponding domain rule loaded, the gate fails.
3. Fix the two drifts a validator will catch: the divergent version
   (`.claude-plugin/plugin.json:5` = 1.2.0 vs `.claude-plugin/marketplace.json:12` = 1.0.0) and the
   install section of `README.md:18,24-25`, which documents two dead channels.
4. Run `claude plugin validate ./ --strict` (the same check as the review pipeline) until it passes.
5. Submit at `platform.claude.com/plugins/submit` — the route explicitly open to individual
   authors outside a Team/Enterprise org — with **one single** description sentence: emit
   per-change evidence of which standards governed the code the agent wrote.

Why this one and not another: it is the only one that uses what already exists (6 hooks + 22 records), attacks the
slot measured as empty (0/2,283), depends on a first-party event already shipped
(2026-03-04), and is shielded by the *not planned* decision on issue #23478. Submitting
**all** of EngineOS to the catalog would mean entering as the 2,284th generic plugin next to `dod-guard` and
`agentops` — commodity distribution, not space occupation.

**Blocking precondition (not legal advice):** step 5 requires a repository readable by the
pipeline (approved plugins are pinned to a commit SHA). The IP/moonlighting terms of the current
employment are UNKNOWN (brief §6) and need to be resolved by him before step 4 — if the answer
is negative, the same action becomes the private organization route of Movement 2 (marketplace in a
**private** repo, via the Claude GitHub App, Team/Enterprise plan), and the success signal changes with it.

**Observable signal that it worked.** A single one, verifiable by third parties: by **2026-08-20**,
the plugin name appears in
`https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json`
(the public catalog syncs *nightly*; today, 2026-07-30, the file has 2,283 entries and
none called `engineos`). A documented rejection with criteria also counts as a signal —
it tells what is missing. **Silence does not.**

A stronger signal, if the `docs/PRD.md:4` team actually exists (UNKNOWN, brief §6): a receipt
file generated by a session he did not run. That is the first structurally non-zero
number this project can produce.

If neither happens by 2026-08-20, the constraint is **not** distribution — it is demand. In that
case the next move is to interview buyers, not to build more surface (and it is worth noting
that the work shipped in July was all about *adding surface*, brief §2).

---

## What would falsify this

Any of these observations invalidates the analysis and requires re-running it:

1. **A search in `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` returning
   plugins that use `InstructionsLoaded` for conformance evidence.** I measured 0 of 2,283 on
   2026-07-30 over name+description; if the hook is in use without appearing in the description, the slot
   is not empty and the central thesis falls.
2. **Endor Labs, Zenity, Pillar, Prompt Security or any of the eight publishing an
   instruction/standards-adherence report** (not only a security policy one). Endor already has the six
   hook events since 2026-05-12; that would close the Movement 1 window before it is
   occupied.
3. **Anthropic reopening and implementing issue #23478** (`paths:` rules firing on Write),
   or shipping instruction adherence in the Claude Code Analytics API. Today #23478 is *closed as
   not planned* — it is that decision that sustains the durability of the `Edit|Write` gate.
4. **The EU reinstating 2026-08-02 for high-risk obligations**, reversing the act signed on
   2026-07-08. That would return the urgency to the regulator and make Movement 3's
   "procurement, not regulation" framing wrong.
5. **The primary number of ISO/IEC 42001 certificates turning out to be far below the hundreds.** It is the
   most loaded UNKNOWN in the report; if the certified base is marginal, "purchased governance"
   is vendor narrative and the opportunity horizon doubles.
6. **Anthropic allowing public repositories in organization marketplaces.** That would unify
   the channels and destroy the bifurcation that is the whole of Movement 2.
7. **A second human using EngineOS and the governance cycle breaking in the first week.** It would be
   the most valuable falsification of all: it would mean the layer I called durable (the shape
   of the cycle tested in use) does not exist yet — it only appears to exist because it has always run on the
   same machine, with the same author, with the install and docs drifts that brief §5.5
   documented.
