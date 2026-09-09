// Idempotent SQLite migration runner + DB file creation, mirroring the
// tracking-table pattern this repo already uses for its Postgres store
// (`libs/core/src/db/migrate.ts` in the sibling web app): read ./migrations/*.sql
// in filename order, apply whatever `schema_migrations` hasn't recorded yet.
//
// Resolved from the module URL, not the working directory: `next dev`/`next build`
// and any future CLI invocation of this module may run from different cwds, and
// only the module's own location is stable across all of them.

import Database from 'better-sqlite3';
import { CONSOLE_ROOT } from '@/lib/config';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Built as `join(...)`, not `new URL('./migrations/', import.meta.url)`: webpack's
// production build statically intercepts that URL-asset form and tries to resolve
// the directory as a module, which fails ("Module not found: Can't resolve
// './migrations/'"). Plain path arithmetic on the already-resolved module dir
// isn't recognized as an asset reference, so it survives the build unchanged.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(MODULE_DIR, 'migrations');

// Gitignored on purpose (`.gitignore`): this is local draft state, never
// something to commit or share between operators.
//
// Anchored on `CONSOLE_ROOT` rather than on a second `process.cwd()` read:
// config.ts is the one module allowed to ask where the app is running from, and
// a module that reads cwd itself is a module the tests cannot point elsewhere.
export const DEFAULT_DB_PATH = join(CONSOLE_ROOT, '.data', 'console.sqlite');

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare<[], { filename: string }>('SELECT filename FROM schema_migrations').all().map((row) => row.filename),
  );

  const pending = listMigrationFiles().filter((file) => !applied.has(file));

  const applyOne = db.transaction((file: string) => {
    const statements = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(statements);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
  });

  for (const file of pending) {
    applyOne(file);
  }
}

/**
 * Opens (creating if needed) the console's SQLite file and brings it up to
 * date with every migration in `./migrations`. Safe to call more than once —
 * `schema_migrations` makes each migration file apply at most once.
 */
export function ensureDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
