# Independent final review

After integration, a fresh read-only Verifier reviews every acceptance claim against
the approved plan, binding sources and final diff. Report claim, file/line evidence,
result and risk in verification.md. Pending executable evidence remains pending.
The orchestrator runs final lint/typecheck/build. Test/eval authoring and execution
require direct current-task final-stage human approval (rules/verification.md).
If approved, derive meaningful JavaScript tests and run one bounded covering suite.
Repeat affected checks only after a repair; preserve existing tests and never
weaken assertions. Report actual output, skipped evidence and unresolved failures.
