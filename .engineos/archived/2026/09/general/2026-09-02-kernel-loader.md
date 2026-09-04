---
name: 2026-09-02-kernel-loader
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: general
completed: 2026-09-02
---

## What
Routed every `registries/*.json` read in `scripts/kernel.sh` through one internal
seam (`reg`), deleted the two subcommands that had no caller anywhere (`retry`,
`capability`), and declared the surviving kernel subcommands as public surface in
`docs/COMPATIBILITY.md` so a future demotion gets a deprecation window.

## Why
PR5 of the runtime-deepening spec. Its Problem section, item 3: "13 public
subcommands; the runtime calls 2 (`resolve-task`, `route-path`); the router agent
calls 5 more; `retry` and `capability` have no caller. Registry loading is repeated
at 13 sites."

Three defects, one file:

1. **Registry loading was copy-pasted 13 times.** Each subcommand spelled out its
   own `need_reg <file>` plus its own `local X="$REG/<file>"`. Thirteen call sites
   therefore each knew where registries live, and thirteen could each drift on how
   a missing one is reported.
2. **Two dead arms.** `retry` and `capability` had no caller in any hook, command,
   skill, agent, doc, test or registry. `capability` had exactly one reader — a
   validator Check that used it to reach data it could read directly.
3. **The CLI was undeclared surface.** `docs/COMPATIBILITY.md` listed rule paths,
   agent names, aliases, commands, skills, hook contracts, registry shape and the
   return envelope — but not the kernel subcommands that hooks and consumers call.
   A removal was therefore free, which is exactly why the two dead arms had to go
   first: they were the last free removals.

## Scope
- Runtime: `scripts/kernel.sh`
- Validator: `scripts/checks/50-kernel.sh` (C18a retargeted)
- Suites: `scripts/test-kernel.sh`, `scripts/test-validate-engineos.sh`
- Surface doc: `docs/COMPATIBILITY.md`

## Checklist
- [x] Count the actual `jq` invocations and registry opens per subcommand BEFORE
      designing the loader
- [x] Capture a byte-exact snapshot of all 68 invocations across every subcommand,
      to diff after
- [x] Add the `reg` seam; route all 13 registry-read sites through it
- [x] Prove the observable CLI output is byte-identical except the usage string
- [x] Prove `scripts/bench-runtime.sh` does not regress, A/B alternated against the
      base kernel
- [x] Grep the whole repo for `retry` / `capability` dependents before deleting
- [x] Delete `cmd_retry`, `cmd_capability`, their dispatcher arms, the usage-string
      entries and the header lines
- [x] Keep `registries/policy.json` `.retry` and the Checks that assert on it
- [x] Delete their `scripts/test-kernel.sh` cases; drop `capability` from the
      positional-guard loop
- [x] Retarget validator C18a off `kernel.sh capability` onto surviving behaviour
- [x] Add a negative case for the half of C18a that had none
- [x] Cover the loader in `scripts/test-kernel.sh`, mutation-checked
- [x] List the kernel subcommands in `docs/COMPATIBILITY.md`, saying the two arms
      went before the declaration
- [x] Verification sweep, once, at the end

## What was made
**One seam, and the shape came from measurement.** `reg <registry-file> [<var>]`
resolves a registry against `$REG`, fails closed with
`registry missing: registries/<file>` if it is absent, and binds the resolved path
to the caller's variable. Every one of the 13 read sites now reads

```
local P
reg policy.json P
```

instead of `need_reg policy.json` plus its own `"$REG/policy.json"`. `$REG` appears
in exactly two places, both inside `reg`. Composed subcommands declare their inputs
in the original order, so a missing registry is still reported by the same
subcommand with the same message: `reg intents.json I; reg policy.json P; reg
models.json M`.

**The loader binds a path, not contents — and that was the second attempt.** The
first implementation read each registry once with `$(<file)` and handed every `jq`
an `--argjson`. That version was strictly better on paper: one dialect at every
call site instead of three (file positional, `--slurpfile`, re-read per guard), and
`resolve-task` dropped from 9 registry opens to 4, `route-escalate` from 6 to 3,
`repair` from 3 to 1 — verified by counting the loader's read site under `bash -x`.
It was also 5-10% slower on every kernel budget, measured by alternating
`bench-runtime.sh` runs between the two kernels:

| Budget | contents form | path form | base |
|---|---|---|---|
| route-intent | 33.6ms | 31.3ms | 31.7ms |
| resolve-task | 157.9ms | 149.3ms | 147.3ms |
| prompt-advisor (end to end) | 333.2ms | 320.2ms | 320.9ms |
| route-before-change (cache hit) | 69.7ms | 70.6ms | 70.0ms |

