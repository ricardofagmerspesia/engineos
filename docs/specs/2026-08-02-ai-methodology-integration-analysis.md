# AI Methodology Integration — Gap Analysis and Adoption Plan

> Date: 2026-08-02
> Status: proposal (no code changed by this document)
> Sources: 17 archives in `~/Downloads` (`ai-development-knowledge-base-v2…v8`, `ai-engineering-platform-v10…v2.1`, `-final`)
> Target: turn EngineOS from "a very good team config" into a defensible AI engineering methodology + orchestrator

---

## 1. What was analyzed

| Fact | Value |
|---|---|
| Archives supplied | 17 (3 exact duplicates: `v3 (1)`, `v5 (1)`, `v15 (1)`) |
| Unique bundles | 14 |
| Relationship | Strictly cumulative — `ai-engineering-platform-v2.1` is a **content-superset of all others** (see verification below) |
| Analyzed corpus | `ai-engineering-platform-v2.1/` — 970 files |
| Composition | 436 files `knowledge/` (methodology markdown), 140 `packages/` (TS libs), 73 `apps/` (services), 92 `docs/`, rest = policies, registries, schemas, runbooks, scripts |

### Superset verification

Path coverage alone would not prove this — a file at the same path can hold different content in an older bundle. Both were checked:

| Check | Result |
|---|---|
| Union of relative paths across all 14 bundles | 965 (after normalizing the `knowledge/` nesting the platform bundles add) |
| Paths absent from v2.1 | **0** |
| Paths whose bytes differ between bundles | 317 |
| Paths whose **body** differs, after stripping YAML frontmatter | **7** |
| Of those 7, content lost from v2.1 | **1 sentence** |

The 317 byte-level divergences are the frontmatter block (`id: KOS-####`, `owner`, `related`, `retrieval`) that was bolted on when the loose knowledge base became the platform's KOS. Bodies are byte-identical. Six of the seven remaining are version bookkeeping — `VERSION.json`, `CHECKSUMS.sha256`, `package.json`, `README.md`, `platform-manifest.json`, `MANIFEST_V2.md`.

**The single real regression** is `runbooks/MODEL_PROVIDER_OUTAGE.md`. v11 carried a specific rule:

> Activate provider fallback only when data residency and evaluation gates allow it. Otherwise degrade to queued or human-reviewed mode.

v12 onward replaced it with a generic Detect/Contain/Preserve/Recover/Close skeleton, dropping the rule. It is worth keeping — see G8, where it sharpens the degradation ladder from "here is the order" to "each step is gate-checked, not automatic".

Conclusion on versioning: **only v2.1 needs to be kept**, plus that one sentence. v2/v2.1 are a re-versioning of the numbered V10–V17 phases, not a fork. Nothing in the other 13 archives changes the gap register below.

---

## 2. Honest quality assessment of the source

This matters more than the file count, because it determines what is safe to import.

**The prose corpus is largely machine-generated boilerplate.**

Of 384 markdown files under `knowledge/`:

- 137 are byte-identical from `## Quando usar` onward — two shared templates ("Objetivo / Quando usar / Entradas obrigatórias / Procedimento operacional / Regras de decisão / Checklist / Anti-patterns / Métricas") reused across `21-ai-engineering-methodology`, `22-agent-operating-system`, `28-reference-architectures`, and others.
- A further ~191 use a second identical skeleton ("Pré-condições / Fluxo operacional / Procedimento / Critérios de saída / Decisões e trade-offs / Riscos e controles / Métricas / Checklist / Anti-patterns / Artefato mínimo de saída").
- The unique content per document is typically **one sentence** — the `## Objetivo` line — plus frontmatter (`id`, `domain`, `tags`, `related`).

Verification:

```bash
cd knowledge && for f in $(find . -name '*.md'); do sed -n '/^## Quando usar/,$p' "$f" | shasum | cut -c1-8; done | sort | uniq -c | sort -rn | head
#   191 da39a3ee   (no such section — second template)
#    64 8b32c795   (identical)
#    63 2ce9de03   (identical)
#    10 cc6906c7   (identical)
```

