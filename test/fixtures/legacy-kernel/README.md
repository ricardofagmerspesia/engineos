# Pinned legacy kernel

A frozen copy of the bash decision kernel and the registries it answers from.
`src/kernel/parity.test.ts` runs both this copy and the TypeScript projections
over the same fixture arguments and asserts the two answers are the same JSON,
in the same key order, with the same exit code.

It is a *pinned* copy on purpose: the parity harness must compare the port
against a kernel that cannot drift under it. Editing `scripts/kernel.sh` while
the port is in flight changes the live kernel, never this one, so a parity
failure always means "the port disagrees with the kernel we ported", and never
"someone moved the target".

## Contents

| Path | What it is |
|---|---|
| `kernel.sh` | The last bash `scripts/kernel.sh`, pinned by sha below (executable) |
| `registries/*.json` | Snapshot of the repo's `registries/` |

## Pinned at

- `kernel.sh`: commit `02c9f82ae36f2509671b4c482be997c2bbb9333e` (`origin/main`) —
  the last bash implementation, refreshed from `3f1f646` so it carries the
  `skill-state` arm and the `skills_suppressed` field the port has to match. It
  is byte-identical to `3f1f646`'s copy apart from that addition (verified by
  diff before the refresh), so no other parity case moved.
- `registries/*.json`: still the `3f1f646` working-tree snapshot described below.
- Plus one uncommitted delta that was in that working tree at snapshot time:
  `registries/routing.json` already carried the Task 7 edits — the per-domain
  `hint` fields and the three rewritten `hook_guidance` strings. The snapshot is
  of the **working tree**, not of the commit, so bash and TypeScript answer from
  byte-identical registry data. Without that, `route-path` parity would fail on
  guidance strings for a reason that has nothing to do with the port.

## The snapshot keeps fields the live registry has dropped

`registries/routing.json` stopped storing `hook_guidance` and `risk_floor` on
its ten domain rows (plan Task 13 / design "Route guidance" step two): the
TypeScript kernel renders the guidance string from `rules`, `skills`, `agent`
and `hint`, and reads a domain's floor from the intent that claims it, so the
live registry keeps one form of each fact.

The snapshot under `registries/` here deliberately **retains both fields**. The
pinned bash kernel emits them by reading them (`{domain: .id, rules, skills,
skills_suppressed, agent, risk_floor, hook_guidance, excluded: false}`) and has
no renderer; strip
them from the snapshot and every `route-path` parity case would compare a
derived string against `null` — a red that says nothing about the port. The
divergence between this snapshot and the live registry is therefore expected,
and it is the reason the fixture is pinned rather than refreshed: see
"Refreshing" below before copying `registries/*.json` over it again.

## How the harness points the bash kernel at this snapshot

The pinned `kernel.sh` derives its own root from where the file sits
(`ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`, `REG="$ROOT/registries"`)
and never reads `ENGINEOS_ROOT` (the live `scripts/kernel.sh` is now a shim that
does export it). A copy sitting at `legacy-kernel/kernel.sh`
would therefore resolve its root to `test/fixtures/` and read registries that do
not exist there.

So the harness stages the fixture into a fresh temp directory per test as
`<tmp>/scripts/kernel.sh` + `<tmp>/registries/`, and spawns the staged path. The
bash kernel then resolves `ROOT` to `<tmp>`, and the TypeScript side is given
`ENGINEOS_ROOT=<tmp>` — one root, one set of registry bytes, two implementations.
The layout stored here stays the one the plan names, so refreshing is a plain
`cp`.

## Refreshing

Only when the live bash kernel or the live registries change in a way the port
must keep matching:

```sh
cp registries/*.json test/fixtures/legacy-kernel/registries/
```

`scripts/kernel.sh` is no longer copyable: it is a shim over
`dist/engineos.cjs`, so the pinned `kernel.sh` here is the last real bash
implementation and stays frozen. The one legitimate way to move it is the way it
moved once already — `git show <sha>:scripts/kernel.sh` from a commit whose
`scripts/kernel.sh` is still bash, diffed against the copy being replaced so the
PR can say exactly which arms changed. Refreshing the registries alone will also
**re-break** `route-path` parity unless `hook_guidance` and `risk_floor` are put
back on the ten domain rows of the copied `routing.json` — see the section above.

Then update the "Pinned at" commit above. A refresh that makes a red parity case
green is a decision to be argued for in the PR, not a routine step: it moves the
target the port is measured against.

## What is deliberately not covered

Unknown-subcommand handling is **not** a parity case. The two answers differ by
design — bash reports `unknown subcommand: <x>` from its own dispatcher while
the shim is still in place, and the TypeScript `runKernel` owns the same message
for a different set of ported arms, so an arm that is not ported yet is "unknown"
on one side and answered on the other. Comparing them would assert on the
migration's own progress, not on behaviour.

## Lifetime

Requires `jq` and a **bash >= 4** on the machine running the suite. The version
floor is not decoration: `skill_state_json` nests a `case` inside two levels of
command substitution, which bash 3.2 — still the `/bin/bash` macOS ships —
cannot parse at all. The harness probes both (`bash -n` on this file) and skips
by name rather than failing, so a macOS checkout reports the parity suite as
skipped instead of red; CI runs bash 5 on Linux and Git Bash on Windows, where
it parses. Deleted together with the bash shim at 2.0, along with
`src/kernel/parity.test.ts`.
