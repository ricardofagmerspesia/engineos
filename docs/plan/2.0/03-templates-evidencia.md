# EngineOS 2.0 — Evidence and acceptance templates

Mandatory formats for closing a task, crossing a gate and shipping a release. Compatible with
`rules/gates.md`, `rules/verification.md`, `skills/record-change/` and `templates/handoff.md`.

## Principle

A task is complete when evidence exists that **a third party can re-execute**.
Three things never count as evidence:

- typecheck or build passing on its own;
- a prose description of what the agent claims to have done;
- the absence of an error where no test ran.

Absence of data never becomes success. A skipped test, an unknown cost and an
infrastructure error stay explicitly marked as **not measured**.

---

## Template 1 — Task card

One per `E0X-Tn` task. Lives in `.engineos/changes/<date>-<slug>.md` until it is archived.

```markdown
---
id: E04-T7
epico: E04
titulo: Persisted and invalidatable approval
responsavel: <name>
dependencias: [E01-T11]
risco: high
autonomia: A0
gate: validation
status: pending | in_progress | blocked | done
spec: docs/specs/<date>-<slug>-design.md   # mandatory if >2 files or a new capability
---

## Observable objective
<One sentence. What becomes true in the system when this is finished.>

## Scope
Files: <closed list>
Out of scope: <what explicitly does not change>

## Test setup
Environment: <local | homologation | staging>
Data: <origin and authorization>
Commands:
```
<exact, re-executable commands>
```

## Acceptance criteria
- [ ] <verifiable postcondition 1>
- [ ] <verifiable postcondition 2>
- [ ] Failure scenario: <removing the control makes the test fail>

## Evidence
| Item | Value |
|---|---|
| Commit | <sha> |
| config_version | <value> |
| Command | <command> |
| Result | <summarized output + log link> |
| Date | <ISO 8601> |
| Not measured | <explicit list, or "none"> |

## Rollback
<Steps to undo. If rollback is unsafe because of data incompatibility,
say so here and describe the progressive recovery.>

## Known limitations
<What this delivery does not cover and must not be announced as covered.>
```

**Refusal rule:** a task card without a failure-scenario section does not close a `medium`
or `high` risk task. Proving that something works does not prove that the control blocks.

---

## Template 2 — Gate evidence

One per gate passage on the ladder `discovery → design → implementation → validation → release`.

```markdown
# Gate <name> — <epic or phase>

Date: <ISO 8601> · Commit: <sha> · Profile: <local | hosted | distributed>

## Tasks covered
| ID | Acceptance met | Evidence | Not measured |
|---|---|---|---|
| E0X-Tn | yes/no | <link> | <list> |

## Verification executed
| Check | Command | Result | Log |
|---|---|---|---|
| typecheck | `npm run typecheck` | green/red | <link> |
| tests | `npm test` | green/red | <link> |
| integrity | `scripts/validate-engineos.sh` | N checks | <link> |
| deterministic evals | `scripts/run-evals.sh --deterministic` | N/N | <link> |
| live evals | `scripts/run-evals.sh --live` | N/N or **skipped** | <link> |

## Proven failure scenarios
| Control | How it was removed | Test that started failing |
|---|---|---|

## Critic (mandatory at high risk)
Agent: `critic` · Verdict: <refuted | did not refute> · Findings: <list or "none">

## Decision
Pass / Fail · Owner: <name> · Accepted residual risks: <list>
```

**Refusal rule:** a skipped live eval cannot be reported as passed. The field is
`skipped`, and the gate records that there is no live-accuracy evidence in that run.

---

## Template 3 — Checklist per operational gate

One per deployment profile declared in `E01-T3`. A pending field blocks the release of
that profile — not of the whole product, and not silently.

```markdown
# Operational readiness — profile <name>

| Gate | Mandatory deliverable | Owner | Status | Evidence | Agreed value |
|---|---|---|---|---|---|
| Capacity and SLO | Success, latency, concurrency and cost targets per task class | Tech Lead + Operations | ⬜ | | SLO: <pending> |
| Security and isolation | Threat model, least privilege, secrets outside the model, per-resource authorization | Security + Backend | ⬜ | | |
| State and recovery | Inventory of durable data, backup, RPO/RTO, rehearsed restore | DevOps + Data | ⬜ | | RPO: <pending> · RTO: <pending> |
| Migrations and upgrade | schema/config/adapter compatibility, repeatable migration, rollback | Backend + DevOps | ⬜ | | |
| Supply chain | Lockfiles, SBOM, package integrity, dependency analysis | DevOps + Security | ⬜ | | |
| Observation and response | Dashboards, alerts with an owner, runbooks, severity | Operations | ⬜ | | |
| Staged release | Separate environments, flags, canary, stop criteria | Release owner | ⬜ | | |
| Data and audit | Retention, deletion, log access, protected history | Backend + Security | ⬜ | | Retention: <pending> |
| Support | Version/platform matrix, installation, upgrade, diagnostics, incident | Tech Lead + Operations | ⬜ | | |

Legend: ⬜ pending · 🟡 partial with a declared limitation · ✅ met with evidence
```

