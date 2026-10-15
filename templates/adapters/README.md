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
| Pending validation notice | stop-verify.sh (no commands) | convention | convention | convention |
| Block unrecorded change | record-verify.sh | none | none | none |
| Integrity/evals | approval-gated CI scripts | same | same | same |
| Native DAG decisions | scheduler CLI | scheduler CLI | scheduler CLI | scheduler CLI |
| Native agent launch/state persistence | host supervisor convention | convention | convention | convention |

CI checks run only on explicitly approved manual final runs; gaps stay explicit.
All executable lint/typecheck/build/tests/evals/integrity checks require final
integration and scoped user approval under rules/verification.md.

Scheduler commands compute legal actions, not native launches. A concrete
AgentLauncher can execute the admitted frontier; current instruction adapters
must map actions to their authorized tools, persist snapshots/events and
reconcile active handles on resume. Unknown host capacity remains unresolved.
The policy cap bounds workers; subtract the supervisor only when the host's
reported capacity includes it. See native engineos-implement-spec for the
action/evidence protocol and rules/verification.md for approved timing.

## Writing a new adapter

Follow cursor.md: real loading paths, honest enforcement/gaps and CI fallback.
Derive routes from registry. Map mechanisms without duplicating rules/ content
(rules/memory.md).
