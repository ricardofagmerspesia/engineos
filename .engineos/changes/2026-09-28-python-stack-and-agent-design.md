---
name: 2026-09-28-python-stack-and-agent-design
status: active
owner: Sergio Hermsdorff
spec: docs/specs/2026-09-28-python-stack-and-agent-design-design.md
domain: llm
---

## What
Make EngineOS run its verification gate, routing and coordinators on Python/FastAPI
packages, and add an interactive, developer-approved design gate for any project
with more than one agent (12-step form, pattern catalog, Mermaid review).

## Why
The Stop gate, path routing and intent signals only know JavaScript; seven of the
developer's eight Python repos get no lint/typecheck/test gate and no routing. The
one multi-agent repo's working mechanisms (tenant profiles, three-layer index
context feeding tools, bounded self-repair, preview-vs-handoff envelopes) exist
nowhere reusable, and nothing makes a new project design its agent topology
before code.

## Scope
See spec §6. Runtime (`src/hooks`, `src/kernel`, `src/init`, `src/checks`),
registries, rules, three new skills, agents, templates, commands, patterns, docs,
one ADR. Branch: `feat/python-stack-and-agent-design`; PR to upstream after the
developer approves the branch.

## Checklist
- [x] Wave 0 — spec written (this record's `spec:`)
- [x] Developer reviews and approves the spec (recorded below)
- [x] Wave 0 — contracts frozen in docs/specs/2026-09-28-python-stack-and-agent-design-contracts.md (runner union, config schema, git-guard parser, registry diffs, pattern skeleton, wave-1 ownership)
- [x] Wave 1 — Python runner + stack resolution + registries/mirrors/validator + git-write-guard (4 agents, disjoint scopes, one dispatch; barrier: typecheck, tests, validator 113/113, evals 11/11)
- [x] Wave 2 — rules + `python-patterns` + `langgraph-patterns` + agents/templates (4 agents; barrier: 2281 tests/0 fail, validator 113/113, evals 11/11; resolve-task on a FastAPI prompt → backend-python rules + python-patterns; init picks project-claude-python.md for python-only repos through the rebuilt dist)
- [x] Wave 3 — `agent-system-design` skill (12-step form in references/form.md, 599 lines), `/engineos:design-agents`, patterns/3-Agent-topology-interview.md, templates/agent-topology.md, llm-coordinator INTERVIEW mode, 10 pattern files + 2 references (hitl reason + ADR landed in wave 1c); barrier: 2281 tests/0 fail, validator 113/113, evals 11/11; kernel on a supervisor-agent prompt → agent-system intent, design-agents command, hitl topology-approval
- [x] Wave 4 — docs (README, CODEBASE_MAP, BIG-PICTURE, START, ADOPTION, COMPATIBILITY, kernel.sh header), deprecation header (wave 2), final gate (2281 tests/0 fail, validator 113/113, evals 11/11, bundle rebuilt), live hooks on `labv-assist` (SessionStart stack line, PreToolUse routing → backend-python) and `labv-opensearch-agent-demo` (prompt-advisor → agent-system + topology-approval)
- [ ] Developer re-runs `install.sh` (auto mode blocks Claude from self-modifying ~/.claude) — then the git-write guard and the Python gate are live in sessions
- [ ] Developer decides: keep `ruff format --check` inside the lint target (labv-assist currently blocks on it) or gate it on `[tool.ruff.format]`
- [ ] PR to upstream (ricardofagmer/engineer-spec-ia-pattern) after the developer reviews the branch; flag the `ENGINEOS_GIT_WRITES` default (`ask`) for Ricardo

## What was made
- **Python stack in the runtime.** The Stop gate selects a runner per package: `pyproject.toml`/`requirements.txt` packages run ruff (check + format --check), pyright and pytest through a venv → uv → compose cascade (`src/hooks/runner-python.ts`), skip loudly when no environment resolves, and advise on unpinned tools; the venv is activated for the spawn (PATH + VIRTUAL_ENV). `.engineos/config.json` declares the stack (`src/registry/project-config.ts`), `kernel.sh resolve-stack` detects it, `engineos init --stack` writes it and picks `templates/project-claude-python.md` for python-only repos, SessionStart prints the stack line.
- **Routing, intents, gates.** Domain `backend-python` (after `dba`), Python globs on test/dba/llm/security, intents `backend-python` and `agent-system`, decision rule `rule-multi-agent-design`, hitl reason `topology-approval` (ADR), CLAUDE.md/AGENTS.md mirrors, validator and eval cases.
- **Prose for Python.** `rules/backend-python.md` (ports and adapters, Pydantic boundary, closed error codes, tenant from the token, fail-closed settings, usage in `finally`); Python idioms in `base.md`; pip-audit, validate-then-retry structured output, the three prompt tests, and the design-gate paragraph across `security.md`, `llm-apps.md`, `verification.md`; `production-backend-standards.md` deprecated and off the backend row.
- **Skills.** `python-patterns` (ten sections mirroring nestjs-patterns), `langgraph-patterns` (cited to labv-opensearch-agent-demo), Python variants in `eval-harness` and `llm-engineering`, and `agent-system-design`: the 12-step form (`references/form.md`), ten catalog patterns and two references, `/engineos:design-agents`, `patterns/3-Agent-topology-interview.md`, `templates/agent-topology.md`, llm-coordinator INTERVIEW mode.
- **Agents and templates.** Stack-aware backend-coordinator, Python boot order and OpenAPI discovery in qa-tester, Python manifests in architecture-analyst, Python hunts in security-reviewer; both stack blocks in `templates/project-claude.md`; Python read-only permissions; Python paths in `claude-security.yml`.
- **Git-write guard.** `ENGINEOS_GIT_WRITES=ask|auto` (default ask) enforced by `hooks/git-write-guard.sh` on every Bash call; `output.ts` gained the `ask` decision; `rules/git.md` "Who may write"; survives bypass.
- Verified live against labv-assist and labv-opensearch-agent-demo (see Verification). Bundle rebuilt.

## Verification
Real runs at the wave-1 barrier (2026-09-28, rebuilt dist):
- `git-write-guard` invoked as a hook binary with PreToolUse envelopes: `git status`, `git log | head` silent; `git commit`, `git -C x status && git push`, `gh pr create`, an unbalanced-quote command → `permissionDecision: ask`; `ENGINEOS_GIT_WRITES=auto` silent.
- `kernel route-path` on real labv files: routes_describe.py → backend-python, test_health.py → test, auth.py → security, graph/workflow.py and tools/search.py → llm, use_cases/describe.py → backend-python.
- `kernel resolve-stack` on labv-assist (fastapi@.), the demo (fastapi@. + fastapi@backend + react@frontend), portal_dds (fastapi@backend + react@frontend).
- Stop gate against labv-assist's own `.venv` (repo untouched): real ruff ran; `ruff check` green, `ruff format --check` red on 6 files → block; pytest (390 tests) ran green with `ENGINEOS_VERIFY_TESTS=1`; advisory "ruff, pytest not pinned" carried on the block; pyright absent → target skipped.
- Stop gate against a scratchpad venv (python3.12, ruff 0.13.0, pyright 1.1.405, pytest 8.4.1 pinned) over the fixture: green → silent; injected unused import → lint red; injected type error → pyright red; injected failing test → test red with the assertion; no venv → "skipped … no Python environment" message.
- Two defects found ONLY by the real runs and fixed: (1) venv tools ran under the bare PATH, so pyright resolved imports against the system interpreter — `PythonEnvironment.spawnEnv` now activates the venv (PATH, VIRTUAL_ENV); (2) skip/infra/advisory lines were dropped whenever the gate blocked — they now ride on the block reason. Fixture gained `pythonpath = ["."]`.
Planned (spec §7): `npm run typecheck && npm run lint && npm test`,
`scripts/validate-engineos.sh`, `scripts/run-evals.sh`, manual gate/routing runs
on both labv repos.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
- 2026-09-28 | Sergio Hermsdorff | design | approved | branch-first then PR; ruff/pyright/pytest pinned; Pydantic-validated structured output; pytest import-purity test; keep all 8 new catalog patterns; tools get their own form step; developer approval (not product HITL) gates topology
- 2026-09-28 | Sergio Hermsdorff | design | approved | per-developer git-write setting `ENGINEOS_GIT_WRITES=ask|auto`, default ask, enforced by a PreToolUse Bash hook that survives bypass (spec Part C, D18); Sergio = ask, Ricardo = auto
- 2026-09-28 | Sergio Hermsdorff | design | approved | spec docs/specs/2026-09-28-python-stack-and-agent-design-design.md approved; add hitl reason `topology-approval` (with ADR); enforcement instruction-level for now, blocking hook deferred (spec §8)

## Changes registered
Commits on `feat/python-stack-and-agent-design` (base `main` = dfead93^):
```
177e822 feat(agents): agent-system design gate — 12-step form, /engineos:design-agents, pattern catalog and references (wave 3)
9f98f28 feat(python): rules, python-patterns and langgraph-patterns skills, stack-aware agents and templates (wave 2)
1c6664a feat(python,agents,git): Python Stop-gate runner, stack resolution, registries, git-write guard (wave 1)
dfead93 docs(spec): Python stack + agent-system design gate — design and change record
```
`git diff --stat dfead93^..HEAD`: 107 files changed, 10137 insertions(+), 863 deletions(-)
Uncommitted at close (wave 4, awaiting the developer's commit):
```
 M .engineos/changes/2026-09-28-python-stack-and-agent-design.md
 M README.md
 M docs/ADOPTION.md
 M docs/BIG-PICTURE.md
 M docs/CODEBASE_MAP.md
 M docs/COMPATIBILITY.md
 M docs/START.md
 M scripts/kernel.sh
```

## Notes
- Close-out: when the three open developer items above are done, set `status: done`, add `completed: <date>`, and move this file to `.engineos/archived/2026/09/llm/` (the `record-change` skill does this; the validator refuses an archived record with an unchecked item).
- Wave-1 barrier reconciliations (contracts doc amended): `backend-python` is its own
  hook-mirrored intent (validator C16: one intent per domain); `layout-manifest.json`
  does not list `config.json` (init is the only writer); `PythonEnvironment.probe`
  added; stack detection skips every dot-directory; `hitl.topology` fact added to the
  `resolve --facts` CLI parser; stale `decisions.test.ts` fixture fixed (rule added
  09-11 broke a 09-04 expectation on main).
- Follow-ups parked for wave 4 docs: CODEBASE_MAP/BIG-PICTURE/README hook and verb
  tables, kernel.sh header, git-write-guard in node-guard SILENT_HOOKS decision.
- Grounding repos: `~/Documents/labv-assist` (ports-and-adapters reference, built under
  EngineOS, audit `.engineos/audits/2026-09-04-all.md`) and
  `~/Documents/labv-opensearch-agent-demo` (LangGraph reference). Both English, Azure
  OpenAI only, pytest + hand-written fakes, no type checker today.
- Vocabulary fixed in the spec: developer (drives Claude) vs user (uses the product).
- Auto mode blocks Claude from running `install.sh` (self-modification of `~/.claude`);
  the developer runs it.
