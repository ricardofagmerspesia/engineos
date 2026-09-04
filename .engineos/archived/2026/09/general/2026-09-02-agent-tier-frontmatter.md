---
name: 2026-09-02-agent-tier-frontmatter
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: general
completed: 2026-09-02
---

## What
Closed the tier residual: `scripts/exec-journal.sh` reads the tier vocabulary
from `registries/models.json` instead of carrying its own hardcoded copy, and a
new integrity Check (C24) asserts that every agent's declared `tier:` binds, in
that registry, the `model:` the agent also declares. Marked
`hooks/lib-common.sh` non-executable, bumped the plugin to 1.6.0, and wrote the
repo's first `docs/release-notes/` entry covering the whole eight-unit stack.

## Why
PR7, the last row of the runtime-deepening spec's Decision table. The tier
frontmatter itself had already landed upstream — all 22 agents carry a `tier:`
line, `scripts/gen-agent-registry.sh` copies it into `registries/agents.json` as
`model_tier`, and it hard-errors on a missing, unknown or model-inconsistent
tier. What was left was the part that made the registry actually the source of
truth rather than one of two:

1. **A second copy of the tier list.** `scripts/exec-journal.sh` carried
   `VALID_TIERS="cheap build design most-capable"` as a constant, four tier ids
   spelled out by hand. `rules/models.md` says `registries/models.json` is the
   machine-readable form of its table, and `scripts/validate-engineos.sh` fails
   when the two disagree — but nothing was watching the journal's copy. Adding
   or rebinding a tier would leave it accepting a vocabulary the kernel no
   longer knows, silently, because the journal is a schema contract with no
   caller in this repo to notice.
2. **Nothing in the tree asserted tier/model agreement.** The generator refuses
   to *emit* a drifted agent, which protects `registries/agents.json` — but only
   at the moment someone regenerates it. An agent file edited and committed
   without a regeneration sat wrong in the tree with no check objecting. The
   generator is one reader; the validator has to be the other, independently.
3. **`hooks/lib-common.sh` was tracked 755** while its own header says it
   carries no exec bit. It is sourced, never executed. PR1's record flagged this
   and left it; `hooks/lib-runner.sh` shipped 644 in PR6, so 755 was the
   outlier, not the convention.
4. **No release notes existed at all.** `rules/memory.md` names
   `docs/release-notes/` as their home and `docs/COMPATIBILITY.md` tells
   consumers to read them before upgrading a MINOR. The directory did not exist.
   Eight units of work had landed, including three hook deletions, a shim
   deletion and two kernel subcommand removals, with nothing telling a consumer
   any of it happened.

## Scope
- Runtime: `scripts/exec-journal.sh`
- Validator: `scripts/checks/30-agents-skills.sh` (C24 added)
- Suites: `scripts/test-validate-engineos.sh`
- Permissions: `hooks/lib-common.sh` (mode only, no content change)
- Version: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Docs: `docs/release-notes/release-notes-1.6.0.md` (new)

## Checklist
- [x] Verify the upstream tier work rather than assume it: 22/22 agents declare
      `tier:`, the generator copies it as `model_tier`, `registries/agents.json`
      carries 22 of them
- [x] Read `scripts/exec-journal.sh`'s existing no-jq degradation before
      changing it, and preserve it exactly
- [x] Replace `VALID_TIERS` with a registry read placed after the jq guard, so
      no command gains a new failure mode
- [x] Guard the registry's absence with the same message shape the generator uses
- [x] Pick the Check's family file by what it reads (agent documents ->
      `30-agents-skills.sh`), not by what it is about
- [x] Follow the existing `check_<id>()` shape: `have_jq || return 0`, one `ok`
      or one `bad`, findings accumulated into a single message
- [x] Add the negative case with an explicit Check id as `case_`'s first argument
- [x] Prove C24 is load-bearing by mutating an agent's `model:` off its tier
- [x] Comment the validator's own frontmatter regex to say the duplication with
      the generator is deliberate
- [x] Check `hooks/lib-common.sh`'s actual mode before chmod, and confirm it is
      sourced and never executed
- [x] Check the current version before bumping, and grep for anything asserting
      on the version string
- [x] Follow `docs/COMPATIBILITY.md`'s versioning policy and justify MINOR with
      evidence, not assertion
- [x] Read every branch's change record before writing the release notes rather
      than working from the brief's summaries
- [x] Group the notes by consumer impact, removals, and public surface
- [x] Name every removal explicitly: three advisor hooks, one routing shim, two
      kernel subcommands
