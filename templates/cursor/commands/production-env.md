# /production-env — guarded PRODUCTION database session

Open a guarded session against a live production database using the project's
`./production.env`. Trailing text after the command is treated as an optional
alternate env path (first token) and/or an initial query/task.

You are entering **PRODUCTION DB mode**. You are connecting to a live production
database. Treat every action as high-risk and irreversible until proven
otherwise. Write your messages in normal, explicit prose in this mode.

## Safety contract (non-negotiable)

1. **Read-only by default.** `SELECT`, `EXPLAIN`, `SHOW`, `WITH ... SELECT`,
   describe/`\d`, and catalog introspection run freely.
2. **Guarded writes.** Before ANY statement that can mutate data or schema
   (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`,
   `CREATE`, `GRANT`, `REVOKE`, or a CTE/procedure that wraps one), you MUST:
   - Print the **exact** statement.
   - Print the target: `host=<DB_HOST> db=<DB_NAME> engine=<engine>` and the word
     **PRODUCTION**.
   - Ask the user to confirm with an explicit `yes`. No confirmation -> do not run.
   - When in doubt whether a statement writes, treat it as a write.
3. **Never reveal secrets.** Never print `DB_PASSWORD`, never echo the full
   connection string with the password, never pass the password as a visible
   shell argument. Use `PGPASSWORD`/stdin only.
4. **Refuse if the env file is tracked by git** (a tracked prod secret is a leak):
   ```bash
   git ls-files --error-unmatch ./production.env 2>/dev/null && echo TRACKED
   ```
   If it prints `TRACKED`, stop and tell the user to `git rm --cached production.env`,
   add `production.env` to `.gitignore`, and rotate the credentials.
5. **No bulk export / no dumping PII** to files or chat. Page results; cap row
   counts. PII never goes into logs or the transcript.

## Steps

1. **Locate + protect the env file.** Resolve the path (default `./production.env`).
   If missing, stop and tell the user to create it with `DB_HOST DB_PORT DB_USER
   DB_PASSWORD DB_NAME` (+ optional `DB_ENGINE=postgres|oracle`). Run the
   git-tracked check above; refuse if tracked. Confirm `production.env` is in
   `.gitignore` — if not, add it before proceeding.

2. **Load it without leaking.** Source it and confirm only non-secret fields:
   ```bash
   set -a; . ./production.env; set +a
   echo "host=$DB_HOST port=$DB_PORT db=$DB_NAME user=$DB_USER engine=${DB_ENGINE:-auto}"
   ```
   Never echo `$DB_PASSWORD`.

3. **Detect engine.** Use `DB_ENGINE` if set. Otherwise infer from `DB_PORT`
   (`5432`->postgres, `1521`->oracle). If still ambiguous, ask the user.

4. **Test the connection (read-only).**
   - Postgres — password via env, never argv:
     ```bash
     PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
       -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "SELECT current_database(), now();"
     ```
   - Oracle — password via stdin (`/nolog`), never argv:
     ```bash
     sqlplus -S /nolog <<EOF
     connect ${DB_USER}/${DB_PASSWORD}@//${DB_HOST}:${DB_PORT}/${DB_NAME}
     SELECT sys_context('USERENV','DB_NAME') FROM dual;
     EOF
     ```
   If the client binary is missing, tell the user to install `psql`
   (postgresql-client) or `sqlplus` (Oracle Instant Client) and stop.

5. **Run queries.** For reads, prefer a read-only transaction and a timeout:
   - Postgres: prepend `SET default_transaction_read_only = on; SET statement_timeout = '30s';`
   - Oracle: select-only; no `COMMIT`.
   Page large results (`LIMIT`/`FETCH FIRST n ROWS`). Report row counts, not dumps.

6. **Writes — only via the guarded path.** Follow safety contract item 2: show
   statement + PRODUCTION target, get explicit `yes`, then run inside an explicit
   transaction so it can roll back on error:
   - Postgres: `BEGIN; <stmt>;` -> show affected rows -> `COMMIT;` only when the
     count matches expectation; else `ROLLBACK;`.
   - Oracle: run, show `SQL%ROWCOUNT`, `COMMIT;` only on explicit go-ahead; else
     `ROLLBACK;`.
   For `DROP`/`TRUNCATE`/unfiltered `DELETE`/`UPDATE`, warn it is destructive and
   require the user to restate the intent before confirming.

## On exit

Production mode lasts for the session or until the user says to stop. The
`production.env` values remain loaded in the shell; clear them with
`unset DB_PASSWORD DB_HOST DB_PORT DB_USER DB_NAME`.
