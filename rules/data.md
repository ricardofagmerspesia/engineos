# Data & Migrations Rules

Loaded for DBA / data-layer work. Owns migration safety and data lifecycle; the
general "push slow work to background, paginate" principles live in
`architecture.md`.

## Migrations
- DO make every migration backward-compatible with the currently-running code
  (expand-contract): add columns/tables nullable or with defaults first, backfill,
  switch reads/writes, then drop in a later deploy — never break old and new at once.
- DO ship a reversible down path, or document explicitly why a migration is
  irreversible and how to recover.
- DON'T run destructive DDL/DML (DROP, TRUNCATE, column drop, type narrowing)
  without a two-phase deploy and an explicit, confirmed instruction.
- DO avoid locking DDL on large tables: use concurrent index creation, batched
  backfills, and lock-timeout guards; know your engine's locking behavior.
- DO keep migrations forward-only in history (never edit a shipped migration; add
  a new one).

## Schema & access
- DO index for the actual access pattern, not speculatively; verify with the query
  plan, not intuition.
- Parameterized queries / ORM bindings only — `security.md` (always-on) owns this.
- DO model state with explicit columns/enums, not overloaded nullable flags.
- DO bound every `IN (...)` list size. (Pagination and the N+1/bounded-concurrency
  rules are owned by `architecture.md`, loaded alongside this file on the DBA row —
  this file adds only the SQL-specific bound.)

## Data lifecycle
- DO define retention and deletion for every data class; PII gets the shortest
  viable retention.
- DO keep seed/fixture data out of production migrations; seed via a separate,
  idempotent path.
- DON'T store secrets or PII unencrypted at rest — this file owns encryption-at-rest
  for stored data; keeping PII out of logs is `security.md`'s rule.
