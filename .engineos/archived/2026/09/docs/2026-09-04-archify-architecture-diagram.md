---
name: 2026-09-04-archify-architecture-diagram
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: n/a — two-file docs artifact, below the >2-file spec threshold and no new behavior
domain: docs
---

## What
An Archify architecture diagram of EngineOS: a typed JSON specification and the rendered self-contained HTML it produces, both under `docs/architecture/`.

## Why
The user asked for an architecture view generated with Archify (tt-a1i/archify). It gives new readers one page that shows how Claude Code, the hooks, `kernel.sh`, the registries, the validator, CI and the new TypeScript runtime relate, with every component badge linked to real files at a pinned revision.

## Scope
`docs/architecture/engineos.architecture.json`, `docs/architecture/engineos-architecture.html`.

## Checklist
- [x] Author the architecture IR (11 components, 2 regions, 11 connections, 3 cards) with source evidence pinned to `d1101a8`
- [x] Pass `archify validate --quality showcase` with 0 composition errors and warnings
- [x] Deliver the HTML and run `archify visual-check`
- [x] Review the rendered PNG for overlaps and truthfulness

## What was made
- Added `docs/architecture/engineos.architecture.json`: grid layout (5 columns, 3 rows), components typed frontend/backend/database/cloud/security/external, two regions (plugin root vs target project state), emphasis on the Claude -> hooks -> kernel -> registries control path, dashed edges for the planned wave-1 registry loader and the exec-journal spans, and three explainer cards (control loop, two mirrors kept honest, runtime migration).
- Added `docs/architecture/engineos-architecture.html`: the Archify showcase render, self-contained, with 15 source references verified against the repository at revision `d1101a884afb8c1c6b241e8dc95a73351db3169a`.
- Layout repairs applied during validation: sublabels shortened to fit the 120px component box, `labelDy: 24` on the four vertical edges whose labels sat on their source component, edges into the registries and out of the hooks de-conflicted by moving the validator above the registries and sourcing the journal edge from the kernel (which writes the kernel-decision events the usage report reads).

## Verification
- `archify validate architecture ... --quality showcase --repo-root .`: ok.
- `archify deliver`: 9/9 artifact checks passed, composition profile showcase status pass, 0 errors, 0 warnings; artifact SHA-256 `781f3da52667f6678f75411d2e5bf25eb754f9612f50a1978c6a6b30ddf2fa99` (722252 bytes); evidence verified, 15 references.
- `archify visual-check`: automated browser evidence pass at 1440x900 and 1600x1000, light and dark; no overflow, minimum projected node text 8.88px (required 6px).
- Rendered PNG inspected once for overlaps and label truthfulness; no perceptual review beyond that was performed. Visual-check side files were not committed.
- No lint/typecheck applies (docs only).

## Human decisions
None fired. Risk low: additive documentation, trivially reverted, no consumer.

## Changes registered
```
?? docs/architecture/engineos-architecture.html
?? docs/architecture/engineos.architecture.json
```
Both files new; no renames.

## Notes
- The diagram claims are pinned to `d1101a8`; regenerate after wave 1 lands (the dashed "wave 1 loader (planned)" edge becomes real).
- Archify skill lives outside the repo (cloned to the session scratchpad); regenerate with `archify deliver architecture docs/architecture/engineos.architecture.json docs/architecture/engineos-architecture.html --quality showcase --repo-root .`.
