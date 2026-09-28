# Python stack + agent-system design gate — frozen contracts (wave 0)

*Companion to `2026-09-28-python-stack-and-agent-design-design.md`. Every wave-1
unit builds against these shapes and changes none of them; a change to a contract
comes back here first, then to the units that consume it.*

## 1. Runner (`src/hooks/runner.ts`, new `src/hooks/runner-python.ts`)

Selection becomes **per package**, not per repo root. The Node ladder is untouched
in behaviour; it gains a sibling arm.

```ts
// runner.ts — public surface after wave 1
export type RunnerKind = 'nx' | 'npm-family' | 'python';

export type RunnerSelection =
  | { kind: 'nx' | 'npm-family'; run: string; exec: string }
  | { kind: 'python'; env: PythonEnvironment };

// Kept for callers that still select once per root (post-edit-check, tests).
export function runnerSelect(root: string, exists?: (p: string) => boolean): RunnerSelection;

// NEW. The selection for the package that owns `pkgDir`. A pyproject.toml (or a
// requirements.txt with no pyproject.toml above it, bounded by `root`) selects
// the python arm; otherwise the Node arm via runnerSelect(root).
// Returns `{ kind: 'python-unavailable', reason }` when the package is Python
// but no environment resolves — the caller renders the skip message and moves on.
export function runnerSelectFor(
  pkgDir: string,
  root: string,
  config: ProjectConfig | null,          // .engineos/config.json, may be absent
  exists?: (p: string) => boolean,
  spawn?: SpawnSyncLike,
): RunnerSelection | { kind: 'python-unavailable'; reason: string };

// Unchanged signatures; each gains a `kind === 'python'` branch that delegates
// to runner-python.ts.
export function runnerHandle(sel, pkgDir, readFile?): string | null;          // python: pkgDir
export function runnerHasTarget(sel, handle, target, readFile?, spawn?, cwd?): boolean;
export function runnerRun(sel, handle, target, timeoutSeconds, env, spawn?, cwd?): RunResult;
```

```ts
// runner-python.ts
export type PythonEnvMode = 'venv' | 'uv' | 'compose';
export interface PythonEnvironment {
  mode: PythonEnvMode;
  pkgDir: string;
  // How a tool name becomes an argv prefix:
  //   venv:    [join(venvBin, tool)]
  //   uv:      ['uv', 'run', '--directory', pkgDir, tool]
  //   compose: ['docker', 'compose', 'exec', '-T', service, tool]
  command: (tool: PythonTool) => readonly string[];
  // Human-readable origin for messages: ".venv/bin", "uv (uv.lock)", "compose:backend".
  source: string;
  // Amended at the wave-1 barrier: the argv the runner-found probe runs once per
  // distinct selection (venv: <bin>/python; uv: uv; compose: docker compose exec -T <svc> python).
  probe: readonly string[];
}
export type PythonTool = 'ruff' | 'pyright' | 'pytest';
export type PythonTarget = 'lint' | 'typecheck' | 'test';

// The commands a target runs, in order; the first non-zero stops the target.
export const PYTHON_TARGETS: Record<PythonTarget, readonly (readonly [PythonTool, ...string[]])[]> = {
  lint:      [['ruff', 'check', '.'], ['ruff', 'format', '--check', '.']],
  typecheck: [['pyright']],
  test:      [['pytest', '-q']],
};

// Resolution order (design §A1 / D3). First hit wins; cached per pkgDir for the process.
//   1. <pkgDir>/.venv/bin/     2. <root>/.venv/bin/
//   3. uv.lock in pkgDir or root AND `uv` on PATH  -> uv
//   4. config.packages[dir==pkgDir].compose_service -> compose
//   5. null
export function resolvePythonEnvironment(pkgDir, root, config, exists?, spawn?): PythonEnvironment | null;

// A target "exists" when its tool is configured in pyproject.toml ([tool.ruff],
// [tool.pyright], [tool.pytest.ini_options] / pytest.ini / conftest.py) OR the
// tool answers `--version` (PROBE_TIMEOUT_SECONDS) through the environment.
export function pythonHasTarget(env: PythonEnvironment, target: PythonTarget, readFile?, spawn?): boolean;

// Runs PYTHON_TARGETS[target] in sequence under one shared budget; output is the
// concatenation of every command's output, prefixed by its argv on its own line.
export function pythonRun(env: PythonEnvironment, target: PythonTarget, timeoutSeconds, processEnv, spawn?): RunResult;

// Advisory only (D2): the tools this package declares without an exact pin.
export function unpinnedTools(pkgDir: string, readFile?): PythonTool[];
```

