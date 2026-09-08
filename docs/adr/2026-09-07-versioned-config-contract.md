# Versioned configuration contract between console and runner

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Production readiness plan" (2026-09-06, rev. 2), epics E01 (configuration contract), E03 (publish and rollback) and E04 (pin the version per execution).

## Context

Today the console writes files and the runtime reads files. There is no name for "the configuration that was in force when this execution ran". The consequences show up in three distinct places that are in fact the same problem:

- A publish in the middle of an execution changes its behavior halfway through, and nothing records that.
- A rollback has no way of knowing whether it discards work another operator has just written — the console already implements `publish`, `diff`, `history` and `rollback` over files, with no base revision.
- A telemetry trace cannot answer "under which policy was this decision made?", which is the first question of any incident investigation.

The kernel is already deterministic: declared facts go in, a structured decision comes out, with no external effect. What is missing is not determinism, it is **identity** of the input.

## Options considered

1. **Immutable `config_version`, with a content hash, pinned per execution** (chosen).
   - Pros: an execution declares its version at the start and carries it to the end — the result is reproducible and explainable; a concurrent publish compares against the base revision and fails instead of overwriting; rollback becomes "publish version N again", not "undo files"; telemetry and evals can version results per configuration, which is a prerequisite for comparing before/after in E06.
   - Cons: it requires a version table and a serialization point for publishes; a long execution may finish with an old policy — which is a desired property, not a bug, but needs to be said to the operator.

2. **Read the files at every decision (current state)** (rejected).
   - Pros: no infrastructure; a change takes effect immediately.
   - Cons: immediate effect *in the middle of an execution* is precisely the failure mode. A task that passed through `admit` under one budget and calls the model under another has no defined behavior, and no trace can explain what happened.

3. **The git commit as the version** (rejected).
   - Pros: it already exists, already has a hash, already has history.
   - Cons: it ties publishing to a commit, which prevents the console from publishing without writing to the repository and makes the hosted profile depend on a git credential. Besides that, not every effective configuration comes from a versioned file — the final resolution depends on precedence (action → route → agent → skill → default) and it is the *resolved* one that needs an identity. The commit is still recorded as provenance, not as identity.

## Decision

Option 1. The published configuration is immutable and addressed by `config_version` (monotonic) plus the hash of the resolved content. The minimum contract of a publish is `{config_version, base_hash, author, changes, timestamp}`.

Rules that follow:

- **The runner pins the version at the start of the execution** and does not swap it. `run_id` carries `config_version`.
- **Publishing is conditional on the base revision.** If `base_hash` does not match the current state, the publish fails and shows the conflict. Concurrent publishes are serialized.
- **Rollback publishes a previous version as a new version.** It never rewrites history and never discards someone else's write without an explicit conflict.
- **File write, commit and database snapshot are coordinated.** A failure between steps leaves a recoverable operation recorded, not a half-written state.
- **`config_version` appears in traces, evals and the approval record.** Without it, no before/after comparison in E06 is interpretable.

## Consequences

- `config_version` becomes public surface under `docs/COMPATIBILITY.md`.
- A human approval is valid for one `config_version`; see `2026-09-07-approval-bound-to-effect.md`.
- A long execution may finish under an old policy. That is the guarantee, and the operator needs to be able to see it — it is not a reason to swap the version halfway through.
- Until E03/E04 implement this, "disable in the console" is **not** enforcement and must not be announced as such (see `docs/CAPABILITIES.md`).
