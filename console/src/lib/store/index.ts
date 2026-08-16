// Public surface of the store module. Callers import from `@/lib/store`, never
// reach into `client.ts`/`schema.ts`/`migrate.ts` directly (rules/architecture.md:
// "give each module one public surface; internals stay private").
//
// Both forms are exported: named functions and `getStore()` (a bundled
// singleton, per this unit's brief) — same implementation underneath, so
// there's exactly one code path to keep correct.

export {
  appendHistory,
  getEntity,
  getSnapshot,
  getStore,
  listEntities,
  listHistory,
  replaceSnapshot,
  upsertEntity,
} from './client';
export type {
  BaseEntityLike,
  EntityStatus,
  NewPublishHistoryRecord,
  PublishHistoryRecord,
  Store,
} from './client';
