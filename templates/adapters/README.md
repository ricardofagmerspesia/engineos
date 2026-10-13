# Adapters

EngineOS routing, gates, risk, evidence and fan-out are tool-independent; Claude
Code alone runs these hooks. Each adapter describes loading, actual enforcement
and convention-only gaps.

## Enforcement matrix

| Mechanism | Claude Code | Cursor | Codex | Copilot |
|---|---|---|---|---|
| Always-on rules | hooks + @ imports | always-apply .cursor/rules | AGENTS.md | .github/copilot-instructions.md |
| File routing | route-before-change.sh | glob rules | convention | path instructions |
| Decision advisory | prompt-advisor.sh | convention | convention | convention |
| Post-edit checks | post-edit-check.sh (opt-in/unregistered) | convention | convention | convention |
| Block unverified done | stop-verify.sh | none | none | none |
| Block unrecorded change | record-verify.sh | none | none | none |
| Integrity/evals | approval-gated CI scripts | same | same | same |

CI supplies portable executable enforcement; gaps stay explicit. Final
lint/typecheck/build is separate from final approval-only tests/evals.

## Writing a new adapter

Follow cursor.md: real loading paths, honest enforcement/gaps and CI fallback.
Derive routes from registry. Map mechanisms without duplicating rules/ content
(rules/memory.md).