- [x] Run the full verification set once, at the end

## What was made

### `scripts/exec-journal.sh` — the tier list comes from the registry

`VALID_TIERS` is gone. In its place, a `valid_tiers()` function reading
`registries/models.json`, plus the `ROOT`/`MODELS_FILE` pair the generator
already uses to locate it:

```bash
valid_tiers() {
  jq -r '[.tiers[].id] | join(" ")' "$MODELS_FILE"
}
```

The three constraints the old constant satisfied are all preserved, and each is
now stated in the comment rather than implied:

- **Hyphenated ids, not the table's spaced prose.** `in_list` splits on
  whitespace, so `most capable` as a token would silently never match. The
  registry stores `most-capable`, which is the identifier form — the property
  the old comment was protecting is now structural rather than a convention
  someone has to remember.
- **No new degradation path.** This was the trap. `valid_tiers()` needs `jq`,
  and putting the read at file scope would have broken two things that currently
  work without it: `usage()` (a bare invocation, which must still print usage
  and exit 1) and `cmd_validate`'s own `jq required` message, which would have
  been preceded by jq's parse errors on stderr. The call sits inside
  `cmd_append`, after its existing `command -v jq` guard, so every path degrades
  exactly as it did before.
- **A missing registry fails loudly.** `[ -f "$MODELS_FILE" ]` next to the jq
  guard, with the generator's message shape (`no models registry at <path>`).
  Without it, `set -euo pipefail` would abort on the command substitution with
  jq's own error, which names the file but not what the script wanted from it.

The header comment's schema line changed from "one of `rules/models.md`'s four
tier names" to "a tier id from `registries/models.json`" — the old line was both
a second copy of the count and a pointer at the human mirror rather than the
machine form.

### `scripts/checks/30-agents-skills.sh` — C24

For every agent declaring both `tier:` and `model:`, the model
`registries/models.json` binds to that tier must equal the declared model. An
unknown tier is reported separately from a mismatch, since they need different
fixes.

Two decisions inside it are worth stating:

**A fresh id, not `C13b`.** A letter suffix in this harness means "sub-check of
that parent" — the `--only` resolver expands a bare parent id to its suffixed
children, so `--only C17` runs C17, C17b, C17c and C17e. Filing a tier check as
`C13b` would make `--only C13` ("no empty rule/agent/skill documents") silently
run a tier assertion, which is a lie about what C13 is. The precedent for a
non-sub-check joining an existing family is `C14`/`C15` in `20-registries.sh`,
which took fresh numbers rather than becoming `C8b`. C24 is the next free
number; the harness sorts by numeric part, so it lists last.

**Placed in the agents family, not the models family.** The obvious alternative
was `40-decision-registries.sh`, where C16 already validates
`registries/models.json` internally. But `lib.sh` groups families by *what they
read*, and C24 reads `agents/*.md` — 22 documents — and consults the registry
for one scalar per agent. C16 reads the registry and nothing else. Filing C24
next to C16 would have put the only agent-document reader in a registry family.

**Why it duplicates the generator rather than sourcing it.** This is the point
of the Check, and the reason item 3 of the brief exists. `scan_agent_contracts`
now carries the comment:

> Deliberately the validator's OWN frontmatter reader, not the generator's:
> sourcing `scripts/gen-agent-registry.sh` here would make a broken generator
> invisible — the Check would read the agent files exactly as wrongly as the
> thing it exists to catch. Two independent readers, on purpose.

The generator's `frontmatter_value` and the validator's `sed -n 's/^name: *//p'`
are near-identical regexes over the same files. Deduplicating them would be the
obvious cleanup and would destroy the property: a generator whose regex broke
would produce a wrong registry, and a validator sharing that regex would agree
with it. Two readers that can disagree is the whole mechanism.

### The mutation proof

C24 is green on the tree as it stands:

```
ok   every agent's tier binds the model it declares (22 agents)
```

`agents/critic.md` declares `tier: design` and `model: opus`;
`registries/models.json` binds `design` to `opus`. Moving only the model:

```
$ sed -i.bak 's|^model: opus$|model: haiku|' agents/critic.md
$ bash scripts/validate-engineos.sh --only C24
FAIL agent tier/model disagreements: critic(tier:design-binds-opus,model:haiku)
passed 0, failed 1
```

Reverted immediately; the tree is unchanged. The same mutation is now
`scripts/test-validate-engineos.sh`'s C24 case, so it is asserted on every run
rather than proved once by hand.

