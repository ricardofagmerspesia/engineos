# Mastra LLM/chatbot policy

Spec: docs/specs/2026-10-06-mastra-llm-policy.md
Risk: medium. Autonomy: A2. Gate: final non-test validation passed; testing/evals pending approval.

## Human decisions
2026-10-06: User selected Mastra for LLMs and chatbots. NestJS backend and final-only approved testing remain established requirements. No test approval received; no package installations, git writes or consumer app migration performed.

## Checklist
- [x] Scope, frozen hosting contract and rollback written before implementation
- [x] Mastra active rules, new skill, coordinator and design guidance
- [x] LLM/chatbot routes, stack prompt and templates aligned
- [x] Legacy LangGraph skill retained as a deprecated compatibility redirect
- [x] Multi-agent implementation approval preserved; single-agent chatbot exempt
- [x] Final non-test validation: npm run typecheck (also repo lint implementation), npm run build, registry JSON and new skill frontmatter syntax, git diff --check — passed
- [x] Generated runtime, agent registry and agent commands refreshed
- [ ] Final tests/evals and behavioral integrity checks — pending explicit user approval

## What was made
Mastra is required for LLM applications, agents and chatbots. NestJS providers host/inject Mastra, while Nest controllers/guards own transport and authenticated identity. Added skills/mastra-patterns/SKILL.md with version-aware integration, schemas, tenant-scoped memory/storage, bounded workflows/cost and primary documentation links. LangGraph's public skill path remains a redirect through the documented deprecation window. Updated active topology patterns and form, retaining public pattern ids and clearly labeled historical citations. Routing recognizes Mastra/chatbot terms and Mastra source paths without adding bare Mastra/chatbot to multi-agent decision signals. Skill consultation is allowed during planning; implementing multi-agent workflows still waits for topology approval. Existing packages/services are not implicitly migrated.

## Evidence and limits
Official Mastra documentation reviewed 2026-10-06: https://mastra.ai/docs, https://mastra.ai/docs/memory/overview, https://mastra.ai/docs/guides/overview. Syntax checks found one trailing space, corrected; affected diff check rerun passed. No tests/evals run or authored. Protected AGENTS.md/.agents files unchanged. Prior uncommitted changes and unrelated pnpm files preserved. Rollback: revert this focused working-tree change; no external effect occurred.
