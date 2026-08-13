-- Migration 0008: AirNow regional AQI (key-gated, no-ops without
-- AIRNOW_API_KEY configured, same pattern as Ecowitt's optional secrets).
-- Corroborates the local Ecowitt PM2.5 sensor with a regional reading,
-- most useful during PNW wildfire smoke season per SPEC.md 1a.

CREATE TABLE IF NOT EXISTS regional_air_quality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  airnow_aqi REAL,
  airnow_category TEXT,
  reporting_area TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regional_air_quality_ts ON regional_air_quality(ts);
