---
name: 2026-09-07-e03-publish-guards
status: active
owner: Ricardo Fagmer
spec: n/a — execution of epic E03 of the plan "EngineOS 2.0 — Production readiness plan" (2026-09-06, revision 2), acceptance criterion "a concurrent or invalid change does not overwrite existing work"
domain: frontend
---

## What

The console's publish and rollback can no longer destroy work that is not theirs: a per-file base revision guard, a write lock across processes, refusal to roll back over a dirty file, and the console enters CI.

## Why

The console edits a **copy**. `writeSkills` preserved the untouched lines of the file byte for byte — which looked like enough care and was not. Between the capture of the draft and the click on Publish, the file may be edited by hand, by another console session or by a git operation; the draft's description then overwrote the new one, **with no error, no diff and no trace**. It is the worst form of data loss: nobody finds out.

Three variants of the same problem were open:

1. **No base revision.** There was no way to ask "is this file still the one I edited against?".
2. **No serialization.** Two `POST /api/publish` can interleave — a double click on Publish is enough. Two `git add`/`git commit` pairs competing produce a commit with half of the other request's files, or an opaque `index.lock` error well after the disk has already been touched.
3. **Rollback over a dirty tree.** `git revert` either aborts or stops in the middle of a conflict, and in both cases what is at risk is the operator's uncommitted edit.

And the fourth, which explains the three: **CI did not touch the console.** No `grep console .github/workflows/ci.yml` returned anything. Typecheck, lint and build ran only on the machine of whoever edited it, and tests did not exist. A surface that writes to the repository and makes commits, without automated verification, is where work loss is born.

## Scope

- `console/src/lib/entities/types.ts` — `baseHash` field.
- `console/src/lib/entities/skills.ts` — `hashSource`, `detectBaseConflicts`, refusal in `writeSkills`.
- `console/src/lib/publish-lock.ts` — new.
- `console/src/lib/git.ts` — `pathsInCommit`, `dirtyPaths`.
- `console/src/app/api/publish/route.ts`, `console/src/app/api/rollback/[historyId]/route.ts`.
- `console/tsconfig.test.json`, `console/package.json` (`test` script), two test files.
- `.github/workflows/ci.yml` — `console` job.
- `docs/CAPABILITIES.md`.

## Checklist

- [x] Record the base revision of each draft by content hash
- [x] Refuse publishing when the file changed since capture, naming the files
- [x] Treat a draft with no recorded base as unknown, not as trusted
- [x] Serialize concurrent publishes, including across processes
- [x] Refuse rollback over a file with an uncommitted change
- [x] Rebase the published drafts onto the just-written bytes
- [x] Behavior tests for the guards
- [x] Console in CI: typecheck, lint, tests and build
- [ ] Editable entities for agents, models, MCPs, routing and rules
- [ ] Precedence action → route → agent → skill → default, with a conflict requiring explicit resolution
- [ ] Effective configuration with the origin of each choice and a route simulation before publishing
- [ ] Authentication, RBAC and isolation before hosting

## What was made

**Base revision.** Each draft carries the sha256 of the file as it was when the content was captured. Hash, not mtime: mtime moves when a tool rewrites identical content and does not move on some filesystems within the same second — in both directions it answers the wrong question. Publishing calls `detectBaseConflicts` **before** validating and before any write, and refuses naming the files. `writeSkills` refuses again on its own: a future caller must not be able to reintroduce the silent-overwrite path just by forgetting the pre-check.

A draft with no `baseHash` — rows written before the guard existed — is refused as an unknown base. It is the fail-closed reading, and the `GET` does **not** rewrite the base of an existing draft: doing that would automatically accept whatever is on disk right now and would nullify the whole guard.

A successful publish rebases the drafts onto the bytes it has just written, otherwise the second publish of the same draft would conflict with the file the first one wrote — the guard firing against the operator's own success.

**Lock.** `mkdir` is the only atomic and fail-if-exists primitive on every platform where this runs, with no dependency, and — the part an in-memory flag does not give — it also excludes a **second instance** of the console pointed at the same repository, which is precisely the concurrent-publish case. Publish and rollback take the same lock, and it is released even when the body throws: a publish that fails must not block all the following ones.

Staleness by age, not by pid check: a pid does not distinguish a dead process from a process on another machine sharing the directory, and getting that wrong means breaking a live publish.

**Rollback.** Before reverting, it lists the paths of the commit and refuses if any of them has an uncommitted change. After the revert, it resynchronizes the snapshot from disk; a draft still holding the pre-revert base will be refused by the publish guard, and that is the correct outcome — the file it was edited against no longer exists.

## Verification

- `console: npm test` — **12 passed, 0 failed** (6 cases for the base guard, 6 for the lock).
- `console: npx tsc --noEmit` clean; `npx eslint .` clean.
- `scripts/validate-engineos.sh` and `scripts/test-kernel.sh` unchanged by this change and verified again over the package.

One of the tests found a defect in the code it was testing, and it is worth recording because it is the kind of error that only shows up that way: `acquire` read the `owner` file and computed the lock's age in the **same** `try`. A lock with no `owner` — a process dead between the `mkdir` and the write — threw before the age was computed, fell into the default age of 0 and **could never be reclaimed**. The half-created lock was the only case the staleness rule existed for, and it was the only one it did not cover. Fixed by separating the two reads; there is a test for it.

Declared limitations:

- The console's `npm run build` was **not** executed on this machine: `next build` downloads the SWC binary and this session's network refused. Typecheck, lint and tests pass; the build runs in the CI `console` job, which also has not had a real run yet.
- The guards cover the skills vertical, the only one that exists. Every new entity needs to enter `detectBaseConflicts` — there is nothing forcing that yet.
- The route handlers have no test: they are orchestration over the tested modules, and testing them would require bringing up Next. `tsconfig.test.json` compiles only `src/lib/entities` and `publish-lock`, leaving out `store/` (the better-sqlite3 seam, which uses `import.meta`).
- Still without authentication, RBAC or isolation: the console remains not hostable.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | execution scope | approved | "Go ahead" on the continuation of E03. The slice was chosen by the epic's own acceptance criterion — "a concurrent or invalid change does not overwrite existing work" — which was the only E03 item with a risk of data loss.

## Changes registered

Commit of this unit on the `chore/e01-eol-baseline` branch, immediately after `9843fa1`.

## Notes

- Order, again: adding editable entities before these guards would have multiplied by five the surface capable of overwriting work silently.
- Pattern to keep: **when the UI edits a copy, the identity of the origin is part of the draft** — without it there is no conflict, there is only the last one to write. [[draft-precisa-de-base]]
