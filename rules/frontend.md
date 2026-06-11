# Frontend Rules — React / Next

## Components
- DO default to Server Components (Next App Router); add `'use client'` only for interactivity.
- DO keep components small and single-purpose; extract when JSX nesting passes ~3 levels.
- DO colocate component + styles + test + subcomponents in one folder per feature.
- DON'T build "god components" with 10+ props — split or compose with children.

## State
- DO colocate state at the lowest component that needs it; lift only when shared.
- DO use server state libraries (TanStack Query/SWR) for remote data — never mirror API data into useState.
- DO derive instead of syncing: compute from props/state in render, don't copy into more state.
- DON'T reach for global state (Redux/Zustand) until prop drilling crosses 3+ levels for truly global data.

## Data fetching
- DO fetch on the server when possible (RSC, route handlers); client fetch only for user-driven updates.
- DO handle the four states everywhere: loading, error, empty, success. Empty state is a designed state, not a blank div.
- DON'T fetch in useEffect when a query library or server component can do it.

## Styling & design system
- DO use design tokens (CSS variables / theme) — never hardcoded hex values or magic px in components.
- DO build on the project's existing component library before adding new primitives.
- DON'T mix styling systems in one project (pick Tailwind OR css-modules OR styled — follow what the project uses).

## Accessibility floor (non-negotiable)
- DO use semantic HTML first: button is `<button>`, nav is `<nav>`; ARIA only when semantics don't exist.
- DO make everything keyboard-operable; visible focus states.
- DO label every input (`<label>` or aria-label) and every icon-only button.
- DO keep text contrast ≥4.5:1.

## Performance
- DO lazy-load below-the-fold and route-level code (`next/dynamic`, `React.lazy`).
- DO use `next/image` for images; set width/height to avoid layout shift.
- DON'T memoize by default — `useMemo`/`useCallback`/`memo` only for measured hot paths or referential-stability needs.

## Forms
- DO validate with the same schema client and server (zod shared) — client for UX, server for truth.
- DO disable submit while pending and show inline field errors.
