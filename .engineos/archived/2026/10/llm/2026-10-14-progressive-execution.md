# Progressive specification, execution and streamed outcomes

status: done
completed: 2026-10-14
domain: llm
spec: docs/specs/2026-10-14-progressive-execution/01-stream-outcomes.md
Status: planning sealed; every delivery integrated and approved final proof passed. Each worker started after its own bounded spec was ready without waiting for later specs.
Scope revision: progressive-execution-v1.
Risk: medium. Autonomy: A2. Branch/current PR: unknown; preserve existing dirty work and work context.
Specs: `docs/specs/2026-10-14-progressive-execution/{01-stream-outcomes,02-incremental-admission,03-ready-frontier-guidance}.md`.

## Human decisions

- User requests streaming outcomes and implementation starting as soon as the first task spec is ready, while later specs are authored.
- User selected "Skip prototype; implement ready task specs" for progressive-execution-v1. Prototype declined; ready-spec implementation authorized. This planning worker waits for explicit production ownership dispatch.
- Final consent: on 2026-10-14 the user submitted **Run proposed checks** for source revision integrated-v1 after planning sealed and every implementation/correction integrated. Approved focused scheduler/CLI regression authoring and announcement-expectation updates, `npm run build`, and `npm test -- scheduler/state.test.js scheduler/incremental.test.js scheduler/cli.test.js workflow/gates.test.js hooks/announce-agent-dispatch.test.js hooks/announce-agent-return.test.js hooks/announce-agent.e2e.test.js`. Test script compiles the repo then runs only named suites. No installs, Git writes, deployment or live databases. Earlier role-label proof is explicitly included.
- No Git writes, release, installation or external effects authorized.

## Tickets and checklist

- [x] STREAM-1 spec ready: opt-in `--stream` for existing scheduler plan/step, independently implementable in `src/scheduler/cli.ts` and new `src/scheduler/output.ts`.
- [x] Record actual first-slice preview/design decision.
- [x] Dispatch STREAM-1 immediately without waiting for later spec completion.
- [x] Integrate STREAM-1 with read-only output/argument compatibility evidence.
- [x] Finish and admit the incremental graph/sealing slice independently; preserve active ownership and renewed scope admission.
- [x] Seal complete planning and integrate every actual implementation delivery/correction before final consent.
- [x] Complete approved final proof with actual outputs.

## What was made

First-slice spec and this open change record. Frozen transport uses `{type:'event',event}`, `{type:'snapshot',state,actions,enforcement}` and `{type:'error',error}` NDJSON rows only with `--stream`; default JSON remains unchanged. This is one-shot scheduler CLI output, not a persistent native launch service.

## Evidence, recovery and limits

Read-only inspection finds no append operation, full-graph fingerprint-bound launch admission and existing batch-local outcome events. Legacy complete-graph publication is the current authoring barrier. Proposed later append/seal work is outside first-slice ownership. Preserve global final verification and actual task-scoped decisions; streamed metadata is not consent or validated completion.

STREAM-1 changed `src/scheduler/cli.ts` and added `src/scheduler/output.ts`. Supervisor inspected the actual output branches and parser: default results use the same `writeJson` serializer and result fields; stream output separates event, snapshot and error records. Final approved check evidence appears below. Reverse only identified task patch hunks through ordinary file edits for recovery; preserve earlier dirty work. Owner: top-level supervisor.

## Implementation graph

- STREAM-1: integrated; CLI output transport.
- ADMIT-1: integrated; immutable graph expansion, planning seal, events and completion facts.
- ADMIT-2: integrated; depends on integrated STREAM-1 and ADMIT-1, owns CLI admission integration.
- GUIDANCE-3: integrated; accepted task-frontier handoff, independent of runtime implementation after interface freeze. Includes the existing new-feature command entry point.
- FINAL-PROOF: passed after sealed planning, complete integration and fresh final consent; includes earlier role-label proof.

The kernel resolved this work to parallel execution, medium complexity/risk, A2 and policy capacity 3. Serial ADMIT-2 ownership avoids concurrent CLI writers. Read-only integration evidence never substitutes for final executable validation.

## Integrated evidence

Supervisor inspected the actual output helper/CLI, append/seal APIs, shared initialization/readiness, strict graph/state parsing, event transitions and completion admission. Append retains existing units, validates combined IDs/dependencies/cycles and requires current revision/nondecreasing time; seal is explicit. Open planning suppresses terminal completion and denies final validation. Existing graph fingerprint and launch admission remain unchanged. Workflow/entrypoint guidance publishes accepted frontiers without waiting for later prose and retains ownership, admission and global final-consent safeguards. This inspection established integration before final executable checks.

## Final proof

Actual final user consent was recorded before test-writer dispatch. The kernel workflow gate returned `productionAllowed: true`, `validationAllowed: true`, `reasons: []`, `enforcement: host-attestation-only` for the exact five integrated implementation IDs and current final consent. No HITL reason fired; preview decisions were voluntarily submitted under the workflow policy.

`npm run build`: exit 0, rebuilt `dist/engineos.cjs`.

`npm test -- scheduler/state.test.js scheduler/incremental.test.js scheduler/cli.test.js workflow/gates.test.js hooks/announce-agent-dispatch.test.js hooks/announce-agent-return.test.js hooks/announce-agent.e2e.test.js`: exit 0. The existing script ran `tsc -p tsconfig.json` then the seven named Node suites.

```text
tests 104
pass 104
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 2979.597209
```

Added 17 focused scheduler/CLI/gate regressions. No source correction, repeat checks, installs, Git writes or external effects were needed. This is scoped validation, not a repository-wide integrity/security scan or release approval. Streaming remains a one-shot CLI transport; host launch, state persistence and approval remain host responsibilities.

## Changes registered

Actual scoped `git status --short` and `git diff --stat HEAD` below include preceding dirty changes and the regenerated bundle; they are not a claim that this task authored the entire diff. No commits were made.

```text
 M commands/new-feature.md
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M rules/parallelism.md
 M rules/subagents.md
 M src/hooks/announce-agent-dispatch.test.ts
 M src/hooks/announce-agent-dispatch.ts
 M src/hooks/announce-agent-return.test.ts
 M src/hooks/announce-agent-return.ts
 M src/hooks/announce-agent.e2e.test.ts
 M templates/adapters/codex.md
?? commands/implement-spec.md
?? skills/engineos-implement-spec/
?? skills/engineos-spec/
?? src/scheduler/
?? src/workflow/

 commands/new-feature.md                   |  205 +-
 dist/engineos.cjs                         | 2961 +++++++++++++++++------------
 docs/COMPATIBILITY.md                     |  180 ++
 rules/parallelism.md                      |  183 +-
 rules/subagents.md                        |  114 +-
 src/hooks/announce-agent-dispatch.test.ts |   12 +-
 src/hooks/announce-agent-dispatch.ts      |    6 +-
 src/hooks/announce-agent-return.test.ts   |   20 +-
 src/hooks/announce-agent-return.ts        |    5 +-
 src/hooks/announce-agent.e2e.test.ts      |   20 +-
 templates/adapters/codex.md               |   90 +-
 11 files changed, 2403 insertions(+), 1393 deletions(-)
```

## Optional follow-ups

After delivery, offered workflow flowchart / no additional artifact and a separate opt-in session retrospective. Matt Pocock upstream `/retro` is available at `.agents/skills/retro/SKILL.md`, purpose completed-session retrospective. No submitted follow-up answer yet; no further artifacts or retro invoked. Reuse the same-task response on resume.
