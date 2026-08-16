# docs/specs/

Feature and design specs. A change touching more than 2 files, or any new
feature, starts here: brainstorm the idea, write the spec, then the
implementation plan. One file per change. Smaller changes skip the spec and go
straight to a change record in `.engineos/changes/`.

Naming: `<YYYY-MM-DD>-<short-kebab-slug>-design.md` (and `-plan.md` for the plan).

A spec states the problem, the decisions taken, the components, error handling,
testing, and explicit non-goals. The matching change record in
`.engineos/changes/` links back to its spec via the `spec:` front-matter field.
