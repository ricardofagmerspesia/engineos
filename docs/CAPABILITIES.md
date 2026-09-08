# EngineOS — capability and evidence matrix

**Status:** baseline measured 2026-09-07 · **Snapshot:** `99b5eec` (clean working tree, except `skills-lock.json`)
**Rule for this table (E01):** a capability only appears as *available* if there is an implementation **and** evidence that exercises it. Design, spec and written rule do not count as implementation. Where the evidence is indirect, that is said.

This matrix exists because the PRD (`docs/PRD.md`, Draft v1 of 2026-06-11) describes the original intent, not the current state. It is the source for release notes, for the compatibility map and for what can be announced to a user.

## Legend

| State | Meaning |
|---|---|
| **Available** | Implemented and covered by automated verification over the release bytes. |
| **Partial** | An implementation exists, but an announced part of the behavior is not wired up or is not verified. |
| **Planned** | A design, rule or spec exists; there is no implementation. It cannot be announced. |

## Matrix

| Capability | State | Implementation | Evidence | Gap / epic |
|---|---|---|---|---|
| Intent routing and rule/skill loading | Available | `registries/intents.json`, `registries/routing.json`, `agents/router.md`, `hooks/` | `scripts/validate-engineos.sh` — 108 checks, 0 failures over the extracted package | — |
| Deterministic decision kernel (risk, admission, breaker, HITL) | Partial | `scripts/kernel.sh` (`risk`, `admit`, `breaker`, `hitl`, `skill-state`), `registries/policy.json`, `registries/decision-rules.json` | the `node:test` suites in `src/kernel/` (units per arm, `kernel*.e2e.test.ts` over the published bundle, `parity.test.ts` against the pinned bash kernel); kernel checks and backpressure/HITL coupling checks | Risk, admission and breaker are still not connected to real execution transitions. Only `enabled=false` gained an enforcement point. E04 |
| Quality gates per hook (typecheck/lint/tests) | Available | `hooks/hooks.json` + `hooks/*.sh` | Hook mode and wiring checks; `npm test` 24/24 | — |
| TypeScript runtime (CLI) | Partial | `src/cli.ts`, `src/dispatch.ts`, `src/io.ts`, `src/node-guard.ts`, `dist/engineos.cjs` | clean typecheck, 24/24 tests, `dist` vs `src` drift guard in CI | It is CLI dispatch, not a runner: there are no execution states, budget, deadline, cancellation or persisted approval. E04 |
| Administrative console | Partial | `console/` — entities: skills (editable), agents and models (read-only); guards: `publish-lock.ts` + `detectBaseConflicts`; APIs: `skills`, `agents`, `models`, `effective`, `publish`, `diff`, `history`, `rollback` | 20 behavior tests (`npm test`); typecheck and lint; `console` job in CI; 22 agents and 4 tiers resolved from the real tree, 19 aliases matching the generated registry | Agents and models are read-only; MCPs, routing and rules do not exist as entities; no declared precedence; no authentication/RBAC. E03 |
| Reproducible distribution (package, manifest, checksum) | Available | `scripts/package-release.sh`, `package` job in `.github/workflows/ci.yml` | Artifact `engineos-1.6.0-99b5eec.zip`: 344 files, validate 108/0, `npm ci` from the lockfile, typecheck, 24/24 tests | The platform matrix covers Linux and Windows/Git Bash in CI; macOS is not declared supported. E02 |
| End-of-line and permission portability | Available | `.gitattributes` (LF for all text, CRLF only for `*.ps1`), verification in the packager, checks `C32`/`C33` | The `package` job fails if the checkout diverges from HEAD; `C33` audits 571 POSIX text files; CRLF and execute-bit verification over the final bytes | Platform matrix in `docs/COMPATIBILITY.md`; macOS out |
| Telemetry / exec journal | Partial | `scripts/exec-journal.sh`, `scripts/telemetry.sh`, `rules/observability.md` | Span schema, bidirectional wiring and field guard checks | No consumer: no OpenTelemetry export, dashboard, alert or SLO. No aggregated cost/latency. E05 |
| Evals | Partial | `evals/intent-routing-cases.jsonl` (33 cases), `evals/agent-cases.jsonl` (16), `scripts/run-evals.sh`, `.github/workflows/live-evals.yml` | Deterministic dataset integrity checks | No live run measured in this baseline; no metrics for tool selection, groundedness, leakage or cost. E06 |
| Memory and learning promotion | Planned | `rules/memory.md`, `docs/specs/2026-09-03-agent-memory-architecture-design.md`, `skills/retro/SKILL.md` | — | `promote-candidates` does not exist in the code; no grouping, deduplication, TTL or revocation. E07 |
| RAG | Planned | `rules/llm-apps.md`, `skills/eval-harness/references/retrieval-metrics.md` | Check that the three metrics are defined and referenced | Written guidance, with no corpus, ingestion, index or retrieval. E08 |
| Queues, workers, distributed recovery | Planned | — | — | Nothing implemented; required only if the distributed profile enters the release. E09 |
| Tool/MCP registry and authorization | Planned | `templates/mcp.template.json` | — | Manual configuration per template; no catalog, health check, rate limit or authorization on the server. E10 |
| Adapters for other tools (Cursor, Trae, Windsurf, `.agents`) | Partial | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/`, `templates/adapters/` | Check `C32` — the three mirrors are byte-for-byte identical (147 files × 2); honest enforcement matrix in `templates/adapters/README.md` | Outside Claude Code, the Stop gates degrade to convention — that is documented, not solved. CI is the only portable layer. They stay out of the package by default (`--with-ide-mirrors`). E01 |

### Effective configuration — the console shows what the runtime decides

`GET /api/effective?path=…&prompt=…` answers by calling **`scripts/kernel.sh`**, the same binary the hooks call, and returns the origin of each part of the answer alongside it. There is no second resolver in TypeScript, and that is the decision: a second resolver drifts, and a console that confidently shows the wrong answer is worse than one that shows nothing.

Suppressed skills appear **as suppressed, with the reason**. Whoever simulates a route before publishing sees that a skill was withheld and why, instead of reading a short list and assuming it is complete.

### Publishing — what can no longer happen

The console edits a **copy**. Between the moment a draft captured a file and the click on Publish, that file may be edited by hand, by another console session or by a git operation. Publishing then discarded that work silently — no error, no diff, no trace. Since 2026-09-07:

| Situation | Before | Now |
|---|---|---|
| File changed on disk since the draft was captured | Overwrote without warning | Publish refused, naming the files |
| Draft with no recorded base revision | The concept did not exist | Refused as an unknown base (fail-closed) |
| Two concurrent publishes | Interleaving of `git add`/`commit` | Serialized by a directory lock, across processes |
| Rollback over a file with an uncommitted change | `git revert` aborted or stopped on a conflict | Refused before touching anything |

The lock is `mkdir`, not an in-memory flag: a flag would not exclude a **second instance** of the console pointed at the same repository, which is exactly the concurrent-publish case.

### Skill enablement — what the switch is worth

`enabled: false` stopped being decorative on 2026-09-07. The kernel stops recommending the skill and says that it suppressed it; what it does **not** do is prevent anyone from invoking it by name, because the Skill tool reads the directory and there is no hook between the two things. Real blocking requires uninstalling the skill. The full contract, with where it is tested, is in [`COMPATIBILITY.md`](COMPATIBILITY.md#what-enabled-false-does-and-does-not-do).

This is enforcement of **recommendation**, not of execution — and it is the limit that separates this line from an "available" for E03 as a whole.

## Deployment profiles

| Profile | Description | Gates required before release |
|---|---|---|
| **Local (single-dev)** | Installation in `~/.claude` via `install.sh`/`install.ps1`; console not hosted | E01, E02; support, safe update and recovery of the local installation |
| **Team (shared repo)** | The same package distributed to 2–10 people via git | The previous one + E03 (sound console, publish and rollback) and E06 (blocking regression) |
| **Hosted** | Console served to more than one operator | The previous one + authentication, RBAC, isolation, central auditing (E03/E10) and observability with alerting (E05) |
| **Distributed** | Execution through queues and workers | All of the previous ones + E09 (idempotency, lease, recovery, load) |

An incomplete feature stays disabled and explicitly **not supported** in the released profile. No profile has been released as of this date: SLO, RPO, RTO, retention and budget do not have defined values yet (see section 8 of the production readiness plan).

## Recorded decisions

The decisions that hold this matrix up live in ADRs, each one with its rejected alternative — a decision without a rejected alternative is a preference, not a decision:

| ADR | Status | What it settles |
|---|---|---|
| [`2026-09-07-release-from-commit-with-allowlist`](adr/2026-09-07-release-from-commit-with-allowlist.md) | accepted | The artifact is a function of a commit, by allowlist; the test runs over the final bytes |
| [`2026-09-07-versioned-config-contract`](adr/2026-09-07-versioned-config-contract.md) | proposed | Immutable `config_version` pinned per execution; publishing conditional on the base revision |
| [`2026-09-07-approval-bound-to-effect`](adr/2026-09-07-approval-bound-to-effect.md) | proposed | An approval is valid for (action, arguments, target, `config_version`) — never per session |
| [`2026-09-07-when-to-split-a-service`](adr/2026-09-07-when-to-split-a-service.md) | proposed | Five observable triggers for extracting a service; none has fired to date |
| [`2026-09-04-typescript-runtime-over-bash`](adr/2026-09-04-typescript-runtime-over-bash.md) | accepted | Language of the core (method/runtime boundary) |
| [`2026-09-03-hitl-as-kernel-entity`](adr/2026-09-03-hitl-as-kernel-entity.md) | accepted | HITL as a queryable entity, with a closed vocabulary of reasons |

The three ADRs in `proposed` describe E03/E04/E09 contracts that are not implemented yet. While they stay in that state, the corresponding behavior **cannot** be announced.

## Known divergences from the PRD

PRD Draft v1 declares as *non-goals* three things the repository already does. That needs to be corrected in the PRD, not here:

1. "Non-Claude tooling (Cursor rules, Copilot instructions)" — `.cursor/`, `.trae/`, `.windsurf/`, `.agents/` and `templates/adapters/` exist for Codex, Cursor and GitHub Copilot.
2. "Building a custom plugin marketplace" — `.claude-plugin/marketplace.json` exists.
3. "CI/CD agent automation" — `.github/workflows/ci.yml` and `live-evals.yml` exist.

Beyond that, the PRD's open questions about an API key in `settings.json` predate this repository; the secret scan over the release bytes found nothing, which is not proof of absence.
