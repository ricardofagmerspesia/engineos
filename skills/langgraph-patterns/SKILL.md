---
name: langgraph-patterns
description: Deprecated compatibility redirect for the former LangGraph skill; active LLM and chatbot implementation uses mastra-patterns.
---

# Deprecated: use Mastra patterns

This public path is retained for compatibility. Load `mastra-patterns` for all new
LLM applications, agents and chatbots; use NestJS providers as the backend host.
For existing LangGraph/LangChain integrations, report the deviation and scope a
compatibility-preserving migration before extension. This redirect does not
authorize rewriting consumer applications or installing dependencies.

Deprecated in the current minor release; retain for at least one complete minor
release window. Remove no earlier than the next major release, following
`docs/COMPATIBILITY.md`.
