# Rewrite the EngineOS runtime in TypeScript, distributed as one committed Node bundle

Date: 2026-09-04
Status: proposed

## Context

The runtime — 49 bash scripts, about 11,300 lines across `hooks/`, `scripts/` and
`scripts/checks/` — is JSON-in, JSON-out logic written in a language with no JSON
type. That forces `jq` as a hard dependency (27 probes in 21 files; four hooks go silent
without it), Git Bash's `bash.exe` on Windows (`install.ps1` resolves it by hand), and a bash
3.2 / BSD-userland baseline that costs workarounds in every file (a four-rung
millisecond clock, GNU-vs-BSD `stat` and `sed` branches, no arrays). Every hook fire
pays for two or more subprocesses. `bench-runtime.sh` already had to be written in
embedded Python because the measurement was impractical in bash.

The public contract (`docs/COMPATIBILITY.md`) is the kernel's subcommand names and
JSON shapes, the hook event contract, registry shapes and the return envelope. The
implementation language is explicitly not surface. The plugin is installed by
`git clone` with no build step, so anything that must exist at install time has to
be in the repo.

## Options considered

1. **TypeScript, esbuild to one committed `dist/engineos.cjs`, run by `node`** —
   chosen.
   - Pros: JSON native; strict types over the registries; one dependency swap
     (`jq` -> `node`) rather than a new class of dependency; the hook path runs
     natively on Windows without Git Bash; `node:test` needs no framework; bundle is about
     100 KB with zero runtime deps; the team's stack is TypeScript.
   - Cons: node startup (about 40 ms) on every hook fire; a committed build
     artifact needs a drift guard; a hook PATH without node makes Claude Code
     report a hook spawn error (louder than `jq`'s silence today, still a
     failure); node 16 on an nvm PATH needs a re-exec guard, and the runner's own
     node-20 PATH fix must be ported separately; six checks that grep bash source
     text must be re-pointed as each file is shimmed.
2. **Bun `--compile` to a per-platform binary** — zero external runtime, about
   10 ms startup.
   - Cons: 50-90 MB per platform, so binaries go to GitHub releases and the
     installer downloads by arch; a `git clone` install no longer works on its own;
     one more toolchain to keep current. Deferred, not rejected: listed as a
     revisit trigger below.
3. **TypeScript source only, `npm ci && npm run build` at install** — clean repo.
   - Cons: install fails offline and needs npm; a hook fires before the build ran
     and finds nothing. Rejected.
4. **Go single binary** — same profile as Bun with a mature toolchain.
   - Cons: outside the team's stack; same distribution cost as Bun. Rejected.
5. **Python** — available on macOS and Linux.
   - Cons: 30-50 ms startup plus import time, version fragmentation, absent on
     Windows by default, outside the team's stack. Rejected.
6. **Stay in bash and keep patching** — no migration cost.
   - Cons: every listed pain is permanent; the kernel is already 919 lines of
     bash over `jq` programs and the checks are 2,700 more. Rejected.

## Decision

Option 1. TypeScript under `src/`, strict, no runtime dependencies, bundled by
esbuild into a committed `dist/engineos.cjs` targeting node 18, exposed as one CLI
whose subcommands mirror today's scripts. Every bash entry point becomes a
one-line shim so contracts and the existing black-box test suites hold during the
migration. `hooks/hooks.json` calls `node` directly so the hook path drops Git
Bash on Windows; `scripts/kernel.sh` stays a bash shim until 2.0, so a consumer
calling that public entry point on Windows keeps a bash until then.
Migration is trunk-based, one shim swap per PR, in the waves the design spec
lays out.

Reasons that decided it: the code is JSON logic and TypeScript is the JSON-native
language the team already writes; `node` replaces `jq` one-for-one as the single
external dependency, where a compiled binary would have replaced the install
model; and shims make the whole migration reversible per PR.

## Consequences

- Easier: JSON handling, typing over registries, Windows support, unit testing,
  one process per hook instead of three or more, deleting the bash 3.2 and BSD
  workarounds.
- Harder: a committed build artifact (drift guard in CI); a `node >= 18`
  requirement stated in the installers; the re-exec guard for old node on a hook
  PATH; 30-36 PRs of migration work under the 400-line limit.
- Committed to maintain: `dist/engineos.cjs` regenerated in every PR that touches
  `src/`; `.sh` shims until 2.0 per `docs/COMPATIBILITY.md`; byte-compatible
  kernel answers, verified by `scripts/test-kernel.sh` until it is itself ported.
- Three deliberate behaviour changes (design spec, "Deliberate deviations"): check
  discovery becomes an explicit registry so duplicate check ids fail at compile
  time; under an unusable node the hooks that today run degraded without `jq`
  emit a visible `systemMessage` instead; six source-text checks read the
  TypeScript module instead of the bash file.
- `hooks/scaffold-layout.sh` is a sourced library and versioned surface; it cannot
  be shimmed, so it stays bash, frozen, until 2.0.

Revisit triggers:
- Node startup pushes any published budget in `bench` over its limit after wave 3,
  or hook latency is reported by two or more consumers — then evaluate Bun
  `--compile` for the hook entry point only.
- A consumer environment where Claude Code runs without node on the hook PATH is
  reported more than once — then the installer writes an absolute node path into
  `settings.json` instead of relying on PATH.
- The plugin distribution model changes (a marketplace with a build step) — then
  option 3 becomes viable and the committed bundle can go.

## Addendum 2026-09-04 — kernel shape

The decision above is unchanged: TypeScript, one committed bundle, the fourteen
kernel arms and their JSON answers byte-compatible. This addendum records how
the kernel is shaped *inside* that surface, decided in the architecture review
of the same day (source: the review's candidate 1 and the grilling rounds that
followed; frozen contract in the migration design spec, "Kernel shape").

- `src/kernel/` is one deep module, `resolve(facts, ctx)`, over declared facts.
  The legacy arms are projections of its sparse answer, kept in `src/kernel/cli.ts`.
- One arm is added, `resolve`, as a MINOR change under `docs/COMPATIBILITY.md`.
  Nothing is removed by the migration; the arms with no external caller
  (`gates`, `route-intent`, `scale`, `decision-rules`) are candidates for a later
  MAJOR with the deprecation window.
- Byte-compatibility is proven by a differential parity suite against a pinned
  copy of the bash kernel, deleted at 2.0 with the shim.

Rejected: one module per subcommand (the plan's original layout — it ports the
shallow surface one to one, fourteen modules and fourteen test files for four
arms that fail the deletion test); two modules split by task facts versus
runtime facts (`hitl` and `repair` share the `never_retry` vocabulary across that
seam, and the router agent would call both); deprecating the shallow arms inside
this migration (largest consumer blast radius for no behaviour gain).

Revisit trigger: a consumer is found calling `gates`, `route-intent`, `scale` or
`decision-rules` directly — then the demotion is off the table and those arms
stay first-class projections indefinitely.
