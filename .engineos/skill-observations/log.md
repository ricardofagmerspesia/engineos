# Skill Observation Log

Skill/rule friction captured during task work. Written by the task-observer
skill; OPEN entries are consumed by retro.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = fix landed
| DECLINED (YYYY-MM-DD) = decided not to pursue — resolved statuses always
carry their resolution date

---

### Observation 1: Validate semantic policy agreement

**Status:** ACTIONED (2026-08-13) — verification contract and semantic drift check added
**Date:** 2026-08-13
**Session context:** Auditing and improving the EngineOS methodology.
**Skill:** All rules
**Type:** engineos
**Phase/Area:** Policy registry and prose-layer integrity

**Issue:** Referential and mirror checks can stay green while two authoritative-looking artifacts prescribe different behavior. `registries/decision-rules.json` requires `relevant-tests` for every code change, while `rules/verification.md` makes tests opt-in for the task.

**Suggested improvement:** Give each policy meaning one owner and add a semantic invariant check for the verification contract across the decision registry, always-on rule, gate description, and human-facing documentation.

**Principle:** Integrity checks must validate behavioral agreement, not only that references resolve and mirrored values have the same shape.

Checkpoint 2026-08-13: no additional observations.
