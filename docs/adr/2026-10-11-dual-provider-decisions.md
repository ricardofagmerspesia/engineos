# ADR: Decision framework in the existing local console

Status: accepted under the user-supplied architecture and explicit identity/preview decisions.

Use the existing Next.js/React console, SQLite/Drizzle migration system, a separately operated durable SQLite worker, and framework-independent TypeScript/Zod decision contracts. Use native structured-output HTTPS APIs through built-in fetch instead of SDKs requiring a higher runtime than the existing Node floor. Pin Zod to the already-resolved 4.5.4. Provider identities and usage are server-assigned; models never select approvals or authorize actions.

Local principal is the server's single OS operator. Multi-user mode requires an installed trusted identity resolver; absence fails closed. Never accept tenant or reviewer identity in request bodies or untrusted proxy headers. High-risk two-reviewer policy cannot be fulfilled by two aliases of the local user.

Alternatives rejected: introduce NestJS/PostgreSQL/Redis/Mastra (not in this repository and explicitly excluded by the user's stack-matching requirement); run model jobs inside request lifecycle (not durable); identify users from arbitrary headers (spoofable). The direct evaluator calls are bounded assessments, not autonomous tool-using agents; no application agent topology is introduced.

Deployment remains local, single-host SQLite. Sensitive evidence storage and authenticated multi-user deployments require separate operational verification and a trusted identity adapter; no claim of multi-host or sensitive-data production readiness is made. No migrations are run against the operator's real database during development. Tests use disposable databases.

Rollback: stop the worker and disable DECISIONS_ENABLED; additive tables do not affect capability operations. A down migration is documented but never run automatically. No deployment, Git publication, or consequential action execution is authorized.
