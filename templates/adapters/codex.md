# Adapter — Codex / OpenAI agents

## How rules load

Root AGENTS.md loads automatically. Keep always-on guidance and a router pointer;
load activity references on demand (rules/context.md).

```markdown
# Engineering rules
<always-on set inline>

# Routing
Supervisor routes project writes/dispatch, including small edits/follow-ups.
Read matching rules/skills/patterns; table: <CLAUDE.md router link>. Announce route.
Consume kernel execution facts before artifacts: eligible simple tasks ask permitted
clickable Implement directly / Create a lightweight spec choices. Current direct
choice uses stack guidance plus security/Git safeguards without mandatory prototype
or spec/tickets; unknown facts permit scoping only. Selected specs dispatch the
dependency-ready graph and follow rules/parallelism.md Prototype preview choice.
After all implementation integrates, always ask fresh final clickable check consent.
After delivery separately follow
its Completion follow-up for optional Matt Pocock /retro, executed only on yes.
```

Nested AGENTS.md supplies directory guidance (e.g. api/ and web/).

## The AGENTS.md copy

Root AGENTS.md mirrors CLAUDE.md by hand, retaining these intentional differences:
- Longer always-on imports: parallelism, models, memory, subagents, verification,
  risk-autonomy and gates; no prompt advisor loads them.
- Install path ~/.Codex/AGENTS.md; wording "the Codex environment".
- Rule citations say "always-on", not "from the task contract".
- Hooks are absent, rather than requiring a Node version.

Other content and router rows stay aligned: C16 validates CLAUDE.md against
registries/intents.json, so copy-only rows escape validation. Scripted generation
was rejected because maintaining the four substitutions costs more than hand sync.

## What is enforced

Always-on and nested directory instructions load; other EngineOS gates do not.

## What degrades to convention

All hooks: routing/advisory, edit checks and Stop gates are model discipline.
Keep the return envelope: explicit BLOCKED/FAILED status remains useful without a parser.

## User input presentation

Apply rules/base.md **Awaiting user input** at clarification, preview, design,
validation, final security review/scans and other decision pauses. Inspect the tools
exposed in the current session and follow their availability and usage restrictions:

- Use `request_user_input_async`, when exposed and permitted, with a self-contained
  question and short meaningful clickable options. Free-text decisions offer
  **Provide details** plus the host text field. It returns immediately; the actual reply
  arrives as a user message. A preselected option is not a submitted answer.
- Use `request_user_input` only in modes and for question types the host permits.
  A planning-only tool is not available in an execution turn; a tool restricted
  to optional clarification cannot collect mandatory approval.
- For consent, use an exposed tool that explicitly permits approval requests;
  otherwise present labelled choices in text. Include the exact artifact revision
  and implementation scope, or integrated source revision and final commands,
  as required by the applicable gate.
- Keep a required decision pending until the user's submitted reply arrives.
  Continue independent authorized work meanwhile; dependent writes or checks
  retain their existing gates. Text-only hosts receive an actionable question
  with alternatives, not simulated clickable controls.

For final security consent follow rules/verification.md: all implementation is
integrated before offering the reviewer and listed scans, keep that decision
separate from unrelated build/test approval, and preserve required review as
pending on defer/refusal. Use the exposed approval-capable clickable tool where
permitted; the host owns the controls and actual submitted response.

Apply rules/subagents.md **Visible subagent announcements** before actual native
spawn/follow-up calls and after returns, including failures. Codex has no banner
hooks: the supervisor emits the bold startup label and diff block itself, with
the role-only `[<short role>]` label, status, task, actual host model, mode and
exclusive scope. Resolve every agent's short role through rules/subagents.md and
retain any separate instance field across its lifecycle. Canonical dispatch IDs,
registered aliases and agent responsibilities retain their existing contracts.
A queued security reviewer remains pending until approved dispatch; no banner
may imply that a worker launched before the host call succeeds. Color depends on
the renderer, so retain explicit text status and task.

These are host presentation conventions, not kernel UI capabilities. The kernel
evaluates recorded decision facts; it does not display choices or authenticate
consent. The gate and Git-write policies remain applicable to submitted answers.

For simple planning, supply current `scopeRevision`, actual `specChoice` and
`specChoiceScopeRevision`; the unresolved kernel choice is not approval. For final
checks, bind `completion.requiredTicketIds` to the entire approved implementation
graph and enumerate that exact ticket set in current completion facts, then
set `validation.requestedAtPhase: final` only after the actual final question.
The separate final-proof ticket is excluded from that implementation list.
Present **Run proposed checks** / **Choose specific checks** / **Skip for now**;
earlier broad permission never substitutes for the end-of-implementation choice.
For **Choose specific checks**, follow rules/verification.md: clickable **Run** /
**Skip** for each distinct exact command (including test suite/case filters), batch
within host limits, then confirm the selected commands through clickable
**Run selected commands** / **Revise selection** / **Skip for now**. Record actual
submitted choices; unavailable commands and unsubmitted defaults grant no consent.

## Native workflow capability

`engineos kernel execution --facts <json>` selects a scoped execution lane.
`engineos scheduler plan|step` validates dependency/ownership/capacity transitions
and returns legal actions plus events; it does not call Codex agent tools.
The supervisor consumes launch/review actions through authorized host tools,
persists state under one owner and reconciles running handles on resume.
`launchReady` is an injectable library adapter, not a built-in Codex launcher.
Keep enforcement labelled conventional until a concrete host launcher exists.
`kernel workflow-gate --facts` evaluates scope/revision-bound preview and final
validation attestations; `launchReady` requires matching preview admission.
The host authenticates user decisions and applies the gate for direct execution.
Optional retro remains an instruction convention owned by rules/parallelism.md.
Use `engineos workflow-report` on real metadata events; native
engineos-spec/engineos-implement-spec/pr require no upstream skill installation.
An explicitly chosen prototype preview requires the installed upstream prototype;
completion `/retro` uses the installed upstream session retro only on opt-in.

## CI fallback

CI is conditional final executable verification. Lint/typecheck/build and
tests/evals/integrity scripts need explicit current-task approval after
integration (rules/verification.md), including per-run manual CI dispatch.
Automatic Stop launches no commands; missing approval is pending, never green.
