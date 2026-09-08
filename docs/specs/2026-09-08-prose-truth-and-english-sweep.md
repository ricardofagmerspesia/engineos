# Prose truth sweep and English-only sweep (audit U9 + U10)

**Date:** 2026-09-08
**Status:** approved (owner picked U9/U10 after U11; audit `.engineos/audits/2026-09-08-all.md` lines 16, 53-62, 99-100; owner decisions in-session: re-enable `skills/strategy`; translate the four 2026-09-07 change records, the four 2026-09-07 ADRs, `docs/plan/2.0/*` and `docs/strategy/*` as well)
**Risk:** low — prose and comments; the only behaviour changes are two new validator checks (C36, C37) and `skills/strategy` going back to `enabled: true`. All reversible by revert.
**Autonomy:** A2.

## Problem

Prose states facts nothing checks, and several are false:

- "62-check validator" / "62 checks" at `CLAUDE.md:172`, `AGENTS.md:181`, `README.md:183`,
  `docs/CODEBASE_MAP.md:16,205,317`, `src/validate/cli.test.ts:10`. Real: 66 ids, 108 results.
- "nine Claude Code hooks" at `CLAUDE.md:171`, `AGENTS.md:180`. `hooks/hooks.json` registers
  eight; `post-edit-check` is built and deliberately unregistered.
