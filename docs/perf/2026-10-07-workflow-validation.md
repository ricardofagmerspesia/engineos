# Workflow optimization — working-tree validation

Date: 2026-10-07  
Scope: [optimization plan](../specs/2026-10-07-workflow-optimization-plan.md)  
Status: scoped implementation validated; unreleased; wider compatibility suite has known failures.

## Delivered controls

- Kernel execution facts select unresolved/direct/delegate/parallel independently
  of task-budget guidance and classified risk; mandatory risk/design/security rules remain.
- Scheduler validates DAGs, exclusive scopes, host/policy capacity, revisions,
  contract evidence and bounded explicit resumes. Returned work retains ownership;
  integration releases dependents without a whole-wave barrier.
- Accepted integration emits useful-result before completion. Protected reasons
  cannot be overwritten or manufactured through the internal dependency namespace.
- Versioned metadata journals and workflow-report cover observed waits, runtime,
  TTFR, concurrency, retries and nullable model usage; native retro consumes them.
- Native spec/implement-spec/PR procedures preserve required artifacts, branch/PR
  context, current-task test consent and final integration validation.

## Executed evidence

| Command | Observed result |
|---|---|
| `npm run build` | Exit 0; rebuilt committed runtime bundle. |
| `npm run typecheck` | Exit 0. `lint` is the identical TypeScript command, so no second identical run or independent lint capability is claimed. |
| `tsc -p tsconfig.json` then five directed test files | 73 tests, 73 pass, 0 fail; includes 43 new behavior cases and existing policy-loader cases. |
| `node dist/engineos.cjs validate` | 113 passed, 0 failed after rule-load/prose mirror repairs. |
| `git diff --check` | Exit 0. |
| Built-bundle kernel execution smoke | Fully declared small low-risk docs scope selected direct; budget 1–3 and policy capacity 3. |
| Built-bundle scheduler smoke | A/B ready and admitted; C depends on A and remains planned; enforcement explicitly conventional. |

Directed command:

```sh
node --test build/kernel/execution.test.js build/scheduler/state.test.js \
  build/report/workflow.test.js build/journal/workflow.test.js \
  build/registry/policy.test.js
```

Tests include actual scheduler-to-journal/report event integration, evidence-bound
TTFR before completion, unknown usage, scope/capacity and retry boundaries,
immutable failure reasons, reserved dependency-prefix rejection, forged blockers,
uncertain launch handles, and an accepted dense 1,000-unit acyclic graph.
The dense case proves behavior without a fragile wall-time threshold; it is not
a measured performance improvement.

## Wider related-run failures

A covering run also included existing kernel CLI/resolve/admission/wave tests:
**212 total, 209 passed, 3 failed**. Preserve these failures; do not describe the
overall repository suite as green:

1. `src/kernel/cli.test.ts`: resolve-stack expects autodetected FastAPI alongside
   Node although current stack detection no longer activates Python backends.
2. `src/kernel/cli.test.ts`: relative-dir stack detection expects autodetected Django.
3. `src/kernel/resolve.test.ts`: every intent assumes a first signal; the deprecated
   backend-python entry has `signals: []` and `enabled: false`.

`git show HEAD:registries/intents.json` confirms the disabled Python entry and
empty signals predate this implementation. `src/kernel/stack.ts` was not modified.
The affected legacy expectations were not skipped, deleted or rewritten to hide red.
This wider compatibility gap must be resolved before a release claiming a green suite.

Final integrity also exposed missing backend-rule closure in the retained Python
compatibility route and missing conditional-verification prose anchors. The route
table/intents/routing mirrors now include the existing deferred backend rule;
the route remains disabled. Verification wording now matches its approved-scope
semantics. Neither repair reactivates Python or changes test consent.

## Independent review and limitations

Critic and security reviewer raised concrete lifecycle/protected-blocker findings;
these were fixed and regression-tested. Security verdict: clear within reviewed
source. Critic inspected the saved 73/73 and 113/113 outputs and found no remaining
blocking workflow defect, with wider-suite/host/release gaps explicitly retained.

Native instruction adapters compute legal actions but rely on the host for real
launches, single-owner durable state/event persistence, breaker resource checks,
worker termination and uncertain-outcome reconciliation. The injectable launcher
does not provide a built-in Codex or Claude runtime. Protected blocker clearance
has no native human-approval API; abandonment/reconciliation remains external.

No real-workload TTFR/token/cost reduction or matched baseline comparison was run.
Synthetic test timestamps prove metric definitions, not savings. Unobserved
provider usage remains null. No Git/forge write, release, deploy, installation or
model-provider service was performed. Unrelated concurrent agent-alias and visual
doc changes and existing pnpm files were preserved outside this task's scope.
