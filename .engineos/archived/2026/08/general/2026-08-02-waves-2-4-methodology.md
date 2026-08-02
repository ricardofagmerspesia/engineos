---
name: 2026-08-02-waves-2-4-methodology
status: done
completed: 2026-08-02
owner: Ricardo Fagmer
spec: docs/specs/2026-08-02-ai-methodology-integration-analysis.md
domain: general
---

## What

Waves 2 through 4 of the methodology integration plan — the remaining 12 gaps
(G1, G2, G3, G5, G7, G8, G9, G10, G12, G13, G14, G15). EngineOS gains a risk
axis, a named gate ladder, a data-driven decision engine, a drift-proof routing
registry, a handoff contract, a failure policy, a context budget, an adversarial
critic, a retrospective loop, a compatibility policy, and adapters for three
non-Claude-Code tools.

## Why

The request was "G3 to G15". G1 and G2 were pulled in because in-range items hard
depend on them: `rules/gates.md` (G7) keys every gate off the risk tier, and
`agents/critic.md` (G14) is dispatched by it. Shipping the range without them
would have delivered gates that reference a tier nothing assigns.

The underlying motivation is the analysis in the spec: EngineOS was ahead of the
supplied corpus on parallelism, model tiering and knowledge placement, but had no
risk axis at all — a column-dropping migration and a README typo received
identical ceremony — and no release gate, so nothing ever required a rollback path
or a named owner before shipping.

## Scope

New always-on rules: `rules/risk-autonomy.md`, `rules/context.md`, `rules/gates.md`.
Extended rules: `rules/models.md` (budget ladder), `rules/parallelism.md` (failure
policy, handoff at barriers, risk in the brief).
New registries: `registries/routing.json`, `registries/decision-rules.json`.
New hook: `hooks/gate-advisor.sh` + `hooks/test-gate-advisor.sh`, wired into
`hooks/hooks.json` on UserPromptSubmit.
New agent: `agents/critic.md` (alias `vera`) + generated commands.
New skill: `skills/retro/SKILL.md`.
New docs/templates: `docs/COMPATIBILITY.md`, `templates/handoff.md`,
`templates/adapters/{README,claude-code,cursor,codex,github-copilot}.md`.
Extended: `CLAUDE.md`, `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`,
`scripts/run-evals.sh`, `evals/*`, `.github/workflows/ci.yml`.

## Checklist

- [x] G1 risk tiers + autonomy levels A0-A4, risk in the router announcement
- [x] G2 decision rules as data + a hook that makes them fire
- [x] G3 routing registry with enforced three-way consistency
- [x] G5 handoff contract, required at wave barriers
- [x] G7 five named gates + validation ladder + release gate
- [x] G8 budget and gate-checked degradation ladder
- [x] G9 context engineering rule
- [x] G10 retro skill
- [x] G12 compatibility and deprecation policy
- [x] G13 adapters with an honest enforcement matrix
- [x] G14 critic agent gated on risk
- [x] G15 failure policy for dispatch
- [x] Constitution updated: always-on set, router line, 3 new rows, 2 new non-negotiables
- [x] Validator extended 12 -> 23 checks; negative suite 9 -> 16 cases
- [x] Evals extended 26 -> 33 intent cases, 14 -> 16 agent cases, `expect_risk` added
- [x] All of it wired into CI

## What was made

