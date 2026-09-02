# Runtime performance — design

Date: 2026-08-13
Status: approved by user (`ok do it`)
Risk: medium — changes the prompt-hook interface and context-loading behavior;
all existing policy remains owned by the same registries/rules and compatibility
scripts remain present. Reversible by revert. Autonomy A2.

## Problem

EngineOS resolves one prompt through three registered shell hooks. On the current
machine their cumulative work is about 4.34 seconds: scale 511 ms, decision rules
670 ms, route 3,161 ms. The route kernel scans 136 literal signals by spawning
`sed` and `grep` per signal. File routing adds about 478 ms before every edit.

The feedback loop is also slow: the full validator takes about 40.6 seconds and
the 78 planted-breakage cases each invoke the whole validator. Finally, the
always-on constitution and eleven imported rules total 56,276 bytes / 8,726
words before any route-specific context.

## Decisions

### 1. One prompt-resolution interface

Add:

```text
kernel.sh resolve-task --prompt <text>
```

It returns one `task_contract` object containing deterministic route facts,
scale classification, decision-rule matches, required artifacts, rule/skill/MCP
loads, agents, model tier, and risk floor. It composes existing registry owners;
it does not create a second policy store.

`hooks/prompt-advisor.sh` calls that interface once and emits one
`UserPromptSubmit` result. The three existing hook scripts stay on disk for one
compatibility window and retain their direct tests, but `hooks/hooks.json`
registers only the unified hook.

### 2. Match inside one process

`route-intent`, `scale`, and `decision-rules` evaluate their registry collections
inside `jq`. Literal intent signals preserve the existing case-insensitive,
non-alphanumeric-boundary semantics. No per-signal shell process is allowed.

### 3. Cache file-route answers

`route-before-change.sh` caches the compact guidance answer by registry mtime,
session, and file path under the repository git directory. A registry change
selects a new cache file; SessionStart removes stale caches. Cache failure is a
miss, never a routing failure.

### 4. Select validator checks

`validate-engineos.sh --only <C-id[,C-id...]>` runs only named check groups.
Groups preserve the existing C identifiers; combined historical groups remain
combined where splitting would create duplicate setup. Negative tests declare
their group and call only that group. Full validation remains the CI authority.

### 5. Reduce always-on prose

Keep the constitution plus `base`, `security`, `git`, and `context` always on.
Load `risk-autonomy`, `gates`, `models`, `parallelism`, `subagents`, `verification`,
and `memory` only when the task contract or lifecycle state needs them. The
constitution keeps compact fallback instructions for adapters without hooks.
Policy bodies are not duplicated or deleted.

### 6. Performance budgets

Add a deterministic benchmark script with warmed median budgets:

- `kernel.sh route-intent`: under 250 ms;
- `kernel.sh resolve-task`: under 500 ms;
- end-to-end `prompt-advisor.sh`: under 600 ms;
- cached `route-before-change.sh`: under 150 ms;
- always-on corpus: under 32,000 bytes.

Budgets run in CI with a documented multiplier override for slower runners.
Behavioral tests remain the correctness gate; a fast wrong answer fails before
performance is considered.

## Compatibility

- Existing kernel subcommands and the three legacy advisor scripts remain.
- `hooks/hooks.json` changes only the registered `UserPromptSubmit` command.
- Hook output remains `hookSpecificOutput.additionalContext` and non-blocking.
- The public task contract is additive JSON.

## Verification

- Kernel behavioral suite, including equivalence fixtures for old vs. new
  intent/scale/decision outputs.
- Unified advisor hook tests for route, scale, decision-rule, silence, bypass,
  and telemetry behavior.
- Route hook cache miss/hit/invalidation tests.
- Full integrity validator and selected-check planted-breakage tests.
- Performance-budget script and measured before/after report.
- Document probes after the always-on import reduction.
