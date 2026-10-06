# Base Rules — always on

## Naming
- DO name by intent, not implementation: `retryFailedJobs()` not `loopArray()`.
- DO use full words: `userRepository` not `usrRepo`. Abbreviations only when industry-standard (id, url, dto).
- DON'T encode types in names (`userArray`, `IUser` interfaces prefix). TypeScript already knows.

## Functions & modules
- DO keep functions to one responsibility; if you describe it with "and", split it.
- DO keep files under ~300 lines; split by domain concept, not by line count.
- DON'T pass more than 3 positional args — use an options object.
- DON'T export anything that has no caller outside the module (barrels re-exporting the module's public surface are fine).

## Types
- DO use explicit return types on exported functions.
- DO model states with discriminated unions, not boolean flags (`status: 'pending' | 'active' | 'failed'` not `isActive + isFailed`).
- DON'T use `any`. Unknown input is `unknown`, then narrow.
- DON'T use type assertions (`as`) to silence errors — fix the type.

## Language idioms (TypeScript)
- DO use one import statement per module — combine symbols (`import { A, B, C } from 'x'`), never split the same source across lines.
- DO use `Number.parseInt` / `Number.parseFloat`, not the globals.
- DO put mappers/transformers in their own file so they're reusable, not inlined per call site.

## Language idioms (Python)
- DO type-hint every signature and module-level constant; `X | None`, never `Optional[X]`; `list[str]`, never `List[str]`. `from __future__ import annotations` only when a forward reference needs it.
- DON'T use `Any` at a boundary — a payload is `dict[str, object]` or a Pydantic model, then narrowed.
- DO model closed sets as `Literal[...]` unions (`Literal["ok", "error"]`), not bare `str`.
- DO follow PEP 8 names: `snake_case` functions and variables, `PascalCase` classes, `UPPER_SNAKE` constants, `_leading_underscore` for module-private.
- DO define ports as `typing.Protocol` and domain values as `@dataclass(frozen=True)`; Pydantic models only at boundaries (HTTP, settings, model output), never inside the domain.

## Errors
- DO fail fast at boundaries: validate input where it enters the system, then trust it inside.
- DO throw typed/domain errors (`OrderNotFoundError`), catch at the layer that can act on them.
- DON'T swallow errors (`catch {}`), and don't log-and-rethrow at every layer — handle once.
- DON'T return `null` to signal failure where an error is meaningful.

## Code hygiene
- DO delete dead code — git remembers. No commented-out blocks.
- DO write comments that say WHY (constraint, gotcha, business reason), never WHAT the next line does.
- DON'T leave TODOs without an issue/ticket reference.
- DON'T add abstractions for one caller. Duplicate twice, abstract on the third.
- DON'T ship placeholder/fake data in production paths — wire the real integration with error handling and fallback, never a stubbed return.
- DON'T use emojis in code, comments, or logs.
- DO write all identifiers, comments, and messages in English.

## Dependencies
- DO prefer the standard library and existing project deps over adding new packages.
- DO check a new dep's maintenance (last release, downloads, deps count) before adding.
- DON'T add a dependency for what 20 lines of code can do.

## New projects — stack first
A repo is greenfield when it has no `.engineos/config.json` and no package manifest (the
SessionStart and UserPromptSubmit hooks detect it and say so).
- DO ask the developer for the stack in your first reply in a greenfield repo, before any
  code — one question per tier the work touches: backend, frontend, mobile, LLM/agent
  runtime. Offer the stacks EngineOS supports first (NestJS, FastAPI, React/Next, React
  Native, Python + LangGraph for agent systems), and accept any other answer.
- DON'T choose a stack yourself, and don't infer one from which skills or patterns happen
  to exist — that inference is how a TypeScript team got a Python project.
- DO persist a supported answer with `engineos init --stack <framework>[@dir],...` and record
  the choice as the project's first ADR (`docs/adr/`).
- DO say plainly which EngineOS parts will not apply when the answer is a stack EngineOS has
  no patterns for (e.g. "`langgraph-patterns` and the agent-design form are Python-only; the
  Stop gate has no Go runner"), then proceed on the generic rules.
- A dispatched agent cannot ask: a coordinator whose scope is greenfield returns `BLOCKED`
  with `stack undeclared`, and the orchestrator asks the developer.
