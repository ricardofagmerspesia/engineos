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
| `kernel.sh` | Byte copy of `scripts/kernel.sh` (executable) |
| `registries/*.json` | Snapshot of the repo's `registries/` |

## Pinned at

- Commit `3f1f646cf3485152b14a4d9e4a0eeaf9bd28977b` (branch `feat/kernel-wave1a`).
- Plus one uncommitted delta that was in the working tree at snapshot time:
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
agent, risk_floor, hook_guidance, excluded: false}`) and has no renderer; strip
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
implementation and stays frozen. Refreshing the registries alone will also
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

Requires `bash` and `jq` on the machine running the suite (the harness skips
rather than fails when either is missing). Deleted together with the bash shim
at 2.0, along with `src/kernel/parity.test.ts`.
