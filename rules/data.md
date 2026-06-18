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
- DO use parameterized queries / ORM bindings only — never string-concatenate SQL
  (see `security.md`).
- DO model state with explicit columns/enums, not overloaded nullable flags.
- DON'T fetch unbounded result sets — paginate, and bound `IN (...)` list sizes.
- DON'T introduce N+1 access; batch with bounded concurrency.

## Data lifecycle
- DO define retention and deletion for every data class; PII gets the shortest
  viable retention.
- DO keep seed/fixture data out of production migrations; seed via a separate,
  idempotent path.
- DON'T store secrets or PII unencrypted; never log row contents containing PII
  (see `security.md`).
