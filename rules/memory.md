# Memory & Knowledge Conventions — always on

Where knowledge lives. One home per fact — duplication drifts.

| Knowledge | Home | Changed via |
|---|---|---|
| Team engineering standards (how we build) | EngineOS `rules/` | PR to engineos repo |
| Team procedures (how to do X) | EngineOS `skills/` | PR to engineos repo |
| Architectural decisions + why | Project `docs/adr/` | PR + `adr` skill |
| Project facts: stack, commands, domain glossary, convention deltas | Project `CLAUDE.md` | PR to project |
| Feature requirements/specs | Project `docs/specs/` (or tracker) | Spec workflow |
| Product requirements (what/why) | Project `docs/prds/` | PRD template |
| Project rule deltas (longer-form) | Project `docs/rules/` | PR to project |
| Change records (what was made, per unit of work) | Project `.engineos/changes/` → `.engineos/archived/` when closed | `record-change` skill |
| Audit reports (system health findings) | Project `.engineos/audits/` | `/engineos:audit` |
| Strategy analyses (market, career, positioning) | Project `docs/strategy/` | `strategy` skill |
| Release notes | Project `docs/release-notes/` | `release-notes` skill |
| Personal preferences (style, tools, workflow) | Your `~/.claude/CLAUDE.md` + Claude memory | Yours alone |
| Session-only context | Nowhere — let it die with the session | — |

## Placement & promotion

- DO promote: a personal note you've repeated to Claude 3 times → project CLAUDE.md; a project convention a second project adopts → EngineOS rules.
- DO record decisions when made (`adr` skill), not when someone asks "why" six months later.
- DON'T put team standards in personal memory — invisible to the team, dies with your machine.
- DON'T put volatile facts (current sprint, WIP state) in any CLAUDE.md — they rot. Tracker or session only.
- DON'T duplicate EngineOS rules into project CLAUDE.md — project files hold ONLY deltas (see `templates/project-claude.md`).
- Claude memory (`~/.claude/.../memory/`): personal recall only — your preferences, your context. Never the team's source of truth.
