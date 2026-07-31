---
name: react-patterns
description: Team React/Next conventions for components, state, data fetching, forms, and styling. Use when creating or modifying frontend code — components, pages, hooks, layouts, or styles — including React Native screens/components, where mobile work adapts these same patterns.
---

# React Patterns

Apply `rules/frontend.md` and `rules/architecture.md` from EngineOS first (EngineOS
rules — resolved relative to EngineOS's `CLAUDE.md`, the repo/plugin root, not this
project). This skill adds the concrete shapes.

## Feature folder layout

```
src/features/orders/
  components/
    OrderList.tsx
    OrderList.test.tsx
    OrderCard.tsx
  hooks/
    useOrders.ts             # TanStack Query wrapper, single source for this resource
  api.ts                     # fetch functions + zod schemas (shared with server validation)
  types.ts
```

Shared primitives live in `src/components/ui/` (the design system) — check there before creating any new button/input/modal.

## Building a new view — checklist

1. Server Component by default per `rules/frontend.md`; `'use client'` only on the interactive leaf.
2. Data via hook wrapping TanStack Query (client) or direct fetch in RSC (server). Query keys: `['orders', filters]` — consistent, hierarchical.
3. Render all four states per `rules/frontend.md`: loading as a skeleton (not spinner-only), error with a retry action, empty with a designed message + CTA.
4. Styling: design tokens and existing UI primitives, per `rules/frontend.md` — no new one-off variants without checking the system first.
5. Accessibility pass per `rules/frontend.md`, plus focus management on dialogs (project addition, not in the base rule).
6. Test: render + interaction test for behavior (testing-library, user-event), not snapshot dumps.

## Forms

- **react-hook-form + zod resolver**, importing the schema from the shared `api.ts`/schema file — client/server parity per `rules/frontend.md`.
- Submit: pending-disable + inline field errors per `rules/frontend.md`; add a toast/banner for server-side errors (project addition).

## State decision ladder

State placement follows `rules/frontend.md` (colocate low, lift only when shared, server
state via TanStack Query — never copy into `useState`, global state only past 3+ levels).
One team addition: shareable view state (filters, tabs) goes to the URL via `searchParams`
before reaching for global state.

## Anti-patterns to flag

- `useEffect` + fetch + setState, derived data stored in state, and unmeasured `memo`/`useCallback` — all covered by `rules/frontend.md`'s data-fetching/state rules; catch them here rather than at review.
- Prop drilling fixed with context for non-global data → restructure composition (children/slots) first.
- `dangerouslySetInnerHTML` on anything user-influenced.
