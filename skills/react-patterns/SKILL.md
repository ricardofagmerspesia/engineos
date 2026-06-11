---
name: react-patterns
description: Team React/Next conventions for components, state, data fetching, forms, and styling. Use when creating or modifying frontend code — components, pages, hooks, layouts, or styles.
---

# React Patterns

Apply `rules/frontend.md` and `rules/architecture.md` from EngineOS first. This skill adds the concrete shapes.

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

1. Server Component by default; `'use client'` only on the interactive leaf.
2. Data via hook wrapping TanStack Query (client) or direct fetch in RSC (server). Query keys: `['orders', filters]` — consistent, hierarchical.
3. Render all four states: loading (skeleton, not spinner-only), error (retry action), empty (designed message + CTA), success.
4. Styling via design tokens / existing UI primitives. No raw hex, no new one-off variants without checking the system.
5. Accessibility pass: semantic elements, labels, keyboard path, focus management on dialogs.
6. Test: render + interaction test for behavior (testing-library, user-event), not snapshot dumps.

## Forms

- react-hook-form + zod resolver; schema imported from the shared `api.ts`/schema file so client and server validate identically.
- Submit: disable while pending, inline field errors from schema, toast/banner for server errors.

## State decision ladder

1. Local `useState` in the component.
2. Lift to nearest common parent.
3. Server state → TanStack Query (never copy into useState).
4. URL state for shareable view state (filters, tabs) → searchParams.
5. Global client state (theme, session) → context or zustand. Reaching here should be rare.

## Anti-patterns to flag

- `useEffect` + fetch + setState → replace with query hook or RSC.
- Derived data stored in state → compute in render.
- Prop drilling fixed with context for non-global data → restructure composition (children/slots) first.
- `memo`/`useCallback` sprinkled "for performance" without measurement.
- `dangerouslySetInnerHTML` on anything user-influenced.
