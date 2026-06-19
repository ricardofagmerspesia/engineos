---
name: 2026-06-19-consolidate-engineos-dir
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Consolidated the three top-level governance dirs (changes/ archived/ memory/) into
a single hidden `.engineos/` folder, plus `.engineos/audits/` for /audit output. A
consuming project now gets ONE hidden folder instead of 3+ root dirs.

## Why
Adopting EngineOS was polluting a project's root with unrelated folders. Keep the
footprint to a single `.engineos/`.

## Scope
- git mv changes/ archived/ memory/ -> .engineos/ (history preserved).
- hooks: routing-map + mark-unrecorded exclusions -> */.engineos/*; route-before-change
  soft reminder -> .engineos/changes; record-verify unchanged (flag lives in .git).
- record-change skill: paths -> .engineos/changes, .engineos/archived/<Y>/<M>/<D>.
- commands/audit -> .engineos/audits; commands/implement -> .engineos/changes.
- docs: README, docs/ADOPTION, docs/START, docs/CONTRIBUTING, specs, moved READMEs;
  new .engineos/README.md index. Fixed README link to docs/START.md.
- tests updated for the .engineos exclusion (route 13/13, governance 6/6).

## Verification
- routing 13/13, governance 6/6; gate clean on tracked files; no double-prefixes;
  end-to-end install PASS; top level = 8 project dirs + hidden .engineos/.

## Notes
Governance stays always-on (a project must create .engineos/ to satisfy the record
gate), now one hidden folder. Heads-up: a docs/CLAUDE.md duplicate of the root
constitution appeared (user reorg) — worth deduping separately. See [[2026-06-19-archived-date-tree]].
