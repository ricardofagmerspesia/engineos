import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export class DecisionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}
export function openDecisionDatabase(path: string, migrationPath: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  db.transaction(() => {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
    if (!db.prepare('SELECT filename FROM schema_migrations WHERE filename=?').get('0001_decisions.sql')) {
      db.exec(readFileSync(migrationPath, 'utf8'));
      db.prepare('INSERT INTO schema_migrations(filename) VALUES(?)').run('0001_decisions.sql');
    }
  }).immediate();
  return db;
}
export function decode<T>(value: string): T { return JSON.parse(value); }
export function audit(db: Database.Database, tenant: string, decision: string, actor: string, event: string, data: Record<string, unknown>): void {
  db.prepare('INSERT INTO decision_audit(decision_id,tenant_id,event,actor_id,created_at,data_json) VALUES(?,?,?,?,?,?)').run(decision, tenant, event, actor, new Date().toISOString(), JSON.stringify(data));
}
export const newId = (): string => randomUUID();
