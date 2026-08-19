-- Migration 0015: audit-grade fields for AI diagnoses, plus dedup support.
--
-- The daily per-tree diagnostic (src/dailyDiagnostic.ts, shipped 2026-08-18)
-- hands Claude near-raw numbers and persists only status/summary/detail --
-- no record of what evidence was actually shown, no way to tell a
-- provisional/cheap model call from a considered one, and nothing stops a
-- cron retry (or the /api/debug/diagnostic route) from inserting a second
-- near-duplicate row for the same tree on the same day. This closes both
-- gaps: evidence_json/output_json/provider/model_version/prompt_version
-- make a diagnosis reproducible and auditable; input_hash + the unique
-- index let application code treat "already diagnosed with this evidence
-- today" as a clean no-op instead of a duplicate row.
--
-- All columns nullable, no backfill -- historical analyses rows (and
-- kind='vision'/'comparative'/'retrospective' rows going forward) simply
-- leave these NULL, matching the no-backfill convention already used in
-- e.g. 0007_alerts_source.sql and 0014_regional_air_quality_forecast_date.sql.

ALTER TABLE analyses ADD COLUMN provider TEXT;
ALTER TABLE analyses ADD COLUMN model_version TEXT;
ALTER TABLE analyses ADD COLUMN prompt_version TEXT;
ALTER TABLE analyses ADD COLUMN input_hash TEXT;
ALTER TABLE analyses ADD COLUMN evidence_json TEXT;
ALTER TABLE analyses ADD COLUMN output_json TEXT;
ALTER TABLE analyses ADD COLUMN confidence TEXT CHECK (confidence IN ('low','medium','high') OR confidence IS NULL);
ALTER TABLE analyses ADD COLUMN data_start_ts TEXT;
ALTER TABLE analyses ADD COLUMN data_end_ts TEXT;

-- SQLite treats each NULL as distinct for uniqueness, so this is a no-op
-- for every existing row and for any future non-'sensor' row (all of which
-- leave input_hash NULL) -- safe to add without touching existing data.
-- Application code does a SELECT-before-insert for clear "already
-- diagnosed" logging; this index is the backstop against a race between
-- the cron and the debug route, not the primary dedup mechanism.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_tree_input_hash ON analyses(tree_id, input_hash);
