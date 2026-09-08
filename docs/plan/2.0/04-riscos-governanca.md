# EngineOS 2.0 — Risks and governance

## 1. Risk register

Probability and impact scale: low / medium / high. **Exposure** = the combination, with
the worse of the two weighing more. Every risk has an **observable trigger** — the condition
that shows it has stopped being a hypothesis — and a **named owner**.

### 1.1 Product and scope risks

| # | Risk | Prob. | Impact | Exposure | Mitigation | Observable trigger | Owner |
|---|---|---|---|---|---|---|---|
| R01 | Announcing as ready a capability that is only designed | **high** | high | **critical** | `E01-T4` requires implementation + evidence per row; §4 of the readiness report rejects a row without both | A capability appears in release notes with no link to a test | Product |
| R02 | "2.0" being published before the release criteria | medium | high | high | The version is only bumped in `E01-T6`, after F0; milestones A/B/C are blockers, not labels | A manifest with 2.0.0 in a commit earlier than milestone A | Tech Lead |
| R03 | Scope growing to keep up with the document (RAG, queues, hosting) with no profile decision | **high** | medium | high | `E01-T3` fixes the profiles; a capability outside the released profile is declared unsupported | An F3/F4 task starts execution before F1 finishes | Product |
| R04 | Confusing consolidation with expansion and treating E08/E09 as a universal prerequisite | medium | medium | medium | The nature table in `01-decomposicao-epicos.md`; F4 is skippable by explicit decision | A queue discussion before the local runner is governed | Tech Lead |
| R05 | Qualitative scores from the earlier analysis turning into acceptance targets | medium | medium | medium | The document states they are not a baseline; targets come from `E05-T8` and `E06-T8` | Someone cites a numeric score as a criterion | Product |

### 1.2 Technical risks

| # | Risk | Prob. | Impact | Exposure | Mitigation | Observable trigger | Owner |
|---|---|---|---|---|---|---|---|
| R06 | The kernel decision never reaching the real execution transition — enforcement announced and absent | **high** | **high** | **critical** | `E04-T3/T4/T7` wire admit/breaker/hitl to transitions; `E01-T13` maps rule → enforcement point → test; a rule with no enforcement point is marked as not enforced | `docs/TRACEABILITY.md` with a row that has no enforcement point | Backend |
| R07 | `enabled=false` in the console with no effect in the runtime | **high** | high | **critical** | `E03-T15` is an end-to-end test and an exit condition of F2 | The console shows disabled and the trace shows the call | Backend |
| R08 | A partial publish corrupting configuration (files written, commit not made) | medium | **high** | high | `E03-T12` with revision comparison, serialization and recovery; injected failure at every step | Divergence between `published_snapshot` and the working tree | Backend |
| R09 | Rollback discarding an operator change | medium | high | high | `E03-T14` detects an intervening change and reports a conflict instead of overwriting | A complaint about lost work after a rollback | Frontend |
| R10 | A duplicated external effect on worker resume | medium | **high** | high | `E09-T5` per-effect idempotency + external result lookup; `E09-T10` chaos test | Two records of the same effect with the same run_id | Backend |
| R11 | A model fallback chosen by tier name, not by capability | medium | medium | medium | `E04-T10` validates availability and capability; the fallback reason is recorded | A fallback to a model without the required capability | LLM |
| R12 | An unknown cost recorded as zero | medium | medium | medium | `E05-T3` keeps the availability field separate from the value | A dashboard showing cost 0 on a real run | Backend |
| R13 | CRLF or loss of the execute bit coming back in a future release | medium | medium | medium | `E02-T10` automated regression over the final package | An installation requiring a manual `chmod` | DevOps |
| R14 | The artifact carrying local state (`console/.data`, caches, worktree) | **high** | medium | high | `E02-T1` allowlist; `E02-T2` stops tracking the SQLite file; the manifest is compared in CI | `unzip -l` with an entry outside the allowlist | DevOps |
| R15 | Hooks silent for lack of `jq` masking missing governance | medium | medium | medium | Documented in `03-templates-evidencia.md`; a `jq` check in the test setup | No `[router]` line on edits | DevOps |
| R16 | A rule load that is not closed making a deferred policy disappear | medium | high | high | `E03-T5` validates closure; `scripts/validate-engineos.sh` already checks both halves | The closure check failing in CI | Tech Lead |