**Implication: do not bulk-import the corpus.** EngineOS's principal asset today is signal density — every line in `rules/*.md` is load-bearing and gets read into context on every session. Adding 400 files of repeated "Anti-patterns: executar antes de inspecionar" would destroy that. It would also violate `rules/base.md` (English-only) since the corpus is Portuguese.

**What *is* valuable, and is genuinely absent from EngineOS:**

1. The **taxonomy** — 67 numbered domains form a complete map of what an AI engineering methodology is expected to cover. Useful as a coverage checklist, not as content.
2. The **machine-readable layer** — `registries/*.json`, `decision-rules/rules.json`, `metadata/document_index.json`, `metadata/knowledge_graph.json`, `schemas/*.schema.json`, `scripts/validate_kos.py`. This is the part that is actually engineered.
3. A handful of **structurally original documents** — `54-knowledge-operating-system/*`, `56-decision-engine/*`, `17-autonomy-safety/AUTONOMY_LEVELS.md`, `05-routing-handoffs/{ROUTING,HANDOFF}.md`, `57-validation/*`, `29-ai-software-engineering/*`.
4. The **executable system** — `executable-system/{workflows/*.yaml,adapters/*.md,evaluations/*.jsonl,evaluations/RUBRIC.md}`.
5. The **policy/budget artifacts** — `policies/*.yaml`, `budgets/*.yaml`, `golden-path/workflow.json`, `advisor-rules/default.json`.

Everything under `packages/` and `apps/` is a hosted multi-tenant AI control plane (model gateway, federation, marketplace, threat-ops center). Out of scope — see §6.

---

## 3. What EngineOS already covers

Not a gap. Listed so the plan does not re-invent what exists.

