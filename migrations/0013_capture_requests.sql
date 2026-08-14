-- Migration 0013: capture_requests -- lets the app queue an on-demand
-- camera capture (a "Capture now" button) for the local capture script to
-- pick up, mirroring irrigation_events' command-queue pattern. The Worker
-- can't reach the camera or the script directly (no public IP on the home
-- network), so the script polls this queue instead of being pushed to.

CREATE TABLE IF NOT EXISTS capture_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')) DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  analysis_id INTEGER REFERENCES analyses(id),
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_capture_requests_tree_requested ON capture_requests(tree_id, requested_at);
