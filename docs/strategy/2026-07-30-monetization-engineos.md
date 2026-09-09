# Monetization — revenue hidden in the assets that already exist in EngineOS

Date: 2026-07-30 · Mode: monetization · Confidence: **medium**
(asset inventory: high — read on disk and cited; prices: medium — dated sources, but
mostly secondary aggregators; demand: **low** — no sales, no historical
conversion, audience UNKNOWN.)

> **This is neither financial nor legal advice.** These are estimate ranges with the
> arithmetic exposed so you can adjust the assumptions yourself. No number here is a forecast.
> Where there is an employment contract, an IP clause, or client confidentiality, the decision
> requires a lawyer — this report only flags where the risk is.

---

## Headline

The three assets monetizable in 30 days **are not EngineOS** — they are the legacy-system
documentation generator in Portuguese (`patterns/1-Analisys` +
`agents/architecture-analyst.md`), the tested quality gates system
(`hooks/` + 5 test suites) and the Cursor portability knowledge
(`docs/specs/2026-06-19-cursor-adapter-design.md`); all of them sell 1:1 to a named
buyer and **none of them depends on the repository being public nor on you having an audience** —
which is exactly why they are the only ones activatable now.

---

## Grounding

### Project (read, not inferred)

| File | What it proves |
|---|---|
| `CLAUDE.md` (9,190 bytes) | Constitution + routing table of ~25 intents; 7 non-negotiables |
| `rules/*.md` (12 files, 492 lines) | Declarative DO/DON'T standards; `rules/parallelism.md:1-57` and `rules/models.md:1-41` are original doctrine, not repackaging |
| `skills/*/SKILL.md` (8 skills, 558 lines) | `skills/nestjs-patterns/SKILL.md` (100 lines) is the largest; `skills/record-change/SKILL.md` (74) codifies the governance cycle |
| `agents/*.md` (18 agents, 1,205 lines) | `agents/architecture-analyst.md` (120), `agents/mobile-coordinator.md` (112), `agents/ios-builder.md` (102), `agents/android-builder.md` (110), `agents/qa-tester.md` (109) |
| `hooks/hooks.json:1-56` | 5 events wired: UserPromptSubmit, PreToolUse, PostToolUse (2), Stop (2) |
| `hooks/stop-verify.sh` (167 lines) | Real gate: lint+typecheck+test scoped to the changed package, Nx detection, pnpm/yarn/npm runner by lockfile |
| `hooks/routing-map.sh:10-72` | Canonical path→domain map (security → tests → backend → dba → devops → frontend → llm) |
| `hooks/test-verify.sh` (136), `test-layout.sh` (65), `test-governance.sh` (42), `test-route.sh` (38), `test-task-scale.sh` (37) | The hooks have their own test suite — 941 lines of shell in total in `hooks/` |
| `install.sh` (171 lines) | Fail-closed secrets gate over `git ls-files` |
| `install.ps1` (293 lines), `install.ps1:20-35` | Windows port with 14 secret regex patterns — **and it is not in git** (`git status` → `?? install.ps1`; `git ls-files` only returns `install.sh`) |
| `docs/specs/2026-06-19-cursor-adapter-design.md:29-53` | Cursor hooks schema mapped empirically: event names, exit 2 = block, reuse of the `tool_input` nesting, per-event output schema, matchers in JS regex, commands without a namespace |
| `templates/cursor/commands/{audit,implement,production-env}.md` | Portability layer already delivered — the method is not locked to Claude Code |
| `docs/specs/` (10 specs, 1,579 lines) | `2026-06-19-project-layout-standard-plan.md` has 645 lines of executable plan |
| `.engineos/archived/**` (22 records) | `2026-06-17-review-findings-fixes.md` documents a pre-adoption review with 1 CRITICAL (secrets gate inoperative on macOS), 6 commits, 27 files |
| `docs/ADOPTION.md` (214 lines) | 9-step runbook with per-step verification + troubleshooting table |
| `docs/START.md` (199), `README.md` (137), `docs/PRD.md` (176), `docs/CONTRIBUTING.md` (58) | Onboarding content already written |
| `templates/github/claude-review.yml`, `claude-security.yml` | CI review workflows with a tuned prompt (includes the ≤400-line PR rule) |
| `templates/mcp.template.json`, `templates/permissions.template.json`, `docs/ADOPTION.md:94-122` | MCP baseline + allowlist + read-only credential doctrine |
| `templates/project-claude.md`, `templates/project-layout/*` (4 files) | Project layout template |
| `patterns/1-Analisys` (51 lines, **written in PT-BR**) | Architectural analysis prompt: generates "Arquitetura do Sistema", "Objetivo do Sistema" and a README per module, with an explicit rule to mark inference as "hipótese" |
| `scripts/usage-report.sh:1-30` | Measurement instrument: mines `~/.claude/projects/*.jsonl` for `[router] intent=` and skill invocation |
| `scripts/gen-agent-commands.sh` + `commands/agents/` (33 files) | Slash command generation with a human alias |
| `.github/workflows/ci.yml` | The repo's own CI (shellcheck + hook tests) |
| `LICENSE:1-3` | MIT, copyright "Ricardo Fagmer" — single authorship confirmed (brief §2: 83 commits, 100% his) |

