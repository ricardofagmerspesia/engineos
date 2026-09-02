---
name: 2026-09-02-hook-envelope
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: general
---

## What
`hooks/lib-common.sh` gains the hook envelope — `hook_read_envelope`,
`hook_context`, `hook_telemetry` — and the registered hooks are migrated onto it,
so a hook file holds only its decision.

## Why
Every registered hook re-implemented the same preamble: `INPUT=$(cat)`, a `jq`
guard, per-field jq extraction, one of two idioms for sourcing `bypass.sh`, a
seven-line telemetry emit block copied verbatim in four places, and the
`hookSpecificOutput` jq literal at seven sites. The duplication meant a fix to
any one of those had to be made five to seven times, and the NUL-delimited
single-pass decoder that preserves tabs and newlines in prompt text existed in
only two of them.

## Scope
- `hooks/lib-common.sh` — the envelope itself; sources `bypass.sh` so a hook
  sources one file.
- Migrated: `prompt-advisor.sh`, `route-before-change.sh`, `mark-unrecorded.sh`,
  `record-verify.sh`, `announce-agent-dispatch.sh`, `announce-agent-return.sh`.
- Partially migrated (envelope decode deliberately left local, see Notes):
  `stop-verify.sh`, `ensure-project-layout.sh`.
- `hooks/test-lib-common.sh` — new suite; `.github/workflows/ci.yml` runs it.
- `CONTEXT.md` — the term **Hook envelope**.

## Checklist
- [x] `hook_read_envelope` decodes all seven fields in one NUL-delimited jq pass
- [x] `hook_context` replaces the copied `hookSpecificOutput` literal
- [x] `hook_telemetry` replaces the four copied emit blocks, memoizing the
      repo/git-dir lookup so multi-event hooks still pay for it once
- [x] `lib-common.sh` sources `bypass.sh`; the two path idioms are gone
- [x] hooks with a working no-jq path keep their own decode
- [x] new test suite, wired into CI
- [x] `CONTEXT.md` term added
- [x] every existing hook suite still green

## What was made
`hooks/lib-common.sh` now ends in a "Hook envelope" section holding `LIB_DIR`
(resolved from `BASH_SOURCE`), a `. bypass.sh`, and the three helpers.
`hook_read_envelope` reads stdin once into `HOOK_INPUT`, exits 0 when `jq` is
absent, and sets `HOOK_CWD`, `HOOK_SID`, `HOOK_PROMPT`, `HOOK_FILE`,
`HOOK_TOOL`, `HOOK_TRANSCRIPT` and `HOOK_STOP_ACTIVE` from a single NUL-delimited
`jq -j` pass. `hook_context <event> <text>` emits the additionalContext envelope.
`hook_telemetry <event> <data>` appends one event, no-op when telemetry is off,
when the payload carried no `cwd`, or when the project has no `.engineos/`, and
always returns 0.

Six hooks lost their preamble entirely. `prompt-advisor.sh` shrank from 101 to 77
lines: its terminal `jq` now emits the joined note text with `-r` and hands it to
`hook_context`, and its two telemetry emits are two `hook_telemetry` calls.
`route-before-change.sh` keeps all of its cache and git work and only swapped the
envelope, bypass and output preamble. `stop-verify.sh` and
`ensure-project-layout.sh` kept their local grep/sed decode — both still do real
work without `jq` and `hook_read_envelope` would have exited 0 on them — but took
`bypass.sh` from the library, and `stop-verify.sh` also took `hook_telemetry`.

## Verification
Final gate only, run once at the end.

- `shellcheck hooks/lib-common.sh hooks/test-lib-common.sh` + all eight migrated
  hooks — clean.
- `bash hooks/test-lib-common.sh` — 11 passed, 0 failed.
- `bash hooks/test-prompt-advisor.sh` — 7 passed, 0 failed.
- `bash hooks/test-route.sh` — pass=40 fail=0.
- `bash hooks/test-verify.sh` — pass=17 fail=0 skip=0.
- `bash hooks/test-governance.sh` — pass=15 fail=0.
- `bash hooks/test-layout.sh` — pass=14 fail=0 skip=0.
- `bash hooks/test-agent-announce.sh` — pass=5 fail=0.
- `bash hooks/test-bypass.sh` — pass=27 fail=0.
- `bash scripts/validate-engineos.sh` and `bash scripts/bench-runtime.sh` — green.

## Changes registered
See `git diff --stat` on the `refactor/hook-envelope` branch: nine hook files,
one new test suite, `CONTEXT.md`, `.github/workflows/ci.yml`, and this record.
No renames, no deletions.

## Notes
- `stop-verify.sh` and `ensure-project-layout.sh` are the two hooks
  `CLAUDE.md` documents as degrading rather than going silent without `jq`
  (`test-verify.sh` case 10 and `test-layout.sh`'s no-jq probe defend that).
  `hook_read_envelope` exits 0 without `jq` by contract, so migrating their decode
  would have removed the fallback those tests exist to protect.
- `route-before-change.sh`'s injected JSON changes from one compact line to
  pretty-printed, because `hook_context` uses `jq -n` as the shared contract
  specifies. Every consumer parses it with `jq`; the cache-hit fast path still
  replays a byte-identical cached file and still costs zero extra `jq` startups.
- `hooks/lib-common.sh` is tracked mode 755 while its own header says it carries
  no exec bit. Pre-existing, untouched here — worth a follow-up.
