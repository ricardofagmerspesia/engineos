# Base Rules — always on

## Awaiting user input
- Present every user decision through available, permitted clickable input controls: clarification, planning, preview, approvals, final checks, security, and completion offers. Use concise meaningful options, including **Provide details** when free text is needed; accept details through the host text field. Required decisions remain pending until submitted.
- State the decision and what each choice permits. For approvals, identify the concrete scope, revision and action; use only a host tool that permits approval requests.
- If interactive input is unavailable or disallowed, ask the question in text with labelled alternatives and explain the fallback. Keep the pending decision visible instead of ending with only a waiting notice.
- Resume dependent work only after the required answer is submitted. Preselection, silence and timeouts are not consent. Continue independent authorized work while awaiting a reply, and reuse valid same-task answers on resume.

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

## Active ecosystem
- Use JavaScript/TypeScript; every application backend (API, worker, webhook, or LLM/agent service host) uses NestJS. Frontend uses Next.js/React, mobile React Native, all LLM applications, agents and chatbots use Mastra.
- Next handlers serve frontend integration/proxies/BFF; domain APIs/jobs/LLM hosts use Nest modules/providers. Pure domain functions/shared TS libraries stay independent.
- Node supports runtime/CLI/build/shared libraries/kernel; never bootstrap standalone Node HTTP or Express application backends.
- Nest’s Express adapter/transitive dependencies are allowed; composition/lifecycle/boundaries remain Nest-owned.
- Existing non-Nest backends: report deviation, scope migration before extension; preserve truthful detection and compatibility, never silently rewrite/relabel.
- Python interfaces retained for compatibility are deprecated; do not use them for new work.

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
Greenfield means neither `.engineos/config.json` nor a package manifest exists; SessionStart/UserPromptSubmit announce detection.
- Record mandatory NestJS backend/Mastra agent choices without asking again.
- Before code ask only unresolved tiers/deployment needs; offer supported choices, explain unsupported requests and obtain compatible scope.
- Never infer unresolved choices from available skills/patterns; Node remains runtime.
- DO persist the selected NestJS backend and supported answers with `engineos init --stack <framework>[@dir],...` and record the choices in the project's first ADR (`docs/adr/`).
- Required unresolved decisions yield `BLOCKED` for supervisor clarification; undeclared backend alone does not require framework selection.
