# Domain Docs

Single-context domain guidance for engineering skills. Seeded by engineos init;
edit freely, init never overwrites.

## Before exploring, read these

Read root CONTEXT.md glossary and relevant docs/adr/. Missing files: proceed
silently; domain-modeling creates them lazily through grill-with-docs or
improve-codebase-architecture.

## File structure

Root CONTEXT.md and docs/adr/YYYY-MM-DD-<slug>.md. ADR date is the decision date;
use kebab slugs, never sequence numbers that collide across parallel branches.

## Use the glossary's vocabulary

Use glossary terms in tickets, proposals, hypotheses and test names, respecting
avoided synonyms. A missing term means reconsider invented language or flag a
real gap for domain-modeling.

## Flag ADR conflicts

Explicitly name contradicted ADRs and the reason to reopen them; never silently override.
