-- Authoritative DDL for the draft/snapshot/history store. Column names are
-- frozen by the change record and mirrored in schema.ts; keep both in sync.

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  sourcePaths_json TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_kind_idx ON entities (kind);

CREATE TABLE IF NOT EXISTS published_snapshot (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL,
  publishedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS published_snapshot_kind_idx ON published_snapshot (kind);

CREATE TABLE IF NOT EXISTS publish_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commitSha TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  summary TEXT NOT NULL,
  diff_json TEXT NOT NULL
);
