# Wave 1 — Flowcharts

Companion to `docs/specs/2026-08-02-ai-methodology-integration-analysis.md`.
Diagrams for what Wave 1 (G11, G4, G6) actually changed, and where it sits in the
adoption plan.

## 1. Adoption plan and dependencies

```mermaid
flowchart TD
    subgraph W1["Wave 1 — verify what exists (shipped)"]
        G11["G11 integrity check<br/>scripts/validate-engineos.sh"]
        G4["G4 evals<br/>evals/ + scripts/run-evals.sh"]
        G6["G6 return envelope<br/>agents/*.md"]
    end
    subgraph W2["Wave 2 — add the risk axis"]
        G1["G1 risk + autonomy"]
        G7["G7 named gates"]
        G15["G15 failure policy"]
        G9["G9 context rule"]
        G8["G8 budget ladder"]
    end
    subgraph W3["Wave 3 — policy from prose to data"]
        G3["G3 routing registry"]
        G2["G2 decision rules"]
    end
    subgraph W4["Wave 4 — compounding and reach"]
        G10["G10 retro loop"]
        G5["G5 handoff contract"]
        G14["G14 critic agent"]
        G12["G12 compatibility policy"]
        G13["G13 adapters"]
    end

    W1 --> W2 --> W3 --> W4
    G6 -.->|status field| G14
    G1 -.->|risk tier| G7
    G1 -.->|risk tier| G14
    G4 -.->|regression net| G3
    G11 -.->|closure check| G3
```

Wave 3 is gated on Wave 1 because rewriting the router without a working eval
suite is the one change in this plan that can silently break everything else.

## 2. CI gate chain after Wave 1

```mermaid
flowchart TD
    PR[Push or pull request] --> T[Tools present: jq, shellcheck, bash]
    T --> SC[shellcheck -S error<br/>hooks + scripts]
    SC --> JS[Validate JSON manifests]
    JS --> DG[Agent-commands drift guard]
    DG --> VE["scripts/validate-engineos.sh<br/>12 invariants"]
    VE --> VT["scripts/test-validate-engineos.sh<br/>9 planted breakages"]
    VT --> EV["scripts/run-evals.sh<br/>deterministic tier"]
    EV --> HT[Hook test suites]
    HT --> SG[Secrets gate: planted + clean]
    SG --> GREEN[CI green]

    VE -->|any invariant broken| RED[CI red]
    VT -->|a planted break not caught| RED
    EV -->|eval set rotted| RED

    RED:::fail
    classDef fail stroke-dasharray: 4 3
```

`test-validate-engineos.sh` is the check on the checker: it breaks one invariant
at a time in a throwaway copy and asserts the validator catches that one. Without
it, a validator that quietly stopped checking anything would still report green.

## 3. G11 — what the integrity check verifies

```mermaid
flowchart LR
    C[CLAUDE.md] -->|@rules imports| A[always-on rules exist]
    C -->|router table rows| CL[load lists are closed]
    R[rules/*.md] -->|deferral graph| CL
    R --> XR[every rules/X.md reference resolves]
    AG[agents/*.md] --> XR
    SK[skills/*/SKILL.md] --> XR
    M[hooks/routing-map.sh] --> TG[named agents, skills, rules all exist]
    AG --> FM[frontmatter name matches filename]
    AG --> RF[declares the Return format envelope]
    AG --> CM[agent and alias both have a slash command]
    SK --> SN[SKILL.md name matches directory]
    ENV[environment] --> JQ[jq present]
```

The closure check is the one that could not be done by reading. A rule "defers"
to another when its text names that file; the check derives that graph from
`rules/` at runtime, then asserts every router row that loads a deferring rule
also loads its target. Today: `backend.md` defers to `architecture.md` and
`observability.md`; `data.md` defers to `architecture.md`.

## 4. G6 — how an agent picks its status

```mermaid
flowchart TD
    S[Work finished or stopped] --> Q1{Did you complete<br/>the assigned unit?}
    Q1 -->|no, could not start| BL["status: BLOCKED<br/>say what is needed"]
    Q1 -->|no, tried and failed| FA["status: FAILED<br/>say what was tried"]
    Q1 -->|yes| Q2{AUDIT mode with<br/>merge-blocking findings?}
    Q2 -->|yes| CR["status: CRITICAL"]
    Q2 -->|no| Q3{Any caveat, warning,<br/>or partial coverage?}
    Q3 -->|yes| DG["status: DEGRADED"]
    Q3 -->|no| Q4{Is the evidence<br/>list non-empty?}
    Q4 -->|no| DEF["defect — go verify,<br/>then re-answer"]
    Q4 -->|yes| OKS["status: OK"]
    DEF --> Q4
```

Pick the worst status that applies; never round up. An `OK` with an empty
`evidence` list is a defect, not a pass — the same rule
`superpowers:verification-before-completion` already applies to the main loop,
now stated where sub-agents will read it.

## 5. G4 — eval tiers

```mermaid
flowchart LR
    CS[evals/*.jsonl] --> D{deterministic tier}
    D --> D1[valid JSONL, required fields]
    D --> D2[asserted rules and agents exist]
    D --> D3[no contradictory expectations]
    D --> D4[must_load sets are closed]
    D --> D5[coverage floor: 25 cases]
    D --> L{ENGINEOS_EVAL_LIVE=1<br/>and claude on PATH?}
    L -->|no| SK[report SKIPPED with a count]
    L -->|yes| LV["send input, capture the<br/>[router] line, compare sets"]
    LV --> G[grade against evals/RUBRIC.md]
```

The deterministic tier exists because golden sets die quietly: the suite keeps
passing while the thing it describes moves underneath it. Checks D2 and D4 catch
exactly that. The live tier is never reported as passed when it did not run.
