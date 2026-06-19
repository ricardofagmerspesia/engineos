# docs/specs/

Feature and design specs. Every change starts here: brainstorm the idea, write
the spec, then the implementation plan. One file per change.

Naming: `<YYYY-MM-DD>-<short-kebab-slug>-design.md` (and `-plan.md` for the plan).

A spec states the problem, the decisions taken, the components, error handling,
testing, and explicit non-goals. The matching change record in
`.engineos/changes/` links back to its spec via the `spec:` front-matter field.
