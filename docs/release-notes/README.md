# Release notes

One `<version>.md` per release, matching `.claude-plugin/plugin.json`. Record
gains, changes, fixes and upgrade actions. [`COMPATIBILITY.md`](../COMPATIBILITY.md)
owns semver; every deprecation names its replacement and removal version.

| Version | Notes |
|---|---|
| 1.6.0 | [1.6.0.md](1.6.0.md) — runtime governance: backpressure, circuit breaker, HITL, agent spans, one-command adoption |
| 1.7.0 | [1.7.0.md](1.7.0.md) — the node runtime: one bundle, node hooks, jq and python3 gone, every bash entry point a deprecated shim, bash suites ported to node:test |

Earlier releases have no reconstructed notes; use `.engineos/archived/`.

`skills/release-notes/SKILL.md` persistence step names the file
`release-notes-<version>.md`. This directory uses `<version>.md` instead, as
`docs/specs/2026-09-03-engineos-default-methodology-plan.md` Task 9 specifies.
The two conventions disagree and the skill has not been changed; reconciling
them is an open item, not a decision made here.