Parsing 26KB of `intents.json` out of `argv` costs more than the file opens it
saves; a micro-benchmark put `--argjson` from a shell variable at ~0.6ms/call above
`--slurpfile` from the file, and the composing paths pay that several times over.
So `jq` reading the file is the fast path, the seam's job is to say WHICH file, and
the positional-vs-`--slurpfile` choice stays `jq`'s own distinction at the call
site. The rejected form and the reason are recorded in the `reg` comment, because
the uniform-dialect version is the one a future reader will want to reintroduce.

That is also the honest limit of this seam: it hides where registries live and how
absence is reported. It does not hide how `jq` consumes them.

**`jq` spawns per subcommand, before and after** (counted with a `jq` shim on
`PATH`):

| Subcommand | before | after |
|---|---|---|
| route-path (hit / excluded) | 3 / 2 | 3 / 2 |
| route-intent | 1 | 1 |
| model | 2 | 2 |
| risk | 3 | 3 |
| gates | 1 | 1 |
| repair (red ladder) | 4 | **3** |
| waves | 3 | 3 |
| decision-rules | 1 | 1 |
| scale | 2 | 2 |
| route-escalate | 5 | 5 |
| resolve-task | 7 | 7 |

The one reduction is `repair`: it read `max_fix_attempts_per_check` and
`escalations` with a `jq -r` each, which the loader made obvious once both lines
named the same bound variable. They are now one `@tsv` read split in the shell.
Nothing else changed process count, which is the property the loader was designed
for — `reg` performs no process of its own.

**Two dead arms deleted.** `cmd_retry` (43 lines) and `cmd_capability` (16 lines)
are gone, with their dispatcher arms, their entries in the `usage:` string, and
their lines in the header comment. `registries/policy.json` `.retry` STAYS: it is
policy that `rules/parallelism.md` documents and that validator C16 asserts on
(`scripts/checks/40-decision-registries.sh`: the `never_retry` list length, and the
2-attempts-plus-1-escalation bound checked against the prose). Only the subcommand
went. Nothing in `scripts/checks/*.sh` asserted on the `retry` subcommand — every
`retry` hit in that directory is a `policy.json` `.retry` read.

**C18a retargeted, not deleted.** It was the only consumer of `kernel.sh
capability` in the repo:

```
bound=$(bash "$KSH" capability route 2>/dev/null | jq -r '.bound')
kmodel=$(bash "$KSH" capability route 2>/dev/null | jq -r '.model')
```

The property it defends never lived in that subcommand. Its registry-to-registry
half (a binding resolves at all, a tier is valid) is C15 and C15b's. What survives
here and nowhere else is the registry-to-frontmatter half: the tier the `route`
capability claims must resolve, in `models.json`, to the model `agents/router.md`
declares in its own frontmatter. C18a now reads that directly, so the Check is one
step shorter and can still fail. `have_router_inputs` gained `models.json` and its
skip message names it.

That half had no negative case — the existing C18 case mutates `model_tier` off
`design`, which trips the outer guard before the comparison. A second case was
added that rewrites `agents/router.md`'s `model:` to `haiku`, so the comparison
itself now has a defender.

**Loader coverage, mutation-checked.** `scripts/test-kernel.sh` gained a
`registry loader` family. The fail-closed behaviour that `need_reg` provided at 13
sites had NO test: nothing proved a subcommand refuses, or says which registry it
wanted, when one is absent. Two tables now hide exactly one registry at a time in a
relocated copy of the kernel — the same `pwd -P` copy trick PR3 established, since
`kernel.sh` derives `ROOT`/`REG` from its own `BASH_SOURCE` — and assert both the
non-zero exit with an `{"error":...}` body and the exact message. The second table
covers the composed reads (`resolve-task` -> `decision-rules.json`,
`route-escalate` -> `models.json`), where the missing registry is not needed by the
subcommand's first `jq` program.

Both were mutation-checked rather than merely run green. Dropping `reg models.json M`
from `route-escalate` turns 3 fixtures and their assertions red; making `gates`
bypass the seam with a hardcoded path turns exactly the two new `gates` assertions
red (`passed 195, failed 2`) and nothing else — so the new cases fail for the
reason they exist.

**Kernel CLI declared public surface.** `docs/COMPATIBILITY.md`'s public-surface
table gained a row for `scripts/kernel.sh` subcommand names and their JSON answer
shape, followed by the enumeration of the eleven survivors, the MINOR/MAJOR split
(adding a subcommand or an answer field is MINOR; removing or renaming either is
MAJOR), and the explicit note that `retry` and `capability` were removed BEFORE the
row was written because they were the last removals the policy did not yet cover.
The paragraph also says what is NOT surface: `reg`, the `jq` programs, and how many
processes an answer costs. The kernel header comment points at the policy so the
next editor of that dispatcher sees it there too.

## Verification
Run once, at the end. All green:

