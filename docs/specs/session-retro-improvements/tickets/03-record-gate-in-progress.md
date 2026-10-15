# 03 — Record gate reports "recorded, in progress" for branch-linked records

**Objective.** `record-verify` (Stop) blocks whenever `ENGINEOS_UNRECORDED.<sid>`
exists and no `.deferred` sibling exists (`src/hooks/record-verify.ts`). During
multi-turn PR work the change record is active, not archived, so every session
ends with a `touch .deferred`. Treat an active record that names the current
branch as recorded-in-progress: report, do not block.

**Owner.** `backend-coordinator` (borisenko), model tier `build`. MODE IMPLEMENT.
Tests in `record-verify.test.ts` are authored at the approved final stage.

**Exclusive paths.** `src/hooks/record-verify.ts`, `src/hooks/record-verify.test.ts`,
`.engineos/changes/_template.md`, `skills/record-change/SKILL.md`.
Shared, supervisor-owned: `dist/engineos.cjs` rebuild, `docs/COMPATIBILITY.md`,
`docs/CODEBASE_MAP.md` line 143.

**Contract.** `plan.md@sri-v1` C2. Frontmatter key `branch:` (optional) in a
`.engineos/changes/*.md` with `status: active`; compared byte-for-byte with
`git rev-parse --abbrev-ref HEAD` through the hook's existing `ctx.spawn`.
Behaviour order: bypass → `stop_hook_active` → marker absent → `.deferred` →
**branch-linked active record → `message`** → `block`. Message text:
`[engineos] change recorded, in progress: <record path> (branch <name>) — archive it with record-change when the work closes`.
`recordGateReason` text, `UNRECORDED_MARKER_PREFIX` and `.deferred` are unchanged.
Reader: reuse `src/hooks/change-records.ts` `activeChangeRecords` from the
merged PR #132 (developer decision O1); add only the `branch:` frontmatter
extraction beside it. No default-branch exception (decision O4): a record with
`branch: main` on `main` counts. Template: add `branch: <current branch; set when
the record spans sessions>` under `spec:`. `record-change` SKILL step 7 mentions the key.

**dependsOn.** none.

**Acceptance.** SRI-11, SRI-12, SRI-13, SRI-14 (SRI-15 rows returned in envelope).

**Required checks (approved later).** `typecheck`, `test`, `build`, `validate`.

**Risk.** medium — Stop-hook contract is versioned surface (`docs/COMPATIBILITY.md`
"Hook event contract"); additive path, MINOR. **Rollback.** `git revert` + rebuild `dist`.

**Return envelope.** diff summary; COMPATIBILITY row text (MINOR, new `message`
path, unchanged block text); CODEBASE_MAP line 143 replacement.
