-- GroveIQ D1 Schema
-- Cloudflare D1 (SQLite dialect)
-- Covers Phase 0 scope: core monitoring, AI insights, irrigation, camera/photo,
-- milestones, journal, chat, species reference, and forecast alerts.

-- ============================================================
-- CORE: Trees
-- ============================================================
CREATE TABLE IF NOT EXISTS trees (
  id TEXT PRIMARY KEY,               -- e.g. 'hemlock-01'
  name TEXT NOT NULL,                -- display name
  species TEXT NOT NULL,
  pot_size_liters REAL,
  origin_notes TEXT,
  soil_moisture_threshold_low REAL,  -- % below which alert fires
  soil_moisture_threshold_high REAL,
  ec_threshold_high REAL,
  dormancy_soil_temp_c REAL,         -- species-specific dormancy trigger
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CORE MONITORING (1.1)
-- ============================================================

-- Per-tree soil sensor readings (Ecowitt WH52 channels), 5-min polling
CREATE TABLE IF NOT EXISTS soil_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  ts TEXT NOT NULL,                  -- ISO timestamp
  soil_moisture_pct REAL,
  soil_temp_c REAL,
  soil_ec REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_soil_readings_tree_ts ON soil_readings(tree_id, ts);

-- Shared/location-wide conditions (not per-tree)
CREATE TABLE IF NOT EXISTS conditions_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  outdoor_temp_c REAL,
  humidity_pct REAL,
  wind_mph REAL,
  rain_in REAL,
  black_globe_temp_c REAL,
  pm25 REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conditions_readings_ts ON conditions_readings(ts);

-- Daily rollup archive (indefinite retention; raw tables above trimmed to 90 days)
CREATE TABLE IF NOT EXISTS daily_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  date TEXT NOT NULL,                -- YYYY-MM-DD
  soil_moisture_avg REAL,
  soil_moisture_min REAL,
  soil_moisture_max REAL,
  soil_temp_avg REAL,
  soil_ec_avg REAL,
  outdoor_temp_avg REAL,
  outdoor_temp_min REAL,
  humidity_avg REAL,
  wind_max REAL,
  rain_total REAL,
  black_globe_max REAL,
  pm25_avg REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tree_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_readings_tree_date ON daily_readings(tree_id, date);

-- ============================================================
-- AI INSIGHTS (1.2) / PHOTO ANALYSIS (1.7)
-- ============================================================
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  kind TEXT NOT NULL CHECK (kind IN ('sensor','vision','comparative','retrospective')),
  source TEXT CHECK (source IN ('manual','scheduled')),  -- photo-sourced analyses only
  status TEXT CHECK (status IN ('ok','watch','urgent')),
  summary TEXT,
  detail TEXT,
  model TEXT,                        -- e.g. 'claude-haiku-4-5', 'claude-sonnet-5'
  photo_r2_key TEXT,                 -- R2 object key, if vision-based
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_tree_ts ON analyses(tree_id, ts);

-- ============================================================
-- MILESTONES (1.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  date TEXT NOT NULL,
  label TEXT NOT NULL,               -- e.g. 'buds swelling', 'repotted'
  source TEXT NOT NULL CHECK (source IN ('manual','ai')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_tree_date ON milestones(tree_id, date);

-- ============================================================
-- FORECASTS (1.5, 1a)
-- ============================================================
CREATE TABLE IF NOT EXISTS forecasts (
  date TEXT PRIMARY KEY,             -- one row per day, cached NWS pull
  low_temp_f REAL,
  high_temp_f REAL,
  wind_gust_mph REAL,
  precip_chance_pct REAL,
  frost_risk INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forecast_alerts_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,          -- 'frost' | 'wind' | 'aqi'
  threshold_value REAL NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('watch','urgent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- JOURNAL (1.11)
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT REFERENCES trees(id),  -- nullable: collection-wide notes allowed
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  voice_transcript INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tree_date ON journal_entries(tree_id, date);

-- ============================================================
-- SENSEI CHAT (1.9)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT REFERENCES trees(id),  -- nullable: collection-wide chat
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tree_ts ON chat_messages(tree_id, ts);

-- ============================================================
-- SPECIES REFERENCE / PLANT WIKI (1.10)
-- ============================================================
CREATE TABLE IF NOT EXISTS species_reference (
  species TEXT PRIMARY KEY,
  light_needs TEXT,
  native_range TEXT,
  styling_notes TEXT,
  common_pests TEXT,
  pnw_notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TRAINING LOG (1.11)
-- ============================================================
CREATE TABLE IF NOT EXISTS training_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('wire','prune','repot','other')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_training_log_tree_date ON training_log(tree_id, date);

-- ============================================================
-- SMART IRRIGATION MODULE (1.12)
-- ============================================================
CREATE TABLE IF NOT EXISTS irrigation_zones (
  tree_id TEXT PRIMARY KEY REFERENCES trees(id),
  valve_channel INTEGER NOT NULL,     -- 1-5, maps to rotary switch position
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','scheduled','sensor','ai')),
  last_watered_at TEXT,
  last_duration_sec INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS irrigation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('manual','scheduled','sensor','ai')),
  requested_duration_sec INTEGER NOT NULL,
  actual_duration_sec INTEGER,
  flow_confirmed INTEGER,             -- boolean 0/1, null if unknown
  aborted_reason TEXT                 -- e.g. 'no_flow_detected', 'max_runtime_cutoff'
);
CREATE INDEX IF NOT EXISTS idx_irrigation_events_tree_ts ON irrigation_events(tree_id, ts);

-- ============================================================
-- SEED DATA (5 trees — placeholder, replace with real profiles)
-- ============================================================
INSERT OR IGNORE INTO trees (id, name, species, pot_size_liters) VALUES
  ('tree-1', 'Tree 1', 'TBD', NULL),
  ('tree-2', 'Tree 2', 'TBD', NULL),
  ('tree-3', 'Tree 3', 'TBD', NULL),
  ('tree-4', 'Tree 4', 'TBD', NULL),
  ('tree-5', 'Tree 5', 'TBD', NULL);
