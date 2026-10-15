# Gates

Risk (`rules/risk-autonomy.md`) selects applicable gates. Strengths: blocking
prevents transition; checked can fail CI; advisory guides; conventional relies
on executor/human.

## The ladder

| Gate | Question it answers | Mechanism | Strength |
|---|---|---|---|
| Discovery | Is this the right problem, stated testably? | `superpowers:brainstorming`; `docs/prds/` | conventional procedure |
| Design | Do we know how, and did we record why? | `docs/specs/`; `adr`; decision rules; `/implement` spec gate | blocking in `/implement` when triggered; otherwise advisory |
| Implementation | Is the change being built correctly, in bounded scope? | `hooks/route-before-change.sh`; routed stack rules | advisory |
| Validation | Is there evidence it works? | `rules/verification.md`; `hooks/stop-verify.sh` | pending until explicit final approval; manual checks after integration |
| Release | Can it be operated, and undone? | `skills/release-notes`; this file's release checklist | human gate; otherwise conventional |

## Which gates apply

| Risk | Discovery | Design | Implementation | Validation | Release |
|---|---|---|---|---|---|
| low | skip | skip | required | required | n/a unless it ships |
| medium | if the problem is vague | required when non-negotiable #1's threshold is met, or a decision rule demands it | required | required | required if it ships |
| high | required | required, always | required | required, plus an independent `critic` pass | required, plus human approval |

Outside the complete kernel-resolved simple direct exception, the spec threshold
remains non-negotiable #1: >2 files or any new feature. Eligible simple tasks ask a
clickable direct/spec choice before artifacts. High risk always requires design,
regardless of size. Every selected spec is decomposed into bounded tickets; all
implementation tickets integrate before any executable validation or final consent.

## Design gate — exit criteria

- The chosen approach is written down, with at least one rejected alternative and
  why. One option considered is a preference, not a decision.
- Contracts that parallel work depends on are frozen first (`rules/parallelism.md`
  step 2): shared types, API schemas, DB schema, event payloads.
- Every requirement in `registries/decision-rules.json` that matched has a named
  artifact. An unmet `require` is an open gate, not a nit.
- Architectural choices are recorded via the `adr` skill, not left in chat.

## Validation ladder

`rules/verification.md` owns which checks are in scope and approved timing.
Complete applicable rungs in order:

1. **Local** — scoped lint/typecheck/build and unit tests only after final
   integration and explicit current-task approval. Deduplicate commands and run
   once at the approved revision under rules/verification.md.
2. **Integration** — plan boundary coverage; after integration and explicit
   current-task final-stage user approval, run the module
   against a real dependency (DB via testcontainers, API with mocked externals).
3. **Pre-production** — the real deployment shape, real config, seeded data.
4. **Production** — canary or staged rollout with the rollback trigger defined
   BEFORE traffic arrives, not discovered during the incident.

Rungs 3 and 4 are project-specific; a project without them says so in its own
`CLAUDE.md` rather than pretending rung 2 is sufficient.

## Release gate — exit criteria

- [ ] A named owner for operating the change, not just for writing it.
- [ ] A rollback path, stated concretely (revert commit, feature flag, previous
      image tag, down migration) — or an explicit statement that rollback is
      impossible, and what recovery looks like instead.
- [ ] Validation evidence attached, with output shown — not "tests pass".
- [ ] Residual risks written down and accepted by the owner.
- [ ] For medium and high risk: what to watch after release, and for how long.
- [ ] For high risk: human approval recorded before the external effect.
- [ ] For any `hitl.required`: the human decision is recorded under
      `## Human decisions` in the change record, with the reason ids
      (`rules/risk-autonomy.md` "Human-in-the-loop").

A release without a rollback path is a high-risk action regardless of what the
diff looks like. Classify it that way.

## Rules

- DO state which gate you are at when the work spans a session boundary. "Design
  gate, exit criteria 2 of 4 met" resumes; "in progress" does not.
- Report failed gates explicitly; never lower their bar.
- Run only applicable gates.
- DON'T treat an advisory Stop hook as validation evidence or the Release gate.
  It executes no checks and knows nothing about owners or rollback.
