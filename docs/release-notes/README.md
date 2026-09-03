# Release notes

One file per released EngineOS version, named `<version>.md` and matching the
`version` field of `.claude-plugin/plugin.json`. Each file says what a consuming
repository gains, what changed shape, what was fixed, and what a consumer has to
do to upgrade. `docs/COMPATIBILITY.md` is the policy that decides which of those
belong in a MAJOR, a MINOR or a PATCH; these files are the record of what
actually shipped under it. This directory is also the register
`docs/COMPATIBILITY.md` points at for deprecations: when a public surface is
deprecated, the release note for that version names the replacement and the
version in which the old surface is removed.

| Version | Notes |
|---|---|
| 1.6.0 | [1.6.0.md](1.6.0.md) — runtime governance: backpressure, circuit breaker, HITL, agent spans, one-command adoption |

Releases before 1.6.0 have no file here: the directory did not exist, and
nothing is being reconstructed after the fact. For those versions the
`.engineos/archived/` change records are the account.

`skills/release-notes/SKILL.md` step 5 names the file
`release-notes-<version>.md`. This directory uses `<version>.md` instead, as
`docs/specs/2026-09-03-engineos-default-methodology-plan.md` Task 9 specifies.
The two conventions disagree and the skill has not been changed; reconciling
them is an open item, not a decision made here.
