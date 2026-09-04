# Keep Mermaid for workflow diagrams; do not adopt LangGraph as the workflow layer

Date: 2026-09-04
Status: proposed

## Context

EngineOS documents its control loop and wave flows as Mermaid blocks:
`docs/METHODOLOGY.md` (the control loop), `docs/BIG-PICTURE.md` (8 diagrams) and
`docs/specs/2026-08-02-wave1-flowcharts.md` (5 diagrams); one more sits in
`docs/specs/2026-09-03-engineos-default-methodology-plan.md`. A proposal was raised to
replace those diagrams with a LangGraph workflow definition.

The forces that decide this:

- EngineOS has no runtime of its own. The control loop is executed by Claude Code:
  `CLAUDE.md` prose drives the model, `hooks/hooks.json` registers `type: command`
  hooks the harness invokes, and `scripts/kernel.sh` is a deterministic resolver
  over `registries/*.json` that never calls a model. Nothing in this repo owns the
  model call, so nothing can host an executable graph.
- The diagrams are read by humans on GitHub, which renders Mermaid natively. They
  have no execution semantics and none is expected of them.
- `rules/observability.md` already names the one place an executable orchestration
  layer could exist: a planned headless runner that owns model calls and emits
  `tool`/`model` spans with real token and cost figures. That runner does not exist
  yet, and its design is not this decision.

## Options considered

1. **Keep Mermaid; do not adopt LangGraph** — diagrams stay documentation.
   - Pros: zero new dependencies, renders on GitHub, matches how the loop actually
     runs (prose + hooks + kernel). Nothing to install, nothing to keep in sync
     beyond the docs themselves.
   - Cons: diagrams can drift from the kernel and hooks; drift is caught only by
     review, not by a check.
2. **Replace Mermaid with a LangGraph graph as the source of truth** — the control
   loop becomes Python/JS code; docs point at it.
   - Pros: executable definition; LangGraph can emit Mermaid from the graph
     (`get_graph().draw_mermaid()`), so a diagram could be generated, not hand-drawn.
   - Cons: category error for the docs — humans still need a rendered diagram, so
     the Mermaid does not go away, it moves. Adds the LangChain ecosystem and a
     Python or Node runtime to a repo whose executor is Claude Code, which cannot
     invoke a graph from a hook. The graph would run nowhere today.
3. **Build the headless runner on LangGraph, generate diagrams from it** — the
   runner `rules/observability.md` plans, implemented as a LangGraph graph whose
   nodes call `scripts/kernel.sh`, with Mermaid exported from the graph.
   - Pros: single source for behaviour and diagram; real spans and costs.
   - Cons: the Claude Agent SDK is already the harness and already provides hooks,
     subagents and MCP; LangGraph sits on top of it as a second orchestration and
     state model. Ties the runner to a framework before the runner has a spec.
     Out of scope for a diagram question.

## Decision

Option 1. Mermaid stays as the documentation notation for workflows. LangGraph is
not adopted, neither as a diagram replacement nor, by this decision, as the
headless runner's framework.

Reasons that decided it: a diagram notation and an orchestration runtime answer
different questions, and the executor of the loop is Claude Code, which has no
slot for a graph. Choosing the runner's framework belongs to the runner's own ADR,
written when that runner has a spec.

## Consequences

- Easier: nothing changes; no new dependency, no runtime, no install step.
- Harder: diagram drift remains a review problem. If drift recurs, the fix is a
  generated diagram from the TypeScript runtime that
  `docs/adr/2026-09-04-typescript-runtime-over-bash.md` introduces — not a new
  orchestration framework.
- Committed to maintain: Mermaid blocks in `docs/METHODOLOGY.md` and
  `docs/BIG-PICTURE.md` (the two living documents; the spec-file diagrams are
  dated design records and may go stale) updated in the same PR as any kernel or hook behaviour
  change they depict.

Revisit triggers:
- The headless runner gets a spec. Its framework is decided in its own ADR; this
  one only records that the diagram question did not decide it.
- A control-loop diagram is found stale against `scripts/kernel.sh` or the hooks
  more than twice in `retro` findings — then generated diagrams become worth
  their cost.
