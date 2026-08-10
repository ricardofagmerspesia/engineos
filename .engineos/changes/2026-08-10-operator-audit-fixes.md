---
name: 2026-08-10-operator-audit-fixes
status: done
owner: ricardo
spec: n/a — five independent defect fixes found by auditing the operator surface, each landing in the files that hold it
domain: general
completed: 2026-08-10
---

## What
Five defects found by executing every operator-facing command in both repos
rather than reading them, then fixing what the runs exposed:

1. `kernel.sh`'s three positional subcommands accepted a flag silently and
   answered about the literal string `--prompt`, exit 0.
2. Ten `registries/intents.json` signals carried documentation metasyntax and
   could never match, making seven intents unroutable.
3. `hooks/gate-advisor.sh` shifted every optional `@tsv` field one slot left,
   printing a rule's gate as its preference and dropping risk.
4. `install.sh` wired 7 of 9 hooks, so `gate-advisor` and `route-advisor` were
   dead for every symlink install; and `/route` invoked a bare relative
   `scripts/kernel.sh`, which exits 127 on every project except engineos.
5. ai-se-os died on a missing run-log parent directory, and leaked a git
   worktree on the missing-kernel-path exit.

## Why
The audit ran 97 shell invocations across both repos with adversarial verifiers
re-executing every claimed command. Two findings deserve naming because the
suites were green throughout:

**The fail-open resolver was the sharpest.** `kernel.sh route-intent --prompt
"audit the system"` returned `{"matches":[{"id":"llm",...}]}` with exit 0 — bash
bound `--prompt` to `$1`, the real request was discarded, and "prompt" happens
to be an LLM intent signal. A resolver that refuses is safe; one that answers
confidently and wrongly is not, and the flag shape is plausible precisely
because `route-escalate`, `scale` and `decision-rules` all do take `--prompt`.

**The dead signals had been encoded as expected behavior.** `intents.json`
signals are matched as literal phrases, but ten were copied verbatim from
CLAUDE.md's human-readable router table with their placeholders intact —
`"should we use X or Y"`, `"why does X happen"`, `">3 files"`. Seven intents
could not fire on any real input. Worse, two existing green assertions *depended*
on that: `policy.json` router fixture 5 and a `test-kernel.sh` case both used
"why does the login handler fail with a 500" and passed because ZERO intents
matched, not because the bug intent matched. The fixture asserted only
`escalate`/`reasons`, and escalate=false with reasons=[] is also exactly what
total routing failure looks like.

## Scope
engineos: `scripts/kernel.sh`, `scripts/test-kernel.sh`,
`scripts/validate-engineos.sh`, `registries/intents.json`,
`registries/policy.json`, `hooks/gate-advisor.sh`, `hooks/test-gate-advisor.sh`,
`install.sh`, `commands/route.md`, `agents/router.md`.

ai-se-os (branch `fix/operator-audit-round`): `src/workflow/run-log.ts`,
`bin/ai-se-os.js`, `test/run-log.test.ts`, `test/composition-root.test.ts`.

## Checklist
- [x] Reproduce each defect live before fixing it
- [x] `require_positional` guard, called directly so `err`'s exit is not trapped in a subshell
- [x] Replace the ten unmatchable signals with literal text
- [x] Validator check so placeholder metasyntax cannot return
- [x] Assert `intents` in the router fixtures — close the vacuity, not just the symptom
- [x] Update the two assertions that encoded the bug, honestly, keeping their original coverage
- [x] Non-whitespace delimiter for the gate-advisor field read
- [x] All 9 hooks wired by `install.sh`; kernel resolved absolutely in `/route`
- [x] `mkdir -p` for the run log without swallowing genuine write errors
- [x] Order the kernel-path check above worktree creation
- [x] Planted breakage on every new check and test
- [x] Every suite in both repos

## What was made
**Fail-closed positional args.** A shared `require_positional` rejects a missing
argument, any leading-dash argument, and a second positional. It is called
directly rather than in a command substitution — `err` exits, and inside `$(...)`
that would kill only the subshell while the caller continued with an empty value.
Nine subcommands already rejected unknown flags; the three positional ones now
match them.

