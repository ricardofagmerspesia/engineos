# Gates

Five gates from problem to production. Each names its mechanism and honest
enforcement strength: **blocking** prevents a transition, **checked** can fail CI,
**advisory** emits guidance, and **conventional** relies on an executor or human.
Which gates apply is a function of the risk tier from always-on
`rules/risk-autonomy.md` — not every change walks the whole ladder.

## The ladder

| Gate | Question it answers | Mechanism | Strength |
|---|---|---|---|
| Discovery | Is this the right problem, stated testably? | `superpowers:brainstorming`; `docs/prds/` | conventional procedure |
| Design | Do we know how, and did we record why? | `docs/specs/`; `adr`; decision rules; `/implement` spec gate | blocking in `/implement` when triggered; otherwise advisory |
| Implementation | Is the change being built correctly, in bounded scope? | `hooks/route-before-change.sh`; routed stack rules | advisory |
| Validation | Is there evidence it works? | `rules/verification.md`; `hooks/stop-verify.sh` | blocking once in Claude Code; checked in CI elsewhere |
| Release | Can it be operated, and undone? | `skills/release-notes`; this file's release checklist | human gate; otherwise conventional |

## Which gates apply

| Risk | Discovery | Design | Implementation | Validation | Release |
|---|---|---|---|---|---|
| low | skip | skip | required | required | n/a unless it ships |
| medium | if the problem is vague | required when non-negotiable #1's threshold is met, or a decision rule demands it | required | required | required if it ships |
| high | required | required, always | required | required, plus an independent `critic` pass | required, plus human approval |

The Design row does not add a second spec threshold. Non-negotiable #1 owns it:
more than 2 files, or any new feature. This file only says that at high risk the
threshold is irrelevant — you write the design either way.

## Design gate — exit criteria

- The chosen approach is written down, with at least one rejected alternative and
  why. One option considered is a preference, not a decision.
- Contracts that parallel work depends on are frozen first (`rules/parallelism.md`
  step 2): shared types, API schemas, DB schema, event payloads.
- Every requirement in `registries/decision-rules.json` that matched has a named
  artifact. An unmet `require` is an open gate, not a nit.
- Architectural choices are recorded via the `adr` skill, not left in chat.

## Validation ladder

Validation is not one event. `rules/verification.md` owns which checks are in
scope. Promote through the selected rungs rather than skipping one on the excuse
that a later rung will catch it.

1. **Local** — typecheck and lint; unit tests when tests are in scope. Run once at
   the final gate, not after every edit.
2. **Integration** — when the contract or release risk requires it, run the module
   against a real dependency (DB via testcontainers, API with mocked externals).
3. **Pre-production** — the real deployment shape, real config, seeded data.
4. **Production** — canary or staged rollout with the rollback trigger defined
   BEFORE traffic arrives, not discovered during the incident.

Rungs 3 and 4 are project-specific; a project without them says so in its own
`CLAUDE.md` rather than pretending rung 2 is sufficient.

## Release gate — exit criteria

The gap this file exists to close. Nothing in EngineOS previously required any of
this before something shipped.

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
- DO fail the gate loudly. A gate you passed by lowering its bar is worse than no
  gate, because it produces a record saying the bar was met.
- DON'T run gates you do not need. Discovery on a typo is theatre, and theatre is
  how teams learn to skip gates that matter.
- DON'T treat a green Stop hook as the Release gate. It is the Validation gate;
  it knows nothing about owners or rollback.
