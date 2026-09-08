# Adapters

The EngineOS methodology — router, gates, risk tiers, evidence contract, fan-out
discipline — is tool-independent. Only the *enforcement* is Claude Code specific,
because only Claude Code runs the hooks.

Each adapter states three things, in this order:

1. **How rules load** on that tool.
2. **What is actually enforced** there.
3. **What degrades to convention** — the honest part. A rule that nothing checks
   is a convention, and calling it a gate on a tool that cannot gate it is how
   teams stop trusting the whole system.

## Enforcement matrix

| Mechanism | Claude Code | Cursor | Codex | Copilot |
|---|---|---|---|---|
| Always-on rules in context | hooks + `@` imports | `.cursor/rules` always-apply | `AGENTS.md` | `.github/copilot-instructions.md` |
| Route on file pattern | `route-before-change.sh` (PreToolUse) | glob-scoped rule files | convention | path-scoped instructions |
| Gate advisory from decision rules | `prompt-advisor.sh` (UserPromptSubmit) | convention | convention | convention |
| Post-edit lint/typecheck | `post-edit-check.sh` (opt-in, unregistered by default) | convention | convention | convention |
| Block "done" without verification | `stop-verify.sh` (Stop) | **none** | **none** | **none** |
| Block on unrecorded change | `record-verify.sh` (Stop) | **none** | **none** | **none** |
| Integrity + evals | `scripts/*.sh` in CI | same, via CI | same, via CI | same, via CI |

**CI is the portable enforcement layer.** Everything in the last row runs the same
everywhere, because it runs in GitHub Actions rather than in the agent. When
porting to a tool without Stop hooks, move what you can into CI and accept that
the rest is convention — do not pretend otherwise.

## Writing a new adapter

Copy the shape of `cursor.md`. Requirements:

- Name the tool's actual instruction-loading mechanism, with the real file path.
- Fill the enforcement matrix row honestly, including the gaps.
- State the CI fallback for each gap.
- Do not restate the rules themselves. Adapters map mechanisms; `rules/` holds
  content, and duplicating it guarantees drift (`rules/memory.md`).