**Signals that can fire.** `"should we use X or Y"` → `"should we use"`,
`"why does X happen"` → `"why does"` plus `"failing"`/`"does nothing"`,
`"document version X.Y.Z"` → `"document version"`,
`"what's broken across X"` → `"what's broken"` + `"what is broken"`,
`"ask me about how X works"` → `"ask me about"`,
`"X or Y and I can't decide"` → `"and I can't decide"` + `"and I cannot decide"`,
`"across all X"` → `"across all"` + `"across every"`. `big-sweep`'s `">3 files"`,
`">1 domain"` and `"≥3 independent tasks"` were deleted rather than rewritten:
they are threshold notation whose home is `parallelism.fanout_signals`, not a
phrase list. The CLAUDE.md table keeps its placeholders — it is documentation
for humans; the registry is a matching engine and may not.

A validator check now rejects any signal containing bare `X`/`Y`/`N` or `>`/`≥`.

**The two dishonest green assertions.** Fixing `bug`'s signal made fixture 5
match, and made a `test-kernel.sh` case fail — correctly, because both had
encoded the defect. Fixing `big-sweep` also moved fixture 2 from
`unrouted-scale` to `requires-dispatch-plan`: the prompt genuinely is a big
sweep, so routing it and demanding a dispatch plan is the better answer, and
`unrouted-scale` (scale detected, nothing routed) was only correct while routing
was broken. Rather than delete that coverage, a sixth fixture — `"modernize all
services"` — exercises `unrouted-scale` for real: `modernize` is an action verb
that is nobody's intent signal, so scale fires with zero intents. Every fixture
now carries expected `intents`, and C18e asserts them.

The replaced `test-kernel.sh` case now uses a deliberately meaningless string
(`"zzqq wibble frobnicate"`) for the zero-intent branch. A realistic prompt there
becomes vacuous the moment routing improves, which is the exact trap being
closed; the realistic prompt is asserted separately, matching, as the guard
against that signal dying again.

**Field shift.** `gate-advisor.sh` reads `@tsv` on `0x1f` instead of tab. Tab is
IFS whitespace, so bash collapsed the run of two tabs an absent optional field
produces. `@tsv` is kept because it escapes any tab inside a value, which is what
makes the `tr '\011' '\037'` substitution safe: after `@tsv` the only raw tab
bytes are delimiters.

**Wiring and portability.** `install.sh` wires all nine hooks, with a comment
tying the list to `hooks/hooks.json` — a hook wired in one install mode only is
dead for half the userbase. `/route` and `agents/router.md` resolve the install
root before calling the kernel. The subagent's first attempt read the engineos
path out of `~/.claude/CLAUDE.md`; that was replaced, because `rules/memory.md`
makes that file the user's own and a repo-shipped agent must not depend on its
contents to find itself. The resolution now tries `${CLAUDE_PLUGIN_ROOT}`, then
walks up from any installed command's symlink until it finds
`scripts/kernel.sh` — `install.sh` links every command back into the checkout, so
any one of them leads home, and foreign commands are skipped because only a
directory holding the kernel is accepted.

**Runner robustness.** `JsonlFileRunLogWriter.append` creates its parent
directory, deliberately on every append (the writer has no init hook and also
appends after a resume) and deliberately without a try/catch: the run log is the
durable record resume reads back, so a full disk or read-only mount must still
fail the run. Only the missing directory is absorbed. `requireKernelPath()` moved
above worktree creation rather than being converted into a throw — the `finally`
intentionally KEEPS a worktree on failure so it stays inspectable, so routing a
config error through it would still leave the worktree behind, merely announced.
A misconfigured env var leaves nothing to inspect.

## Verification
Planted breakage first, on every new check and test — each was reverted, watched
go red, and restored:

```
route-intent guard reverted:        passed 166, failed 5
placeholder-metasyntax check:       FAIL unmatchable signals (placeholder metasyntax):adr:should we use X or Y
fixture intents assertion:          FAIL route-escalate fixture mismatches: [why does the login handler fail with a 500](got esc=false reasons=[] intents=["bug"])
gate-advisor fix reverted:          pass=21 fail=4
  and its wrong output, verbatim:   - rule-production-write — ... — prefer: release [gate: high]
                                    - rule-destructive-ddl  — ... — prefer: high
run-log mkdir reverted:             Tests 2 failed | 6 passed (8)
```

