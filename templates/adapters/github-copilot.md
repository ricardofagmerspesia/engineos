# Adapter — GitHub Copilot

## How rules load

`.github/copilot-instructions.md` for repo-wide instructions, and
`.github/instructions/*.instructions.md` with `applyTo:` frontmatter for
path-scoped rules:

```markdown
---
applyTo: "**/*.controller.ts,**/*.service.ts,**/*.module.ts"
---
<backend rules>
```

Generate the `applyTo` patterns from `registries/routing.json`.

## What is enforced

- Repo-wide instructions: yes.
- Path-scoped instructions: yes.
- Everything else: no.

## What degrades to convention

Everything hook-driven. Copilot has the weakest agentic control surface of the
four, so the methodology has to move outward:

- **Verification gate** -> required status checks on the branch.
- **Change record** -> a PR template checkbox plus a CI check that
  `.engineos/changes/` or `.engineos/archived/` gained a file.
- **Risk tier and gates** -> PR template fields (`risk:`, `rollback:`, `owner:`),
  reviewed by a human rather than a hook.
- **Critic pass** -> the `claude-review.yml` workflow in `templates/github/`.

## CI fallback

`templates/github/claude-review.yml` and `claude-security.yml` already exist and
carry most of the weight here. Add the `scripts/` suite.

## Honest assessment

On Copilot, EngineOS is a well-specified convention with CI teeth, not an
enforced runtime. That is a real degradation, not a configuration detail — say so
to the team adopting it rather than letting them discover it after an unrecorded
change ships.
