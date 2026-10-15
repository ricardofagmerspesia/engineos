# Optional prototype preview before implementation

Date: 2026-10-08. Risk high (public workflow guidance); autonomy A2.
Scope: instruction/procedure changes only, no runtime schema or launcher changes.
Also offer an optional Matt Pocock session /retro once at task completion.
User confirmed Matt Pocock's installed `prototype` skill as the intended preview.

## Design contract

One authoritative procedure in rules/parallelism.md applies before production
implementation in every lane, including direct, delegated and resumed execution.
Ask once per implementation scope whether the user wants a throwaway prototype
showing how the result will work/look. Missing answer pauses production work.
No -> record declined and continue other applicable gates. Yes -> invoke installed
prototype, select LOGIC/UI branch by question, present runnable artifact and exact
revision/path, then wait for explicit approval of that preview and scope.
Approval to create a preview is not approval to implement. Revisions materially
changing approved behavior reopen preview approval. Same-scope resumes preserve
recorded decline or approval; silence/timeouts and worker returns grant neither.
Read-only analysis/spec preparation may continue while blocked. Prototype creation
is the explicit exception to production-write blocking; production worker dispatch
must wait. No implicit tests, git/forge writes, branches, commits or persistence.
If prototype skill is missing, report blocked preview and request its location;
never fabricate a preview or silently substitute another skill.

## Deliverable / task budget

One indivisible guidance change owned by llm-coordinator; supervisor owns this spec,
change record and integration/validation. Independent critic reviews after return.
One task is sufficient: no file-per-task decomposition.
Keep existing entry points and output-artifact timing. Pre-build preview is separate
from post-delivery artifact offer and applies to all implementation domains.
Do not invent a /template alias or install/vend external skills automatically.

## Acceptance

- ASK: mandatory pre-implementation choice; unanswered stops production writes.
- NO: decline recorded, implementation may proceed through existing gates.
- YES: actual prototype invocation + preview shown + explicit approval before code.
- RESUME: decision tied to scope and approved preview artifact/revision; no duplicate
  prompt for unchanged scope, approval invalidated by relevant material changes.
- ENTRY: implement/new-feature/implement-spec, native skills, constitution mirrors
  and Codex/Cursor instruction adapters point to the central procedure.
- BOUNDARIES: instruction-based gate explicitly conventional, no CLI enforcement
  claim; prototype branch capture remains subject to git-write consent.

## Completion retro contract

After scoped work and actual verification results are delivered, ask once whether
user wants Matt Pocock's session `/retro`. Yes invokes installed upstream skill
(or loads its verified source when needed); no finishes without retro. Silence
never starts a retro and never blocks delivery. Record scope/delivery and any
verification gaps honestly before offering. This is separate from native EngineOS
long-window retro, whose archive/recurrence thresholds do not replace session retro.
Do not silently substitute native retro for upstream. Preserve current-task tests,
Git policy and proposal-only limits; accepting retro does not approve its changes.
Avoid recursively offering retro after the retro itself; prior same-task answer
persists on resume. Retain existing post-delivery artifact offer without confusing
prototype choice, preview approval, retro opt-in or output artifact selection.

## Alternatives / rollback

Rejected: only offer a template after delivery, because feedback arrives after code.
Rejected: mandatory prototype generation for every change, because user explicitly
asked for an optional preview. Accepted: mandatory choice, conditional preview.
Rollback: revert only this guidance patch from the starting working-tree snapshot;
preserve unrelated/uncommitted changes. No external release approved.

## Validation plan

Read-only scoped diff and independent critic; integrity validator, Markdown links,
whitespace check. Runtime/typecheck/build not applicable to prose-only edits. No new
behavior tests/evals requested or executed; previous task consent does not carry.
