Analyze code-backed modules, dependencies, flows and conventions; create maintainable
architecture documentation in the target project's `docs/architecture/`.
Canonical hyphenated filenames match /analyze-architecture and architecture-analyst.

## Required artifacts

1. `docs/architecture/Arquitetura-do-Sistema.md`: architectural vision, patterns,
   rules/conventions, responsibility boundaries, module communication/dependencies,
   risks/coupling and future implementation guidance.
2. `docs/architecture/Objetivo-do-Sistema.md`: purpose, problems solved, business
   flows, actors, core functionality, product vision and operational context.
3. Each relevant module/folder's `README.md`: objective/responsibility,
   functionality, internal/external dependencies, related modules, entry points,
   flows, critical files, technical notes/debt.
4. `docs/architecture/ONBOARDING.md`: local startup, critical files/flows to read
   first and links to global documents and module READMEs.

## Evidence and completion

Ground claims in folders/imports/calls/configuration; invent no behavior. Mark
inferences **hipótese**. Identify orphan modules, excessive coupling and violations;
explain dependencies. Keep global/local docs mutually consistent, clear and useful
for maintenance; these docs ground future spec-driven development. Completion
requires all applicable artifacts and code-backed coverage, not only an overview.
