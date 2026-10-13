# Adapter — GitHub Copilot

## How rules load

Repo-wide: .github/copilot-instructions.md. Path-scoped:
.github/instructions/*.instructions.md, with applyTo patterns generated from
registries/routing.json.

```markdown
---
applyTo: "**/*.controller.ts,**/*.service.ts,**/*.module.ts"
---
<backend rules>
```

## What is enforced

Repo-wide and path-scoped instructions load; other EngineOS mechanisms do not.

## What degrades to convention

Hook-driven obligations move to external review/CI:
- Verification → required branch checks.
- Change record → PR checkbox and CI file check in changes/ or archived/.
- Risk/gates → human-reviewed PR fields risk/rollback/owner.
- Critic → templates/github/claude-review.yml.

## CI fallback

Use templates/github/claude-review.yml, claude-security.yml and applicable scripts.
Final tests/evals/behavioral scripts need explicit current-task approval after
integration; CI configuration alone is not consent (rules/verification.md).

## Honest assessment

Instructions and CI enforce parts of EngineOS; Copilot has no EngineOS hook
runtime. Explain the remaining convention-only gates to adopting teams.
