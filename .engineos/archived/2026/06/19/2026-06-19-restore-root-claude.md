---
name: 2026-06-19-restore-root-claude
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Moved the constitution back from docs/CLAUDE.md to the repo root (CLAUDE.md). A
reorg had relocated it into docs/, which broke the whole load chain.

## Why
- install.sh imports `@$REPO_DIR/CLAUDE.md` (root) — was pointing at a missing file.
- The user's ~/.claude/CLAUDE.md imports the root path — broken.
- docs/CLAUDE.md's relative `@rules/base.md` resolved to docs/rules/ (nonexistent).
The constitution must live at repo root for the import chain + relative @rules.

## Scope
- git mv docs/CLAUDE.md -> CLAUDE.md (history preserved).

## Verification
- relative @rules/* all resolve from root; install.sh import target exists;
  end-to-end install writes the import line; routing 13/13, governance 6/6; gate clean.

## Notes
docs/ keeps ADOPTION/START/CONTRIBUTING/PRD; only the constitution returns to root.
See [[2026-06-19-consolidate-engineos-dir]].