The case is deliberately a *model* mutation and not a *tier* mutation. Changing
`tier:` to something unknown would also go red, but through the unknown-tier arm
— which the generator would also catch. Moving the model off a valid tier is the
drift the generator cannot see once the registry has already been generated:
the frontmatter still reads plausibly, `registries/agents.json` is unchanged and
still internally consistent, and nothing else in the repo objects.

### `hooks/lib-common.sh` — mode 644

Tracked `100755`, now `100644`. Content untouched. It is sourced by nine hooks
and executed by none; `hooks/lib-runner.sh`, the seam PR6 added for the same
reason, shipped 644.

### Version 1.6.0

`.claude-plugin/plugin.json` 1.5.0 -> 1.6.0, and `.claude-plugin/marketplace.json`
alongside it — the marketplace entry carries its own copy of the same number and
would have been left stale. Nothing else in the repo asserts on the version
string: `registries/*.json` each carry an independent schema version
(`policy.json` reads 1.5.0 coincidentally, not as a mirror of the plugin), no
Check reads `plugin.json`, and no suite greps for it.

**MINOR is defensible, and the reasoning is not just "the tier field is
additive".** The stack contains three hook deletions, a shim deletion and two
kernel subcommand removals, and `docs/COMPATIBILITY.md` says a removal from the
public surface is MAJOR. Each was checked against the actual table:

- **The three advisor hooks were never on it.** The surface is "hook event
  contract in `hooks/hooks.json`", and `git show e823c6b:hooks/hooks.json` shows
  that file has only ever registered `prompt-advisor.sh` for `UserPromptSubmit`.
  The advisors were unregistered files left on disk after 1.5.0's prompt-adapter
  work.
- **`retry` and `capability` are covered by the policy's own carve-out.** The
  kernel-CLI row says in its own text that the two were removed before the row
  was written, deliberately, as the last removals the policy did not cover.
- **`hooks/routing-map.sh` is a hook internal**, explicitly freed by the "not
  public surface" paragraph, and its data moved to an additive registry key.
- **The tightened checks are MINOR by the policy's explicit rule** — "an
  existing rule is tightened in a way that flags more, not less" — and it
  requires them to be named in the release notes, which they are.

### `docs/release-notes/release-notes-1.6.0.md`

The repo's first release notes; the directory did not exist. Written via the
`release-notes` skill, whose template supplies Summary / Breaking Changes /
What's New / What Was Fixed / Upgrade. Two sections were added to it — **Removed**
and **Public Surface** — because the brief's grouping (consumer impact,
removals, public surface) does not map onto a template built for a single
version's features, and because burying six named removals inside "What's New"
would defeat the reason for naming them.

Grouping decisions:

- **Breaking Changes leads and is not empty**, even though nothing on the
  declared surface broke. Four changes can break tooling built against
  undeclared internals — the two kernel subcommands, `--only`'s vocabulary, the
  routing shim, and `route-before-change.sh`'s now pretty-printed JSON. Each
  carries a migration step, per the skill's rule that a breaking change without
  one is incomplete. The section opens by saying the declared surface is intact,
  so the reader is not misled about the version number.
- **Removals get their own section with a named heading each**, and the advisor
  deletion carries the `hooks.json` evidence inline — a consumer whose settings
  name `route-advisor.sh` needs to know both that it is gone and why it got no
  deprecation window.
- **The Upgrade section leads with "reinstalling is required, not optional"**
  and both reasons. The `install.sh` defect installed zero hooks while printing
  success, so a consumer has no local symptom to notice; and the installer's new
  scrub removes hand-edited EngineOS hook entries, which is a data loss a reader
  must be warned about before running it, not after.
- **`install.ps1` is flagged unverified.** Its record says no PowerShell was
  available on the authoring machine and it was reviewed by reading only.
  Shipping that silently to Windows consumers would be the "green summary hiding
  a dead branch" `rules/parallelism.md` forbids.

## Verification

Run once, at the end, per `rules/verification.md`. Final line of each command:

```
$ shellcheck -S error hooks/*.sh install.sh scripts/*.sh scripts/checks/*.sh
(no output, rc=0)

$ bash scripts/test-exec-journal.sh
passed 14, failed 0

$ bash scripts/test-gen-agent-registry.sh
passed 7, failed 0

$ bash scripts/validate-engineos.sh
passed 89, failed 0

$ bash scripts/validate-engineos.sh --list
C24                       (45 ids, up from 44)

$ bash scripts/test-validate-engineos.sh
passed 85, failed 0       (84 before, +1 for the C24 case)

$ bash scripts/test-kernel.sh
passed 197, failed 0

$ bash hooks/test-docs.sh
pass=190 fail=0

$ bash hooks/test-governance.sh
pass=15 fail=0

$ bash scripts/run-evals.sh
passed 11, failed 0, skipped 33

$ bash scripts/bench-runtime.sh
ok   always-on context: 26457 bytes budget<32000 bytes
```