### 1.3 Security and data risks

| # | Risk | Prob. | Impact | Exposure | Mitigation | Observable trigger | Owner |
|---|---|---|---|---|---|---|---|
| R17 | Authorization decided in the prompt instead of on the server | medium | **high** | **critical** | `E10-T3` decides on the server; `E10-T11` adversarial tests at the real boundary | A read agent managing to write through another tool | Security |
| R18 | An approval reused in a scope other than the approved one | medium | **high** | high | `E04-T7` binds the action, the argument hash, the target and `config_version`; `E10-T6` validates the scope | An approval accepted after the target changed | Security |
| R19 | A revocation not affecting a resumed run | medium | **high** | high | `E10-T4` re-verifies at execution time, including after pause/resume | A resumed run using a revoked credential | Security |
| R20 | Prompt injection through a tool result or a RAG document | **high** | **high** | **critical** | `E10-T8` and `E08-T3` treat results and documents as untrusted input; adversarial cases in the eval set | Behavior changing after hostile content is planted | Security |
| R21 | Cross-project leakage in memory or in RAG | medium | **high** | **critical** | `E07-T6` and `E08-T10` with a negative test built to favor the leak | Retrieval returning an item from another project | LLM |
| R22 | A prompt, a secret or personal data in a log | medium | high | high | `E05-T6` redaction by default; a test with a planted secret | A planted secret appearing in the output | Security |
| R23 | A secret in the distributed artifact | low | **high** | high | `E02-T6` blocking scan over the final bytes | A confirmed finding in the scan | DevOps |
| R24 | A hosted console exposed without authn/RBAC | low | **high** | high | `E03-T17` keeps the profile disabled and declared unsupported until it passes | The console reachable outside `127.0.0.1` without authentication | Security |

### 1.4 Process risks

| # | Risk | Prob. | Impact | Exposure | Mitigation | Observable trigger | Owner |
|---|---|---|---|---|---|---|---|
| R25 | Execution roles staying proposed, with no people | **high** | high | **critical** | No wave starts without a named owner; the risk register has a named owner, not a role | A task card with an unfilled `<name>` owner | Product |
| R26 | SLO/RPO/RTO/retention values never being fixed | **high** | high | high | `E01-T3` makes them named blockers; the profile checklist rejects `<pending>` | An operational checklist with a pending field on the eve of the release | Tech Lead |
| R27 | Targets revised downward after adoption, with no record | medium | medium | medium | §8 requires preserving the prior evidence when a target changes | An SLO changed with no baseline attached | Operations |
| R28 | A gate crossed on task completion instead of evidence | **high** | high | **critical** | Templates 2 and 4 require re-executable evidence; `critic` mandatory at high risk | A gate marked as passed with no failure-scenario section | Tech Lead |
| R29 | Bypass left permanently on in a shared environment | medium | high | high | `E05-T9` records bypass through an independent path; the machine-wide flag does not expire on its own | A bypass record continuing for more than one session | Operations |
| R30 | Silent deprecation of public surface breaking consumers | medium | high | high | `E01-T7` + `docs/COMPATIBILITY.md`: nothing is removed in the release that deprecates it | A rename with no stub and no forwarding | Tech Lead |

### 1.5 Critical risks — the eight that decide the release

R01, R06, R07, R17, R20, R21, R25, R28. They all share the same shape: **the system
looks controlled and is not**. They are the only ones whose mitigation cannot be deferred by
priority ranking, and each one has a test that fails when the control is removed.

A control without a test that proves it by the negative does not count as a mitigation.

---

## 2. Governance model

### 2.1 Roles

Roles are functions, not people. Each one needs **a named person** before the corresponding
wave starts — R25 exists because today none has one.

| Role | Decides | Does not decide |
|---|---|---|
| Product owner (Ricardo Fagmer) | Deployment profiles, release scope, residual-risk acceptance, release | Implementation, stack choice |
| Tech Lead | Architecture, ADRs, technical gate passage, compatibility matrix | Business-risk acceptance |
| Security | Authorization boundary, secret handling, veto on security risk | Roadmap priority |
| DevOps | Distribution, CI, supply chain, backup and restore | API contract |
| QA/LLM | Datasets, scorers, judge calibration, marking things not measured | Gate passage on its own |
| Operations | Operational SLOs, alerts, runbooks, halting adoption | Scope |
| Release owner | Staged release, canary, stop criterion | Technical gate acceptance |

