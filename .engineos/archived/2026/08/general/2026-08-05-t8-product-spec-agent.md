---
name: 2026-08-05-t8-product-spec-agent
status: done
completed: 2026-08-05
owner: Ricardo Fagmer
spec: docs/specs/2026-08-05-phase1-registry-kernel-design.md
domain: general
---

## What
Contribute the product/spec agent (proven in ai-se-os's T6) back to the EngineOS
kernel as a first-class agent, and bind `capabilities.json`'s `author-spec` entry
to it — removing the "no dedicated kernel agent yet" note.

## Why
T8 (engineer-spec-ia-pattern#15): the kernel is meant to be the single agent
inventory — the ai-se-os runner should hold no private agent definitions. The
Phase 1 registry-kernel change (see [[2026-08-05-phase1-registry-kernel]]) had
left `author-spec` bound to a main-loop note specifically so this ticket could
resolve it with a real agent.

## Scope
`agents/product-spec.md` (new), `registries/capabilities.json` (author-spec entry),
`registries/agents.json` + `commands/agents/product-spec.md` + `commands/agents/mariana.md`
(regenerated, no hand-edits).

## Checklist
- [x] `agents/product-spec.md` written to kernel conventions (frontmatter, Procedure,
      Output, Return format envelope) — matches `test-writer.md`'s structure
- [x] `capabilities.json`'s `author-spec` entry now binds `agent: "product-spec"`,
      note removed
- [x] `registries/agents.json` and `commands/agents/*` regenerated — confirmed
      byte-identical to a fresh generator run (no drift)
- [x] Full kernel integrity suite green (`scripts/validate-engineos.sh`,
      `test-validate-engineos.sh`, shellcheck, all hook/eval suites)

## What was made
One commit (`5031434`): `agents/product-spec.md` (alias `mariana`, tools
Read/Grep/Glob/Write, model `fable` — the most-capable tier per
`rules/models.md`'s spec-authoring row), the `capabilities.json` binding, and
the regenerated `registries/agents.json` + two new slash-command files.

## Verification
- `bash scripts/gen-agent-commands.sh` + `scripts/gen-agent-registry.sh` — both
  re-run, `git diff --quiet` clean against the committed output (no drift).
- `jq '.agents[] | select(.name=="product-spec")' registries/agents.json` —
  confirms `capability_ids: ["author-spec"]` back-reference resolves correctly.
- `bash scripts/validate-engineos.sh` — 27 passed, 0 failed.
- `bash scripts/test-validate-engineos.sh`, `test-gen-agent-registry.sh` — 20 and 3
  passed, 0 failed.
- `shellcheck -S error scripts/*.sh hooks/*.sh install.sh` — clean.
- Full remaining hook/eval suite — unchanged, all passing, no live model calls.
- The runner-side half of T8 (ai-se-os's `bin/ai-se-os.js` switching to this
  kernel agent and deleting its own `PRODUCT_SPEC_AGENT` placeholder) is a
  separate repo with no `.engineos/` scaffold — tracked there via its own
  commit (`55ebca5`), not a second record here.

## Notes
T9 (the measured exit-criterion run) is the only remaining ticket in the
original T1-T9 breakdown, and needs a real scratch repo plus explicit
go-ahead to execute live — not just credentials — before it can start.