All five runtime budgets green and unmoved from PR5's numbers: route-intent
30.4ms (<250), resolve-task 146.2ms (<500), prompt-advisor end-to-end 317.3ms
(<600), route-before-change cache hit 69.6ms (<150), always-on context 26457
bytes (<32000). Nothing in this change is on a hot path, and the bench confirms
it.

The agent-registry drift guard CI runs:

```
$ bash scripts/gen-agent-registry.sh
Wrote 22 agents to .../registries/agents.json
$ \git diff --exit-code registries/agents.json
rc=0   (clean)
```

The two new Checks in the suite counts are worth separating: `validate` went
88 -> 89 because C24 is new and green; the negative suite went 84 -> 85 because
its C24 case plants breakage and the Check catches it. A Check that only ever
passes would have moved the first number and not the second.

## Changes registered

`git diff --stat 96cce8d..05d8c93` for this change's single commit:

```
 .claude-plugin/marketplace.json                    |   2 +-
 .claude-plugin/plugin.json                         |   2 +-
 .../changes/2026-09-02-agent-tier-frontmatter.md   | 385 +++++++++++++++++++++
 docs/release-notes/release-notes-1.6.0.md          | 288 +++++++++++++++
 hooks/lib-common.sh                                |   0
 scripts/checks/30-agents-skills.sh                 |  41 ++-
 scripts/exec-journal.sh                            |  27 +-
 scripts/test-validate-engineos.sh                  |   7 +
 8 files changed, 743 insertions(+), 9 deletions(-)
```

Movements: one file added (`docs/release-notes/release-notes-1.6.0.md`, and the
`docs/release-notes/` directory with it). One mode change,
`hooks/lib-common.sh` 100755 -> 100644, zero content lines. No file deleted, no
file renamed.

**Size against the 400-line PR cap (`rules/git.md`):**

| Count | Added | Deleted | Total |
|---|---|---|---|
| Excluding this record and the release notes | 70 | 9 | 79 |
| Excluding this record only | 358 | 9 | 367 |

79 lines of actual code and test — the brief's target. 367 with the release
notes, still under the cap; the notes are prose in a new file, the kind of bulk
`rules/git.md` says to call out and exclude rather than split a PR over.

## Notes
Judgement calls the brief left open:

- **`C24`, not `C13b`.** The brief said "the next free id in that family's
  sequence", which reads most literally as a letter suffix on the family's last
  id. Taken literally it would have filed a tier assertion as a sub-check of
  "no empty documents" and made `--only C13` run it. The suffix convention
  means parentage everywhere else in the harness (C17b/c/e under C17, C18b-g
  under C18), and `20-registries.sh` already sets the precedent that an
  unrelated Check joining a family takes a fresh number. C24 is the next free
  number and lives in the family the brief named.
- **`.claude-plugin/marketplace.json` bumped too.** The brief named only
  `plugin.json`. The marketplace entry carries its own copy of the same version
  and is the number a consumer installing from the marketplace actually sees;
  bumping one and not the other would ship a release whose two published
  versions disagree.
- **`registries/policy.json` left at 1.5.0.** It reads like the plugin version
  but is not: every registry carries an independent schema version
  (`models.json` 1.0.0, `routing.json` 1.1.0, `intents.json` 1.3.1), and nothing
  ties any of them to `plugin.json`. Changing it would have invented a coupling
  that does not exist.
- **The header comment's "four tier names" dropped.** Naming the count in prose
  is the same defect as the constant: it is a second copy of something the
  registry owns, and it goes stale the moment a fifth tier is added.
- **`install.sh`'s `chmod +x hooks/*.sh` left alone.** It re-marks
  `lib-common.sh` and `lib-runner.sh` executable on every install, so the 644
  mode holds in git but not in an installed checkout. Fixing it means narrowing
  the glob to exclude `lib-*.sh`, which is outside this change's scope — logged
  under Out of scope rather than done quietly.
- **The release notes cover the whole stack, not PR7.** The brief asked for
  this, and it is the right shape: `docs/COMPATIBILITY.md` tells consumers to
  read the notes for a version, and the version is what all eight units ship as.
  A PR7-only entry would document the tier field and silently omit three hook
  deletions.
