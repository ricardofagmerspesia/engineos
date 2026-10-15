# 01 — Prompt-source golden set from captured payloads

**Objective.** Prove, with fixtures captured from real harness payloads, that
`prompt-advisor` neither escalates nor emits fan-out guidance on injected text
(`<task-notification>`, `<agent-message from=`, `[SYSTEM NOTIFICATION - NOT USER INPUT]`,
the `<system-reminder>` wrapper variant), and still routes a user prompt that
merely contains a frame later in the text.

**Owner.** `test-writer` (sameer), model tier `build`. MODE IMPLEMENT, final-stage
test authoring only: dispatch after explicit current-task approval (`rules/verification.md`).

**Exclusive paths.** `test/fixtures/prompt-source/**`, `src/hooks/prompt-source.test.ts`,
`src/hooks/prompt-advisor.test.ts`, `src/hooks/prompt-advisor.e2e.test.ts`.
Read-only reference: `src/hooks/prompt-source.ts`, `registries/policy.json` `router.source_markers`.

**Contract.** `plan.md@sri-v1` C4. Fixtures are the raw stdin JSON of the
UserPromptSubmit event with `session_id`, `cwd`, `transcript_path` set to `<redacted>`.
Capture is a developer step: a temporary `UserPromptSubmit` hook in
`~/.claude/settings.local.json` that tees stdin to a file during one session with
a background task; never committed with real ids or prompt text beyond the frame.

**dependsOn.** none. Runs on `main` after PR #132 merges (developer decision O1,
2026-10-11); `src/hooks/prompt-source.ts` and `policy.router.source_markers`
arrive with that merge.

**Acceptance.** SRI-01, SRI-02, SRI-03, SRI-04.

**Required checks (approved later).** `typecheck`, `test`; `evals` at final fan-in.

**Risk.** low. **Rollback.** delete the fixtures and the added cases.

**Return envelope.** files written, fixture provenance (session date, frame kind),
any marker string in a captured payload that `source_markers` does not list
(reported under `out_of_scope`, never patched here).
