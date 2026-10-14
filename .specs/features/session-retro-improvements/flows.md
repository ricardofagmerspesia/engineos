# Session-retro improvements — decision flows

Diagrams of the two contracts in `plan.md@sri-v1` that branch. The tickets stay
authoritative. Archify renderings (interactive HTML, all four finalize gates
passed 2026-10-13):

- C1: `.archify/workflow-installer-rule-split-20261013-073628/installer-rule-split.html`
- C2: `.archify/workflow-record-gate-20261013-073628/record-gate.html`

The Mermaid below is the plain-text source of the same flows.

## C1 — installer rule split (ticket 02, `install.sh` / `install.ps1` step 4d)

```mermaid
flowchart TD
  start([For each rules/NAME.md in the repo]) --> marker{H1 ends with<br/>'— always on'?}
  marker -- yes --> linkAlways[Link into ~/.claude/rules/NAME.md<br/>loaded every turn]
  marker -- no --> linkRouted["Link into ~/.claude/engineos/rules/NAME.md<br/>not auto-loaded<br/>print 'rule linked (path-resolved): NAME'"]
  linkRouted --> stale{~/.claude/rules/NAME.md is a symlink<br/>into the repo's rules/?}
  stale -- yes --> unlink[Remove it<br/>print 'rule unlinked: NAME']
  stale -- "no, regular file" --> skip[Keep it<br/>print existing 'skip:' warning]
  stale -- "no, absent" --> done([Next rule])
  linkAlways --> done
  unlink --> done
  skip --> done
```

Agents, skills, commands and templates still name rules as `rules/NAME.md`.
On an installed machine, the sentence added to `CLAUDE.md` and `AGENTS.md`
resolves a routed or deprecated rule to `~/.claude/engineos/rules/NAME.md`.

## C2 — record gate (ticket 03, `record-verify` Stop hook)

Checks run top to bottom; the first that applies answers.

```mermaid
flowchart TD
  stop([Stop hook fires]) --> bypass{EngineOS bypass active?}
  bypass -- yes --> exitQuiet([Exit quietly])
  bypass -- no --> active{stop_hook_active?}
  active -- yes --> exitQuiet
  active -- no --> unrecorded{Unrecorded-change marker present?}
  unrecorded -- no --> exitQuiet
  unrecorded -- yes --> deferred{.deferred marker present?}
  deferred -- yes --> exitQuiet
  deferred -- no --> linked{"Active change record whose branch:<br/>equals git rev-parse --abbrev-ref HEAD?<br/>main included, decision O4"}
  linked -- yes --> report(["Message, no block:<br/>'change recorded, in progress: RECORD (branch NAME)'"])
  linked -- no --> block([Block with the existing<br/>record-change instruction])
```