Consequences frozen with it:

- `verify-targets.ts`: `VERIFY_EXTENSIONS` += `'py', 'pyi'`; `PACKAGE_MARKERS`
  += `'pyproject.toml', 'requirements.txt'`; `containedIn` refuses owners reached
  through `.venv`, `site-packages`, `__pycache__` as it does `node_modules`.
- `classify-failure.ts`: `TARGET_ABSENT['python']` =
  `'No module named (ruff|pyright|pytest)|command not found|No such file or directory: .*(ruff|pyright|pytest)'`
  and that match yields `{ situation: 'infra', reason: 'runner-missing' }`, not
  `target-absent`. `Evidence.run.runner` accepts `'python'`.
- `stop-verify.ts`: `runLadder` selects per package (`runnerSelectFor`); the
  runner-found probe runs once per **distinct** selection; the node-version guard
  applies only when at least one Node package is in scope; a
  `python-unavailable` package contributes one line to the final `message()`:
  `[engineos] stop-verify skipped for <pkg>: no Python environment found (venv, uv or compose)`;
  the unpinned advisory is one line per package:
  `[engineos] <pkg>: <tools> not pinned to exact versions (rules/verification.md)`.
  Budgets: 90 s / 180 s (test), overridable by `ENGINEOS_VERIFY_BUDGET_S`.

## 2. Project config (`.engineos/config.json`, `src/registry/project-config.ts`, `src/kernel/stack.ts`)

```json
{
  "version": 1,
  "stack": {
    "packages": [
      { "dir": "backend",  "language": "python", "framework": "fastapi", "compose_service": "backend", "python_env": "auto" },
      { "dir": "frontend", "language": "node",   "framework": "react",   "compose_service": null }
    ]
  }
}
```

```ts
export type Language = 'python' | 'node';
export type Framework = 'fastapi' | 'django' | 'flask' | 'nestjs' | 'react' | 'next' | 'react-native' | null;
export interface PackageStack {
  dir: string;                       // relative to repo root; "." allowed; no leading "./"
  language: Language;
  framework: Framework;
  compose_service: string | null;
  python_env?: 'venv' | 'uv' | 'compose' | 'auto';   // default 'auto'; ignored for node
}
export interface ProjectConfig { version: 1; stack: { packages: PackageStack[] } }

// Strict loader in the style of src/registry/*.ts: unknown keys, wrong types and
// duplicate dirs are errors; an absent file is `null`, never an error.
export function loadProjectConfig(root: string, readFile?): ProjectConfig | null;

// kernel.sh resolve-stack [dir]  ->  { "packages": PackageStack[], "source": "config" | "detected" }
// Detection: every dir (bounded by root, excluding node_modules/.venv) holding
// pyproject.toml or requirements.txt -> python; package.json -> node. Framework
// from the dependency list (pyproject [project.dependencies] / requirements /
// package.json dependencies). Config wins entirely when present (no merge).
export function resolveStack(root: string, config: ProjectConfig | null, deps?): { packages: PackageStack[]; source: 'config' | 'detected' };
```

`engineos init` gains `--stack <spec>` where `<spec>` is `auto` (default) or a
comma list of `framework[@dir]` (`fastapi@backend,react@frontend`; bare
`fastapi` means `.`). It writes `.engineos/config.json` when absent (never
overwrites) and prints the resolved table. **Amended at the wave-1 barrier:**
`layout-manifest.json` does NOT list `config.json` — the manifest is strictly
"copy template → dest" on both the TS and bash sides and has no representation
for a generated file; `init` is the only writer, and `init --stack auto` writes
nothing when detection finds no package (an empty config would win over
detection forever). Detection also skips every dot-directory (`.agents`,
`.trae`, `.claude`, …) besides the named `SKIPPED_DIRS`.

