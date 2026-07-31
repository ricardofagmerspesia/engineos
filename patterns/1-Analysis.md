Analyze the complete structure of the system — its modules, files, dependencies,
and implementation patterns — to generate standardized, automatically up-to-date
technical documentation.

All artifacts go under the target project's `docs/architecture/` directory
(create it if absent), using these canonical, hyphenated filenames so the
pattern, the `/analyze-architecture` command, and the `architecture-analyst`
agent stay in agreement.

During the analysis, you must produce the following artifacts:

1. `docs/architecture/Arquitetura-do-Sistema.md` — a general document containing:

* the project's architectural vision;
* patterns used;
* architectural rules;
* technical conventions;
* separation of responsibilities;
* communication flow between modules;
* critical dependencies;
* technical risks and important couplings;
* guidelines for future implementations.

2. `docs/architecture/Objetivo-do-Sistema.md` — a document containing:

* the system's main purpose;
* the problems it solves;
* the main business flows;
* the actors involved;
* core functionality;
* product vision;
* the system's operational context.

3. A `README.md` inside each relevant module/folder of the project, containing:

* the module's objective;
* main responsibility;
* existing functionality;
* internal and external dependencies;
* related modules;
* entry points;
* important flows;
* critical files;
* technical notes and identified debt.

4. `docs/architecture/ONBOARDING.md` — the fast-start path for a new developer:
how to run the system locally, the critical files/flows to read first, and
where to go for deeper context (links into the two documents above and the
per-module READMEs).

Important rules:

* Never invent behavior that does not exist in the code.
* Inferences must be explicitly marked as **"hipótese"**.
* Prioritize analysis grounded in real code — folder structure, imports, calls,
  and configuration.
* Identify orphan modules, excessive coupling, and architectural violations.
* Always explain dependencies between modules.
* Produce documentation that is clear, objective, and oriented toward future
  maintenance.
* Treat this documentation as the official basis for future development under
  the Spec Driven Development model.
* Always keep the global documents and the per-module local documents
  consistent with each other.
