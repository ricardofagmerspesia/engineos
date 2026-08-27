---
name: 2026-08-26-agents-prompt-advisor-refs
status: done
completed: 2026-08-26
owner: Ricardo Fagmer
spec: none — single-surface reference fix, below non-negotiable #1's threshold
domain: general
---

## What

Sweep the agent and command documents for references left stale by the
runtime-performance change (2026-08-13-runtime-performance), which replaced the
three registered prompt hooks with the single `hooks/prompt-advisor.sh`.

## Why

`agents/router.md` and `commands/route.md` still named `hooks/route-advisor.sh`
as the dispatch trigger / fast path. The legacy file remains on disk but is no
longer registered in `hooks/hooks.json`, so both references pointed a reader at
a hook that never fires.

## Checklist

- [x] Sweep agents/ and commands/ for replaced hook and kernel references
- [x] Verify every rules/hooks/scripts/registries path named in agents/ exists
      (only intentional target-project output paths are absent)
- [x] Confirm model frontmatter already matches the opus/fable rebind
- [x] scripts/validate-engineos.sh green

## What was made

Two one-line reference fixes: `agents/router.md` (frontmatter description,
dispatch trigger) and `commands/route.md` (fast-path note) now name
`hooks/prompt-advisor.sh`. No behavioral change; the kernel command surface
(`route-escalate`, `risk`, `gates`, `model`, `waves`) named in the router flow
is unchanged and still current. Validator: passed 88, failed 0.

## Files

- agents/router.md — modified
- commands/route.md — modified