**Security veto:** Security can block any gate passage on security risk, and the block is
removed only by a fix or by a formal, recorded acceptance from the product owner, with the
residual risk written into the readiness report.

### 2.2 RACI per epic

R = executes · A = accountable for the result · C = consulted · I = informed

| Epic | Product | Tech Lead | Backend | Frontend | Security | DevOps | QA/LLM | Operations |
|---|---|---|---|---|---|---|---|---|
| E01 | A | R | C | I | C | C | C | I |
| E02 | I | A | I | I | C | R | C | I |
| E03 | C | A | R | R | C | I | C | I |
| E04 | I | A | R | I | C | I | C | I |
| E05 | I | C | R | I | C | R | C | A |
| E06 | I | C | C | I | C | I | R/A | I |
| E07 | I | A | R | I | C | I | R | I |
| E08 | C | A | C | I | C | I | R | I |
| E09 | I | A | R | I | C | R | C | C |
| E10 | I | C | R | I | A | I | C | I |

Two rows deserve attention: **E10 is accountable to Security**, not to engineering —
authorization is a security decision implemented by engineering. And **E05 is accountable to
Operations**, because observability nobody operates is not observability.

### 2.3 Cadence

| Ritual | Frequency | Participants | Mandatory output |
|---|---|---|---|
| Wave barrier | At the end of every wave | Executors + Tech Lead | Handoff in Template 5 |
| Gate passage | At the end of every gate | Gate owner + `critic` if risk is high | Gate evidence in Template 2 |
| Risk review | At the end of every phase | Product + Tech Lead + Security | Updated register with the triggers that fired |
| Retro | Monthly, or after 3 occurrences of the same defect | Everyone | Rule/skill/registry delta as a PR (skill `retro`) |
| Profile decision | Before F1 and reviewed before F5 | Product + Tech Lead | Released and unsupported profiles, in writing |
| Post-release review | Weekly during controlled adoption | Operations + Tech Lead | Continue / pause / revert |

### 2.4 Escalation

| Situation | Goes to | Deadline | If there is no answer |
|---|---|---|---|
| A gate failed twice on the same task | Tech Lead | same wave | The task is replanned, not re-executed |
| A blocking security finding | Security → Product | 24h | The gate stays blocked |
| A pending operational field on the eve of the release | Product | before the release | The profile is not released |
| A decision disagreement between roles | Tech Lead; Product if it persists | 48h | Recorded as an ADR with the losing position documented |
| An error/latency/cost limit exceeded during adoption | Operations | immediate | Expansion of adoption is halted |

**Bounded repair loop:** two fix attempts per check, one model-tier escalation, and then
stop and report red (`registries/policy.json` `repair`). Exhausting the bound reports red
honestly — it never reports done. This is EngineOS's own rule applied to the development of
EngineOS.

### 2.5 Definition of Done

A task is done when **all** of these hold:

1. The observable objective is true in the system, not in the document.
2. Verifiable acceptance has a test, and there is a test that fails when the control is removed.
3. Evidence is re-executable by a third party: command, commit, `config_version`, date.
4. Items not measured are listed explicitly.
5. Rollback is described, and its safety with respect to the data has been assessed.
6. Known limitations are written where someone announcing the capability will read them.
7. The change record is closed (`skills/record-change`), with a linked spec when the threshold required one.
8. Any changed public surface followed `docs/COMPATIBILITY.md`.

A phase is done when all its tasks are done **and** the phase exit condition, in
`02-sequenciamento.md`, has been demonstrated — not inferred from the sum of the tasks.

### 2.6 What governance must not do

- Do not turn absence of data into success.
- Do not use task completion as proof of readiness.
- Do not accept declarative configuration as proof of blocking: the proof is the denied call.
- Do not lower a target silently after adoption; changing a target preserves the prior evidence.
- Do not publish a release, host the console or fire a paid call because a plan exists.
  Those steps happen in the corresponding task and with the corresponding authorization.
