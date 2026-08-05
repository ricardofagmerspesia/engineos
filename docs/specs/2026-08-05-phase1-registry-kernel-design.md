# Phase 1 registry-kernel — design

## Problem

`ai-se-os` (the headless delivery runner, Phase 2 of the AI-SE OS evolution path) is
built to consume EngineOS as a pinned dependency: it resolves workflow states to agents
through "the capability registry," reads "the generated agent registry," and journals
runs in "the Phase 1 exec-journal schema." None of those three things exist in EngineOS
yet. `registries/` holds only `routing.json` (file-pattern → domain) and
`decision-rules.json` (condition → required artifact) — neither maps a workflow
capability to an agent binding, neither is machine-consumable by an external repo, and
there is no journal schema at all. The Phase 2 spec was written assuming this phase
had already shipped; it hadn't. This closes that gap before T8 (kernel contribution of
the product/spec agent) tries to bind into a registry entry that isn't there.

## Decision

Add three artifacts, matching the existing registry conventions (`routing.json`'s
version/description/precedence shape, `gen-agent-commands.sh`'s generate-with-marker
pattern, `validate-engineos.sh`'s per-registry consistency checks):

**1. `registries/capabilities.json`** — hand-maintained, one entry per workflow
capability a kernel consumer can request. Each entry binds a capability id to either a
kernel agent (by name, must exist in `agents/`) or an explicit "no dedicated agent yet"
note naming the model tier the main Claude Code loop should use instead
(`rules/models.md`'s tier names — never a raw model alias). A consumer reads this file
to resolve "what handles author-spec" without knowing anything about EngineOS's
internal agent files.

**2. `registries/agents.json`** — generated, never hand-edited. One entry per
`agents/*.md`, derived from its frontmatter (name, alias, description, tools, model)
plus a `capability_ids` back-reference computed from `capabilities.json`. This is what
"generated agent registry... picks it up with no drift" (T8's acceptance criterion)
refers to: an external consumer gets the same agent inventory `gen-agent-commands.sh`
already turns into slash commands, as data instead of as generated markdown.

**3. `scripts/exec-journal.sh`** — a tiny append/read CLI over one JSONL schema
(`timestamp`, `run_id`, `capability_id`, `agent`, `model_tier`, `status`, `tokens_in`,
`tokens_out`, `duration_ms`, `note?`). `status` reuses the kernel's own
`OK|BLOCKED|FAILED|DEGRADED` vocabulary (`rules/parallelism.md`) rather than inventing a
second one. This is a schema contract, not a running service: EngineOS has no agent
dispatch loop of its own to instrument today (Claude Code dispatches agents directly);
the deliverable is "here is the one JSONL shape both sides write to," proven by the
script being able to append a conforming line and read it back. `ai-se-os`'s own run
journal (T1) writes this same shape so the two join without translation.

## Rejected alternative

Fold `capabilities.json` into `routing.json` (one registry, one set of consistency
checks). Rejected: routing answers "which rules/skills/agent apply to this file path,"
a request-time question the `PreToolUse` hook answers deterministically per file.
Capabilities answer "which agent handles this abstract workflow step," a question that
has no file path at all and no hook currently asks it. Conflating them would make
`routing.json`'s existing agent-exists / rules-exist checks ambiguous about which axis
failed.

## Validation

- `registries/*.json` stay valid JSON (existing generic check in
  `scripts/validate-engineos.sh` already globs the directory).
- New targeted check: every `capabilities.json` entry's `agent` (when non-null) names a
  file that exists under `agents/`; every `model_tier` (bound or noted) is one of
  `rules/models.md`'s four tier names.
- New drift guard (mirrors the existing `commands/agents/` one in CI): regenerating
  `registries/agents.json` produces byte-identical output to what's committed.
- `scripts/test-validate-engineos.sh` gains a planted-breakage case per new check
  (unknown agent, unknown tier), matching how every other check in that file is proven.

## Versioning

MINOR bump: `1.3.0` → `1.4.0`. Additive only — no existing file's shape changes, no
rule path moves, `docs/COMPATIBILITY.md`'s definition of versioned surface is respected
by construction (new registries, no renames).
