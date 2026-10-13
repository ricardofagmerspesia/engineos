# Mandatory supervisor routing and useful concurrency

Risk: medium — shared workflow guidance, reversible. Autonomy: A2.

User explicitly requests that project creation and follow-ups pass through routing
and the supervisor, who dispatches maximum useful agents/subagents following roles,
rules and patterns. This is development delegation, not a new application agent
topology. Preserve one supervisor, flat workers, same branch/PR and approved final tests.

## Acceptance criteria and frozen boundaries

- Every project implementation/design/doc/config task, including small edits and
  follow-ups, is classified by the supervisor before writes and dispatch.
- Deterministic routing is the fast path; the supervisor resolves residue or uses
  the existing read-only router planner when needed. No new planning approval gate
  is imposed on work the user has already authorized.
- Worker briefs name resolved role, rule/skill/pattern references, exclusive paths,
  contracts, risk/autonomy, branch/PR, dependencies and review return expectations.
- The supervisor fans out all useful ready units up to min(policy capacity, host
  worker capacity), reserving its slot. Queue excess units and refill promptly.
- One indivisible task gets one routed worker; no idle duplicate agents to hit a
  numeric target. Tasks still vague or inherently serial retain honest dependencies.
- Workers return scope changes/new subtasks to the supervisor for rerouting; they
  neither self-dispatch nor bypass shared ownership. Patterns apply when routed.
- All PR/testing/risk/public-name contracts remain unchanged. Explanations without
  project writes do not create artificial implementation tasks.

## Exclusive task scopes

1. llm-coordinator: rules/subagents.md — mandatory development routing and briefs.
2. workflow-capacity: rules/parallelism.md — saturation and small-task scheduling.
3. router-guidance: CLAUDE.md, commands/implement.md,
   templates/cursor/commands/implement.md — entry points use the same procedure.
4. Root supervisor: this spec/change record, integration, final non-test checks.

AGENTS.md and .agents remain protected and unchanged. Do not introduce registry
schema or runtime changes; this procedure remains executor discipline under Codex.
No tests/evals/benchmarks or intermediate gates. No git/forge writes or installations.
Rollback restores only these scoped prose deltas and records, preserving prior work.
