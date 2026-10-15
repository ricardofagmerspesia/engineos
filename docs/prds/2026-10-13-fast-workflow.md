# Fast EngineOS workflow

Approved by the user in this chat on 2026-10-13. Implement the six-ticket graph, not another planning interview.

Simple, reversible, low-risk work asks one clickable question before creating a spec: Implement directly or Create a lightweight spec. Direct work loads only relevant stack guidance plus non-negotiable security/Git safeguards; no mandatory prototype, PRD, ADR or multiple tickets. Small new behavior may use this lane only when all low-risk scope facts are known and no independent design/security gate applies. Missing facts never grant a fast-lane bypass.

An accepted spec is decomposed into multiple bounded dependency-aware tickets using Matt Pocock to-tickets. Run all independent ready tickets concurrently within host capacity, with one supervisor and exclusive ownership. Never launch unfinished dependencies or make redundant tickets just to occupy workers.

Tests, typecheck, lint, unit/E2E/security tests, scans, integrity, builds and startup checks run only after all implementation tickets and corrections are integrated. Always ask clickable end-of-implementation consent with Run proposed checks / Choose specific checks / Skip for now. Earlier blanket permission is insufficient. Skipping validation permits reviewable delivery but does not establish a verified pass or release clearance.
