---
name: mastra-patterns
description: Implement LLM features, chatbots, agents, tools, workflows and memory with Mastra inside NestJS providers.
---

# Mastra inside NestJS

Use Mastra for every LLM/chatbot feature, including a single-agent conversation.
NestJS owns the backend host: create/inject Mastra instances through providers;
controllers and guards own transport, authenticated identity and authorization.
Reuse an existing Mastra provider where possible. Pure TypeScript domain helpers
remain independent of the orchestrator. Do not start a separate Mastra server or
introduce another agent framework by default.

- Map conversational model/tool decisions to Mastra agents; use Mastra workflows
  for explicit staged orchestration. Start with the smallest shape meeting the
  contract; multi-agent topology follows the approved design when required.
- Validate model and tool input/output with typed schemas. Supply trusted tenant,
  principal and request context from NestJS; model-provided identifiers never
  establish identity or permissions. Enforce retrieval ACL in every branch.
- Scope memory/persistence and thread access by principal/tenant; use server-side
  authorization before reads or writes. Protect resumable effects with approval
  and idempotency. Configure persistence according to the feature's durability
  requirement rather than assuming an in-memory default is production-ready.
- Bound model/tool calls, workflow concurrency, retries, time, iterations and cost.
  Stream through the supported Mastra API via the NestJS transport; preserve
  cancellation and record run id, prompt version, model, latency and usage.
- Freeze contracts and file ownership before dependency-ready parallel work;
  merge at dependency barriers and keep one owner for shared provider wiring.
- Plan acceptance criteria before implementation. Author/run tests and evals only
  after integrated implementation and explicit current-task final-stage approval.

Resolve concrete APIs against installed package versions and official documentation
before writing code. Check Mastra's engine, peer dependencies and module exports
against the NestJS build configuration before adding imports; resolve ESM/CommonJS
integration at the provider boundary without silently changing unrelated packages.
There is no implied official NestJS adapter; provider wiring
is project integration. Do not copy standalone-server quickstarts into the service.

## Official references

Read only what the feature needs: [documentation](https://mastra.ai/docs),
[agents](https://mastra.ai/docs/agents/overview),
[workflows](https://mastra.ai/docs/workflows/overview),
[memory](https://mastra.ai/docs/memory/overview).
