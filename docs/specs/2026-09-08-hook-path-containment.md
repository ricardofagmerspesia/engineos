# Audit deferrals: separator-agnostic `findUpAny` and a contained `post-edit-check`

**Date:** 2026-09-08
**Status:** approved (owner picked the deferrals batch in-session; audit
`.engineos/audits/2026-09-08-all.md`, deferred from wave 1 / U1)
**Risk:** medium. Both hooks execute repository `lint`/`typecheck` scripts
outside the tool-permission prompt; the change narrows where they may look.
Reversible with `git revert` plus `npm run build`.
**Autonomy:** A2, `security-reviewer` AUDIT pass on the diff before the gate.

## Problem

1. `src/hooks/verify-targets.ts:48-61` `findUpAny` bounds and walks with `/`
   only: the containment test is `start.startsWith(`${stop}/`)`, the root test
   is `dir !== '/'`, and `parentOf` (`:150-155`) cuts at `lastIndexOf('/')`.
   `stop-verify.ts:220` passes `realpathSync(root)`, which on Windows is
   `C:\Users\...`; the walk from `C:\Users\...\src` never satisfies the `/`
   prefix, so `findUpAny` answers `null` for every file and the Stop gate
   silently verifies nothing on Windows. Fail-closed, but a dead gate that
   reads as green.
2. `src/hooks/post-edit-check.ts:59-62,107` calls `findUpAny` with no `stop`
   for the package, the workspace and the linter config. It walks to the
   filesystem root and runs whatever `package.json` it finds: the exact
   defect U1 fixed in `stop-verify.ts` (`docs/specs/2026-09-08-audit-remediation-wave1.md`
   Problem 1). The hook is unwired by default (`hooks/hooks.json`), which is why
   U1 left it; a team that opts back in inherits the hole.

## Decision

- `findUpAny` becomes separator-agnostic through `node:path`: `start` and
  `stop` are `resolve`d, containment is `relative(stop, start)` not starting
  with `..` and not absolute, the walk ascends with `dirname` and terminates
  when `dirname(dir) === dir`. Probing uses `join(dir, name)`. Behavioural
  consequence, accepted: a RELATIVE `start` now resolves against the process
  cwd (the hook's cwd is the project root) instead of converging to `.`;
  every caller today passes an absolute path (`stop-verify.ts:startDir`,
  `post-edit-check.ts:dirname(env.file)`), and the bash `find_up` this
  mirrored no longer exists. `parentOf` is deleted with its comment.
  Rejected: a `sep`-aware string version of the current code (still wrong for
  mixed `C:/Users` forms Git Bash hands node on Windows; `relative`/`dirname`
  handle both).
- `post-edit-check` gains the same two-layer containment as `stop-verify`:
  `stopReal = realpathSync(env.cwd)` (fail closed: unresolvable cwd verifies
  nothing), every `findUpAny` call passes it, and the package and workspace
  owners must satisfy `containedIn(stopReal, owner)` on realpaths. The
  linter-config lookup is bounded by `stopReal` too. `containedIn` and
  `startDir` move from `stop-verify.ts` into `verify-targets.ts` as the shared
  vocabulary (exported), so one copy exists. Rejected: gating post-edit-check
  on `.engineos/` adoption like the Stop gate; a team that wires this hook by
  hand has consented explicitly, and the cwd is the consented tree.

## Frozen contracts

- `findUpAny(start: string, names: readonly string[], stop?: string): string | null`
  signature unchanged. Returned owner is the `resolve`d form of the directory.
- New exports in `verify-targets.ts`: `containedIn(root: string, candidate: string): boolean`
  (realpath both, `candidate === root || candidate.startsWith(root + sep)`,
  `false` on any realpath failure) and `startDir(file: string): string`
  (`realpathSync(dirname(file))`, lexical `resolve(dirname(file))` fallback).
  `stop-verify.ts` imports them instead of defining them; its behaviour is
  byte-identical.
- `post-edit-check.ts`: `verify` keeps its signature. Decision on an edit whose
  package owner is outside `env.cwd` is `silent`.

## Unit (single agent, devops-coordinator)

Files: `src/hooks/verify-targets.ts`, `src/hooks/verify-targets.test.ts`,
`src/hooks/stop-verify.ts` (import swap only), `src/hooks/post-edit-check.ts`,
`src/hooks/post-edit-check.test.ts`. Tests ARE in scope (the fix's evidence):

- `findUpAny`: existing tests keep passing; add "a start outside stop returns
  null without probing" using `relative` semantics (sibling directory sharing
  a prefix, e.g. stop `.../repo` and start `.../repo-other/src`, must be
  refused; the old `${stop}/` test already refused it, keep it refused);
  add "walk terminates at the filesystem root for an absolute start with no
  marker".
- `post-edit-check`: add "a package.json above the session cwd is never run"
  (temp root with `package.json` carrying a red `typecheck`, cwd a nested
  directory without one, edit inside cwd: decision `silent`, spawn never
  called) and "a package in a sibling checkout is never run" (edit outside
  cwd: `silent`).
- Keep every existing assertion. Do not run `npm run build`; the orchestrator
  rebuilds `dist/engineos.cjs` at the barrier. Scoped verification only:
  `npx tsc -p tsconfig.json --noEmit` and `node --test` on the two touched test
  files after `npx tsc -p tsconfig.json` (compiled tests run from `build/`;
  read `package.json` `scripts.test` for the exact form).

## Amended at the security re-pass

`security-reviewer` returned MERGE WITH FIXES. Applied at the barrier:

- `post-edit-check`: `env.cwd === ''` returns `silent` before the realpath
  (`realpathSync('')` answers the process cwd, an implicit ceiling); the
  linter-config owner passes `containedIn` like the package and workspace.
- `findUpAny` / `containedIn`: containment is decided on the FIRST SEGMENT of
  `relative` (`isWithin`), so `..hidden/` is inside and `../x` is not; the
  ceiling terminator compares through `relative`, which is case-insensitive on
  win32, instead of `===`.
- `containedIn` refuses an owner reached through a `node_modules` segment
  (HIGH, pre-existing in both hooks: a dependency's `package.json` under the
  consented tree had its `lint`/`typecheck` run on an edit inside it). Applies
  to the Stop gate as well.
- COMPATIBILITY wording softened: Windows behaviour is covered by unit tests
  over `node:path` semantics, not by a Windows test run.

Accepted residual: an owner that is git-untracked but not under `node_modules`
(a vendored checkout) is still run; requiring a tracked `package.json` is a
follow-up, not this unit.

## Barrier (orchestrator)

`npm run build`, `npm run typecheck`, `node dist/engineos.cjs validate`,
`npm test`, `git diff --check`; `security-reviewer` AUDIT over the diff;
`docs/COMPATIBILITY.md` Unreleased row (post-edit-check tightened;
findUpAny relative-start semantics). One PR.

## Out of scope

Console leftovers from U11 (blocked on PR #84: same files); TS 7 upgrade;
Windows CI execution of the test suite (the `verify` job is ubuntu-only, so
the win32 branch of this fix is exercised by unit tests over `node:path`
semantics only, and recorded as such).