Correct gate-advisor output, checked against the kernel rather than against my
own first (wrong) registry query — the fields live under `.then`, not top level:
`rule-production-write` is gate=release/risk=high, `rule-destructive-ddl` is
risk=high with no gate, and the hook now prints exactly that.

Portability, from a foreign cwd (`/Users/ricardofagmer/projects/ai-se-os`):
resolution printed `/Users/ricardofagmer/projects/engineos`, the kernel answered
`{"escalate":false,"intents":["new-feature"]}`, and the old relative form still
fails there with `no such file or directory: scripts/kernel.sh`.

Runner defects, empirically: a run into a non-existent directory now exits 0 and
writes all three files; the `AI_SE_OS_AGENT_SDK=1` no-kernel-path exit leaves
`git worktree list` at 1 entry, unchanged.

All suites green:

```
test-verify 16/0   test-route 38/0   test-layout 14/0   test-governance 15/0
test-post-edit 4/0 test-task-scale 12/0
test-gate-advisor 25/0 (was 20/0)    test-route-advisor 17/0
test-kernel        passed 177, failed 0   (was 153)
test-telemetry     passed 16,  failed 0
test-exec-journal  passed 14,  failed 0
run-evals          passed 11,  failed 0, skipped 33
validate-engineos  passed 85,  failed 0   (was 84)
ai-se-os: typecheck 0, build 0, npm test 293 passed | 8 skipped (was 289)
```

## Changes registered
engineos:

```
 agents/router.md             | 49 ++++++++---
 commands/route.md            | 28 ++++++-
 hooks/gate-advisor.sh        | 12 ++++--
 hooks/test-gate-advisor.sh   | 31 ++++++++
 install.sh                   | 11 +++++-
 registries/intents.json      | 14 +++----
 registries/policy.json       | 11 +++---
 scripts/kernel.sh            | 33 ++++++++---
 scripts/test-kernel.sh       | 57 +++++++++++++++++-
 scripts/validate-engineos.sh | 30 +++++++---
 10 files changed, 239 insertions(+), 37 deletions(-)
```

ai-se-os, branch `fix/operator-audit-round` off `main` (`5afb683`):

```
 bin/ai-se-os.js               | 27 +++++---
 src/workflow/run-log.ts       | 20 ++++++-
 test/composition-root.test.ts | 33 ++++++++++
 test/run-log.test.ts          | 55 +++++++++++++++-
 4 files changed, 126 insertions(+), 9 deletions(-)
```

## Notes
- **Reported, not fixed — routing coverage is a design limit, not a typo.**
  Measured against the repo's own 33-case corpus (`evals/intent-routing-cases.jsonl`),
  14 prompts matched zero intents before this change and 13 after. The ten dead
  signals were objectively broken text and are fixed; the remaining misses need
  semantic matching, which a literal-phrase engine cannot do. Examples still
  unrouted: "should I position EngineOS as a product or as consulting"
  (`position` vs the `positioning` signal), "our helm chart is missing resource
  limits", "is this branch safe to merge?". Widening signals to catch these
  invites false positives — "position" would fire on CSS work — so it wants a
  spec, not a signal tweak. Note the corpus is model-graded against
  `evals/RUBRIC.md` and its `expect_intents` uses looser labels than the registry
  ids (`architecture-decision` vs `adr`, `sweep` vs `big-sweep`), so it is a
  source of realistic prompts, not a strict oracle.
- The defect class behind items 2 and 4 is the same: **data copied from prose
  into an engine, and a check that asserted the copy instead of the behavior.**
  Worth grepping for elsewhere — anywhere a registry field was seeded from a
  human-readable table.
- Two more findings from the audit remain open and are deliberately out of scope
  here: `ai-se-os --help` falls through to the fixture-loading path (`invalid
  fixture --help`, exit code correctly 1), and a failed run writes its whole JSON
  report to stderr so `| jq` needs `2>&1` on exactly the runs worth inspecting.
- The subagent wave that produced items 3-5 lost its verification phase to a
  session limit; all three fixes were re-verified here by hand, and one
  (the personal-CLAUDE.md path resolution) was rejected and rewritten.
  [[stale-node-in-hook-path]] is the other case where hook behavior depended on
  environment the repo does not control.