### Web (source + date)

- **Freelance Software Developer Rates by Country in 2026** — index.dev, **2026-05-27** (fetch):
  Brazil US$30–55/h average, senior **US$40–75/h**; US senior US$100–150/h; "AI agent
  developers" US$180–300/h; 40–60% premium for AI/ML over generalist.
- **AI Consulting Costs 2026** — Winder.AI, **2026-06-24** (fetch): senior boutique
  £200–400/h; **LLM application engineering £250–450/h**; offshore body-shop £40–120/h;
  fixed-scope POC £15,000–40,000 (2–4 weeks).
- **Quanto custa uma consultoria de IA no Brasil** — Waxi, **2026-06-28** (fetch):
  diagnosis + prioritization **R$10,000–40,000** (3–6 weeks); first use case
  R$30,000–120,000; **monthly retainer R$5,000–20,000**; explicitly states that the hour
  is not the dominant format in Brazil (fixed-price project and monthly fee are).
- **Cost of Code Audit Services in 2026** — DevCom, **2026-02-18** (fetch): static audit
  **US$5,000–8,000**, dynamic US$8,000–16,000.
- **AI Readiness Audit Pricing 2026** — Pertama Partners, published 2026-02-08,
  **updated 2026-06-17** (fetch): organization <100 employees **SGD 15,000–35,000**,
  2–3 weeks, 1–2 consultants. Published regional multipliers (Malaysia 70–80% of the
  Singapore baseline, Vietnam/Philippines 50–60%) — evidence that the same delivery is
  priced geographically, not absolutely.
- **AI Training Cost in 2026** — TightSlice, **2026-07-01** (fetch): custom on-site
  workshop **US$2,500–5,000 per team**; full-day role-specific **US$5,000 for up to 12
  people**; intensive weekly coaching US$1,500–3,000/month.
- **$100 million for open source** — GitHub Blog, **2026-07-20** (fetch): 70,000+
  maintainers, 280,000+ sponsors; ~40% of the funding comes from organizations and each
  organizational sponsorship is worth ~15× an individual one.
- Complementary searches (snippets, not fetched — treated as a lead, not proof):
  goLance *Node.js Developer Hourly Rate Guide 2026* (senior ~US$128/h, top US$218/h);
  groovyweb *AI consulting rates 2026* (solo consultant US$80–200/h); *AI readiness audit*
  small business US$2,000–8,000; *boilerplate income* (Jake's Insights, 2026-04-26:
  boilerplates US$49–249, top sellers US$1,500–3,500/month; Gumroad fee 10% + ~2.9%+US$0.30);
  Claude Code setups sold at **US$27–97** (Medium, Apr 2026); *Consultant Daily Rate*
  (consultfees, 2026: day rate = 6–8× the hour, US$1,500–5,000/day); light fractional CTO
  advisory US$4,000–8,000/month; **<12% of open source devs earn any revenue** from it.

### UNKNOWN (and the effect of each one on the conclusion)

1. **Terms of the employment relationship: IP, exclusivity, moonlighting** — UNKNOWN (brief §6).
   Effect: if there is an IP assignment or exclusivity clause covering work in the same
   field, routes R1/R2/R7 **as designed** become invalid and the analysis needs to be
   re-run as "publish for reputation, not for revenue". I give no legal advice —
   read the contract and, if in doubt, consult a lawyer **before** issuing the first
   proposal.
2. **Audience outside GitHub** (newsletter, YouTube, LinkedIn, community) — UNKNOWN.
   The only measured number: **6 followers on GitHub** (brief §4). Effect: every route whose
   mechanism is "sell to my audience" is **unfunded** and was demoted below
   the 1:1 routes. If there is an audience of, say, 2,000 people on LinkedIn, R4 climbs
   two positions.
3. **Current income and cash urgency** — UNKNOWN. Effect: it sets the cash ×
   reputation trade-off. If the urgency is cash, the order below is correct. If it is not,
   making the repository public first has a larger compounding return — but that is the output
   of the *positioning* mode, not this one.