SessionStart line (ensure-project-layout): `[engineos] stack: <framework>@<dir> · … · runners: <per language>`.

## 3. Git-write guard (`src/hooks/git-write-guard.ts`, `src/hooks/output.ts`)

```ts
// output.ts — one new kind
export type HookDecision = /* existing */ | { kind: 'ask'; event: 'PreToolUse'; reason: string };
export function ask(reason: string): HookDecision;
// render: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }

// git-write-guard.ts
export type GitWriteSetting = 'ask' | 'auto';
export function gitWriteSetting(env: NodeJS.ProcessEnv): GitWriteSetting;   // unset/invalid -> 'ask'

export interface GitCall { tool: 'git' | 'gh'; subcommand: string; args: readonly string[] }
// Segments on && || ; | newline and $( ); skips env assignments and `cd x &&`;
// skips git global options -C <dir>, -c <k=v>, --no-pager, --git-dir=…, --work-tree=….
// Returns null when the command cannot be tokenized (unbalanced quotes, heredoc).
export function gitCalls(command: string): GitCall[] | null;

export const READ_ONLY_GIT: ReadonlySet<string>;   // design §C2, exact list
export function isWrite(call: GitCall): boolean;   // closed read side, open write side; branch/tag/stash/config/remote inspect their args

// Hook entry: silent unless setting is 'ask' AND (gitCalls(cmd) is null && /\b(git|gh)\s/.test(cmd) OR some call isWrite).
// Ignores bypass on purpose (design §C1).
```

`hooks/hooks.json` PreToolUse gains `{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs\" hook git-write-guard" }] }`.

## 4. Registry diffs (applied in wave 1c together with the `CLAUDE.md`/`AGENTS.md` mirrors)

**routing.json** — precedence becomes
`security, test, backend, dba, backend-python, ios-release, android-release, devops, mobile, frontend, llm`.
`dba` moves ahead of `backend-python` so `*/alembic/versions/*` (added to `dba.match.paths`) and `*.sql` are claimed before any backend-python path glob (`*/adapters/*.py` would otherwise match an alembic tree under `adapters/`). No per-domain exclusion key is introduced.

```json
{ "id": "backend-python", "title": "Backend (FastAPI shapes)",
  "rules": ["backend-python", "architecture", "data", "testing", "observability"],
  "skills": ["python-patterns"], "agent": "backend-coordinator",
  "note": "Same closure as backend: architecture/observability are closure targets of backend-python.md, data because the row's signals include migrations. Follows dba in precedence, so alembic/ and *.sql never land here.",
  "match": {
    "paths": ["*/routers/*.py", "*/api/*.py", "*/services/*.py", "*/use_cases/*.py", "*/adapters/*.py", "*/domain/*.py", "*/repositories/*.py"],
    "basenames": ["schemas.py", "models.py", "ports.py", "main.py", "dependencies.py", "settings.py"]
  },
  "sample_path": "/tmp/api/app/routers/users.py" }
```
Excluded from `backend-python` by construction (they match earlier domains or
`llm`): `*/auth/*`, `auth.py`, `guardrails.py`, `*_credentials.py` (security);
`test_*.py`, `*_test.py`, `conftest.py` (test); `*/alembic/versions/*` and
`*.sql` (dba, which now precedes it).
`llm` gains `paths: ["*/graph/*", "*/agents/*", "*/tools/*"]`, `basenames:
["*_agent.py", "workflow.py", "state.py", "nodes.py", "prompts_*.py"]`; since
`llm` is last, `*/services/*.py` under an agent project still routes
`backend-python` — accepted, documented in the `llm` note.
`excluded.basenames` += `uv.lock`, `poetry.lock`.