The numeric fields — SLO, RPO, RTO, retention, budget — **have not been supplied yet**.
They are a decision of the product owner and of the Tech Lead in `E01-T3`, and each one is a
named blocker until it is filled in. A profile with a `<pending>` field is not released.

---

## Template 4 — Release readiness report

One per release. It is the artifact that authorizes the release; its absence is the answer.

```markdown
# Readiness report — EngineOS <version>

Date: <ISO 8601> · Release owner: <name>

## 1. Identity of what is released
| Item | Value |
|---|---|
| Commit | <sha> |
| Artifact hash | <sha256> |
| Package version | <x.y.z> |
| Manifests version | <x.y.z> |
| policy.json version | <x.y.z> |
| Eval dataset versions | <list> |
| Reference config_version | <value> |

## 2. Released profiles
| Profile | Released | Gates met | Declared limitation |
|---|---|---|---|
| Local single-user | yes/no | 9/9 | |
| Local team | yes/no | | |
| Hosted | **no** | | No authn/RBAC/isolation (E03-T17) |
| Distributed | yes/no | | |

## 3. Integrated validation
| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Register a skill, a model and a tool | | |
| 2 | Publish configuration | | |
| ... | | | |
| 11 | Restore a backup and check compatibility | | |

## 4. Announced capabilities
Every row points to an implementation and to evidence. A capability without both does not go in.
| Capability | Implementation | Evidence | Profiles |
|---|---|---|---|

## 5. What is not ready
<Explicit list. Functionality that is designed and not implemented appears here,
never in section 4.>

## 6. Accepted residual risks
| Risk | Impact | Why it was accepted | Who accepted it | Reversal trigger |
|---|---|---|---|---|

## 7. Rollback
Procedure: <steps>
Data compatibility confirmed: yes/no
If not: progressive recovery described in <link>

## 8. Signatures
Product: <name/date> · Tech Lead: <name/date> · Security: <name/date> · Operations: <name/date>
```

---

## Template 5 — Handoff between waves

Wave barrier and end of session. Extends `templates/handoff.md`.

```markdown
## Objective
<what this wave was supposed to make true>

## State
Current gate: <name> · Risk: <tier> · Wave: <F<n>.<m>>
config_version in use: <value>

## Done
<with evidence, not with adjectives>

## Decisions taken
<and why — so the next session does not reopen them without reason>

## Files touched
<list>

## Evidence
<commands and results>

## Known failures
<what is red right now>

## Open risks
<what can break and has not been tested yet>

## Not done
<explicitly>

## Next step
<one concrete action — never "continue where you left off">
```

---

## Template 6 — "Not measured" register

An annex to any report that contains a gap. It exists to stop the gap from
disappearing at the next reading.

```markdown
| Item | Why it was not measured | What it would take | Which gate it blocks |
|---|---|---|---|
| Live router accuracy | 33 cases skipped in run <id> | Credentials and a cost ceiling | E06 / validation gate |
| Cost per task | The provider does not report it on the current plan | Invoice-based reconciliation | E05-T3 / release gate |
```

---

## How these templates connect to what already exists

| Template | Anchored in | Verified by |
|---|---|---|
| Task card | non-negotiable #5 of `CLAUDE.md` (change record) | `record-verify.sh` hook (Stop gate) |
| Gate evidence | `rules/gates.md`, `rules/verification.md` | `stop-verify.sh` hook + `critic` review |
| Operational checklist | §8 of the 2.0 plan | Tech Lead review per profile |
| Readiness report | §8 and integrated validation | named signature, not automation |
| Handoff | `templates/handoff.md` | wave barrier |
| Not measured | `rules/verification.md` | mandatory reading at the release gate |

The `record-verify.sh` hook depends on `jq`. Without `jq` it exits silently and the change
record Stop gate simply does not fire — which means that the absence of a block does not
prove compliance. Checking `jq` is part of the test setup of any task that depends on
that gate.
