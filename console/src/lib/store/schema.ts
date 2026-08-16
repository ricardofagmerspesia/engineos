// Drizzle schema for the draft/snapshot/history store (frozen contract, change
// record `.engineos/changes/2026-08-15-admin-console-skills-vertical.md`).
// Column names are frozen as written there and mirrored verbatim in
// `migrations/0000_init.sql`, which is the authoritative DDL.

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One row per draft entity across ALL kinds. `kind` is a plain string (not a
// union) on purpose: this table is generic across future entity kinds
// (agents, models, mcp, routing, rules) by design — only 'skill' is populated
// this round, and adding a kind must never require a schema change here.
export const entities = sqliteTable('entities', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  sourcePathsJson: text('sourcePaths_json').notNull(),
  dataJson: text('data_json').notNull(),
  updatedAt: text('updatedAt').notNull(),
});

// Mirrors `entities` as of the last publish/rollback; refreshed wholesale per
// kind by `replaceSnapshot`, never edited row-by-row.
export const publishedSnapshot = sqliteTable('published_snapshot', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  dataJson: text('data_json').notNull(),
  publishedAt: text('publishedAt').notNull(),
});

// Append-only publish/rollback log, independent of `published_snapshot` so
// history survives even if a later publish overwrites the snapshot.
export const publishHistory = sqliteTable('publish_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  commitSha: text('commitSha').notNull(),
  createdAt: text('createdAt').notNull(),
  summary: text('summary').notNull(),
  diffJson: text('diff_json').notNull(),
});
