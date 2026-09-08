---
name: 2026-09-07-e03-skill-enablement
status: active
owner: Ricardo Fagmer
spec: n/a — execution of epic E03 of the plan "EngineOS 2.0 — Production readiness plan" (2026-09-06, revision 2), item "prove that enabled=false is honored by the adapter/runner"
domain: llm
---

## What

Makes `enabled: false` reach the runtime. The kernel now resolves skill enablement, stops recommending disabled ones in the three places where it answers about skills, and says why it suppressed them. The console now resolves real relations instead of fixed empty lists.

## Why

The plan asked to "prove that `enabled=false` is honored by the adapter/runner". The inspection showed there was nothing to prove:

```
grep -rn "enabled" --include='*.sh' --include='*.json' --include='*.ts' scripts hooks registries src
(nenhum resultado)
```

**Nothing outside the console read the field.** Disabling a skill changed a file and nothing else — and the interface presented as a control something that controlled nothing at all. A control like that is worse than its absence: the operator believes they turned something off and they did not.

There was a concrete case in the repository: `skills/strategy/SKILL.md` already declared `enabled: false`, and the skill kept being recommended by any answer that cited it.

The second finding is of the same kind. `SkillEntity.usedByAgents` and `.dependsOnRules` were fixed `[]`, with a comment saying the Agents ticket would fill them. The only *warn* path of the validation — "disabling this skill affects N agent(s)" — could never fire, because the list was always empty. The console let you disable a skill that three agents name and said nothing. A relation that is always empty is worse than a missing field: the interface presents it as an answer.

## Scope

- `scripts/kernel.sh` — enablement resolver, `skill-state` subcommand, filter in `route-path`, `route-intent` and `resolve-task`.
- `scripts/test-kernel.sh` — 14 new cases.
- `scripts/checks/85-skill-enablement.sh` — new, checks `C34` and `C35`.
- `console/src/lib/entities/relations.ts` — new.
- `console/src/lib/entities/skills.ts`, `console/src/app/api/skills/route.ts`.
- `docs/COMPATIBILITY.md`, `docs/CAPABILITIES.md`.

## Checklist

- [x] Resolve enablement from the frontmatter, with absence of the field meaning enabled
- [x] Suppress a disabled skill in the three answer sites, saying the reason
- [x] Expose the resolution as its own answer (`skill-state`) so console, check and hook read the same thing
- [x] Behavior tests, including the negative cases
- [x] Boundary checks with a planted regression verified
- [x] Real relations in the console, activating the validation's warn path
- [x] Document the limit: what the switch blocks and what it does not block
- [ ] Release note for the MINOR (`skills_suppressed` and `skill-state` are new surface)
- [ ] Editable entities for agents, models, MCPs, routing and rules in the console
- [ ] Precedence action → route → agent → skill → default, with a conflict requiring explicit resolution
- [ ] Publishing conditional on the base revision and serialization of concurrent publishes
- [ ] Authentication, RBAC and isolation before hosting the console

## What was made

**Kernel.** `skill_state_json()` reads the frontmatter of each `skills/*/SKILL.md` once per process and produces a `{id: bool}` map. Only the first frontmatter is read, and only when the file starts with it: an `enabled:` line in the body is documentation, not configuration, and cannot turn a skill off. Absence of the field means enabled — it is the console's contract and what keeps every skill written before the field existed working.

The filter is applied in `route-path`, `route-intent` and `resolve-task`. Each one assembles the answer object on its own, so the filter needs to be in all three; `C34` exists precisely because a fourth site added without it would return the raw list and the symptom would be a disabled skill showing up, not an error.

A suppressed skill enters `skills_suppressed` with `reason: "disabled"`. It does not leave silently: a short list and a filtered list are indistinguishable to whoever reads them, and a control whose effect cannot be observed becomes decorative again by another route.

`kernel.sh skill-state [--id <s>]` exposes the resolution on its own, so that console, check and hook read the same thing instead of each one re-parsing frontmatter its own way.

**Console.** `relations.ts` resolves `usedByAgents` from two independent foundations, and both are real: a registry that ties an agent and a skill to the same domain or intent, and an agent whose own prose names the skill. Neither is enough on its own — the registries miss the agent that invokes the skill directly, the prose misses the agent tied only by routing. `dependsOnRules` comes from the body of the SKILL.md. The match is by whole token, never substring: `retro` must not match "retrospective", because this feeds a warning the operator acts on, and a false positive there teaches people to ignore the warning.

`GET /api/skills` overlays the fresh relations on top of the stored draft. They are derived, not edited — a draft written before an agent started referencing the skill would keep asserting that nobody uses it, and the disable warning would stay mute for exactly the skill that needs it most.

Real result of the resolution: `nestjs-patterns` → `backend-coordinator` + `architecture,backend,data,observability`; `react-patterns` → `frontend-coordinator,mobile-coordinator`; `retro` → `git,memory,testing`.

## Verification

- `scripts/test-kernel.sh` — **348 passed, 0 failed** (334 before; 14 new cases).
- `scripts/validate-engineos.sh` — **111 passed, 1 failed**, the failure being the already documented Windows filesystem artifact.
- `C35` verified with a planted regression: disabling `nestjs-patterns` (the only skill of the `backend` domain), the check fails naming the emptied domain; with the file restored, it passes again.
- End-to-end verification of the enforcement, with `nestjs-patterns` disabled:
  `route-path` → `{"skills":[],"skills_suppressed":[{"id":"nestjs-patterns","reason":"disabled"}]}`;
  `resolve-task` → the same pair in `task_contract`. Restored, both go back to `["nestjs-patterns"]` and `[]`.
- `console: npx tsc --noEmit` clean; `parseSkills` run against the real tree producing the relations above.

Declared limitations, not converted into success:

- This is enforcement of **recommendation**, not of execution. EngineOS does not prevent anyone from invoking a disabled skill by name: the Skill tool reads the directory and there is no hook between the two things. Real blocking requires uninstalling the skill. It is said in `docs/COMPATIBILITY.md` and in `docs/CAPABILITIES.md`, and it must not be softened in release material.
- The hooks do not consume `skills_suppressed` yet; whoever reads the pair today is whoever calls the kernel directly.
- None of the other E03 entities (agents, models, MCPs, routing, rules) was implemented. The console stays **partial**.
- Without authentication, RBAC or isolation: the console cannot be hosted.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | execution scope | approved | Instruction "Implement" on the announced next unit: complete the console entities and prove that `enabled=false` has an effect in the runtime. The scope of this slice was decided by the evidence: there was nothing to prove, so the work became implementing the enforcement point before adding entities on top of a field with no effect.

## Changes registered

See the `git log --oneline` of the `chore/e01-eol-baseline` branch; this unit is the E03 commit immediately after `7ca8974`.

## Notes

- The order mattered again. Adding agent and model entities to the console before this commit would have multiplied switches with no effect, instead of fixing what already existed.
- `skills_suppressed` and `skill-state` are new public surface, therefore MINOR under `docs/COMPATIBILITY.md`. The release note does not exist yet and is on the checklist.
- Pattern worth keeping: **a configuration field with no reader is a promise, not a control** — and the way to close the distance is a kernel answer plus a check that asserts the pair, not a line of documentation. [[config-sem-leitor]]
