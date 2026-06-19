---
name: 2026-06-19-leo-curso-extract
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Extracted the broadly-useful NestJS/Prisma techniques from the stray leo-curso/
scaffold into skills/nestjs-patterns, then deleted leo-curso/ (untracked, ~988K).

Added to nestjs-patterns: @CurrentUser() decorator; in-memory fake repositories
(over jest mocks) for service/use-case tests; *.integration.http REST Client tests;
a Prisma block (modular schema per module, @@map snake_case, per-module migration
naming); error-filter shape gains optional details/timestamp. Matching anti-patterns.

## Why
leo-curso held reusable patterns mixed with one course's clean-arch/DDD framework.
Folded in the low-controversy, generally-good practices; left the opinionated
framework out of team standards.

## Scope
- skills/nestjs-patterns/SKILL.md — additions above.
- archived/2026-06-19-gate-tracked-files.md — reworded a connection-string literal
  that was tripping the secrets gate.
- Deleted leo-curso/ (untracked).

## Deliberately NOT adopted (one course's architecture, not universal rules)
lazy entity validation, UseCase<In,Out> naming, aggregate model/provider/usecase
folder framework, concrete-provider-injection-by-class, shared validation-rule
service, orchestration meta-skill. Revisit per-project if a team wants them.

## Verification
- secrets gate clean on TRACKED files (rc=1); routing 12/12, governance 6/6.
- nestjs-patterns frontmatter intact.

## Notes
leo-curso was unrelated course material in the repo dir. See [[2026-06-19-gate-tracked-files]].
