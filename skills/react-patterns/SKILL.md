---
name: react-patterns
description: "React/Next components, pages, hooks, forms, state, fetching and styling; adapt for React Native screens. Use for frontend/mobile UI changes."
---

# React Patterns

Apply `rules/frontend.md` and `rules/architecture.md` from the EngineOS root.
Use `src/features/<feature>/{components/,hooks/,api.ts,types.ts}`: colocated
components; one TanStack Query wrapper per resource; existing client/fetch adapter;
frontend-safe wire types when not generated. Reuse `src/components/ui/`
primitives before adding buttons/inputs/modals. Colocated tests are final-stage only.

## Contract before parallel work

Record contract owner, revision and schema source. Reuse wire types/client generation,
with one generated-file owner. Import frontend-safe payload/schema outputs, never
NestJS decorated DTOs, ORM entities or backend runtime dependencies. Handle contracted
errors/stream events and required runtime validation; TypeScript cannot validate
network values. On mismatch, notify the owner and pause affected work until revision
resolution; continue independent work and record the updated revision before resuming.

## New-view checklist

1. Plan acceptance criteria and pin the API contract.
2. Default to Server Components; `'use client'` belongs on interactive leaves.
3. Client: TanStack Query hook; server: RSC fetch. Hierarchical keys such as
   `['orders', filters]` stay consistent.
4. Render loading/skeleton, error/retry, designed empty/message/CTA and success.
5. Reuse design tokens/UI primitives; check existing variants first.
6. Apply frontend accessibility rules and dialog focus management.
7. Return implementation/diff evidence for integration. The supervisor runs final
   non-test gates; after integration and explicit current-task approval only,
   author/run focused behavior tests using existing testing-library/user-event.

## Forms and state

Reuse form/validation tools (e.g. react-hook-form + existing Zod resolver).
Share runtime schemas only if frontend-safe; otherwise align client constraints
with frozen wire types while NestJS validates class DTOs server-side. Add no
libraries merely to share decorated classes. Disable pending submission, show inline
field errors and a toast/banner for server errors.

Colocate state; lift shared state only. Keep server state in TanStack Query, never
copy it to useState; global state requires 3+ levels. Put shareable filters/tabs in
URL searchParams before global state.

## Review traps

Flag useEffect/fetch/setState, stored derived data and unmeasured memo/useCallback
under frontend rules. Prefer composition/slots over context for non-global prop
passing. Flag user-influenced dangerouslySetInnerHTML.