4. **Whether the "2–10 person team" of `docs/PRD.md:4` is a real team at the employer** — UNKNOWN.
   Effect: it is the hottest possible lead and simultaneously the one with the greatest contractual risk.
5. **Price of technical in-company training in Brazil per closed class** — **UNKNOWN**
   after 3 distinct searches in Portuguese; no Brazilian training company publishes a
   rate card (ohub, Hashtag Treinamentos, BT Company, Instituto Minere, KPMG Business School:
   all "sob consulta"). Assumption used where I needed one: Brazil/US ratio of 35–50% derived
   from the index.dev index (BR US$30–55 vs US US$95–110).
6. **Hourly rate for *AI engineering* consulting in Brazil** — UNKNOWN. I only found generic
   dev hourly rates and AI consulting project bands. TICOOP Brazil's published rate card
   ("Arquiteto de Software (hora)") **could not be fetched** — 302 to another host.
7. **Provenance of the content derived from `leo-curso`** — `.engineos/archived/2026/06/19/2026-06-19-leo-curso-extract.md`
   records that techniques from a third party's course material were folded into
   `skills/nestjs-patterns/SKILL.md`. Effect: for anything **sold or published**,
   that is an open provenance question. The record itself says that the course's opinionated
   framework was deliberately **not** adopted, which helps, but does not settle it.
8. **Conversion volumes** — no history exists (structurally zero revenue, brief §6).
   Every volume below is a **declared assumption**, not a projection.

---

## Analysis

### STEP 1 — Inventory of the unmonetized assets

Classified by what monetization requires of them, not by what they technically are.

#### Class A — Knowledge of a hard problem already solved (the most undervalued)

- **A1. Verification gate that works in a real monorepo** — `hooks/stop-verify.sh`.
  It is not "a hook": it is the solution to four failures that get other teams' gates
  switched off in the second week. Nx target existence detection via
  `nx show project --json` with an anchored guard against a cache false positive
  (`hooks/stop-verify.sh:99-134`); field extraction with **optional** `jq`
  (`:11-19`); portable `timeout` with a `gtimeout`/no-op fallback (`:60-62`); package
  directory dedupe safe for paths with spaces (`:70-81`); scope restricted to
  Edit/Write calls from the transcript, so that merely *reading* a file does not drag the
  package into the suite (`:31-41`). Somebody is paying today to find this out.
- **A2. Cursor hooks schema mapped empirically** —
  `docs/specs/2026-06-19-cursor-adapter-design.md:29-53`. Event names, `exit 2` as the
  block mechanism, reuse of Claude Code's `tool_input` nesting, output schema
  **different per event** (`{permission,user_message,agent_message,updated_input}` vs
  `{additional_context}` vs `{followup_message}`), matchers in **JavaScript** regex and not
  POSIX, commands without a namespace. This is the knowledge asset with the greatest
  differentiation and the least competition in the inventory — and it proves, together with
  the already-delivered `templates/cursor/commands/*.md`, that **the method is not locked to
  Claude Code**. That changes the sales conversation: you are not selling vendor dependence.
- **A3. "Single-source core + thin adapters" architecture** —
  `docs/specs/2026-06-19-cursor-adapter-design.md:55-68`: pure logic in
  `hooks/lib/<name>.core.sh`, thin adapters per host. It is a reusable design decision,
  not code.
- **A4. Fail-closed secrets gate, in two languages** — `install.sh` (over
  `git ls-files`, that is, tracked files only) and `install.ps1:20-35` (14 patterns:
  `sk-ant-`, `sk-proj-`, AKIA, `gh[opsu]_`, `github_pat_`, `glpat-`, `AIza`, `ATATT`,
  `xox[baprs]-`, PEM private key, `private_key_id`, and URL with embedded credential). The
  `2026-06-17-review-findings-fixes.md` record shows that this gate **was already broken
  on macOS** and was fixed — this is scar-tissue knowledge, not theoretical.
- **A5. Parallel fan-out and model tier doctrine** — `rules/parallelism.md` (57
  lines: triggers, contract freezing before fan-out, disjoint file scope,
  cap of ~6 agents per wave, flat agent graph) and `rules/models.md` (41 lines:
  four tiers, dispatch > frontmatter > session precedence, escalation rules).
  Written 2026-07-30; it is the newest piece and the hardest to find published.

#### Class B — Content that is already 80% of a paid artifact

- **B1. `docs/ADOPTION.md` (214 lines)** — a 9-step runbook, each with "what it does" and
  "how to verify", plus a troubleshooting table with root cause
  (`docs/ADOPTION.md:189-200`) and a specialist→MCP→credential table (`:102-109`). This is
  literally the script of a half-day workshop, already written.