**G1 `rules/risk-autonomy.md` (always-on).** Five risk inputs — reversibility,
blast radius, data sensitivity, contract surface, spend — taking the highest tier
any one reaches, plus shortcut floors that are high regardless (destructive DDL,
secret exposure, authz changes, production deploys, payments, acting on someone
else's behalf). Autonomy A0-A4, with a mapping table that gives the ceiling per
tier, not the target. A4 is explicitly not granted by EngineOS today. The router
announcement now carries `risk=` and `autonomy=`.

**G7 `rules/gates.md` (always-on).** Discovery / Design / Implementation /
Validation / Release, each mapped to the EngineOS mechanism that enforces it, plus
a table of which gates apply at which risk tier. Adds the two that did not exist:
a Design gate with exit criteria (rejected alternative recorded, contracts frozen
before fan-out, every matched decision rule satisfied) and a **Release gate** with
a checklist — named owner, concrete rollback path or an explicit statement that
rollback is impossible, evidence attached, residual risks accepted, what to watch
after release. Also the four-rung validation ladder, and the rule that a release
without a rollback path is high risk regardless of diff size.

**G9 `rules/context.md` (always-on).** Six context layers in priority order, with
the rule that pressure drops from the bottom and layer 1 never drops. The
operating rule is the sharp one: never sweep the repository; resolve the intent,
load what the route names, state what was used. Plus a section on briefs, since a
brief is a context budget for someone who cannot ask a follow-up.

**G8 budget ladder in `rules/models.md`.** Five rungs — cache, reduce context,
smaller model, defer, deny — each with an explicit "do NOT take it when" column.
This is where the sentence recovered from v11's dropped runbook landed: each rung
is gate-checked, not automatic. Absolute dollar limits are declared a
project-level delta rather than a team constant.

**G15 failure policy in `rules/parallelism.md`.** Retry once, then escalate one
model tier and retry once more, then stop — two attempts and one escalation, then
a human. Four conditions never retry at all and escalate on first occurrence:
security risk, possible data loss, an irreversible action with an unclear gate,
unresolved ambiguity. A failed unit blocks its wave's barrier rather than being
routed around.

**G2 `registries/decision-rules.json` + `hooks/gate-advisor.sh`.** Twelve rules in
`when -> then require/prefer` form, carrying priority, source, and optional
`signals` regexes. Three encode existing non-negotiables (spec threshold,
verification, change record); the rest come from the analyzed corpus and from
`rules/data.md` / `rules/security.md`. Precedence and a conflict policy are
declared at the top. The hook fires on UserPromptSubmit, matches the prompt against
the signals, and injects the required artifacts plus the A3 ceiling note when a
matched rule sets risk=high. Rules without `signals` are model-only by design —
`files_changed` and `affects_public_contract` cannot be read off a prompt.

**G3 `registries/routing.json`.** Ten domains with rules, skills, agent,
precedence position, risk floor and the exact `hook_guidance` string. **Shipped as
a cross-check, not a generator** — see the spec's G3 note. The validator now
enforces six-way agreement: every registry guidance string is emitted by
`routing-map.sh`, every `routing-map.sh` arm is declared in the registry, each
domain's `rules[]` matches the rules named inside its own guidance string,
precedence covers every domain in arm order, every named agent/skill/rule
resolves, and every risk floor is a valid tier.

**G5 `templates/handoff.md`.** Objective, state (with gate and risk), done,
decisions, files, evidence, known failures, not done, next step, resume commands.
Opens with the test that makes it real: could the next executor resume from this
file alone? `rules/parallelism.md` step 6 now requires one at every wave barrier.

**G14 `agents/critic.md`.** Read-only, opus, prompted to refute rather than
confirm, defaulting to "not proven" under uncertainty. Attacks the evidence before
the code — a claim of verification with no output shown is the first finding.
Hunts seven specific failure modes and requires a concrete failing path per
refutation. Verdicts NOT PROVEN / PROVEN WITH GAPS / PROVEN, mapped onto the
return envelope. Explicitly defers the security lens to `security-reviewer` rather
than doing half a security review.

**G10 `skills/retro/SKILL.md`.** Mines archived change records, eval failures and
integrity failures; requires three independent occurrences before a pattern
qualifies (`rules/memory.md`'s promotion threshold, finally given a mechanism);
routes each root cause to its correct home via that file's placement table;
requires each proposal to state how we would know it worked, and to land the
detection before the rule change. Proposes as a PR, never merges. Includes the
prompt to propose deleting a rule that has never caught anything.

**G12 `docs/COMPATIBILITY.md`.** Declares what counts as public surface (rule
paths, agent names, aliases, command names, skill directories, hook contracts,
return-envelope fields), semver semantics with tightening classified as MINOR not
PATCH, and a deprecate-warn-remove window where removal is never earlier than one
minor after deprecation. States plainly that a rename is a deprecation, not a
`git mv`.

**G13 `templates/adapters/`.** Claude Code (reference), Cursor, Codex, Copilot.
Each states how rules load, what is actually enforced, and what degrades to
convention. The README carries an enforcement matrix whose honest conclusion is
that CI is the only portable enforcement layer, and the Copilot adapter says
outright that on that tool EngineOS is a convention with CI teeth rather than an
enforced runtime.

**Constitution.** Three new always-on imports (set is now 9). Router line carries
risk and autonomy. Three new rows: critic, handoff, retro. Two new
non-negotiables: #9 classify risk before the first write, #10 public surface
changes follow the compatibility policy. The closure rule now says it is enforced
by the validator, because it is.

## Changes registered

```
$ git status --short   (excluding the two pre-existing mode-only changes)
 M .github/workflows/ci.yml
 M CLAUDE.md
 M docs/specs/2026-08-02-ai-methodology-integration-analysis.md
 M evals/RUBRIC.md
 M evals/agent-cases.jsonl
 M evals/intent-routing-cases.jsonl
 M hooks/hooks.json
 M rules/models.md
 M rules/parallelism.md
 M scripts/run-evals.sh
 M scripts/test-validate-engineos.sh
 M scripts/validate-engineos.sh
?? agents/critic.md
?? commands/agents/critic.md
?? commands/agents/vera.md
?? docs/COMPATIBILITY.md
?? hooks/gate-advisor.sh
?? hooks/test-gate-advisor.sh
?? registries/
?? rules/context.md
?? rules/gates.md
?? rules/risk-autonomy.md
?? skills/retro/
?? templates/adapters/
?? templates/handoff.md
```

No renames. `hooks/layout-manifest.sh` and `hooks/lib-common.sh` remain excluded —
mode-only changes predating this work, same as the previous record.

## Verification

```
scripts/validate-engineos.sh       passed 23, failed 0   (was 12)
scripts/test-validate-engineos.sh  passed 16, failed 0   (was 9)
scripts/run-evals.sh               passed 11, failed 0, skipped 33
hooks/test-gate-advisor.sh         pass=16 fail=0        (new)
hooks/test-route.sh                pass=38 fail=0
hooks/test-governance.sh           pass=15 fail=0
hooks/test-task-scale.sh           12 passed, 0 failed
hooks/test-layout.sh               pass=14 fail=0 skip=0
hooks/test-verify.sh               pass=10 fail=0 skip=0
hooks/test-post-edit.sh            pass=4  fail=0
jq empty on all JSON               ok (hooks, registries, plugin manifests)
bash -n on all scripts and hooks   clean
```

Two checks were verified by deliberately breaking them and confirming the failure,
not just by watching them pass: the always-on reference rule (which caught a real
violation in `rules/gates.md` during authoring — it pointed at the route-loaded
`rules/testing.md`, and was reworded) and the eval risk-floor cross-check (a
planted case claiming a DBA change is low risk was correctly rejected against the
registry's high floor).

Not verified locally: `shellcheck -S error` — still not installed on this machine;
CI covers `scripts/*.sh` and `hooks/*.sh` there. The live eval tier remains unrun,
now 33 cases rather than 26.

## Notes

- Scope deviation, stated up front: the request was G3-G15; G1 and G2 were
  included because G7 and G14 do not function without them.
- G3 deviates from the spec's own proposal. Generating `routing-map.sh` from the
  registry would have erased the collision comments that the 38 routing tests
  exist to protect (`authors/` vs `auth/`, the deliberate non-matching of
  `*/app/*`, store-release preceding mobile). Cross-checking achieves the
  anti-drift goal with no loss. The spec was updated to record this rather than
  left describing something that was not built.
- The always-on set grew from 6 files to 9. That is real context cost on every
  session in every consuming project; the three added are short and each one is
  referenced by the others, so splitting them would have broken the closure rule
  that `CLAUDE.md` states for always-on files.
- `hooks/gate-advisor.sh` initially emitted nothing: `@tsv` escapes backslashes,
  which turned every `\b` in the signal patterns into a literal `\\b`. Fixed with
  raw string interpolation, and the reason is commented at the call site so it is
  not reintroduced.
- Wave 2-4 was implemented sequentially rather than fanned out, for the same
  reason as Wave 1: session configuration disallowed the Agent tool without an
  explicit request. The units were disjoint and would have qualified under
  `rules/parallelism.md`.
- Follow-up worth doing: run the live eval tier once and record the baseline. The
  33 intent cases are conformance-checked but have never been graded against a
  model, so the router's actual accuracy is still unmeasured.