- `/analisy-architecture` and `patterns/1-Analisys` at `CLAUDE.md:90`, `AGENTS.md:99`; the files
  are `commands/analyze-architecture.md` and `patterns/1-Analysis.md`. The rename (d39a498) has no
  `docs/COMPATIBILITY.md` entry (non-negotiable #11). No check resolves router-table `/command`
  references.
- `CLAUDE.md:106` says the router runs `route-escalate` and `risk` first; `agents/router.md` runs
  `resolve`; `commands/route.md:40` builds the `resolve --facts` payload with `jq -nc` while
  `README.md:23` promises no jq.
- `AGENTS.md` (the Codex copy of `CLAUDE.md`) still carries the jq-era hooks paragraph
  (`gate-advisor.sh`, `route-advisor.sh`, `task-scale-advisor.sh`), a dead `hooks/routing-map.sh`
  mention, and a router-table row `CLAUDE.md` dropped ("Coordinated multi-domain change").
- `templates/adapters/claude-code.md:26-40` lists `post-edit-check.sh` as enforced and requires jq;
  `templates/adapters/README.md:22` same row.
- `docs/CODEBASE_MAP.md:103,235,348` say the console is not in CI; `.github/workflows/ci.yml` has
  had a `console` job since E03. `:344` documents the `/analisy-architecture` typo as a gotcha.
  The families table (`:207-218`) stops at C30.
- `skills/strategy/SKILL.md:4` `enabled: false` (left behind by the console's first
  "publish config changes" demo) while `CLAUDE.md:101`, `README.md:83`, `registries/intents.json:289`
  advertise it live.

Portuguese in a repository whose rules say English only (`rules/base.md`): `.github/workflows/ci.yml`
comments (lines 118-121, 153-155, 181-182), `docs/CAPABILITIES.md` (whole file),
`docs/COMPATIBILITY.md:111-209` (two sections), `docs/PRD.md:3-11` (warning block), the four
`.engineos/changes/2026-09-07-*.md` records, the four `docs/adr/2026-09-07-*.md` ADRs,
`docs/plan/2.0/*.md` (six files), `docs/strategy/*.md` (five files).

## Decision

Six disjoint units in one wave on one branch; at the barrier each unit becomes its own commit,
cherry-picked onto its own branch off `main`, one PR each, all independent (no stack — today's
out-of-order stack merges stranded two PRs). Translation PRs exceed the 400-line guideline by
construction and say so.

Counts stay in the prose and a check keeps them honest (C37), rather than deleting every count: a
reader is better served by "68 checks" that CI proves than by "some checks". Hook counts are the
exception — they are spelled as words in prose and the registered set is the truth, so the prose
names the registry (`hooks/hooks.json`) and drops the number.

Rejected: regenerating `AGENTS.md` from `CLAUDE.md` by script. The Codex copy deliberately differs
(extended always-on imports, `~/.Codex/AGENTS.md`, "Codex environment", "(always-on)" where
`CLAUDE.md` says "from the task contract") because Codex has no prompt advisor; a generator would
need a substitution table nobody asked for. This unit syncs the drifted paragraphs by hand and
records the intended deltas in `templates/adapters/codex.md` so the next sync knows what to keep.

File names stay (`01-decomposicao-epicos.md` etc.): other documents link to them and a rename is a
separate decision. Translation changes language only — no claim, number, date or code block is
corrected while translating; a stale claim in Portuguese becomes the same stale claim in English.
`docs/CAPABILITIES.md` is a dated 2026-09-07 baseline and keeps that framing.

## Frozen contracts

### Glossary (every translation unit)

| Portuguese | English |
|---|---|
| "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, rev. 2) | "EngineOS 2.0 — Production readiness plan" (2026-09-06, rev. 2) |
| épico | epic |
| matriz de capacidades e evidência | capability and evidence matrix |
| Disponível / Parcial / Desenho / Ausente | Available / Partial / Design only / Absent |
| fim de linha | end of line (EOL) |
| bit de execução | execute bit |
| empacotador / empacotamento | packager / packaging |
| espelho (adaptador) | mirror (adapter) |
| hipótese (as the analyst's label) | keep `hipótese` only where it is the quoted label in `agents/architecture-analyst.md`; those files are out of scope |
| dates `DD/MM/YYYY` | ISO `YYYY-MM-DD` |

Keep verbatim: frontmatter keys and their non-prose values (`name`, `status`, `owner`, `domain`,
`date`, `completed`), code blocks and inline code, file paths, identifiers, check ids, commit
hashes, URLs, table structure, mermaid diagrams (translate label text inside quotes only),
numbers. Translate headings, prose, table cells, list items, the `spec:` free text after `n/a —`,
and `Source:` lines. British/American spelling: American. No emojis added.

### Unit A — prose truth + checks (`devops-coordinator`, model opus, tests IN scope for C36/C37)

Scope: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md`, `docs/COMPATIBILITY.md`
(Unreleased rows only — lines 111-209 belong to Unit B), `commands/route.md`,
`templates/adapters/claude-code.md`, `templates/adapters/README.md`, `templates/adapters/codex.md`,
`skills/strategy/SKILL.md` (frontmatter `enabled` only), `src/checks/prose-truth.ts` (new) +
`prose-truth.test.ts` (new), `src/checks/ids.ts`, `src/checks/index.ts`, `src/checks/findings.test.ts`,
`src/validate/cli.test.ts`, `src/validate/validate.e2e.test.ts`, `dist/engineos.cjs` (rebuilt),
`.trae/skills/strategy/SKILL.md` and `.windsurf/skills/strategy/SKILL.md` and
`.agents/skills/strategy/SKILL.md` if C32 mirrors `skills/` there (check `src/checks/portability.ts`
for what C32 compares; sync only what it compares).

Prose fixes:
- `CLAUDE.md:171-172` → "…executed by a deterministic TypeScript kernel and the Claude Code hooks
  registered in `hooks/hooks.json`, bundled into `dist/engineos.cjs`, and kept coherent by a
  68-check validator." Same sentence in `AGENTS.md:180-181` (Codex copy keeps "Claude Code hooks";
  Codex does not run them, the sentence describes the repo).
- `CLAUDE.md:90` and `AGENTS.md:99`: `/analyze-architecture`, `patterns/1-Analysis.md`.
- `CLAUDE.md:106` and the same row in `AGENTS.md`: "`router` agent runs one
  `scripts/kernel.sh resolve` call FIRST, then reasons only about the residue".
- `AGENTS.md`: replace the jq-era hooks bullet with: "**Hooks do not run under Codex.** The
  `[router] …` context, the edit-time route and both Stop gates are model discipline here — see
  `templates/adapters/codex.md`. In Claude Code they need node >= 18 and are registered in
  `hooks/hooks.json`." Drop the `hooks/routing-map.sh` sentence. Drop the "Coordinated multi-domain
  change" row (C16 counts `CLAUDE.md` rows; the Codex copy must not carry a row `CLAUDE.md` lacks).
  Keep every deliberate Codex delta listed under Decision.
- `templates/adapters/codex.md`: add a short section "## The AGENTS.md copy" listing the deliberate
  deltas from `CLAUDE.md` (the four bullets under Decision) so a future sync preserves them.
- `README.md:183` → `# 68 self-integrity Checks`.
- `commands/route.md:40`: replace the `jq -nc` line with
  `"$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts "$(node -e 'process.stdout.write(JSON.stringify({ prompt: process.argv[1], escalate: true }))' -- "$ARGUMENTS")"`
  and rewrite the following paragraph: node builds the payload (node >= 18 is already the runtime
  the kernel needs) so quotes and newlines are escaped; nothing else in the file changes.
- `templates/adapters/claude-code.md`: drop the `post-edit-check.sh` row; replace the jq paragraph
  with "All of it needs node >= 18. Under an older node the four routing/record hooks exit 0
  silently and the rest print a `[engineos] <hook> skipped` message — `CLAUDE.md` names which";
  bootstrap step 2 → "Confirm `node --version` is 18 or newer." `templates/adapters/README.md:22`
  Claude Code cell → "`post-edit-check.sh` (opt-in, unregistered by default)".
- `docs/CODEBASE_MAP.md`: `:16` "(68 checks)"; `:103` "(skills vertical only; CI job `console`)";
  `:205` "the 68-check integrity harness"; `:235` "Not referenced by root `package.json`; CI runs
  typecheck, lint, tests and build in the `console` job."; `:317` "68 checks over …"; delete the
  gotcha at `:344`; `:348` → "`console/` is not part of the root build; only its Skills vertical
  exists." Families table: add rows `| portability | C32-C33 | adapter-mirror parity, LF policy |`,
  `| skill enablement | C34-C35 | skills/skills_suppressed pair on every kernel answer, no routing domain emptied by disablement |`,
  `| prose truth | C36-C37 | router-table /command and patterns/ references resolve; check-count claims equal CHECK_IDS.length |`.
  Update the `last_mapped` timestamp to now (`date -u +%Y-%m-%dT%H:%M:%SZ`).
- `src/validate/cli.test.ts:10` → "for the declared Checks".
- `skills/strategy/SKILL.md:4` → `enabled: true`. Then confirm `bash scripts/kernel.sh skill-state`
  reports it enabled and C35 still passes.
- `docs/COMPATIBILITY.md` Unreleased, three rows appended after the console rows: (1) C36 and C37
  added — "a `/command` or `patterns/` reference in the CLAUDE.md or AGENTS.md router table that
  resolves to no file, or a check-count literal in CLAUDE.md, AGENTS.md, README.md or
  docs/CODEBASE_MAP.md that differs from the registered count, now fails `validate` (MINOR: new
  failing check)" kind `added`; (2) `/analisy-architecture` → `/analyze-architecture` and
  `patterns/1-Analisys` → `patterns/1-Analysis.md`, renamed in d39a498 (1.7.0) and recorded here
  late; `install.sh` prunes the dangling symlink; kind `renamed`; (3) `skills/strategy` is
  `enabled: true` again — it was disabled by the console's first publish demo, not by decision;
  kernel answers that cite it stop listing it under `skills_suppressed`; kind `restored`.

Checks (family `prose-truth`, ids `C36`, `C37`, appended to `CHECK_IDS` after `C35`; follow
`src/checks/portability.ts` for the shape: `*_FINDINGS` consts, `declare module './codes'`,
`*_CHECKS` export, titles, `skipPending` where a file is unreadable):
- C36 `router-table command and pattern references resolve`: for each of `CLAUDE.md` and
  `AGENTS.md`, every backticked token matching `/^\/(?:engineos:)?([a-z][a-z0-9-]*)$/` in the
  router table must resolve to `commands/<name>.md`; every backticked `patterns/<x>` token must
  resolve to `patterns/<x>` or `patterns/<x>.md`. Findings: `command-missing` (subject
  `<file>:<token>`), `pattern-missing`. Zero references is a `fail` with `no-references` — the
  table always has some.
- C37 `check-count claims equal the registered count`: in `CLAUDE.md`, `AGENTS.md`, `README.md`,
  `docs/CODEBASE_MAP.md`, every match of `/\b(\d+)[- ](?:self-integrity )?[Cc]hecks?\b/g` must
  equal `CHECK_IDS.length`. Finding `count-drift` with subject `<file>:<n>`. Zero matches is ok
  (a file may carry no count). Verify on the real tree after the prose edits that no unrelated
  "N checks" phrase trips it; if one does, reword that phrase, do not widen the regex.
- Tests: `prose-truth.test.ts` on a checkout copy (`checkoutCopy`, `editFile` from
  `./testing`): clean tree → both ok; a router row pointing at `/no-such-command` → C36
  `command-missing`; a `patterns/9-Nothing` token → `pattern-missing`; README with "12 checks" →
  C37 `count-drift`; every declared code produced at least once (the `produced` set pattern).
- Count literals: `findings.test.ts` 66 → 68; `validate.e2e.test.ts` 66 → 68 and "C37 last";
  `cli.test.ts` NATURAL_ORDER `+ 'C36', 'C37'`; `ids.ts` header comment mentions C36-C37.
- `npm run build` after the source changes so `dist/engineos.cjs` matches (CI drift guard).
  Scoped verification for this unit: `npm run typecheck`, `node dist/engineos.cjs validate`,
  `node --test build/checks/prose-truth.test.js` after `npx tsc -p tsconfig.json` (read
  `package.json` for the exact test build command). Do not run the full `npm test`.

### Unit B — misc + records (`docs-writer`, model opus, no tests)

Scope: `.github/workflows/ci.yml` (comment lines only: 118-121, 153-155, 181-182 — no YAML
key, value or step changes), `docs/CAPABILITIES.md` (whole file), `docs/COMPATIBILITY.md` lines
111-209 only (the sections "What `enabled: false` does and does not do" and "Supported platforms
and prerequisites" with its three `###`), `docs/PRD.md` lines 3-11 only, the four
`docs/adr/2026-09-07-*.md`, the four `.engineos/changes/2026-09-07-*.md`.

- ADR titles are translated (the `#` line); file names stay. `Source:` lines follow the glossary.
- Records: frontmatter `status`, `name`, `owner`, `domain` verbatim; `spec:` free text translated.
  Checklist boxes keep their state. Section headings follow `.engineos/changes/_template.md`
  headings where the Portuguese heading is a translation of one (`## What`, `## Why`, `## Scope`,
  `## Checklist`, `## What was made`, `## Verification`, `## Changes registered`); other headings
  translate literally.
- `docs/CAPABILITIES.md` header keeps "Status: baseline measured 2026-09-07 · Snapshot: `99b5eec`".

### Unit C — plan part 1 (`docs-writer`, model opus, no tests)

Scope: `docs/plan/2.0/README.md`, `docs/plan/2.0/01-decomposicao-epicos.md`,
`docs/plan/2.0/02-sequenciamento.md`. Content only; file names stay; internal links to sibling
files keep the existing file names.

### Unit D — plan part 2 (`docs-writer`, model opus, no tests)

Scope: `docs/plan/2.0/03-templates-evidencia.md`, `docs/plan/2.0/04-riscos-governanca.md`,
`docs/plan/2.0/05-arquitetura-contratos.md`. Same rules as Unit C.

### Unit E — strategy part 1 (`docs-writer`, model opus, no tests)

Scope: `docs/strategy/2026-07-30-grounding-brief.md`, `docs/strategy/2026-07-30-decision-engineos.md`,
`docs/strategy/2026-07-30-opportunity-engineos.md`. Frontmatter values other than free text stay;
source citations (URLs, dates, titles of external sources) stay verbatim; quoted external text
stays in its original language inside quotes.

### Unit F — strategy part 2 (`docs-writer`, model opus, no tests)

Scope: `docs/strategy/2026-07-30-positioning-engineos.md`,
`docs/strategy/2026-07-30-monetization-engineos.md`. Same rules as Unit E.

## Out of scope

`agents/architecture-analyst.md`, `commands/*.md` "hipótese" label (a deliberate quoted label);
`docs/COMPATIBILITY.md:449,517` (dated 1.7.0 history — true when written); `docs/PRD.md` body
(English already; a June draft the PRD owner rewrites); `.engineos/archived/**`;
`docs/release-notes/**`; `docs/BIG-PICTURE.md`, `docs/START.md` (English; the accent scan hit
typography only); U7 kernel loaders, U8 CI hygiene.

## Verification

Orchestrator, once per PR branch after the split. Unit A branch: `npm run build` (then
`git status` shows no further dist change), `npm run typecheck`, `node dist/engineos.cjs validate`,
`npm test`. Every translation branch: `node dist/engineos.cjs validate`, `git diff --check`, and
an accent scan (`git grep -nIP '[ãõçáéíóúâêôÃÕÇÁÉÍÓÚÂÊÔ]' -- <unit files>`) that returns only
quoted external text, proper nouns or the deliberate `hipótese` label. Agents verify scoped and
never run the gate.