**intents.json** — **Amended at the wave-1 barrier:** validator C16 requires every routing domain to be claimed by exactly one intent, so `backend-python` is its own hook-mirrored intent (signals `FastAPI, Pydantic, SQLAlchemy, Alembic, Django, Flask, uvicorn, pyproject`; rules = the domain's; skill `python-patterns`; agent `backend-coordinator`; it suppresses `backend`). `backend` keeps its NestJS title and gains only the neutral `router`, `endpoint`. Signals are bounded literals, so `orchestrat` is spelled out as three words. `llm.signals` += `LangGraph, LangChain, orchestrate/orchestration/orchestrator, supervisor, multi-agent, multi agent, multiagent, agent-to-agent, A2A`; new:

```json
{ "id": "agent-system", "title": "Multi-agent system design",
  "signals": ["multi-agent", "agents that", "orchestrat", "supervisor agent", "agent topology", "LangGraph", "A2A", "handoff between agents"],
  "rules": ["llm-apps"], "skills": ["agent-system-design"], "agents": ["llm-coordinator"],
  "commands": ["design-agents"], "mcp": [], "model_tier": "design", "risk_floor": "medium",
  "hook_mirrored": false, "domain": null,
  "note": "Interactive: llm-coordinator (hermsdorff) runs patterns/3-Agent-topology-interview.md; developer approval recorded before any graph code." }
```

**decision-rules.json** — `rule-multi-agent-design` exactly as design §B1.

**policy.json** — `hitl.reasons` += `"topology-approval"` appended last (emission
order is list order); `situations` unchanged. Kernel: `hitlSection` gains a
`topology: boolean` fact; when true, `topology-approval` is emitted and
`required` is true. `rules/risk-autonomy.md` "Human-in-the-loop" lists it; ADR
`docs/adr/2026-09-28-topology-approval-hitl-reason.md`.

**capabilities.json** — step `design-agent-topology` → `llm-coordinator`.

## 5. Pattern-file skeleton (`skills/agent-system-design/references/patterns/<id>.md`)

```markdown
---
id: <id>
title: <title>
origin: labv-assist | labv-opensearch-agent-demo | portal_nexxus | new
---
## Use when
## Do not use when
## Decisions it forces   (each one names the form step it belongs to)
## LangGraph shape       (state keys, nodes, edges, the one reducer, caps)
## Failure modes
## Eval strategy
## Example              (file:line in the origin repo, or "none yet")
```

Ids (design §B4): `react-tool-loop`, `grounded-pipeline`, `supervisor-workers`,
`typed-pipeline`, `rule-first-router`, `evaluator-optimizer`, `fanout-aggregate`,
`plan-execute-replan`, `user-approval-interrupt`, `handoff-swarm`. References:
`context-enriched-tools.md`, `tenant-profiles.md`.

## 6. Disjoint scopes for wave 1 (one message, four agents)

| Unit | Owns (writes) | Reads only |
|---|---|---|
| 1a runner | `src/hooks/runner.ts`, new `runner-python.ts` (+test), `verify-targets.ts`, `classify-failure.ts` (+tests), `stop-verify.ts`, `post-edit-check.ts`, `test/fixtures/py-fastapi/**` | §1, §2 types (imports `project-config.ts` — 1b lands the file first; until then 1a codes against the interface in this doc) |
| 1b stack | new `src/registry/project-config.ts` (+test), new `src/kernel/stack.ts` (+test), `src/init/project.ts` (+test), `src/kernel/cli.ts` (`resolve-stack` verb), `scripts/kernel.sh` (no change: shim), `registries/layout-manifest.json`, `src/hooks/ensure-project-layout.ts` (stack line) | §2 |
| 1c registries | `registries/routing.json`, `intents.json`, `decision-rules.json`, `policy.json`, `capabilities.json`, `src/kernel/hitl.ts` (+test), `src/kernel/resolve.ts`/`decisions.ts` if the topology fact needs plumbing, `CLAUDE.md` (router rows **and** non-negotiable #12 for Part C, one-line append) + `AGENTS.md` mirrors, `rules/risk-autonomy.md` hitl list, ADR, `src/checks/**` additions, `evals/*.jsonl` | §3 (for #12 wording), §4 |
| 1d git guard | new `src/hooks/git-write-guard.ts` (+test), `src/hooks/output.ts` (+test), `src/hooks/cli.ts` (hook registration), `hooks/hooks.json`, new `hooks/git-write-guard.sh` shim (executable, not a library), `rules/git.md`, `docs/START.md` + `docs/ADOPTION.md` settings snippet. Does NOT touch `CLAUDE.md` (1c owns it) | §3 |

Barrier after wave 1: `npm run typecheck && npm test && ./scripts/validate-engineos.sh && ./scripts/run-evals.sh`.
