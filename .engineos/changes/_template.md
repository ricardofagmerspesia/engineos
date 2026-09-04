---
name: <YYYY-MM-DD>-<short-kebab-slug>
status: active
owner: <name>
spec: docs/specs/<YYYY-MM-DD>-<slug>-design.md   # below non-negotiable #1's threshold, use: n/a — <reason>
domain: <backend|frontend|mobile|dba|llm|devops|security|test|docs|general>
---

## What
<the change in one or two sentences>

## Why
<motivation / problem being solved>

## Scope
<files, modules, or surfaces touched>

## Checklist
- [ ] <planned step>
- [ ] <planned step>

## What was made
<filled on completion: past-tense, concrete account of what actually landed>

## Verification
<how it was checked: typecheck, lint, tests, manual>

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
<none if no hitl.required fired; a tier that required a human and records nothing has not passed its gate>

## Changes registered
<filled on completion: the real diff — paste `git status --short` / `git diff --stat HEAD`, renames, and `git log --oneline <base>..HEAD` when the work spanned commits>

## Notes
<decisions, gotchas, links — [[memory-slug]] for durable takeaways>
