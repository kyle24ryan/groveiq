-- Migration 0011: simple key-value settings table for the "Profile &
-- grove" fields in Settings, which were previously hardcoded in the
-- frontend with no way to persist an edit.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('collection_name', 'Grove Collection'),
  ('owner_name', 'Kyle Ryan'),
  ('location', 'North Bend, WA'),
  ('hardiness_zone', 'USDA 8b');
