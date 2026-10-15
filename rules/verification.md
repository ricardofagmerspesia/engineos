# Verification Rules — always on

## Final integrated checks require explicit current-task approval

Checks join the gate ONLY after implementation and integration are complete for
the approved scope, with explicit current-task consent at the approved timing.
This includes lint, typecheck, build, startup/smoke, integrity, tests and evals,
and scripts that chain any of them. Implementation permission, route/spec/skill,
CI adoption, environment variables and repository markers never supply consent.
Ordinary read-only integration inspection, scoped diff inspection and planning
acceptance evidence may proceed during implementation. Security review follows
the final security consent below; executable checks retain final approval.

After ALL implementation tickets and corrections are integrated, present exact
existing commands, scope and source revision. Always ask a fresh permitted clickable
**Run proposed checks** / **Choose specific checks** / **Skip for now** question.
Record the actual final answer; earlier broad test/check requests are insufficient.
For **Choose specific checks**, inventory each distinct existing command, including
test suites/cases, lint, typecheck, build and integrity; show its exact command and
effects in a clickable **Run** / **Skip** question. Batch within host question limits
until every candidate has a submitted answer. Unavailable commands are visibly
unavailable, never selectable. Resolve nested test-case choices to exact supported
commands; commands that chain several checks disclose the entire chain. Then ask
clickable **Run selected commands** / **Revise selection** / **Skip for now**, naming
the exact selected commands, integrated revision and scope. Execute only the
confirmed nonempty subset. An empty selection records skipped validation.
If controls are unavailable or forbidden for this decision, explain the limitation
and use labelled text choices with the same selection and confirmation steps.
Preselection, unsubmitted defaults and silence never grant consent. Tests may be planned before code, but author/run
tests only after complete implementation and approved final timing. Worker briefs
and TDD skills grant no earlier-check exception. Never delete/skip/weaken
existing tests or add `.only` to pass gates. Required corrections preserve coverage.

Without consent or after refusal, return the reviewable implementation and state
`[validation] pending — final-stage user approval required`; no pending evidence
is green, complete validation or release permission. Keep validation pending in
the change record. The host must attest actual user answers: kernel approval
facts evaluate their consistency, not authenticate a human or authorize tools.

## Final security review and scan consent

Routing identifies required security review immediately; record it as pending and
queue `security-reviewer` dispatch and automated security scans. Secure coding
rules remain active throughout implementation. Ordinary integration inspection
may overlap implementation; the final security review may not.

Start the consent step only after ALL implementation units in the approved scope
are integrated, with no running, returned-but-not-integrated, blocked or failed
implementation work and no unfinished corrections. Cancelled work counts as scope
removal only with an explicit user decision. Implementation completion makes the
review ready; it does not establish verified task completion or release clearance.

At final fan-in, name the reviewer and remit, exact task/file scope and integrated
source revision. List existing exact scan commands and their expected network or
dependency effects; identify missing tooling as unavailable. Ask one scoped
security decision using the host's available permitted approval-capable clickable
tool under rules/base.md **Awaiting user input**:

- **Run security reviewer and listed scans:** approve only the displayed reviewer
  scope and available commands at that source revision.
- **Keep security review pending:** deliver the reviewable implementation and
  defer reviewer dispatch and scans.
- **Decline security review:** record refusal and leave any mandatory review/scan
  obligation pending. When required evidence is missing, report that verified
  completion and release clearance remain unestablished.

When no approval-capable clickable tool is available, explain the limitation and
ask with these labeled text choices. Silence, preselection and timeout never grant
consent. Keep security consent separate from unrelated build/test approval; a
security command that chains other checks also needs their scoped approval.
Record the actual decision and exact scope/source in `## Human decisions`.
Always ask this security decision at the end of the full implementation, including
standalone integrated-scope reviews; earlier broad requests are not final consent.
Approval of a reviewer alone grants no scan-command consent, and vice versa.

After approval announce and dispatch the read-only reviewer, then run only the
approved existing commands under the final executable-check gate. Install no scan
tools, invent no scans and perform no dependency repair or `audit --fix` as part of
review. Missing tooling, deferred work and refusals are pending/unavailable evidence,
never a pass. Retain applicable security requirements in the change record.

Source-changing corrections reopen affected review/scan consent: integrate all
repairs, identify the new revision and obtain renewed affected approval before
resuming. Reuse only evidence whose inputs remain unchanged. Installer secret gates
and always-on secret handling retain their existing timing and requirements.

## The final gate

Before executable validation, apply `engineos kernel workflow-gate --facts <json>`
with exact task, scope/source revision, final phase, integrated state and approved
check ids. Supply `completion` with current scope/source, `requiredTicketIds` from
the entire approved implementation graph, and that exact ticket-id set in state
`integrated` with `unfinishedCorrections:false`; omit the separate final-proof
ticket to avoid a circular gate. Supply `validation.requestedAtPhase:"final"` only
after the actual end-of-implementation question. Missing/stale/unfinished facts deny.
The supervisor alone briefs approved checks;
workers return changes/read-only review without intermediate gates. Automatic
Stop executes no package commands or runner probes; it reports approval pending.
Manual host-approved verification retains containment, timeouts and repair bounds.

Run each distinct approved command once for the immutable integrated revision.
Inspect script contents and deduplicate aliases/chains: identical root `lint`
and `typecheck` scripts need one execution, not two. A command containing tests
needs test consent too. Reuse evidence only while its inputs remain unchanged.
After repair repeat only affected commands at the new approved revision within
`registries/policy.json` repair bounds; never rerun unchanged checks for reassurance.
Show actual output; report red/tooling gaps honestly. Final fan-in remains required.

## JavaScript ecosystem runners

Resolve packages via `.engineos/config.json`, `package.json` or Nx `project.json`;
use existing npm/pnpm/yarn/Nx scripts only within approved scope. Missing scripts
produce visible skips; install/invent no tools. Deprecated Python declarations
remain compatibility data without active Python runners; unsupported packages
receive a scope notice. Budget: 90 seconds per approved non-test target,
180 seconds per approved test target; `ENGINEOS_VERIFY_BUDGET_S` only overrides
positive time budgets, never approval. Missing tooling/timeouts are unavailable
evidence, never pass; genuine diagnostics are red. `ENGINEOS_VERIFY_TESTS` remains
deprecated/ignored and no environment approval flag is accepted.
