# 02 — Installer: always-on rules auto-loaded, every other rule path-resolved

**Objective.** Stop routed and deprecated rules from reaching every session
while keeping every `rules/*.md` resolvable on installed machines through the
`docs/COMPATIBILITY.md` window. Root cause (verified 2026-10-11): `install.sh`
step 4d (lines 199-216) and `install.ps1` step 4d (lines 294-303) symlink every
`rules/*.md` into `~/.claude/rules/`, which the host auto-loads each turn
(code.claude.com/docs/en/memory: user-level rules apply to every project; the
directory is discovered recursively; symlinks are followed).

**Owner.** `devops-coordinator` (hinokuma), model tier `build`. MODE IMPLEMENT.

**Exclusive paths.** `install.sh`, `install.ps1`, `rules/gates.md` (H1 line only:
append `— always on`), `CLAUDE.md` and `AGENTS.md` (append one identical sentence
to the "Paths are relative here" bullet; both files are dirty in the working tree —
edit on top, never revert or stage).

**Contract.** `plan.md@sri-v1` C1 (developer decision O2):
1. Always-on = H1 ends with `— always on` (no second list). Link those into
   `$CLAUDE_DIR/rules/<name>.md` as today.
2. Link every other `rules/*.md` (routed and deprecated) into
   `$CLAUDE_DIR/engineos/rules/<name>.md` — outside `$CLAUDE_DIR/rules/` because
   that root is discovered recursively. Print `rule linked (path-resolved): <name>`.
3. For a non-always-on name, if `$CLAUDE_DIR/rules/<name>.md` is a symlink into
   `$REPO_DIR/rules/`, remove it and print `rule unlinked: <name>`; a regular file
   keeps the existing `skip:` warning and is never deleted.
4. Resolution sentence (byte-identical in `CLAUDE.md` and `AGENTS.md`): "On an
   installed machine a routed or deprecated rule named `rules/<name>.md` is read
   at `~/.claude/engineos/rules/<name>.md`; always-on rules are already in context."
5. `install.ps1` mirrors 1-3 with its existing junction/link mechanism.

**Step 0 (read-only, before any edit).** Re-run the reference inventory in
`plan.md` "Reference inventory" (403 references, 120 files, four resolution
categories) and confirm no reference names `~/.claude/rules`; record the count
in the return envelope. If the count or categories differ from the plan, stop and
return `BLOCKED` with the delta — the plan's resolution map is the contract.

**dependsOn.** none.

**Acceptance.** SRI-05, SRI-06, SRI-07, SRI-08, SRI-10, SRI-24, SRI-25
(SRI-09 rows and SRI-26 developer evidence are returned/collected by the supervisor).

**Required checks (approved later).** `validate` (C36 reads both router files;
C3 resolves rule references); `shellcheck install.sh` only where CI already runs it.

**Risk.** medium — every installed machine changes `~/.claude/rules/` and gains
`~/.claude/engineos/rules/` on the next install; blast radius beyond one module;
`CLAUDE.md` is in every session. Autonomy A2 for the edits; the install run is
the developer's. **Rollback.** re-run the previous installer revision; `git revert`.

**Return envelope.** diff summary; inventory count and category confirmation;
COMPATIBILITY row text (installer change, marker contract, the two new stdout
lines, the new directory); corrected README "Loaded by" cells for `subagents`,
`verification`, `risk-autonomy`, `gates`, `parallelism`, `models`, `memory`
("Every session"); any always-on rule whose H1 lacks the marker (`out_of_scope`).
