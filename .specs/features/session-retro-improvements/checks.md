# Checks — session-retro-improvements

Claim-to-evidence map. These are proposed proofs, not executable tests; every
command runs only at the approved final stage (`rules/verification.md`).
Commands: `typecheck` = `npm run typecheck` (identical to `lint`; run once),
`test` = `npm test`, `build` = `npm run build`, `validate` = `node dist/engineos.cjs validate`,
`evals` = `node dist/engineos.cjs evals`.

| Id | Evidence | Kind | Owner |
|---|---|---|---|
| SRI-01 | `ls test/fixtures/prompt-source/` shows the five C4 files; a test parses each through `src/hooks/envelope.ts` | test | 01 |
| SRI-02 | `prompt-advisor.test.ts`: for each injected fixture, decision is `silent` or a context note without `escalate`/`fanout` text | test | 01 |
| SRI-03 | `prompt-advisor.test.ts`: `user-with-trailing-frame.json` yields the same route as its plain prompt | test | 01 |
| SRI-04 | `prompt-advisor.e2e.test.ts`: spawn `dist/engineos.cjs hook prompt-advisor` with fixture on stdin; assert stdout | test (e2e) | 01 |
| SRI-05 | Dry install into a temp `CLAUDE_DIR`; `ls -l $CLAUDE_DIR/rules` lists exactly the always-on names | manual, output shown | 02 |
| SRI-06 | Same run: `production-backend-standards.md`, `backend-python.md`, `frontend.md` absent from `$CLAUDE_DIR/rules` and present as symlinks in `$CLAUDE_DIR/engineos/rules` | manual | 02 |
| SRI-07 | Pre-seed a stale symlink for `frontend.md`; run shows `rule unlinked: frontend.md` | manual | 02 |
| SRI-08 | Pre-seed a regular file `rules/base.md`; run shows the existing `skip:` warning and the file survives | manual | 02 |
| SRI-09 | `git diff -- docs/COMPATIBILITY.md README.md` shows the row and corrected "Every session" cells | read-only diff | supervisor |
| SRI-10 | `node dist/engineos.cjs kernel route-path src/x.test.ts` still answers `hook_guidance` naming `rules/testing.md` | kernel call | 02 |
| SRI-11 | `record-verify.test.ts`: marker + active record with `branch: feat/x` and HEAD `feat/x` → `kind: message`, text contains the record path | test | 03 |
| SRI-12 | `record-verify.test.ts`: marker + record with other branch → `block`, reason equals `recordGateReason(...)` | test | 03 |
| SRI-13 | existing `.deferred` case stays green | test | 03 |
| SRI-14 | `grep -n "^branch:" .engineos/changes/_template.md` | read-only | 03 |
| SRI-15 | `git diff -- docs/COMPATIBILITY.md docs/CODEBASE_MAP.md` | read-only diff | supervisor |
| SRI-16 | `git check-attr linguist-generated -- dist/engineos.cjs package-lock.json console/package-lock.json docs/context/markdown-inventory.json evals/intent-routing-cases.jsonl` | command | 04 |
| SRI-17 | `npm run test:file -- src/hooks/record-verify.test.ts` output; `npm run test:file -- README.md` exits 1 with usage | command (test consent) | 04 |
| SRI-18 | `grep -n "test:file" docs/CODEBASE_MAP.md` | read-only | supervisor |
| SRI-19 | `grep -n "Worktree" rules/parallelism.md` | read-only | 05 |
| SRI-20 | `grep -n -i "worktree" templates/handoff.md`; `node dist/engineos.cjs validate --only C19` | read-only + validate | 05 |
| SRI-21 | `grep -n "superseded behaviour" rules/parallelism.md` | read-only | 05 |
| SRI-22 | `grep -n "linguist-generated" rules/verification.md` | read-only | 05 |
| SRI-23 | `node dist/engineos.cjs validate` full output | validate | supervisor |
| SRI-24 | `grep -n "engineos/rules" CLAUDE.md AGENTS.md` (two identical lines); `node dist/engineos.cjs validate --only C36` | read-only + validate | 02 |
| SRI-25 | Re-run the plan's inventory grep; `grep -rn "\.claude/rules" agents skills commands hooks src registries patterns templates` answers nothing | read-only | 02 |
| SRI-26 | After the developer re-runs the installer, the next session's loaded-rules listing shows 11 always-on names and no routed/deprecated name | manual, shown by the developer | 02 |

Required checks per unit (approved later): 01 `typecheck`, `test`; 02 `validate`
(plus `shellcheck install.sh` where CI already runs it); 03 `typecheck`, `test`,
`build`, `validate`; 04 `test` (the `test:file` smoke), `validate`; 05 `validate`.
`evals` runs once at final fan-in because unit 01 touches hook tests that the
deterministic tier reads.
