# JavaScript ecosystem / parallel development

Spec: docs/specs/2026-10-06-javascript-parallel-development.md
Risk: medium. Autonomy: A2. Gate: final non-test validation passed; approved testing pending.

## Human decisions
2026-10-06: User requested JavaScript ecosystem only, faster parallel development and tests only last with user approval. This authorizes reversible file changes, not test authoring/execution or git/forge writes. No test approval has been received.

## Checklist
- [x] Scope, contracts and rollback recorded before implementation
- [x] JavaScript-only active stack detection/init/routes; legacy public paths retained as deprecated compatibility surfaces
- [x] Dependency-ready bounded parallelism and exclusive ownership documented in rules/registry
- [x] Final-only explicit test consent; Stop hook cannot enable tests via environment flags
- [x] CI non-test runtime/console validation remains parallel; final tests/evals/smokes require approved manual dispatch
- [x] Final non-test validation: npm run typecheck (also the repository lint implementation), npm run build, registry JSON parsing, git diff --check; all exit 0
- [x] Regenerated shipped dist/engineos.cjs, agent registry and agent commands
- [ ] Approved final test authoring/updates, suite, behavioral integrity checks and evals — pending user approval

## What was made
Active defaults support Node.js, NestJS, Next.js, React, React Native and TypeScript LLM tooling. Python detection and new declarations are inactive; legacy config shapes and named paths remain readable without launching Python tools. A canonical JavaScript tlc-spec-lean adaptation replaces implicit test-first feature flow. Parallel policy dispatches ready work as slots open, using min(policy cap of 6, available host worker slots), while retaining frozen contracts and one final non-test gate. The kernel's wave planner remains a conservative planning aid; the orchestrator owns live scheduling and host admission. Test authoring/execution is a separate final action requiring direct current-task consent. CI applies the same consent through a manual approve_tests input.

A read-only review found and resolved Node ownership being shadowed by nested Python manifests and missing .pyi exclusions. Existing tests were preserved without execution or weakening; tests expecting the superseded Python routing/verification behavior may need approved updates. Behavioral integrity validation was intentionally deferred because it executes fixture assertions.

## Known limits / rollback
Protected local .agents/skills and AGENTS.md were not edited. Canonical installation already prefers skills/** over upstream copies; the canonical router and rules take precedence over conflicting legacy instructions. Existing pnpm-lock.yaml/pnpm-workspace.yaml are unrelated pre-existing untracked files and were left untouched. This is an uncommitted working-tree change, not a published release. Rollback is to revert this change set; no external effect occurred.
