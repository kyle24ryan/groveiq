-- Migration 0006: current-condition weather alerts, edge-triggered.
--
-- Not the forecast-based "frost tonight / wind gusts >25mph" alerts SPEC.md
-- 1.5 describes (those need NWS integration, not built yet) - this covers
-- what's evaluable from the live Ecowitt feed right now: sustained wind,
-- WBGT heat stress, and AQI. forecast_alerts_config already existed in the
-- schema for thresholds; this table tracks trigger/resolve state so alerts
-- only fire on transition, not every 5-minute poll.

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,          -- 'wind' | 'heat' | 'aqi'
  tier TEXT NOT NULL CHECK (tier IN ('watch','urgent')),
  message TEXT NOT NULL,
  reading_value REAL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(alert_type, resolved_at);
