# JavaScript ecosystem and parallel development policy — 2026-10-06

Active development targets JavaScript/TypeScript: Node.js, NestJS, Next.js,
React, React Native, Mastra and JavaScript SDKs. Python framework detection,
automatic routing and recommendations are retired. Public `backend-python`
identifiers, rule/skill paths and legacy parsing remain for compatibility;
they are inactive and must not be automatically dispatched. Replacements are
`backend`, `nestjs-patterns`, Node.js and typed Mastra patterns.

Application backends must use NestJS, including API services, workers and hosted
LLM services. Node.js is their runtime and remains available for tooling and
libraries; it is not a standalone backend choice. Express may be Nest's HTTP
adapter, but separately bootstrapped Express servers are outside this policy.
New explicit `--stack node` / `--stack express` declarations receive NestJS
guidance. Existing package detection and legacy config parsing stay truthful;
non-Nest application backends need a scoped migration before extension.

LLM applications and chatbots use Mastra for agents, tools, workflows and memory,
hosted through NestJS providers. `mastra-patterns` replaces the active LangGraph
guidance; the public `langgraph-patterns` skill remains as a deprecated redirect
until the next major release, no earlier than one minor release after deprecation.
Existing agent implementations are not silently migrated. Selecting Mastra for
a single chatbot does not require a multi-agent topology gate.

Deprecated surfaces will not be removed before the next major release and no
earlier than one minor release after this deprecation. `ENGINEOS_VERIFY_TESTS`
is deprecated and ignored: environment flags cannot grant user approval.

Parallel development freezes shared contracts, gives each unit exclusive file
ownership and schedules dependency-ready units within available host capacity
and the existing policy cap of 6. A freed slot admits the next ready unit without
waiting for unrelated work. Integration precedes final validation.

Test authoring and execution require explicit current-task user approval only
after implementation/integration is complete. Agent dispatch, project settings,
feature workflows and inherited configuration cannot supply that approval.
Existing tests are preserved. Lint/typecheck/build remain non-test validation.

This is a policy change with compatibility deprecation, not removal of legacy
public names. No suite was executed to implement this policy without approval.
