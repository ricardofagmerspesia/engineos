# EngineOS 2.0 — Decomposition of the epics into tasks

Date: 2026-09-06 · Source: `EngineOS 2.0 — Production readiness plan` (rev. 2)
State: decomposition for execution. No task here has been executed.

## How to read

Each task has an ID `E0X-Tn`, scope in real files of this repository, dependencies,
risk tier and autonomy ceiling per `rules/risk-autonomy.md` / `registries/policy.json`,
the gate on the ladder `discovery → design → implementation → validation → release`
(`policy.json` `gates.ladder`) that it has to cross, a verifiable acceptance and the
evidence that closes the task.

Conventions applied:

- **Verifiable acceptance** is an observable postcondition, not a description of effort.
- **Evidence** is the artifact a third party can re-run or audit.
- A task that touches >2 files or creates a new capability requires a spec before the code
  (non-negotiable #1 of `CLAUDE.md`, `gates.spec_threshold`).
- `high` risk requires a validation gate with `critic` and a release with human approval
  (`policy.json` `gates.by_risk.high`).
- A task that changes public surface follows `docs/COMPATIBILITY.md`: deprecation with a
  window, never a silent rename.

Current state verified in the working tree on 2026-09-06 (commit `fed9a63`):
`package.json` and `.claude-plugin/plugin.json` at `1.6.0`; `registries/policy.json` at `1.6.0`;
`docs/PRD.md` at `Draft v1` dated 2026-06-11; `console/src` with the skills vertical
only (`entities/skills.ts`, `validate/skills.ts`, routes `skills`, `publish`, `history`,
`rollback`, `diff`); `console/.data/console.sqlite` versioned in the working tree;
`scripts/kernel.sh` exposing 14 subcommands; `src/` with `cli.ts`, `dispatch.ts`, `io.ts`,
`node-guard.ts`; `evals/` with two datasets and `RUBRIC.md`.

---

## E01 — Baseline, scope and release

Owner: Tech Lead + product owner · Dependency: none · Phase: F0
Nature: consolidation. Blocks everything else — no other task should start
without the canonical snapshot fixed.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E01-T1 | Fix the canonical snapshot | `git`, working tree | — | low | A3 | implementation | Difference between the working tree and `HEAD` classified into: semantic, end of line, file mode. No unexplained semantic difference | Report with commit, artifact hash, `git diff --stat` normalized by `-w --ignore-cr-at-eol` |
| E01-T2 | Inventory what shipped in the previous package | ZIP artifact, `.gitignore` | E01-T1 | medium | A2 | implementation | List of items present in the ZIP and absent from `HEAD`, with an explicit decision (include/exclude) for each class | Versioned inventory; `console/.data/`, `console/.next/`, `node_modules/` marked for exclusion |
| E01-T3 | Define the deployment profiles | `docs/PRD.md`, new `docs/DEPLOYMENT-PROFILES.md` | E01-T1 | medium | A2 | design | Named profiles exist (local single-user, local team, hosted) with population, load, criticality and the set of mandatory gates per profile | Document approved by the product owner |
| E01-T4 | Capability matrix per profile | new `docs/CAPABILITIES.md` | E01-T3 | medium | A2 | design | Every announced capability has a state (implemented / partial / planned), an implementation point, evidence and the profile it is supported in. No capability that is only designed appears as available | Matrix with a link to the file and the test for each row |
| E01-T5 | Update the PRD to the 2.0 scope | `docs/PRD.md` | E01-T4 | medium | A2 | design | The PRD separates available capabilities, partial integrations and planned extensions; the status stops being `Draft v1` | PRD revised with date and owner |
| E01-T6 | Synchronize the product version | `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `registries/policy.json`, `docs/release-notes/` | E01-T5 | medium | A2 | implementation | The package version, the manifests and the release notes agree. Schema versions evolve in a field of their own and are not renumbered along with it | `scripts/validate-engineos.sh` green + release notes for the version |
| E01-T7 | Release compatibility map | `docs/COMPATIBILITY.md`, `docs/release-notes/` | E01-T6 | high | A1 | design | Every changed public surface appears as a deprecation with a window and a replacement; no removal in the same release that deprecates | Public surface diff + deprecation table |
| E01-T8 | Matrix per adapter | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/`, `AGENTS.md` | E01-T4 | medium | A2 | design | Each adapter classified as blocking, checked in CI, advisory or conventional, with the product's real capability revalidated on the date | Dated matrix with the revalidation source |
| E01-T9 | ADR — method/runtime boundary | `docs/adr/` | E01-T3 | medium | A2 | design | Decision recorded on what is a rule in prose, what is deterministic kernel and what is runtime. Extends `2026-09-04-typescript-runtime-over-bash.md` | ADR accepted |
| E01-T10 | ADR — versioned configuration contract | `docs/adr/`, `registries/` | E01-T9 | high | A1 | design | `config_version` defined: what composes it, how it is computed, how a run pins it and how it compares to the base hash | ADR accepted + example schema |
| E01-T11 | ADR — approval policy for external effect | `docs/adr/`, `registries/policy.json` (`hitl`) | E01-T9 | high | A1 | design | Extends `2026-09-03-hitl-as-kernel-entity.md`: approval bound to action, arguments, target and version; explicit invalidation rules | ADR accepted |
| E01-T12 | ADR — criteria for splitting services | `docs/adr/` | E01-T9 | medium | A2 | design | Objective criteria (concurrency, isolation, independent deployment) that authorize extracting a process or a service | ADR accepted |
| E01-T13 | Traceability policy → application → test | new `docs/TRACEABILITY.md` | E01-T4 | medium | A2 | validation | Every rule in `registries/policy.json` and `registries/decision-rules.json` points to its application point in the code and to the test that covers it. A rule without an application point is marked as not applied | Table generated and checked in CI |

### Finding measured on 2026-09-06 — advances part of E01-T1 and E02-T3

Measurement executed in this working tree (Windows checkout) against a normalized
`git archive HEAD`, with the commands below. It is not a conclusion of the plan: it is
input data for E01-T1, and it reduces the task's scope.

| Measurement | Command | Result |
|---|---|---|
| Raw differences vs `HEAD` | `git diff --numstat HEAD` | **512 files** |
| Differences ignoring CR and whitespace | `git diff -w --ignore-cr-at-eol --numstat HEAD` | **0 files** |
| Integrity in the working tree | `bash scripts/validate-engineos.sh` | **90 ok / 18 FAIL** |
| Integrity in a copy of `git archive HEAD` | same, in `/tmp` | **108 ok / 0 FAIL** |

Reading:

1. **There is no semantic divergence** between the working tree and `HEAD`. The 512 files
   differ exclusively by end of line. E01-T1 already has its answer and becomes a
   recording task, not an investigation.
2. **The cause of the 18 failures is CRLF in files that `.gitattributes` does not cover.**
   `.gitattributes` declares `eol=lf` only for `*.sh` and `dist/engineos.cjs`; direct
   verification confirms `hooks/lib-common.sh` and `scripts/kernel.sh` in LF and
   `rules/observability.md`, `rules/risk-autonomy.md`, `rules/llm-apps.md` in CRLF. The
   prose-mirror failures (`observability.md-has-no-Agent-traces-section`,
   `risk-autonomy.md-has-no-Human-in-the-loop-section`, `llm-apps.md-has-no-RAG-section`)
   are the CR breaking the section match, not a missing rule. That **confirms E02-T3** and
   fixes its scope: extend `eol=lf` to `*.md`, `*.json`, `*.jsonl` and `*.mjs`.
3. **The file-mode failure is not conclusive by this route.** The
   `library-carries-the-executable-bit` lines were observed through a mount that exposes
   every file as `-rwx`. That is an artifact of the mount, not evidence about the real
   checkout. E02-T4 still requires verification on the target platform — recording this
   measurement as proof of a mode defect would be exactly the error the plan forbids.

Consequence for the sequencing: E02-T3 rises in priority inside F0.4, because today any
run of `validate-engineos.sh` on a Windows machine produces 18 failures that do not
exist in the code — noise that trains the team to ignore its own integrity gate.

**Epic acceptance:** every announced capability points to an implementation and to
evidence; no functionality that is only designed appears as complete; the product version
and the release documentation agree.

---

## E02 — Reproducible distribution and portability

Owner: DevOps · Dependency: E01 · Phase: F0 · Nature: consolidation + correction

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E02-T1 | Allowlist-driven packager | new `scripts/package.sh`, `.github/workflows/ci.yml` | E01-T1, E01-T2 | medium | A2 | implementation | Package generated from `git archive <commit>` with an explicit allowlist. An item outside the allowlist does not get in, even when present in the working tree | Package manifest compared against the allowlist in CI |
| E02-T2 | Local-state denylist | allowlist in `scripts/package.sh` | E02-T1 | high | A1 | implementation | `console/.data/`, `console/.next/`, `node_modules/`, `.engineos/` and caches absent from the artifact. An unclassified path is a **hard error**, not a silent inclusion | `unzip -l` of the final artifact without those entries + test with a planted file |
| E02-T3 | Normalize end of line per consumed format | `.gitattributes` | E02-T1 | medium | A2 | implementation | Every format read by a parser (`*.sh`, `*.json`, `*.jsonl`, `*.mjs`, rule `*.md`) has `eol=lf` declared. A checkout with `core.autocrlf=true` does not change the bytes of those files | Checkout test on Windows comparing hashes |
| E02-T4 | Preserve the execute mode | `install.sh`, `install.ps1`, new bootstrap | E02-T3 | medium | A2 | implementation | After extraction, executable scripts run without a manual `chmod`. Where the ZIP does not preserve the mode, the documented bootstrap restores it and is tested | Test on Linux and Windows/Git Bash from the artifact |
| E02-T5 | Manifest and checksum | `scripts/package.sh` | E02-T1 | medium | A2 | implementation | The artifact ships with a manifest (file, size, hash) and the package's SHA-256 checksum, both traceable to the commit | Manifest + checksum published with the release |
| E02-T6 | Secret and dependency scan | `.github/workflows/ci.yml` | E02-T1 | high | A1 | validation | The scan runs over the artifact's final bytes and over the lockfile. A confirmed finding blocks the release and is documented in the fix | Scan report attached to the release |
| E02-T7 | Platform matrix | `.github/workflows/ci.yml`, `docs/COMPATIBILITY.md` | E02-T4 | medium | A2 | validation | Linux and Windows/Git Bash covered; macOS covered if declared supported. An untested platform is declared unsupported | One job per platform with the log preserved |
| E02-T8 | Artifact E2E test | new `scripts/test-package.sh` | E02-T4, E02-T5 | high | A1 | validation | The sequence extraction → installation in a clean environment → idempotent rerun → smoke task → removal → recovery passes with no undocumented manual adjustment | Full log of the sequence in CI, over the release bytes |
| E02-T9 | Source ↔ bundle sync **in the artifact** | `scripts/test-package.sh` | E02-T1 | low | A3 | validation | The `dist` drift guard already exists in `ci.yml` and runs over the checkout. What is missing is asserting it over the artifact's bytes | Step 2 of `scripts/test-package.sh` checking the bundle hash against the manifest |
| E02-T10 | CRLF and permission regression | `scripts/test-package.sh` | E02-T3, E02-T4 | medium | A2 | validation | Automated regression detects the reintroduction of CRLF or the loss of the execute bit in the final package | Test that fails when the defect is reintroduced on purpose |

**Corrections verified on 2026-09-06, before executing E02:**

- `console/.data/` and `console/.next/` **were never tracked** — `console/.gitignore`
  already ignores them and `git ls-files console/.data` returns empty. The package
  contamination came from packaging the working tree, not from git. The fix is to package
  from `git archive`, and E02-T2 changes from "stop tracking" to "denylist with a hard error".
- The `dist/engineos.cjs` drift guard **already exists** in `.github/workflows/ci.yml`.
  E02-T9 shrinks to asserting it over the artifact.
- `.github/workflows/ci.yml` runs **27 steps, only on `ubuntu-latest`, and always over the
  checkout** — no step extracts a package or installs from one. That confirms E02-T7 and
  E02-T8 as real gaps, not as reinforcement of something that already exists.
- `install.sh` lines 30-33: the secret scan uses tracked files when it is in a work tree
  and falls back to a recursive `grep -rIlE` when it is not. **An extracted ZIP is not a
  work tree**, so every real consumer walks the fallback branch — the only one no test
  exercises. Added to the scope of E02-T6.

Detail in `docs/specs/2026-09-06-f0-baseline-and-distribution-design.md`.

**Epic acceptance:** the published artifact installs without undocumented manual
adjustments; it contains only the items foreseen in the manifest; the tests use the
release's final bytes.

---

## E03 — Complete and secure administrative console

Owner: Frontend + Backend, with security review · Dependencies: E01; E10 for
tool/MCP metadata · Phase: F1 · Nature: consolidation

Current state: only the skills vertical exists (`console/src/lib/entities/skills.ts`,
`console/src/lib/validate/skills.ts`). The schema in `console/src/lib/store/schema.ts` is
already generic by `kind` — adding an entity should not require a schema migration.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E03-T1 | `agent` entity | `console/src/lib/entities/agents.ts`, `registries/agents.json` | E01-T4 | medium | A2 | implementation | Agents are listed, edited, validated and published from the real registry; no hardcoded empty list | Test of read → edit → publish → re-read |
| E03-T2 | `model` entity | `console/src/lib/entities/models.ts`, `registries/models.json` | E01-T4 | medium | A2 | implementation | Models and tiers editable; binding validated against the declared capabilities | Test equivalent to E03-T1 |
| E03-T3 | `mcp`/`tool` entity | `console/src/lib/entities/tools.ts`, registry from E10 | E10-T1 | high | A1 | implementation | Tool/MCP catalog read from the operational registry, with risk and allowed projects visible | Read test + refusal to activate without validation |
| E03-T4 | `routing` entity | `console/src/lib/entities/routing.ts`, `registries/routing.json` | E01-T4 | high | A1 | implementation | Routes editable with glob and precedence validation; an invalid edit is rejected before publishing | Test of an invalid route being rejected |
| E03-T5 | `rule` entity | `console/src/lib/entities/rules.ts`, `rules/*.md`, `registries/decision-rules.json` | E01-T13 | high | A1 | implementation | Rules editable with verification of the load closure described in `CLAUDE.md` (a row that loads A where A defers to B requires loading B) | Test that rejects a non-closed load row |
| E03-T6 | Real relations graph | `console/src/lib/entities/graph.ts` | E03-T1..T5 | medium | A2 | implementation | skill ↔ agent ↔ model ↔ route ↔ tool relations loaded from the real state; an orphan reference is flagged | Test with a planted broken reference |
| E03-T7 | Enable/disable and binding | entities + `console/src/app/api/publish/route.ts` | E03-T6 | high | A1 | implementation | `enabled=false` is written and persists; model binding can be done per action, route, agent and skill | Field persistence test |
| E03-T8 | Precedence and conflict | `console/src/lib/entities/resolve.ts`, `registries/decision-rules.json` (`precedence`, `conflict_policy`) | E03-T7 | high | A1 | design | Precedence action → route → agent → skill → global default implemented. A conflict at the same level requires explicit resolution and is not decided by file order | Test of a tie at the same level blocking the publication |
| E03-T9 | Effective configuration with provenance | `console/src/app/` (new page) | E03-T8 | medium | A2 | implementation | For each effective choice, the interface shows the value and the origin (which level decided it) | Screenshot + provenance test |
| E03-T10 | Route simulation before publishing | integration with `scripts/kernel.sh resolve-task` | E03-T8 | medium | A2 | implementation | The operator simulates a task against the draft and sees route, risk, autonomy, gates and agents before publishing | Test comparing the simulation and the real execution |
| E03-T11 | Global draft validation | `console/src/lib/validate/` | E03-T6 | high | A1 | validation | An invalid reference and a disabled dependency without an explicit fallback prevent the publication | Negative test per invalidity class |
| E03-T12 | Transactional publication | `console/src/app/api/publish/route.ts`, `console/src/lib/fs-writer.ts`, `console/src/lib/git.ts` | E03-T11 | high | A1 | validation | The publication compares the base revision/hash; a file already modified outside the console is not overwritten; a failure between file writes, commit and snapshot leaves the operation recoverable and recorded | Test with a failure injected at each stage |
| E03-T13 | Serialization of concurrent publications | `console/src/lib/store/` | E03-T12 | high | A1 | validation | Two simultaneous publications do not interleave effects; the second observes the new revision or is rejected | Deterministic concurrent test |
| E03-T14 | Non-destructive rollback | `console/src/app/api/rollback/[historyId]/route.ts` | E03-T12 | high | A1 | validation | Rollback restores an intact version and does not silently discard a later change by the operator; a conflict is presented | Rollback test with an intermediate change |
| E03-T15 | Proven effect of `enabled=false` | runner from E04 + adapters from E10 | E03-T7, E04-T2 | high | A1 | validation | An entity disabled in the console is not used by the runtime. Where the tool does not apply the field, the limitation is displayed and a compatible mechanism exists | End-to-end test: disable → execute → verify non-use |
| E03-T16 | Local profile hardening | `console/src/lib/config.ts`, middleware | E03-T12 | high | A1 | validation | Interface and host restricted; a request from an unauthorized origin is rejected; path and arguments validated at the boundary | Negative tests for origin and path traversal |
| E03-T17 | Hosted profile: authn, RBAC, isolation | new authorization module | E03-T16, E10-T3 | high | A0 | release | Without authentication, RBAC and isolation between projects, the hosted profile stays disabled and declared unsupported | Negative authorization tests + release decision recorded |
| E03-T18 | Console in CI | `.github/workflows/ci.yml` | E03-T1 | low | A3 | implementation | Build, typecheck and lint of the console run in CI, in addition to the publication, conflict, rollback and authorization tests | Green job with the cited tests |

**Epic acceptance:** each entity type can be edited, validated and published; the runtime
uses the new configuration; rollback restores an intact version; a concurrent or invalid
change does not overwrite existing work.

---

## E04 — Runner and governed model calls

Owner: Backend/LLM · Dependencies: E01; initial interface from E10 · Phase: F2
Nature: extension + policy integration

Current state: `scripts/kernel.sh` resolves `admit`, `breaker`, `hitl`, `risk`, `gates`,
`repair`, `waves`, `scale`, `route-escalate`, `resolve-task`. The documentation
acknowledges that the decisions are not yet wired to real execution transitions — that is
exactly what this epic closes.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E04-T1 | Run state machine | new `src/runner/state.ts` | E01-T10 | high | A1 | design | States `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `cancelled`, `timed_out` with persisted transitions and explicit terminality. An invalid transition is rejected, not corrected | Transition-table test covering every invalid edge |
| E04-T2 | Configuration pinning per execution | `src/runner/` | E01-T10, E03-T12 | high | A1 | implementation | Each run pins `config_version`, identity and scope at the start and does not re-read them during the execution | Test: publishing during a run does not change the run in progress |
| E04-T3 | Admission before dispatch | `src/runner/` + `kernel.sh admit` | E04-T1 | high | A1 | implementation | A task outside the limit receives the foreseen `defer` or `reject` and is not dispatched | Test with a saturated queue |
| E04-T4 | Breaker before retry | `src/runner/` + `kernel.sh breaker` | E04-T3 | high | A1 | implementation | An open breaker prevents the call; `half-open` releases only the foreseen probes | Test of the three states with the observed result |
| E04-T5 | Deadline, cancellation and step limit | `src/runner/` | E04-T1 | high | A1 | implementation | An exceeded deadline ends in `timed_out`; cancellation prevents new external effects; the step limit ends without false success | Cancellation test during an in-flight call |
| E04-T6 | Budget reserved and reconciled | `src/runner/budget.ts` | E04-T5 | high | A1 | implementation | Capacity and budget are reserved before concurrent calls; real usage is reconciled on completion; an overrun blocks a new dispatch | Concurrent test with a budget overrun |
| E04-T7 | Approval persisted and invalidable | `src/runner/approval.ts` + `kernel.sh hitl` | E01-T11 | high | A0 | validation | The approval binds to action, argument hash, target and `config_version`. A change in any of them invalidates it. A confirmation already valid for the same action is not repeated | Invalidation test by argument change and by target change |
| E04-T8 | `ProviderAdapter` interface | new `src/providers/types.ts` | E01-T9 | high | A1 | design | Contract with output schema, timeout, typed errors and declared capabilities. Provider and model always explicit in the request and in the response | Contract reviewed + type tests |
| E04-T9 | Primary adapter and proof adapter | `src/providers/` | E04-T8 | medium | A2 | implementation | One adapter in use and a second one implemented to prove the contract's portability | Contract suite executed on both adapters |
| E04-T10 | Model resolution and fallback | `src/providers/resolve.ts`, `registries/models.json` | E04-T9 | high | A1 | implementation | Model and fallback are validated by availability and capability, not by tier name. The fallback reason is recorded; unmeasured cost is recorded as unknown, never as zero | Test with an unavailable model and with a missing capability |
| E04-T11 | Headless execution with envelope | `src/cli.ts`, `src/dispatch.ts` | E04-T5 | medium | A2 | implementation | Structured response with check evidence and a recoverable handoff, per `templates/handoff.md`. A failure does not become a success by prose interpretation | Test that injects a failure and checks the final status |
| E04-T12 | Runner failure suite | `src/runner/*.test.ts` | E04-T1..T11 | medium | A2 | validation | Timeout, invalid schema, exhausted budget, open breaker and cancellation have a final state and verified effects | Automated suite in CI |

**Epic acceptance:** tasks outside the limit are not dispatched; an open breaker prevents
the call; cancellation prevents new effects; a missing approval blocks the action that
requires it; a failure does not become a success by prose interpretation.

---

## E05 — Observability with real data

Owner: Backend/DevOps · Dependency: E04 · Phase: F2 · Nature: consolidation

Current state: `scripts/exec-journal.sh` and `scripts/telemetry.sh` exist;
`policy.json` `telemetry.exec_journal` is already checked by C27; the ADR
`2026-09-03-spans-extend-exec-journal.md` fixes the direction.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E05-T1 | Model, tool and runner spans | `scripts/exec-journal.sh`, `src/runner/`, `hooks/lib-common.sh` | E04-T1 | medium | A2 | implementation | Propagated context makes it possible to reconstruct an execution from start to finish, including nested calls | Full trace of a real execution |
| E05-T2 | Result taxonomy | `src/runner/`, `rules/observability.md` | E05-T1 | medium | A2 | design | A technical error, a policy block and a degraded result are distinguishable without reading the agent's text | Test that classifies the three cases |
| E05-T3 | Usage, latency and cost with availability | `src/providers/`, `scripts/telemetry.sh` | E05-T1 | high | A1 | implementation | Reported tokens, latency and computable cost are captured; an availability field distinguishes a measured zero from an absence of measurement | Comparison between the recorded usage and the provider's response |
| E05-T4 | OpenTelemetry export | new `src/telemetry/otlp.ts` | E05-T2 | medium | A2 | implementation | Spans exported over OTLP to a configurable collector; an export failure does not bring the execution down | Collector receiving an end-to-end trace |
| E05-T5 | Dashboard and alerts | observability infrastructure | E05-T4 | medium | A2 | validation | The dashboard shows success per task type, cost, latency, retries, queues, blocks and bypass. Every alert has a named owner | Synthetic alert reaching the owner |
| E05-T6 | Redaction of sensitive content | `scripts/telemetry.sh`, `src/telemetry/` | E05-T1 | high | A0 | validation | Logs do not contain prompts, secrets or personal content by default. Enabling broader capture is an explicit and recorded decision | Test with a planted secret that does not appear in the output |
| E05-T7 | Breaker fed by the observed result | `src/runner/`, `kernel.sh breaker` | E05-T2, E04-T4 | high | A1 | implementation | The breaker state is persisted, with a defined window, resource key and recovery. Failure detected by result, not by text | Test of breaker opening and recovery |
| E05-T8 | SLOs and capacity limits | `docs/DEPLOYMENT-PROFILES.md` | E05-T5 | high | A1 | release | SLOs per task class and capacity limits defined before the release, with a staging baseline. A later revision preserves the previous evidence | Versioned baseline + signed targets |
| E05-T9 | Independent record of bypass | `hooks/`, `scripts/telemetry.sh` | E05-T1 | high | A1 | validation | Bypass use is recorded through a path independent of the mechanisms it turns off. The record makes clear that a local control is alterable by the operator | Test with bypass active generating a record |
| E05-T10 | Retention and expiration | `policy.json` `telemetry.retention_days` | E05-T6 | medium | A2 | validation | Expiration and retention are demonstrable: data beyond the window is not recoverable | Expiration test with a controlled clock |
| E05-T11 | Diagnostic runbook | new `docs/runbooks/` | E05-T5 | low | A3 | implementation | The runbook makes it possible to locate latency between model, tool, queue and retries without tacit knowledge | Runbook executed by a person who did not write it |

**Epic acceptance:** reconstruct an execution from start to finish; compare usage with the
provider's response; detect a failure without depending on the agent's text; demonstrate
expiration and retention.

---

## E06 — Behavior and effectiveness evals

Owner: QA/LLM · Dependencies: baseline in E01; complete metrics after E04/E05
Phase: starts in F0, blocks from F2 on · Nature: consolidation

Current state: `evals/intent-routing-cases.jsonl` (33 cases), `evals/agent-cases.jsonl`
(16 cases), `evals/RUBRIC.md`, `.github/workflows/live-evals.yml`. In the execution cited
in the analysis, the 33 live cases were skipped — there is no evidence of live accuracy in
that run.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E06-T1 | Separate the four layers | `scripts/run-evals.sh`, `evals/` | — | medium | A2 | design | Structural checks, kernel tests, runner tests and live evaluations are executable and reportable separately. One layer's result is not presented as another's | Report per layer |
| E06-T2 | Version dataset, scorer and configuration | `evals/`, result format | E06-T1 | medium | A2 | implementation | Every result records the dataset, scorer, prompt, model and configuration versions | Auditable, re-runnable result |
| E06-T3 | Broaden case coverage | `evals/*.jsonl` | E06-T1 | medium | A2 | implementation | The suite includes Portuguese, an ambiguous request, a dangerous action, an unavailable tool and a combination of domains | Count per category + case review |
| E06-T4 | Behavior metrics | `scripts/run-evals.sh`, `evals/RUBRIC.md` | E06-T2 | medium | A2 | implementation | Tool selection, arguments, real completion by postcondition, groundedness, undue refusal, leakage, cost and latency are measured. Completion is proven by a postcondition, not by the agent's assertion | Execution with verified postconditions |
| E06-T5 | Calibrated judge | `evals/` | E06-T4 | medium | A2 | validation | The judge has a calibration against human review and the disagreement is reported, not hidden | Agreement report |
| E06-T6 | Execution triggers | `.github/workflows/ci.yml`, `.github/workflows/live-evals.yml` | E06-T2 | medium | A2 | implementation | The deterministic ones run on PR; a live subset runs on a prompt change, model binding or relevant policy change; the broad suite is scheduled with a cost ceiling | Workflow configuration + cost per run |
| E06-T7 | Blocking planted regression | CI | E06-T6 | high | A1 | validation | A planted regression fails the change in CI or staging and preserves dataset, version and results | Reproducible red run |
| E06-T8 | Comparable baseline and pilot | `docs/plan/2.0/` | E01-T4, E05-T3 | medium | A2 | release | Rework, escaped defects and delivery time compared per task class and risk, without attributing causality to a small sample | Baseline and pilot with a declared n |
| E06-T9 | Not-measured marking | `scripts/run-evals.sh` | E06-T1 | high | A1 | validation | A skipped case, an unknown cost and an infrastructure error appear as not measured and never as passed | Report with the skipped cases highlighted |

**Epic acceptance:** every relevant change has a before/after comparison; critical
authorization and leakage cases have zero failures in the agreed set; the remaining limits
are defined before the execution. Passing the set is not a universal guarantee of security.

---

## E07 — Memory and learning promotion

Owner: LLM/Backend · Dependencies: E01/E05; E06 for regression · Phase: F3
Nature: consolidation + extension

Current state: `rules/memory.md`, `docs/specs/2026-09-03-agent-memory-architecture-design.md`,
`skills/retro/SKILL.md`, `.engineos/skill-observations/log.md` and `.engineos/archived/`.

**Correction verified on 2026-09-06:** `promotion_threshold` appears only in the design spec
(`docs/specs/2026-09-03-agent-memory-architecture-design.md`). `registries/policy.json` **has
no `memory` block** — checked by reading the top-level keys. E07 therefore starts with a
missing contract, not with a value to adjust: creating the `memory` block in `policy.json`
and the corresponding check in `scripts/checks/` is a prerequisite of E07-T3. It is a
concrete case of risk R06 — the policy exists in prose and does not exist as applicable data.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E07-T1 | Stable grouping key | `src/memory/`, `rules/memory.md` | — | medium | A2 | design | Equivalent episodes group under the same key; the key does not change because the text was reworded | Test with three formulations of the same episode |
| E07-T2 | Provenance, date and status | `src/memory/` | E07-T1 | medium | A2 | implementation | Every record carries source, date, validity and status. A record without a date is reported, not silently discarded | Report of records without a date |
| E07-T3 | `promote-candidates --since` | new `scripts/promote-candidates.sh`; `memory` block to be created in `registries/policy.json` | E07-T2 | medium | A2 | implementation | The count uses independent occurrences; duplicates do not inflate it. Three independent episodes produce one candidate with three sources | Grouping and deduplication test |
| E07-T4 | Retro with structured output | `skills/retro/SKILL.md` | E07-T3 | medium | A2 | implementation | The retro generates a traceable proposal with sources; no agent changes procedural knowledge alone | Proposal generated + human review recorded |
| E07-T5 | TTL, supersession and deletion | `src/memory/` | E07-T2 | high | A1 | validation | A revoked or expired fact does not come back as current; supersession preserves history | Revocation test followed by retrieval |
| E07-T6 | ACL per project | `src/memory/` | E07-T5 | high | A0 | validation | Another project's memory does not appear in the retrieval, even with a query that favors it | Negative cross-project leakage test |
| E07-T7 | Retrieval bounded per task | `src/memory/` | E07-T6 | medium | A2 | implementation | Retrieval respects the per-task budget and does not inject irrelevant memory | Retrieval precision measurement |
| E07-T8 | Lexical vs semantic before indexing | experiment | E07-T7 | low | A3 | design | The decision to adopt an additional index is supported by a measured comparison, not by preference | Experiment with versioned results |

**Epic acceptance:** three independent episodes produce one candidate with three sources;
duplicates do not inflate the count; no agent changes rules alone; deleted memory or memory
from another project does not appear in the retrieval.

---

## E08 — Shared RAG for the product

Owner: LLM/Data · Dependencies: E04/E06; authorization from E10 · Phase: F3
Nature: product expansion

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E08-T1 | Authorized corpus and frozen golden set | `docs/`, new `rag/` | E10-T3 | high | A1 | design | The initial corpus is authorized technical documentation; the golden set is frozen before any optimization | Golden set versioned with the freezing date |
| E08-T2 | Incremental ingestion | `rag/ingest/` | E08-T1 | medium | A2 | implementation | Ingestion uses hash and version, chunks by structure, records metadata and ACL, and is resumable | Idempotent re-ingestion proven |
| E08-T3 | Document as untrusted input | `rag/ingest/`, `rules/security.md` | E08-T2 | high | A0 | validation | Retrieved content is not treated as instruction. An injection planted in the corpus does not change behavior | Adversarial test with a hostile document |
| E08-T4 | Embedding versioning | `rag/index/` | E08-T2 | medium | A2 | implementation | An embedding is versioned by content, model and configuration; the cache is invalidated on deletion, ACL change or index change | Invalidation test for each trigger |
| E08-T5 | Hybrid retrieval and reranking | `rag/retrieve/` | E08-T4 | medium | A2 | implementation | Lexical + vector with fusion and reranking, adopted through a comparative experiment against the golden set | Experiment with baseline and variant |
| E08-T6 | Context budget | `rag/retrieve/` | E08-T5 | medium | A2 | implementation | The injected context respects the declared budget; truncation is recorded | Size measurement per query |
| E08-T7 | Separate metrics | `rag/evals/` | E08-T5, E06-T2 | medium | A2 | validation | Recall@K, Precision@K and MRR are reported separately from groundedness and faithfulness. K, thresholds and freshness are fixed before a change is accepted | Versioned benchmark |
| E08-T8 | Update, deletion and reindexing | `rag/index/` | E08-T4 | high | A1 | validation | Deletion and update are reflected within the declared SLA; reindexing is recoverable | Timed SLA test |
| E08-T9 | Answer with sources and abstention | `rag/answer/` | E08-T7 | high | A1 | validation | The answer cites sources; without sufficient evidence, the system abstains instead of asserting | Abstention cases in the golden set |
| E08-T10 | Negative ACL | `rag/retrieve/` | E08-T2, E10-T3 | high | A0 | validation | A query does not retrieve content without permission, including a query built precisely for that | Adversarial ACL test |

**Epic acceptance:** retrieval and generation metrics have a versioned baseline; a query
does not retrieve content without permission; deletion and update are reflected within the
declared SLA; an unsupported answer is not presented as fact.

---

## E09 — Queues, workers and distributed recovery

Owner: Backend/DevOps · Dependencies: E04/E05/E10 and E06 ongoing · Phase: F4
Nature: expansion. Only blocking if the distributed profile goes into the release.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E09-T1 | Database and queue ADR | `docs/adr/` | E01-T12 | high | A1 | design | Choice justified by recovery, load, operation and team requirements — not by stack preference | ADR accepted with the requirements cited |
| E09-T2 | Persistence of runs, checkpoints, events and approvals | `src/runner/store/` | E09-T1, E04-T1 | high | A1 | implementation | State survives a process restart; approval and configuration are recovered along with the checkpoint | Test of a restart in the middle of the execution |
| E09-T3 | Claim with lease, heartbeat and fencing | `src/worker/` | E09-T2 | high | A1 | implementation | A worker that lost the lease cannot write afterwards; the fencing token rejects a late write | Test with an old worker trying to write |
| E09-T4 | Bounded retries and failure queue | `src/worker/` + `policy.json` `retry` | E09-T3 | medium | A2 | implementation | A failure exhausts the retries and stays visible in a failure queue; it never disappears silently | Exhaustion test with an item in the DLQ |
| E09-T5 | Idempotency per effect | `src/worker/idempotency.ts` | E09-T3 | high | A0 | validation | An idempotency key per effect; an uncertain operation queries the external result before repeating. Killing the worker after the external effect and before the ack does not duplicate the effect in the supported scenario | Chaos test with an observable effect |
| E09-T6 | Outbox for events | `src/worker/outbox.ts` | E09-T2 | high | A1 | implementation | A state transaction that has to publish an event uses an outbox; the limit is documented when the target does not support idempotency | Test of a failure between commit and publication |
| E09-T7 | Scheduler | `src/scheduler/` | E09-T2 | medium | A2 | implementation | Timezone, missed execution and overlap are configurable and tested | Test with a controlled clock |
| E09-T8 | Status, cancellation and resume API | `src/api/` | E09-T2, E04-T5 | high | A1 | implementation | Cancellation and resume cross workers; resume revalidates authorization | Resume test after a revocation |
| E09-T9 | Backpressure per project and provider | `src/worker/` + `policy.json` `parallelism.backpressure` | E09-T4 | medium | A2 | validation | Overload results in the foreseen `defer` or `reject`, not in silent degradation | Saturation test |
| E09-T10 | Multi-worker chaos test | staging | E09-T5, E09-T6 | high | A1 | validation | An expired lease and a lost acknowledgement produce neither a duplicated effect nor an inconsistent state | Test report from staging |
| E09-T11 | Load test | staging | E09-T9 | high | A1 | release | The declared volume sustained with margin; results compared against the E05-T8 targets | Load report |

**Epic acceptance:** killing the worker after the external effect and before the ack does
not duplicate the effect in the supported scenario; the checkpoint resumes without losing
approval or configuration; overload results in the foreseen defer/reject; a failure
exhausts the retries and stays visible. The queue on its own does not guarantee
exactly-once — the real guarantee is documented.

---

## E10 — Operational registry of tools/MCPs and permissions

Owner: Backend/Security · Dependency: E01; contracts developed together with E04
Phase: F1 (contract) and F2 (application) · Nature: operational extension

Current state: `templates/mcp.template.json` is a template, not an operational registry.
There is no per-resource authorization applied on the server.

| ID | Task | Scope | Dep | Risk | Aut. | Gate | Verifiable acceptance | Evidence |
|---|---|---|---|---|---|---|---|---|
| E10-T1 | Registry model | new `registries/tools.json` + schema | E01-T4 | high | A1 | design | Tool, server, version, transport, capabilities, schemas, risk, allowed projects and secret reference modeled. A secret is a reference, never a value | Schema reviewed + validation in CI |
| E10-T2 | Operational lifecycle | `src/tools/registry.ts` | E10-T1 | medium | A2 | implementation | Activation, deactivation, health check, timeout, rate limit and audit exist. A catalog change requires validation before access is broadened | Test of an activation blocked without validation |
| E10-T3 | Authorization on the server | `src/tools/authz.ts` | E10-T1 | high | A0 | design | Authorization per agent, operation and resource is decided on the server, not in the prompt. A read-only agent cannot write through another tool | Adversarial privilege escalation test |
| E10-T4 | Re-verification at execution | `src/tools/authz.ts`, `src/runner/` | E10-T3, E04-T7 | high | A0 | validation | Authorization is rechecked at execution time, including after pause/resume. A revocation affects a resumed execution | Revocation test during a pause |
| E10-T5 | Effect classification | `registries/tools.json` | E10-T1 | high | A1 | design | Read, reversible write and irreversible effect are distinct and drive the approval requirement | Effect matrix per tool |
| E10-T6 | Approval bound to the scope | `src/tools/`, `src/runner/approval.ts` | E10-T5, E04-T7 | high | A0 | validation | An approval is valid for the exact scope; credentials are used outside the model's context | Test of an approval reused in a different scope being denied |
| E10-T7 | Schema and limit validation | `src/tools/` | E10-T1 | medium | A2 | implementation | Arguments are validated against the schema; inputs and outputs have a size limit | Test with an out-of-limit payload |
| E10-T8 | Prompt injection and unavailability | `src/tools/`, `evals/` | E10-T7, E06-T3 | high | A0 | validation | A tool result is not followed as instruction; an unavailable MCP degrades in the foreseen way | Adversarial cases in the eval set |
| E10-T9 | Console and breaker integration | `console/src/lib/entities/tools.ts`, `kernel.sh breaker` | E10-T2, E03-T3, E04-T4 | high | A1 | implementation | A disabled MCP receives no new call; failures feed the resource's breaker | Disablement test with a subsequent call denied |
| E10-T10 | Credential rotation and revocation | `docs/runbooks/` | E10-T1 | high | A1 | release | Rotation and revocation are documented and executable without exposing values | Rotation drill recorded |
| E10-T11 | Adversarial tests at the boundary | `src/tools/*.test.ts` | E10-T3..T8 | high | A0 | validation | A dangerous call without authorization is denied at the real execution boundary, with the denial audited and the absence of a write proven | Adversarial suite in CI |

**Epic acceptance:** a read-only agent cannot write through another tool; a disabled MCP
receives no new calls; a revocation affects resumed executions; a dangerous call without
authorization is denied at the real boundary.

---

## Count and distribution

| Epic | Tasks | High risk | A0 autonomy | Phase |
|---|---|---|---|---|
| E01 | 13 | 3 | 0 | F0 |
| E02 | 10 | 3 | 0 | F0 |
| E03 | 18 | 11 | 1 | F1 |
| E04 | 12 | 9 | 1 | F2 |
| E05 | 11 | 5 | 1 | F2 |
| E06 | 9 | 3 | 0 | F0→F2 |
| E07 | 8 | 2 | 1 | F3 |
| E08 | 10 | 6 | 2 | F3 |
| E09 | 11 | 8 | 1 | F4 |
| E10 | 11 | 9 | 5 | F1→F2 |
| **Total** | **113** | **59** | **12** | |

Twelve tasks with A0 autonomy require an explicit human decision before the effect: they
are the boundaries of authorization, approval, ACL and redaction of sensitive data. None of
them can be absorbed by automation without changing the policy in `registries/policy.json`.
