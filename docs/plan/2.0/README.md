# EngineOS 2.0 — Execution plan

Derived from `EngineOS 2.0 — Production readiness plan` (rev. 2, 2026-09-06).
Working tree reference: commit `fed9a63`.

| Document | What it resolves |
|---|---|
| [`01-decomposicao-epicos.md`](01-decomposicao-epicos.md) | E01–E10 broken into 113 tasks with scope in real files, dependency, risk, autonomy, gate, verifiable acceptance and evidence |
| [`02-sequenciamento.md`](02-sequenciamento.md) | Dependency graph, critical path, parallelizable waves per phase, milestones A/B/C and the integrated validation walkthrough |
| [`03-templates-evidencia.md`](03-templates-evidencia.md) | Six templates: task card, gate evidence, operational checklist per profile, readiness report, handoff and record of what was not measured |
| [`04-riscos-governanca.md`](04-riscos-governanca.md) | 30 risks with an observable trigger and an owner, RACI per epic, cadence, escalation and definition of done |
| [`05-arquitetura-contratos.md`](05-arquitetura-contratos.md) | Minimum contract for each component, anchored in what exists today and in what is missing |

## State

Implementation plan. No code change, release publication or paid call has been
executed — nor should it be, merely because these documents exist.

## The three things that decide the outcome

1. **`E01-T3` and `E01-T4` first.** Deployment profiles and the capability matrix define
   what the release is. Without them, everything else becomes open scope — and the plan
   already classifies that as the highest-exposure risk (R03).

2. **Announced but absent enforcement is the structural defect.** The kernel decides well
   and nothing obeys; the console shows `enabled=false` and the runtime calls it anyway.
   `E01-T13` (traceability rule → application → test), `E04-T3/T4/T7` and `E03-T15` exist
   to close that, and each one requires a test that **fails when the control is removed**.

3. **Roles without people stall the plan.** Every owner in this document is a proposed
   role. No wave should start without an assigned name, and the SLO, RPO, RTO and
   retention values remain pending — each one blocks the release of the corresponding
   profile.

## Already measured in this session

A measurement executed on 2026-09-06 advances part of `E01-T1`: the working tree differs
from `HEAD` in 512 files by raw diff and in **zero** ignoring CR and whitespace — there is
no semantic divergence. `scripts/validate-engineos.sh` gives 90 ok / 18 FAIL in this
Windows checkout and 108 ok / 0 FAIL in a normalized copy of `git archive HEAD`. The cause
is CRLF in files that `.gitattributes` does not cover, which confirms `E02-T3` and fixes
its scope. Detail and caveats in `01-decomposicao-epicos.md`, section E01.

## F0 spec

`docs/specs/2026-09-06-f0-baseline-and-distribution-design.md` — design of E01+E02 in the
house format: packager allowlist and denylist, manifest contract, EOL and file-mode policy,
installer preconditions, 13-step walkthrough of the artifact E2E test, CI matrix and seven
decisions (D1–D7) that depend on the product owner.

## First unit of execution

`E01-T1` — identify the canonical snapshot and classify the working tree differences into
semantic, end of line (EOL) and file mode. Nothing else starts before that.

Then `E02-T1` and `E02-T8`: produce and test the first reproducible artifact, over the
final bytes, before extending console or runtime.
