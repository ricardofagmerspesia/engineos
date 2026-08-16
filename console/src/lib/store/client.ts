// Lazy database singleton (mirrors this repo's `getDb()` pattern in
// `libs/core/src/db/client.ts`): the connection is opened, and migrations run,
// on first use — never at module-import time — so importing this module never
// has a side effect on its own.
//
// Public surface is intentionally narrow: the typed CRUD helpers below (both
// as free functions and bundled on `getStore()`) are the only way callers
// touch the store. Nothing else from this module (or from
// `schema.ts`/`migrate.ts`) is meant to leak past this file.
//
// FROZEN CONTRACT (`.engineos/changes/2026-08-15-admin-console-skills-vertical.md`):
// "entities... data_json holds the full typed entity (kind='skill' only
// populated this round, but the column is generic across kinds by design)."
// That sentence is the authoritative shape: `data_json` round-trips the WHOLE
// entity (e.g. a complete `SkillEntity`), not a kind-specific slice of it.
// The `entities`/`published_snapshot` columns besides `data_json` are a
// denormalized projection of the same object, kept for `kind`-scoped
// filtering without parsing every JSON blob.
//
// Generic (`<T extends BaseEntityLike>`) rather than importing `SkillEntity`
// from `entities/types.ts` — this store must stay generic across future
// entity kinds (agents, models, mcp, routing, rules), so it only ever depends
// on the common `BaseEntity` fields, never a kind-specific one.

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { desc, eq } from 'drizzle-orm';
import { ensureDatabase } from './migrate';
import { entities, publishHistory, publishedSnapshot } from './schema';

export type EntityStatus = 'active' | 'draft-only' | 'disabled' | 'error';

/** Structural floor every stored entity must satisfy, regardless of kind. */
export interface BaseEntityLike {
  id: string;
  kind: string;
  name: string;
  status: EntityStatus;
  sourcePaths: string[];
  updatedAt: string; // ISO
}

export interface PublishHistoryRecord {
  id: number;
  commitSha: string;
  createdAt: string; // ISO
  summary: string;
  diff: unknown;
}

export type NewPublishHistoryRecord = Omit<PublishHistoryRecord, 'id' | 'createdAt'> & {
  createdAt?: string;
};

export interface Store {
  listEntities<T extends BaseEntityLike = BaseEntityLike>(kind: string): T[];
  getEntity<T extends BaseEntityLike = BaseEntityLike>(id: string): T | undefined;
  upsertEntity<T extends BaseEntityLike>(entity: T): T;
  getSnapshot<T extends BaseEntityLike = BaseEntityLike>(kind: string): T[];
  replaceSnapshot<T extends BaseEntityLike>(kind: string, entities: T[]): void;
  appendHistory(row: NewPublishHistoryRecord): PublishHistoryRecord;
  listHistory(): PublishHistoryRecord[];
}

type Db = ReturnType<typeof drizzle>;

let db: Db | null = null;

/** Opens the SQLite file and runs pending migrations on first call. */
function getDb(): Db {
  if (db) {
    return db;
  }

  const sqlite = ensureDatabase();
  db = drizzle(sqlite);
  return db;
}

function toPublishHistoryRecord(row: typeof publishHistory.$inferSelect): PublishHistoryRecord {
  return {
    id: row.id,
    commitSha: row.commitSha,
    createdAt: row.createdAt,
    summary: row.summary,
    diff: JSON.parse(row.diffJson) as unknown,
  };
}

export function listEntities<T extends BaseEntityLike = BaseEntityLike>(kind: string): T[] {
  return getDb()
    .select({ dataJson: entities.dataJson })
    .from(entities)
    .where(eq(entities.kind, kind))
    .all()
    .map((row) => JSON.parse(row.dataJson) as T);
}

export function getEntity<T extends BaseEntityLike = BaseEntityLike>(id: string): T | undefined {
  const row = getDb().select({ dataJson: entities.dataJson }).from(entities).where(eq(entities.id, id)).get();
  return row ? (JSON.parse(row.dataJson) as T) : undefined;
}

export function upsertEntity<T extends BaseEntityLike>(entity: T): T {
  const row = {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    status: entity.status,
    sourcePathsJson: JSON.stringify(entity.sourcePaths),
    dataJson: JSON.stringify(entity),
    updatedAt: entity.updatedAt,
  };

  getDb()
    .insert(entities)
    .values(row)
    .onConflictDoUpdate({
      target: entities.id,
      set: {
        kind: row.kind,
        name: row.name,
        status: row.status,
        sourcePathsJson: row.sourcePathsJson,
        dataJson: row.dataJson,
        updatedAt: row.updatedAt,
      },
    })
    .run();

  return entity;
}

export function getSnapshot<T extends BaseEntityLike = BaseEntityLike>(kind: string): T[] {
  return getDb()
    .select({ dataJson: publishedSnapshot.dataJson })
    .from(publishedSnapshot)
    .where(eq(publishedSnapshot.kind, kind))
    .all()
    .map((row) => JSON.parse(row.dataJson) as T);
}

export function replaceSnapshot<T extends BaseEntityLike>(kind: string, snapshotEntities: T[]): void {
  const publishedAt = new Date().toISOString();
  const database = getDb();

  database.transaction((tx) => {
    tx.delete(publishedSnapshot).where(eq(publishedSnapshot.kind, kind)).run();

    for (const entity of snapshotEntities) {
      tx.insert(publishedSnapshot)
        .values({
          id: entity.id,
          kind,
          dataJson: JSON.stringify(entity),
          publishedAt,
        })
        .run();
    }
  });
}

export function appendHistory(row: NewPublishHistoryRecord): PublishHistoryRecord {
  const createdAt = row.createdAt ?? new Date().toISOString();

  const inserted = getDb()
    .insert(publishHistory)
    .values({
      commitSha: row.commitSha,
      createdAt,
      summary: row.summary,
      diffJson: JSON.stringify(row.diff),
    })
    .returning()
    .get();

  return toPublishHistoryRecord(inserted);
}

export function listHistory(): PublishHistoryRecord[] {
  return getDb().select().from(publishHistory).orderBy(desc(publishHistory.id)).all().map(toPublishHistoryRecord);
}

let store: Store | null = null;

/**
 * Returns the process-wide store singleton. Bundles the same functions
 * exported individually above, for callers that prefer one injected object
 * over separate named imports.
 */
export function getStore(): Store {
  if (store) {
    return store;
  }

  store = {
    listEntities,
    getEntity,
    upsertEntity,
    getSnapshot,
    replaceSnapshot,
    appendHistory,
    listHistory,
  };
  return store;
}