- **B2. `docs/START.md` (199 lines)** — daily operation manual, with a mental model in a
  diagram (`docs/START.md:12-27`).
- **B3. 10 design specs (1,579 lines)** in `docs/specs/`, including an executable plan of
  645 lines (`2026-06-19-project-layout-standard-plan.md`).
- **B4. 22 archived change records** in `.engineos/archived/**` — each one with
  What/Why/Scope/Verification/Changes-registered. This is the corpus that proves process
  discipline to a skeptical buyer, and it is the type of evidence that almost nobody can
  show.
- **B5. `patterns/1-Analisys` (51 lines, in Portuguese)** — architectural analysis prompt
  with explicit anti-invention rules ("Nunca invente comportamento que não exista no
  código", "Inferências devem ser marcadas explicitamente como 'hipótese'") and three
  defined output artifacts. Combined with `agents/architecture-analyst.md` (120
  lines) and `patterns/2-Interview-brainstorm.md`, it is a packaged service waiting for a
  client. **The most sellable asset in the entire repository** — and the only one already in PT-BR.

#### Class C — Process and tooling that works

- **C1. Complete quality gates system** — `hooks/hooks.json` wires 5 events;
  `hooks/route-before-change.sh` (64) + `hooks/routing-map.sh` (72) do deterministic
  routing by path pattern; `hooks/post-edit-check.sh` (84) runs scoped lint+typecheck;
  `hooks/mark-unrecorded.sh` (33) + `hooks/record-verify.sh` (26) force the
  change record; `hooks/ensure-project-layout.sh` (59) + `hooks/layout-manifest.sh`
  (17) do scaffolding; `hooks/task-scale-advisor.sh` (45) suggests fan-out. **With 5 test
  suites** (`hooks/test-*.sh`, 318 lines combined). A process with tests is a product.
- **C2. Cross-platform installer** — `install.sh` (171) + `install.ps1` (293),
  idempotent, with non-destructive merge into `~/.claude/settings.json` and write-once
  backup. **Immediate risk: `install.ps1` is UNTRACKED** — it exists only on this
  machine. It is the only asset in the inventory that can be lost to a `git clean` or a
  burned-out drive.
- **C3. CI review templates** — `templates/github/claude-review.yml` and
  `claude-security.yml`, with a tuned prompt (forbids invented findings, requires file:line,
  flags PRs >400 lines).
- **C4. MCP baseline + permissions allowlist** — `templates/mcp.template.json`,
  `templates/permissions.template.json`, and the read-only credential doctrine
  (`docs/ADOPTION.md:94-122`). Note that the allowlist does **not** auto-approve MCP write
  tools — a least-privilege decision, defensible in a sale.
- **C5. Cursor portability layer delivered** —
  `templates/cursor/commands/{audit,implement,production-env}.md`.
- **C6. Slash command generator** — `scripts/gen-agent-commands.sh` → 33 files in
  `commands/agents/`.

#### Class D — Integrations already built

- **D1. 5 leaf specialists wired to MCP** — `agents/postgres-specialist.md`,
  `agents/oracle-specialist.md`, `agents/kubernetes-specialist.md`,
  `agents/gcp-specialist.md`, `agents/cicd-specialist.md`, with the contract
  "`UNKNOWN — no access` instead of guessing" (`docs/ADOPTION.md:90-92`).
- **D2. Store release agents** — `agents/ios-builder.md` (102) and
  `agents/android-builder.md` (110): preflight → bump → gates → signed build
  → track/TestFlight upload pipeline. Covers a very expensive and poorly documented pain.
- **D3. Web→mobile mirror** — `agents/mobile-coordinator.md` (112) +
  `docs/specs/2026-07-13-elias-web-to-mobile-mirror-design.md`.
- **D4. End-to-end API QA** — `agents/qa-tester.md` (109): clean Docker, endpoint
  inventory in JSON, Postman collection, headless run with Newman.

#### Class E — Data and benchmarks only he has — **HOPE, NOT AN ASSET**

Here the playbook demands honesty and the answer is uncomfortable:

- `scripts/usage-report.sh` is the right instrument — it mines local transcripts for
  `[router] intent=` and for skill invocation. **But none of its output is stored
  anywhere in the repository.**
- `.engineos/memory/` contains **only `README.md`** (1,273 bytes) after 22 completed
  changes (confirms brief §5.3).
- Therefore: "benchmarks only I have" is **hope**, not an asset. There is not a single
  measured before/after number — not review time, not rework rate, not
  failures-caught-per-hook per week, even though `docs/PRD.md:147-157` defines exactly those
  metrics. The corpus of 22 records is evidence of *discipline*, not of *gain*.
- Direct commercial consequence: **no proposal can promise a percentage gain.** Every
  proposal must sell a concrete delivery (document, audit, installed environment), never
  ROI. That also means that instrumenting the next change with
  `scripts/usage-report.sh` creates the first data asset — but that is construction, and the
  playbook forbids routes that need to be built before invoicing.

#### Non-assets (recorded so you stop counting them)

- **Audience**: 6 followers on GitHub (brief §4). Not a channel.
- **Repository**: private — the two documented installation paths
  (`README.md:18`, `README.md:24-25`) do not work for anyone but you (brief §3).
  Zero possible adopters today.
- **Plugin marketplace** (`.claude-plugin/marketplace.json`, `plugin.json` v1.2.0):
  ready, and inert while the repo is private.

---

### STEP 2 — One route per asset (activatable in <30 days, with no new investment)

Every price below carries a source + date. Every volume is a declared assumption.
Exchange rate used where I compare currencies: **US$1 ≈ R$5.40** — an assumption, not a verified
quote (I did not research the exchange rate; adjust it yourself).

---

#### R1 — Fixed-scope service: install and adopt the environment in a team

- **Asset:** C1 + C2 + C4 + C3 + B1 (`hooks/`, `install.sh`/`install.ps1`,
  `templates/mcp.template.json`, `templates/github/*.yml`, `docs/ADOPTION.md`).
- **Model:** fixed-scope service, fixed price. Delivery: installed environment, gates
  wired and proven, project `CLAUDE.md` written, 1 read-only MCP connected, 2 CI
  workflows active, 1h of recorded handoff.
- **Effort:** 14–20h (the runbook already exists; the work is the delta of the client's project).
  It fits in **one week** of the 20h+.
- **Price and arithmetic:**
  - Brazil: 16h × R$220–350/h = **R$3,500–5,600**. The hourly rate anchors on index.dev (BR senior
    US$40–75/h ≈ R$216–405/h, 2026-05-27). As a fixed package — the dominant format in
    Brazil per Waxi (2026-06-28) — **R$6,000–12,000** sits within and below the floor of the
    published "diagnosis" band (R$10,000–40,000), which is the correct position
    for a first client with no case study.
  - International remote: 16h × US$100–180/h = **US$1,600–2,900**; as a fixed fee, the
    "AI readiness audit small business" band US$2,000–8,000 (search, 2026) and the Pertama
    floor for <100 employees SGD 15,000–35,000 (2026-06-17) show that **US$2,500–4,000** is
    conservative, not aggressive.
  - Assumed volume: 1–2 closes in 30 days, and **only** if there is an already existing
    hot lead.
  - **Range: R$6,000–24,000 (BR) or US$2,500–8,000 (intl) in 30 days.**
- **Dependencies and blockers:** it is the route with the **greatest overlap with the job** — the
  natural buyer is the 2–10 person team of `docs/PRD.md:4`, which may be the
  employer's team (UNKNOWN #4). Selling to your own employer is where a moonlighting
  clause bites hardest. Do not advance on this without reading the contract.

---

#### R2 — Paid audit: AI-assisted engineering governance

- **Asset:** A1 + C1 + `commands/audit.md` + `agents/audit-consolidator.md` + C6.
- **Model:** paid audit, fixed price, written deliverable (report with
  STATUS + remediation plan, exactly the format `docs/ADOPTION.md:158-162` already
  describes). Scope: the client team's Claude Code/Cursor setup — what routes, what
  verifies, what leaks a secret, what is not reproducible on a new machine.
- **Effort:** 8–12h per audit. Two per month fit comfortably in the 20h+.
- **Price and arithmetic:**
  - Market floor cited: **static** code audit US$5,000–8,000 (DevCom,
    2026-02-18); *AI readiness audit* small business US$2,000–8,000 (search, 2026); Pertama
    <100 employees SGD 15,000–35,000 for 2–3 weeks with 1–2 consultants (2026-06-17).
    A solo delivering in 1 week needs to stay **below** all of those floors.
  - Brazil: **R$4,000–9,000** per audit (10h × R$400–900/h effective). Consistent with the
    Waxi diagnosis band R$10,000–40,000 being a larger scope (3–6 weeks).
  - International: **US$1,500–4,000** per audit (10h × US$150–400/h; the reference for
    LLM application engineering at a boutique is £250–450/h — Winder.AI, 2026-06-24 — so
    US$150–400 is positioning for a solo with no brand, not a panic discount).
  - Assumed volume: 1–2 in 30 days.
  - **Range: R$4,000–18,000 (BR) or US$1,500–8,000 (intl).**
- **Dependencies and blockers:** it requires the buyer to **already** use Claude Code or Cursor —
  a smaller prospect pool, especially in Londrina. The audit report belongs to the
  client and is confidential; any use as a case study requires written authorization.

---

#### R3 — Workshop with the content already written

- **Asset:** B1 + B2 + `CLAUDE.md` (the router table is the lesson script) + A5.
- **Model:** half-day workshop, fixed fee per class.
- **Effort:** 8–10h to turn `docs/ADOPTION.md` + `docs/START.md` into slides + 4h of
  delivery = 12–14h. It fits.
- **Price and arithmetic:**
  - US/intl: custom on-site workshop **US$2,500–5,000 per team**; full-day
    role-specific **US$5,000 for up to 12 people** (TightSlice, 2026-07-01); a complementary
    search gives half-day US$3,000–8,000 for up to ~25 people.
  - Brazil: **UNKNOWN** — no published rate card found in 3 searches (ohub, Hashtag
    Treinamentos, BT Company, Instituto Minere, KPMG BS: all "sob consulta"). Declared
    assumption: 35–50% of the US value, derived from the BR/US hourly ratio of index.dev
    (US$30–55 vs US$95–110). That gives **R$4,700–13,500 per closed class** at
    US$2,500–5,000 × 35–50% × 5.40. **Treat it as an estimate with an assumption, not as a
    market price.**
  - Assumed volume: 1 class in 30 days.
  - **Range: R$4,700–13,500 (BR, assumption) or US$2,500–5,000 (intl, with a source).**
- **Dependencies:** it needs a corporate buyer with a training budget —
  a purchase cycle typically longer than 30 days in Brazil. That is why it is not in the
  top 3.

---

#### R4 — Licensed template / paid access to the package

- **Asset:** A5 + `CLAUDE.md` + `rules/` + `skills/` + `agents/` + C3 + C4 + C6 +
  `.claude-plugin/` v1.2.0.
- **Model:** licensed template (one-time purchase) or paid access.
- **Effort:** 6–10h — most of it is not packaging, it is **cleaning**: `spesia` appears in
  13 lines of 3 tracked files, including a local filesystem path
  (`docs/specs/2026-06-19-project-layout-standard-plan.md:594,607,617`;
  `docs/specs/2026-06-19-project-layout-standard-design.md:12,164-168`;
  `docs/specs/2026-06-19-cursor-adapter-design.md:17`).
- **Price and arithmetic:**
  - Documented Claude Code setups sell at **US$27–97** (Medium, Apr 2026);
    dev boilerplates at US$49–249, with top sellers at US$1,500–3,500/month (Jake's
    Insights, 2026-04-26). Gumroad fee: 10% + ~2.9% + US$0.30.
  - The same source says that 5–15 copies in the first month presuppose "**any kind of
    existing audience**". **You have no measured audience** — you have 6 followers on
    GitHub (brief §4). So the honest arithmetic is: US$97 × **0–10 copies** = **US$0–970
    gross**, ~US$0–845 net after fees.
  - **This route has "sell to my audience" as its mechanism, and the audience is
    UNKNOWN beyond 6 followers. Declared explicitly, as the brief requires.**
- **Structural conflict you need to see:** the move that solves the closed channel
  (making the repository public) is the same one that destroys this route's scarcity — and under
  **MIT already declared in `LICENSE`**, anyone who receives a copy can redistribute and
  resell it. In other words: the code is never going to be the moat. That is not an argument against
  publishing; it is an argument for the price to sit in the **services** (R1, R2, R7), not in the
  file.

---

#### R5 — Sponsored artifact / paid technical writing about the Cursor knowledge

- **Asset:** A2 (`docs/specs/2026-06-19-cursor-adapter-design.md:29-53`) + A1 + A3.
- **Model:** paid article / sponsored artifact.
- **Effort:** 6–8h per piece.
- **Price and arithmetic:** API/dev documentation **US$0.20–0.40/word**; senior technical
  writer ~US$105/h, top US$173/h (goLance, 2026 — snippet). A 1,800-word
  piece = **US$360–720**. Assumed volume 1–2 in 30 days = **US$360–1,440**.
- **Dependencies:** it requires a publication that pays and an accepted pitch. No editorial
  relationship is documented in the repository — it is cold prospecting. High differentiation, low
  predictability of timeline.

---

#### R6 — Engineering standards retainer

- **Asset:** the whole body of `rules/` + C1 + B4 (the record cycle is what gets operated
  monthly).
- **Model:** monthly retainer.
- **Effort:** 8–12h/month.
- **Price:** AI operation/evolution retainer in Brazil **R$5,000–20,000/month**
  (Waxi, 2026-06-28); light fractional CTO advisory US$4,000–8,000/month (search, 2026);
  Brazilian mentoring floor cited as "abaixo de R$1.500/mês é difícil sustentar"
  (Outsider School — **with no verifiable date**, treat it as weak). Solo, first contract:
  **R$2,500–6,000/month** or **US$800–2,500/month**.
- **Why it is not a 30-day route:** a retainer is the **follow-on** of R1 or R2, not the entry
  door. Nobody signs a monthly fee with someone who has not delivered anything yet. Record it as
  the destination, not as the first step.

---

#### R7 — Legacy-system documentation service, in Portuguese

- **Asset:** B5 (`patterns/1-Analisys`, 51 lines in PT-BR) +
  `agents/architecture-analyst.md` (120) + `patterns/2-Interview-brainstorm.md` +
  `/analisy-architecture` and `/talk-about-the-system` (`commands/`).
- **Model:** fixed-scope service, fixed price per system. Deliverable:
  "Arquitetura do Sistema" + "Objetivo do Sistema" + a `README.md` per module, with
  inferences marked as hypotheses and orphan modules / couplings / architectural
  violations identified — exactly what `patterns/1-Analisys` already specifies.
- **Effort:** 10–16h per system of up to ~15 modules. Two deliveries per month fit in the 20h+.
- **Price and arithmetic:**
  - Brazil: 13h × R$300–700/h effective = **R$4,000–9,000** per system. Floor reference:
    static code audit US$5,000–8,000 (DevCom, 2026-02-18) is a larger and more
    expensive delivery; the Brazilian diagnosis band R$10,000–40,000 (Waxi, 2026-06-28) is a scope
    of 3–6 weeks. Positioning at **R$4,500 (small system) to R$9,000 (system with
    integrations)** sits clearly below both — which is where a first supplier with no
    case study should be.
  - International remote: **US$1,200–3,000** per system (13h × US$90–230/h; the day rate
    cited by consultfees, US$1,500–5,000/day, shows that 2 days at US$1,500 is the
    conservative floor of the range).
  - Assumed volume: 1–2 in 30 days.
  - **Range: R$4,500–18,000 (BR) or US$1,200–6,000 (intl).**
- **Why this route is structurally different from the other six:**
  1. **It does not require the buyer to use Claude Code, Cursor, or to adopt anything.** He buys a
     document. You use your tools underneath — that is your problem, not his.
  2. **It does not require a public repository** — the closed channel (brief §3) is irrelevant here.
  3. **It does not require an audience** — it is a 1:1 sale to a named prospect.
  4. **It is already in Portuguese**, and the pain ("nobody knows how this system works, the guy
     who wrote it left") is universal and recognized by a non-technical manager in one sentence.
  5. It is the smallest surface of conflict with the job: you produce **documentation about the
     client's system**, you do not change his system and you do not deliver code of your own — which
     reduces (does not eliminate) the collision with IP clauses. UNKNOWN #1 still applies.
- **Blocker:** the client gives you access to his source code. That requires an NDA and the habit of
  never recycling snippets of client code into `skills/` — a precedent already recorded in the
  repository: `nestjs-patterns` absorbed third-party material (UNKNOWN #7).

---

#### CUT routes (they violate the hard rule: they would require building before invoicing)

- Recorded course / cohort / SaaS / hosted dashboard / "EngineOS Cloud" — all require
  a new product. Out.
- **GitHub Sponsors / support tier**: requires a public repository **and** an audience.
  `<12%` of open source devs earn any revenue from it (search, 2026); ~40% of the
  funding comes from organizations and each organizational sponsorship is worth ~15× an individual one
  (GitHub Blog, 2026-07-20) — in other words, the money comes from companies that depend on your
  code, and none depends on your code today. With 6 followers this is a 6–12 month
  reputation play, **not a 30-day revenue route**. Recorded, not recommended.
- Selling the package **before** cleaning the 13 references to `spesia` (R4): cut until the
  cleanup, regardless of price.

---

### STEP 3 — Ranking (speed of return × execution effort)

| # | Route | Effort | 30d range (BR) | Why this position — given **your** context |
|---|---|---|---|---|
| **1** | **R7 — legacy documentation in PT-BR** | 10–16h | R$4,500–18,000 | The only route not blocked by **any** of your three real constraints: closed channel, UNKNOWN audience, and the job's IP risk. It sells 1:1, in Portuguese, for a pain that needs no technical translation. |
| **2** | **R2 — paid governance audit** | 8–12h | R$4,000–18,000 | The highest price per hour in the inventory, and it produces a written artifact that becomes your first case study. It is 2nd because the buyer needs to **already** use Claude Code/Cursor — a smaller pool, and you have no channel to find him. |
| **3** | **R1 — install/adopt in a team** | 14–20h | R$6,000–24,000 | The biggest ticket of the three, but the closing cycle is longer and the natural buyer is the PRD's 2–10 person team, potentially your employer's — the greatest contractual exposure in the inventory (UNKNOWN #1 + #4). |

**Where to start: R7. The reason is a property of your situation, not of the size of the revenue.**

Your bottleneck is neither price nor asset quality — it is that **you have no channel**. The repo is
private, the two installation paths in `README.md` return 404 for any third party
(brief §3), and the measured audience is 6 followers. Any route whose first step is
"people find me" is dead this month. R7 is the only one that starts with **you**
finding five people, and whose delivery does not require them to adopt anything of yours.

On top of that: you have a job, 20h+/week and a 7-week history whose velocity
**has already halved once** (brief §2). That disqualifies routes with a long ramp and
qualifies the one that closes in one week of work. And R7 has the smallest surface of collision
with the job, because the deliverable is documentation of the **client's** system — which reduces,
without eliminating, the exposure of UNKNOWN #1.

If your urgency is **reputation** and not cash, the order changes: publishing the repository becomes
the first step and this ranking must be re-run. But that is a decision of the *positioning* mode,
and you did not tell me that cash does not matter.

---

## The one action

**By 2026-08-13 (14 days), send a single proposal, with fixed scope and price, to
5 named prospects from your own network** (LinkedIn `ricardo-fagmer`, former colleagues,
Londrina contacts) offering the `patterns/1-Analisys` deliverable:

> "Documentation of your system's architecture in 7 days: an architecture document, a
> system objective document, and a README per module — with couplings, orphan modules
> and technical risks identified, and every inference marked as a hypothesis.
> **R$4,500** for a system of up to 15 modules. Payment on delivery."

Rules of the action, so it stays **one** action: no new line of code, no
sales page, no public post, no change in the repository. Five messages.
Before sending the first one, re-read your employment contract regarding exclusivity and IP
assignment (UNKNOWN #1) — and if there is any ambiguity, talk to a lawyer, not to me.

**Observable signal of success:** ≥1 of the 5 messages replies asking about scope, timeline or
price by **2026-08-23**. Full success: 1 contract signed at ≥R$3,000 by **2026-08-31**
— which also produces your first real revenue number, ending the "structural zero"
of brief §6.

**Failure signal, equally informative:** 0 replies out of 5. That does not mean the
price is wrong — it means you have no reachable buyer, and the problem moves from
monetization to *positioning*. In that case, stop selling and go make the repository
public.

**Secondary 5-minute action, non-negotiable and not substitutable by the main action:**
`git add install.ps1` and commit it. 293 lines of the project's only Windows installer exist
only on this machine; it is the only asset in the inventory that a `git clean` erases.

---

## What would falsify this

1. **The employment contract contains an exclusivity or IP assignment clause covering
   work in the same field.** Then R1, R2 and R7 are invalid as designed, the 30-day value
   drops to ~zero, and the whole analysis needs to be re-run as "publish for
   reputation". This is the most likely falsifier and the cheapest to check — read the
   contract before sending the 5 messages.
2. **5 proposals → 0 replies, and simultaneously the published repository gains organic
   traction** (>50 stars or >5 third-party issues in the first week). Then the value
   is in distribution, not in a 1:1 service, and the ranking would invert in favor of R4/R8.
3. **A prospect says the R7 deliverable is worth less than R$1,500.** Then the Brazilian
   anchor derived from index.dev is wrong for Londrina and every BRL price in this
   report needs to be lowered — which also kills R1 and R2 in their current form.
4. **There is a real and undeclared audience** (≥1,000 people on any channel you
   control). Then UNKNOWN #2 resolves upward, R4 climbs into the top 3, and the fastest route
   stops being 1:1.
5. **Somebody publishes, before you, an open and maintained package that already delivers the
   Cursor adapter with hook parity.** Then A2 — the knowledge asset with the greatest
   differentiation in the inventory — loses its scarcity premium, and R5 stops having sale value.
6. **`scripts/usage-report.sh` run over your own transcripts produces a defensible gain
   number** (e.g.: failures caught per hook per week, with a trend). Then
   Class E stops being hope, becomes an asset, and it becomes possible to sell ROI — which
   moves both the price and the pitch of all seven routes upward.
