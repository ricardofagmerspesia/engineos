# Mastra for LLM and chatbot development

## User requirement
Use Mastra for LLM applications, agents and chatbots. NestJS remains mandatory for backend/API/worker service hosts; Node.js/TypeScript remains the runtime. Tests and evals remain final-stage only with explicit user approval.

## Design and compatibility
Mastra owns agent/tool/workflow/memory orchestration inside NestJS providers. Nest controllers/guards own transport/authenticated identity; tools receive trusted context from the server. Existing LangGraph/LangChain app orchestration is a deviation requiring scoped migration before extension, never an implicit rewrite. Keep the public langgraph-patterns path as a deprecated redirect to a new mastra-patterns skill; retain historical source citations labeled provenance. No third-party dependencies or consumer services are installed/migrated in this policy task.
Single agents and simple chatbots do not need a multi-agent topology approval just because they use Mastra. Existing multi-agent decision criteria and approval gates remain; architecture patterns map to Mastra concepts rather than Python/StateGraph examples. Model providers remain configurable through Mastra, no new provider/model is selected here.
Alternative rejected: using Mastra's standalone server would conflict with the already-approved NestJS backend policy.
Rollback: revert this focused working-tree change; no external effects.

## Ownership/tasks
- llm-coordinator: rules/base.md, rules/llm-apps.md, skills/llm-engineering/**, skills/mastra-patterns/**, skills/langgraph-patterns/SKILL.md, agents/llm-coordinator.md, skills/eval-harness/**.
- topology-policy: skills/agent-system-design/**, patterns/3-Agent-topology-interview.md, commands/design-agents.md, templates/agent-topology.md.
- routing-policy: registries/intents.json, registries/routing.json, registries/decision-rules.json, CLAUDE.md.
- orchestrator: README.md, project template, stack prompt, release notes, generated metadata/bundle, final non-test verification.

## Acceptance
- LLM and chatbot routes select llm-coordinator and the Mastra skill.
- Active policy, design workflow and templates specify Mastra; no active LangGraph/LangChain implementation defaults.
- Legacy public skill paths retained with a clear redirect and removal window.
- NestJS hosting, bounded dependency-ready implementation parallelism, trust boundaries and final-stage test approval preserved.
- Source typecheck/build and static registry/diff checks pass; tests/evals remain unrun without approval.

## Primary documentation (reviewed 2026-10-06)
https://mastra.ai/docs
https://mastra.ai/docs/memory/overview
https://mastra.ai/docs/guides/overview