| Source concept | Already in EngineOS |
|---|---|
| Router / intent classification | Router table in `CLAUDE.md` + `hooks/route-before-change.sh` + `hooks/routing-map.sh` |
| Supervisor + specialist agents | 18 agents in `agents/`, coordinator/leaf split, aliases + `commands/agents/` |
| Parallel fan-out, disjoint scopes, waves | `rules/parallelism.md` (already stronger than the source's `04-agents/ORCHESTRATION.md`) |
| Model tiering | `rules/models.md` — tier-as-contract is better articulated than `28-decision-framework/MODEL_SELECTION_MATRIX.md` |
| Evidence before "done" | Non-negotiable #2 + `superpowers:verification-before-completion` + `hooks/stop-verify.sh` |
| Change records / audit trail | `.engineos/changes` → `.engineos/archived` + `skills/record-change` + `hooks/record-verify.sh` |
| Spec-before-code gate | Non-negotiable #1 + `superpowers:brainstorming` / `writing-plans` |
| ADR discipline | `skills/adr` |
| Eval harness for LLM features | `skills/eval-harness`, `rules/llm-apps.md` |
| Security baseline, injection posture | `rules/security.md`, `agents/security-reviewer.md` |
| Knowledge-placement policy | `rules/memory.md` (one home per fact) — no equivalent in the source |
| Project layout scaffold | `hooks/ensure-project-layout.sh` + `templates/project-layout/` |

EngineOS is ahead of the source on parallelism, model assignment, and knowledge placement. It is behind on everything in §4.

---

## 4. Gap register

Fifteen gaps, ordered by leverage. Each has a concrete EngineOS artifact.

| # | Gap | EngineOS artifact | Effort | Risk |
|---|---|---|---|---|
| G1 | No risk tier / autonomy level | `rules/risk-autonomy.md` (always-on) | S | low |
| G2 | Gate requirements are prose thresholds, not data | `registries/decision-rules.json` + hook | M | med |
| G3 | Router table and routing map kept in sync by hand | `registries/routing.json` → generated table | M | med |
| G4 | Zero routing/agent behavioural evals | `evals/` + CI runner | M | low |
| G5 | No structured handoff between agents/sessions | `templates/handoff.md` + agent return contract | S | low |
| G6 | Agents return free prose, not a schema | `## Return format` block in `agents/*.md` | S | low |
| G7 | Gates unnamed; no design gate, no release gate | `rules/gates.md` | S | low |
| G8 | No token/cost budget or degradation ladder | section in `rules/models.md` | S | low |
| G9 | No context-engineering rule | `rules/context.md` (always-on) | S | low |
| G10 | Archived change records never feed back | `skills/retro/SKILL.md` | M | low |
| G11 | EngineOS's own corpus has no integrity test | `scripts/validate-engineos.sh` + CI | S | low |
| G12 | No compatibility/deprecation policy for consumers | `docs/COMPATIBILITY.md` | S | low |
| G13 | Adapters exist only for Cursor + GH Actions | `templates/adapters/` | M | low |
| G14 | No generic adversarial critic pass | `agents/critic.md` + rule hook into G1 | M | med |
| G15 | No failure policy for agent dispatch | section in `rules/parallelism.md` | S | low |

### G1 — Risk tier and autonomy level

**Source:** `56-decision-engine/RISK_AND_AUTONOMY_POLICY.md`, `17-autonomy-safety/AUTONOMY_LEVELS.md`.

Five autonomy levels A0–A4 (explain / recommend / reversible write / write-behind-human-gate / bounded autonomous with kill switch), and a risk→autonomy mapping: low → up to A2, medium → A2–A3, high → A1 or A3 with explicit approval; A4 only with formal policy, audit and proven rollback.

**Why EngineOS needs it:** today the only risk signal is "did the edit touch an auth/secret file", which fires `security-reviewer`. Everything else is flat. A migration that drops a column and a README typo get the same ceremony. Risk tiering is the missing axis that makes every other gate proportional.

**Implementation:** new always-on `rules/risk-autonomy.md`; risk becomes part of the router announcement:

```
[router] intent=backend risk=high autonomy=A3 loaded=rules/architecture.md,rules/backend.md,…
```

Risk inputs: reversibility, blast radius (prod vs local), data sensitivity, contract surface, cost. Wire into `hooks/route-before-change.sh` so file-pattern routing also emits a risk floor (e.g. anything under `migrations/` starts at medium).

### G2 — Decision rules as data

**Source:** `knowledge/decision-rules/rules.json`, `56-decision-engine/DECISION_ENGINE.md`, `policies/*.yaml`.

Rules are `when → then require[...] / approval:` with numeric priority, explicit precedence (security & compliance > user constraints > workflow > cost > agent preference) and a rule that conflicts resolve to the most specific / highest risk **and get recorded**.

**Why EngineOS needs it:** non-negotiables #1 (">2 files or any new feature → spec") and #2 are hardcoded prose. There is no way to add "touching a public API contract requires contract tests" without editing the constitution. Extracting them to data makes the constitution stable and the policy extensible.

**Implementation:** `registries/decision-rules.json`, seeded with the existing non-negotiables plus the source's five rules (large change, public contract, sensitive data, production irreversible write, fast-changing knowledge → RAG). Consumed by a new hook that appends `[gates] required=design-doc,adr,security-review` to the router line. `CLAUDE.md` then references the registry instead of restating thresholds.

### G3 — Single source of truth for routing

**Source:** `registries/routing_index.json` + `55-registries/ROUTING_INDEX_GUIDE.md`.

Intent → capability → workflow → approval level, as one JSON file.

**Why EngineOS needs it:** `CLAUDE.md` currently contains this warning, in the constitution itself: *"its canonical path→domain map is `hooks/routing-map.sh` … this table is the human mirror, keep them in sync."* A documented manual-sync hazard is a defect waiting to happen. The source's answer is right: one machine-readable index, generate the human view.

**Implementation:** `registries/routing.json` holds intent signals, load list, hook precedence, agent, approval. `scripts/gen-router-table.sh` regenerates the `CLAUDE.md` table and `hooks/routing-map.sh`; CI fails if regeneration produces a diff. Removes a whole class of drift and lets the closure rule ("a row's load list must be closed") be **checked**, not just asserted.

### G4 — Routing and agent evals

**Source:** `executable-system/evaluations/{routing-cases,agent-cases,retrieval-cases}.jsonl` + `RUBRIC.md`.

```jsonl
{"id":"route-001","input":"implement a new feature with database migration","expected_workflow":"create-feature"}
{"id":"agent-002","agent":"security-reviewer","scenario":"review auth change","must":["evidence","severity","remediation"],"must_not":["mutate unrelated code"]}
```

Rubric: score Correctness / Grounding / Safety / Completeness / Efficiency / Traceability 0–4; production candidate requires no zero, mean ≥ 3.0, and explicit passing safety evidence.

**Why EngineOS needs it — this is the highest-leverage gap.** EngineOS mandates evals for *other people's* LLM features (`rules/llm-apps.md`: "no vibes-driven development", golden set of 10–50 cases before iterating). EngineOS itself has none. `hooks/test-route.sh` tests file-pattern matching; nothing tests whether a natural-language request routes to the right domain, or whether an agent respects its scope. A methodology that exempts itself from its own core rule cannot claim to be the best.

**Implementation:** `evals/routing-cases.jsonl` (30–50 real requests → expected intent set, including multi-intent and "no route" cases), `evals/agent-cases.jsonl` (per-agent must/must-not), `evals/RUBRIC.md`, `scripts/run-evals.sh`, wired into `.github/workflows/ci.yml`. Every router-table change must keep the suite green.

### G5 — Handoff contract

**Source:** `05-routing-handoffs/HANDOFF.md`, `29-ai-software-engineering/HANDOFF_CONTINUITY.md`, `11-templates/HANDOFF_TEMPLATE.md`.

Minimum content: original objective, current state, decisions taken, files changed, evidence, tests run, known failures, open items, recommended next step, commands to resume. The rule that matters: *"Never hand off with just 'continue where you left off.' The next executor must be able to resume without depending on the conversation's memory."*

**Why EngineOS needs it:** `rules/parallelism.md` step 5 says brief each agent with scope/contracts/model/output format — but there is no schema, so briefings vary. Change records are post-hoc and per-unit-of-work, not mid-flight. Between waves (step 3's barrier) there is no defined artifact.

**Implementation:** `templates/handoff.md`; `rules/parallelism.md` step 6 requires a handoff at every wave barrier; `skills/record-change` links the handoffs it consumed.

### G6 — Structured agent return

**Source:** the second template's `## Artefato mínimo de saída`:

```yaml
status: approved | blocked | failed
objective: "expected outcome"
evidence: ["test, log, metric or review"]
decisions: ["decision and rationale"]
risks: ["residual risk and control"]
next_actions: ["action, owner, deadline"]
```

**Why EngineOS needs it:** `rules/parallelism.md` demands "report partial failure honestly — never let a green summary hide a dead branch." A free-prose return makes that a matter of good intentions. A `status` field with three values makes it mechanical.

**Implementation:** add a `## Return format` section to every file in `agents/`; `audit-consolidator` parses it instead of re-reading prose.

### G7 — Named gates

**Source:** `21-ai-engineering-methodology/{DISCOVERY,DESIGN,IMPLEMENTATION,VALIDATION,RELEASE}_GATE.md`, `29-ai-software-engineering/VALIDATION_LADDER.md`, `golden-path/workflow.json`.

**Why EngineOS needs it:** EngineOS has an implementation gate (post-edit hooks) and a validation gate (Stop hooks) but never names them, has no explicit design gate, and **no release gate at all** — nothing requires a rollback plan or a named owner before something ships. The validation ladder (local → integration → staging → production) is also absent; `rules/testing.md` covers the pyramid but not the promotion path.

**Implementation:** `rules/gates.md` — one short table mapping each gate to the EngineOS mechanism that enforces it, marking the two holes as new requirements. Design gate triggers off G2's rules (public contract / >500 lines → ADR + design doc). Release gate: rollback path + owner + evidence bundle, enforced in `skills/release-notes`.

### G8 — Budget and degradation ladder

**Source:** `budgets/economic-guardrails.yaml`:

```yaml
limits: { per_execution_usd: 5, daily_project_usd: 500, monthly_organization_usd: 25000 }
degradation_order: [cache, smaller_model, reduced_context, defer_batch, deny]
```

Plus the rule recovered from v11's `runbooks/MODEL_PROVIDER_OUTAGE.md` (dropped in v12, see §1): *"Activate provider fallback only when data residency and evaluation gates allow it. Otherwise degrade to queued or human-reviewed mode."*

**Why EngineOS needs it:** `rules/models.md` says "never trade correctness for cost" and stops there. When a fan-out wave hits a budget wall the correct behaviour is a defined ladder, not improvisation. The ordering — degrade context before degrading the model, defer before denying — is a good default and costs nothing to adopt. The recovered rule adds the part the ladder alone misses: each rung is **gate-checked, not automatic**. Silently swapping to a cheaper model on a task whose gates assume the stronger one is exactly the correctness-for-cost trade `rules/models.md` forbids; when no rung passes its gate, the answer is defer or ask, never quiet degradation.

**Implementation:** a "Budget and degradation" section in `rules/models.md`. Absolute dollar limits are a per-project delta (project `CLAUDE.md`), not a team constant.

### G9 — Context engineering

**Source:** `03-context-engineering/CONTEXT_ENGINEERING.md`, `54-knowledge-operating-system/KOS_OVERVIEW.md`.

Layers: permanent instructions → domain context → task state → retrieved evidence → summarized history → output format. Rules: separate facts from hypotheses, preserve origin and date, avoid duplication, summarize long history, strip secrets, never treat memory as absolute truth. And the operating rule: *"No agent should scan the whole repository. It queries the routing index, selects few documents, validates preconditions, and records the evidence used."*

**Why EngineOS needs it:** `rules/memory.md` governs *where knowledge lives*; nothing governs *what gets loaded into a given turn*. The router loads rules; nobody says how much repository to read or when to compress. Sub-agent briefings in particular have no context budget.

**Implementation:** `rules/context.md`, always-on, kept under 40 lines. Direct consequence for `Explore`/coordinator dispatch: state the evidence used, don't sweep.

### G10 — Retrospective loop

**Source:** `29-ai-software-engineering/RETROSPECTIVE_AND_LEARNING.md`, `52-agent-intelligence/CONTINUOUS_LEARNING.md`, `policies/v13/self-improvement-policy.yaml`.

**Why EngineOS needs it:** `.engineos/archived/` holds 21 closed change records; nothing ever reads them. `rules/memory.md` has a promotion rule ("repeated 3 times → project CLAUDE.md; adopted by a second project → EngineOS rules") with no mechanism to detect the third repetition.

**Implementation:** `skills/retro/SKILL.md` — periodic pass over archived records and eval failures, emitting proposed deltas to `rules/`, `skills/`, `registries/decision-rules.json` as a PR. Constrained: it proposes, a human merges. This is what closes the loop and makes EngineOS compound rather than ossify.

### G11 — Integrity tests for EngineOS itself

**Source:** `57-validation/INTEGRITY_TESTS.md`, `scripts/validate_kos.py`, `57-validation/QUALITY_SCORECARD.md`.

Required checks: unique IDs, mandatory fields present, all relations resolve to existing IDs, JSON validates against schema, indexed paths exist, no empty documents, no registry pointing at a missing document. Non-zero exit on violation.

**Why EngineOS needs it:** `CLAUDE.md` states the closure rule for rule cross-references ("`backend.md` defers logging to `observability.md`, so every row loading the first must load the second") and enforces it by human diligence. It also documents that four hooks silently no-op without `jq`. Both are checkable.

**Implementation:** `scripts/validate-engineos.sh`, in CI:

- every rule file referenced by the router table exists;
- every `rules/*.md` cross-reference resolves, and every router row loading X also loads X's non-always-on deferrals (the closure rule, automated);
- router table domains == `hooks/routing-map.sh` domains (until G3 makes this structural);
- every agent has a `commands/agents/<name>.md` and a `commands/agents/<alias>.md`;
- every skill directory has a `SKILL.md` with `name` + `description`;
- `jq` presence check with a clear message.

Cheapest high-value item on the list. Recommend shipping it first.

### G12 — Compatibility and deprecation policy

**Source:** `64-change-governance/{SEMANTIC_VERSIONING_FOR_KNOWLEDGE,DEPRECATION_POLICY,COMPATIBILITY_POLICY,REVIEW_OWNERSHIP_MODEL}.md`.

**Why EngineOS needs it:** EngineOS ships as a plugin (`.claude-plugin/`) that other repos consume. Renaming a rule file or an agent alias silently breaks every downstream project's `CLAUDE.md`. There is no version contract and no deprecation window.

**Implementation:** `docs/COMPATIBILITY.md` — semver for the plugin (breaking = removed/renamed rule, agent, alias, or hook contract), one-minor deprecation window with a warning emitted by the hook, ownership per rule file.

### G13 — Adapters

**Source:** `executable-system/adapters/{claude-code,cursor,codex,github-copilot,chatgpt,mastra,openai-agents-sdk}.md`.

**Why EngineOS needs it:** the ambition is "best AI methodology and orchestrator", not "best Claude Code config". `templates/cursor/commands/` has two files and `templates/github/` two workflows. The methodology — router, gates, risk tiers, evidence contract — is tool-independent; only the enforcement mechanism (hooks) is Claude Code-specific.

**Implementation:** `templates/adapters/<tool>.md`, each stating: how rules get loaded, which enforcement is available, what degrades to convention. Honest degradation notes matter more than coverage — Copilot has no Stop hook, so the change-record gate becomes a PR-template checkbox there.

### G14 — Adversarial critic

**Source:** `49-ai-design-patterns/{CRITIC,JUDGE,DEBATE,SELF_CONSISTENCY,REFLECTION}.md`, `27-ai-patterns-catalog/REFLECTION_CRITIC_PATTERN.md`, `24-quality-engineering/LLM_AS_JUDGE.md`.

**Why EngineOS needs it:** `security-reviewer` is an adversarial pass for one dimension. There is no equivalent for correctness on high-risk non-security work. `skills/code-review` is external and user-invoked.

**Implementation:** `agents/critic.md` — read-only, prompted to refute rather than confirm, returns the G6 schema. Dispatch rule keyed to G1's risk tier: risk=high output gets an independent critic pass before "done". Keep it gated by risk so it doesn't tax routine work.

### G15 — Failure policy for dispatch

**Source:** `executable-system/workflows/*.yaml`:

```yaml
failure_policy:
  retry: bounded
  escalate_on: [security-risk, data-loss-risk, unresolved-uncertainty]
```

Plus `04-agents/ORCHESTRATION.md` controls: fan-out limit, per-agent timeout, idempotency, conflict consolidation, cancellation, retry with backoff, circuit breaker.

**Why EngineOS needs it:** `rules/parallelism.md` caps concurrency at ~6 and requires honest partial-failure reporting, but says nothing about what to do when an agent fails. Retry once? Escalate a tier per `rules/models.md`? Abandon the wave? Currently undefined.

**Implementation:** a "Failure policy" section in `rules/parallelism.md`: bounded retry (once, then escalate one model tier per `rules/models.md`, then stop); hard escalation triggers (security risk, data-loss risk, unresolved ambiguity) that never retry and always surface; explicit rule that a failed unit blocks its wave's barrier rather than being silently dropped.

---

## 5. Adoption plan

Four waves. Each is independently shippable and leaves EngineOS working.

**Wave 1 — make the current system verifiable (S, ~1 PR each)**
`G11` integrity tests · `G4` routing + agent evals · `G6` agent return format

Rationale: before adding methodology, prove the existing one holds together. G11 and G4 also become the regression net for waves 2–4. G6 is a prerequisite for G14 and for `audit-consolidator` improvements.

**Wave 2 — add the missing axis (S–M)**
`G1` risk/autonomy · `G7` named gates · `G15` failure policy · `G9` context rule · `G8` budget ladder

All rule-file work, no infrastructure. G1 lands first — G7 and G14 both key off it.

**Wave 3 — move policy from prose to data (M, highest risk)**
`G3` routing registry + generator · `G2` decision-rules registry

The payoff is that `CLAUDE.md` stops being both constitution and configuration. Requires wave 1's evals to be trustworthy before touching the router.

**Wave 4 — compounding and reach (M)**
`G10` retro skill · `G5` handoff contract · `G14` critic agent · `G12` compatibility policy · `G13` adapters

G10 is the one that makes the system improve on its own; it needs waves 1–3 in place to have signal worth mining.

Per `rules/parallelism.md`, waves 1, 2 and 4 each contain independent units over disjoint file scopes and should be fanned out, not done serially. Wave 3's two items share `hooks/` and `CLAUDE.md` — serialize them.

---

## 6. Explicitly not adopted

| Source area | Why not |
|---|---|
| `packages/` (52 TS libs), `apps/` (27 services) | A hosted multi-tenant AI control plane: model gateway, federation, marketplace, threat-ops center, provenance ledger, admin portal. EngineOS is a config repo consumed by a plugin. Wrong product. |
| `helm/`, `docker/`, `migrations/`, `dashboards/`, `monitoring/` | Infrastructure for the above. |
| `compliance/{GDPR,SOC2,ISO27001,LGPD,NIST_AI_RMF}.md` + `control-catalog.json` | Compliance evidence packages for an enterprise platform. If a consuming project needs them, they belong in that project, not the team constitution. |
| FinOps: `optimization/`, `registries/value_metrics.json`, cost dashboards | Only the degradation ladder (G8) is portable. Unit-economics modelling is not a coding-agent concern. |
| The 384 `knowledge/*.md` documents | ~85% duplicated boilerplate; Portuguese; would collapse EngineOS's signal density. The taxonomy is kept as a coverage checklist (this document); the prose is not. |
| `metadata/knowledge_graph.json`, RAG chunking profile | Presupposes a retrieval layer over the corpus. EngineOS loads rules directly by path — cheaper and more deterministic. Revisit only if the corpus grows past what fits in context. |

---

## 7. How we would know it worked

Concrete, checkable — the same standard non-negotiable #2 applies to code.

1. `scripts/validate-engineos.sh` exits 0 in CI, and fails on a deliberately broken cross-reference.
2. `scripts/run-evals.sh` reports ≥ 90% on `evals/routing-cases.jsonl`, with the failures enumerated rather than hidden.
3. Every agent in `agents/` returns a parseable `status` field; `audit-consolidator` no longer parses prose.
4. Every router announcement carries `risk=` and the required gates for that risk.
5. The router table in `CLAUDE.md` is generated — editing it by hand fails CI.
6. One retro pass has produced at least one merged rule change traceable to an archived change record.
7. Plugin version is semver'd, and a rename has gone through a deprecation window without breaking a consuming repo.

Items 1, 2 and 5 are the ones that separate "a methodology document" from "an enforced methodology" — which is the actual claim being made.