```
shellcheck -S error hooks/*.sh install.sh scripts/*.sh scripts/checks/*.sh   rc=0
bash scripts/test-kernel.sh                   passed 197, failed 0
bash scripts/validate-engineos.sh             passed 88, failed 0
bash scripts/test-validate-engineos.sh        passed 84, failed 0
bash hooks/test-route.sh                      pass=41 fail=0
bash hooks/test-prompt-advisor.sh             47 passed, 0 failed
bash hooks/test-bypass.sh                     pass=27 fail=0
bash hooks/test-verify.sh                     pass=19 fail=0 skip=0
bash hooks/test-docs.sh                       pass=190 fail=0
bash hooks/test-governance.sh                 pass=15 fail=0
bash scripts/run-evals.sh                     passed 11, failed 0, skipped 33
bash scripts/bench-runtime.sh                 5 budgets ok
```

**Output identity.** A snapshot script ran 68 invocations covering every surviving
subcommand — every branch of `route-path`, all the error paths, every `repair` and
`waves` and `risk` case, the composed resolvers — against the base kernel and the
new one. The two outputs differ on exactly two lines, both the `usage:` string that
had to lose two names:

```
< {"error":"usage: kernel.sh {...|gates|retry|repair|capability|waves|...} ..."}
> {"error":"usage: kernel.sh {...|gates|repair|waves|...} ..."}
```

**No-jq degradation preserved.** The guard is unchanged and still sits above every
subcommand: `command -v jq || { printf '{"error":"jq is required ..."}'; exit 1; }`.
The kernel still fails hard rather than degrading silently the way the hooks do,
and `reg` runs no process of its own, so it cannot change that.

**Budgets, A/B alternated** three rounds each to cancel machine drift (the first
naive measurement compared a loaded machine against an idle one and read as a 40%
regression that alternation showed to be noise):

| Budget | base | after | budget |
|---|---|---|---|
| route-intent | 31.7ms | 31.3ms | <250ms |
| resolve-task | 147.3ms | 149.3ms | <500ms |
| prompt-advisor (end to end) | 320.9ms | 320.2ms | <600ms |
| route-before-change (cache hit) | 70.0ms | 70.6ms | <150ms |
| always-on context | 26457 bytes | 26457 bytes | <32000 bytes |

## Changes registered

`git diff --stat 68cf842..96cce8d` for this change's single commit:

```
 .engineos/changes/2026-09-02-kernel-loader.md | 283 ++++++++++++++++++++++++++
 docs/COMPATIBILITY.md                         |  11 +
 scripts/checks/50-kernel.sh                   |  21 +-
 scripts/kernel.sh                             | 159 ++++++---------
 scripts/test-kernel.sh                        | 102 +++++-----
 scripts/test-validate-engineos.sh             |   4 +
 6 files changed, 432 insertions(+), 148 deletions(-)
```

Movements: none. No file added or deleted; `scripts/kernel.sh` shrank from 632 to
603 lines.

**Size against the 400-line PR cap (`rules/git.md`):**

| Count | Added | Deleted | Total |
|---|---|---|---|
| Excluding this record | 149 | 148 | 297 |

297 excluding the record — under the cap, and almost exactly balanced between
addition and deletion, which is what a refactor with two removals should look like.

## Notes
Judgement calls the brief left open:

- **`docs/specs/**` references kept.** Four dated design documents name
  `kernel.sh retry` or `kernel.sh capability`
  (`2026-08-06-decision-kernel-p2-resolver-api.md`, `-p3-router-agent.md`,
  `-p5-repair-loop.md`, `-p7-telemetry.md`). They were correct as of their dates;
  PR3 set the precedent that dated specs keep their history rather than being
  rewritten.
- **`registries/capabilities.json` kept.** Only the `capability` SUBCOMMAND had no
  caller. The registry itself is read by `scripts/gen-agent-registry.sh` (the
  `capability_ids` back-reference), `scripts/exec-journal.sh`, and Checks C15,
  C15b and C18a.
- **No memoized existence check.** The contents-form loader memoized; the path form
  does not, because a repeated `[ -f ]` is a shell builtin and there are at most
  nine per process. Memoizing it would add indirection for no measurable gain.
- **`repair`'s two-scalar read collapsed** even though the brief only asked for the
  loader. It is the one duplication the seam made impossible to miss: two `jq`
  spawns for two integers out of the same registry, three lines apart.
- **`kernel.sh` is 603 lines**, over `rules/base.md`'s ~300-line guide. It is a
  dispatcher over eleven independent resolvers with no shared state beyond `reg`,
  `err` and `require_positional`; splitting it into files would make the deep
  interface a directory without making any resolver simpler. PR6 and PR7 of the
  spec touch other files; if the kernel keeps growing, the split to argue for is
  one file per resolver family, which is a spec decision, not a drive-by.
