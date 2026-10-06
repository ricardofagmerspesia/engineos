# NestJS application backend policy

## Requirement
The user requires NestJS for every application backend instead of a plain Node.js app or standalone Express server. Node.js remains the runtime; Next.js/React/React Native remain frontend/mobile choices. CLI tools, build scripts, shared libraries and the EngineOS runtime are not application backend services.

## Design
Rules, backend coordinator, Nest skill, prompts and routing must consistently enforce NestJS for API services, workers and backend/LLM service hosts. Express may exist only as Nest's HTTP adapter or a transitive dependency, never as a separately bootstrapped application. Existing non-Nest backends are identified truthfully: report the mismatch and scope a migration before extending them; do not silently convert or relabel them.
New explicit stack declarations accept named supported frameworks; generic --stack node/express receives actionable NestJS guidance. Auto detection stays truthful and may retain framework:null for tooling or legacy packages. Existing config shapes remain readable for compatibility.
Alternative rejected: treating every Node package as NestJS would misidentify CLI/shared/front-end packages and silently migrate existing services.
Rollback: revert this focused working-tree diff; no git/forge writes or external effects.

## Tasks
- backend-coordinator owns rules/base.md, rules/backend.md, skills/nestjs-patterns/SKILL.md, agents/backend-coordinator.md, templates/project-claude.md, README.md, CLAUDE.md, commands/new-feature.md and LLM service-host guidance as necessary.
- runtime-policy owns src/init/project.ts, src/hooks/stack-question.ts, registries/intents.json, registries/routing.json and commands/init.md.
- Orchestrator owns integration, generated metadata/bundle and final lint/typecheck/build.

## Acceptance
- Backend choices and enforcement say NestJS required; plain Node/Express application backends excluded.
- Nest Express adapter remains permitted.
- Existing detection/config parsing remains factual and compatible; no implicit migration.
- Tests still run only at the final stage with explicit user approval, which has not been supplied.
