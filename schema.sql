-- GroveIQ D1 Schema
-- Cloudflare D1 (SQLite dialect)
-- Covers Phase 0 scope: core monitoring, AI insights, irrigation, camera/photo,
-- milestones, journal, chat, species reference, and forecast alerts.

-- ============================================================
-- CORE: Trees
-- ============================================================
CREATE TABLE IF NOT EXISTS trees (
  id TEXT PRIMARY KEY,               -- e.g. 'mountain-hemlock'
  name TEXT NOT NULL,                -- display name
  nickname TEXT,
  species TEXT NOT NULL,             -- joins to species_reference(species)
  pot_size_liters REAL,
  origin_notes TEXT,
  origin_type TEXT,                  -- 'yamadori' | 'nursery' | 'cutting' | 'other'
  acquired_date TEXT,                -- free text; precision varies ("summer 2026")
  estimated_age_years_low INTEGER,
  estimated_age_years_high INTEGER,
  development_stage TEXT,            -- 'recovery' | 'development' | 'styling' | 'refinement'
  notes TEXT,
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
  wind_dir_deg REAL,
  rain_in REAL,
  pressure_hpa REAL,
  solar_wm2 REAL,
  uvi REAL,
  black_globe_temp_c REAL,
  wbgt_c REAL,
  pm25 REAL,
  pm25_aqi REAL,
  pm25_aqi_24h REAL,
  battery_sensor_array_code REAL,
  battery_pm25_ch1_code REAL,
  battery_bgt_voltage_v REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conditions_readings_ts ON conditions_readings(ts);

-- Daily rollup archive (indefinite retention). Note: the raw tables above
-- (soil_readings, conditions_readings) are also kept indefinitely -- no
-- trim/cleanup job exists or is planned (2026-08-19: confirmed as an
-- explicit user preference, "keep data as long as possible"). Anything
-- that queries a bounded recent window (e.g. the daily diagnostic's
-- RAW_SOIL_WINDOW_HOURS in src/dailyDiagnostic.ts) is a query-time choice
-- for relevance/cost, not a reflection of what's actually retained.
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
  model TEXT,                        -- e.g. 'claude-haiku-4-5', 'claude-sonnet-5' (requested model string)
  photo_r2_key TEXT,                 -- R2 object key, if vision-based
  -- Audit/reproducibility fields (migration 0015). Nullable, no backfill --
  -- populated going forward by the sensor diagnostic path; other `kind`s
  -- may adopt them later.
  provider TEXT,                     -- e.g. 'anthropic'
  model_version TEXT,                -- resolved model string from the API response, distinct from `model` above
  prompt_version TEXT,               -- hand-bumped tag for the prompt template used, e.g. 'sensor-v1'
  input_hash TEXT,                   -- sha256(tree_id + grove-local date + evidence), truncated; dedup key
  evidence_json TEXT,                -- exact deterministic evidence object shown to the model
  output_json TEXT,                  -- raw parsed model response
  confidence TEXT CHECK (confidence IN ('low','medium','high') OR confidence IS NULL),
  data_start_ts TEXT,                -- bounds of the evidence window considered
  data_end_ts TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_tree_ts ON analyses(tree_id, ts);
-- NULL input_hash (every row except deduped 'sensor' diagnoses) is treated
-- as distinct per SQLite's uniqueness rules, so this is a no-op elsewhere.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_tree_input_hash ON analyses(tree_id, input_hash);

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

-- Current-condition alerts (edge-triggered), evaluated from the live
-- Ecowitt feed each poll. Not the NWS-forecast-based frost/wind alerts
-- SPEC.md 1.5 describes -- see migrations/0006 for the distinction.
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,          -- 'wind' | 'heat' | 'aqi' | 'frost' | 'wind_gust_forecast'
  source TEXT NOT NULL DEFAULT 'current', -- 'current' (5-min Ecowitt poll) | 'forecast' (daily NWS pull)
  tier TEXT NOT NULL CHECK (tier IN ('watch','urgent')),
  message TEXT NOT NULL,
  reading_value REAL,                -- canonical units: Celsius for temp, mph for wind, unitless for AQI
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(alert_type, resolved_at);

-- AirNow regional AQI (key-gated, no-ops without AIRNOW_API_KEY configured).
-- Corroborates the local Ecowitt PM2.5 sensor with a regional reading,
-- most useful during PNW wildfire smoke season per SPEC.md 1a.
CREATE TABLE IF NOT EXISTS regional_air_quality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  airnow_aqi REAL,
  airnow_category TEXT,
  reporting_area TEXT,
  discussion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regional_air_quality_ts ON regional_air_quality(ts);

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
  species TEXT PRIMARY KEY,          -- common name, joins to trees(species)
  common_name TEXT,
  scientific_name TEXT,
  native_range TEXT,
  hardiness_zone TEXT,
  light_needs TEXT,
  watering_notes TEXT,
  fertilization_notes TEXT,
  common_pests TEXT,
  wiring_guidance TEXT,
  styling_notes TEXT,
  seasonal_calendar TEXT,            -- free text, spring/summer/fall/winter tasks
  ai_notes TEXT,                     -- guidance for Sensei's diagnostics/chat specifically
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

-- capture_requests: command-queue for on-demand camera capture, mirroring
-- irrigation_events -- the Worker can't reach the camera/local script
-- directly (no public IP on the home network), so the script polls this
-- queue instead of being pushed to. See migrations/0013_capture_requests.sql.
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

-- ============================================================
-- SEED DATA: species_reference (4 species — Grove Collection)
-- ============================================================
INSERT OR IGNORE INTO species_reference
  (species, common_name, scientific_name, native_range, hardiness_zone, light_needs,
   watering_notes, fertilization_notes, common_pests, wiring_guidance, styling_notes,
   seasonal_calendar, ai_notes, pnw_notes)
VALUES
(
  'Mountain Hemlock', 'Mountain Hemlock', 'Tsuga mertensiana',
  'High-elevation subalpine zones of the Pacific coast ranges and Cascades, from Alaska south through British Columbia, Washington, and Oregon to the Sierra Nevada; typically near treeline (5,000-7,500ft in the Cascades).',
  'USDA 5-7',
  'Full sun to light dappled shade; some afternoon shade helps at lower elevations since it evolved with cooler subalpine summers.',
  'Prefers consistently moist, well-drained, humus-rich soil, mimicking snowmelt-fed subalpine slopes. As recently collected yamadori, roots are especially sensitive -- keep evenly moist through establishment and avoid heat stress on the root zone.',
  'Do not fertilize a freshly collected yamadori until roots are established (typically a full growing season). Once established, feed lightly with a balanced fertilizer in spring, tapering off by late summer.',
  'Spruce spider mites, hemlock woolly adelgid (more commonly associated with eastern/western hemlock, but worth monitoring), scale insects.',
  'Wait until fully established post-collection. Branches can be brittle when stressed; wire outside of active growth flush and watch for die-back at wire pressure points.',
  'Prized for dramatic natural deadwood and trunk movement -- this tree already has both. Needle reduction is slow; favor preserving existing jin/shari over heavy new carving.',
  'Spring: resume light feeding once recovery is confirmed, watch for new candle growth as the signal. Summer: protect from prolonged heat, keep roots cool and moist. Fall: taper feeding. Winter: genuine cold dormancy is expected and beneficial for this subalpine species; protect container roots from hard freeze (a pot freezes faster than the ground would).',
  'Recovery timeline is the most important thing to track for the next several seasons -- treat "no styling until spring 2027" as a hard constraint and flag any styling-adjacent suggestion (heavy pruning, wiring) as premature before then. Weight moisture-stress signals more heavily than for established stock; this tree has less buffer.',
  'Uncommon at low elevation in the PNW lowlands -- North Bend''s summer heat is warmer than its native range, so monitor for heat stress more than a native-elevation planting would need.'
),
(
  'Alaska Yellow Cedar', 'Alaska Yellow Cedar', 'Callitropsis nootkatensis',
  'Pacific coast from south-central Alaska through British Columbia to northern California, in cool, wet coastal and montane forests, often near hemlock and fir.',
  'USDA 4-7',
  'Full sun to partial shade; naturally understory-tolerant when young. Some afternoon shade protection helps in hot climates, though North Bend''s mild summers are within its comfort range.',
  'Wants consistently moist soil -- a wet-climate species, markedly less drought-tolerant than junipers or pines. Do not let it dry out between waterings. Drainage still matters to avoid root rot, but tolerance for dry spells is low.',
  'As young trunk-development stock, feed generously through spring-summer with a nitrogen-forward fertilizer to encourage trunk thickening; ease off in early fall.',
  'Cedar/cypress leaf blight, spider mites, scale, aphids. The species has seen wild "cedar decline" linked to reduced snowpack exposing roots to freeze -- a reminder of how cold- and moisture-sensitive the roots are, though less relevant to a protected container.',
  'Responds well to wiring for trunk/branch movement. Bark is thin and marks easily -- check wire regularly during active growth to avoid scarring.',
  'Naturally forms a weeping, pendulous branch habit -- a hallmark of the species worth expressing rather than fighting. Suits informal upright and weeping/cascade-adjacent styles.',
  'Spring: resume/increase feeding, primary growth push. Summer: sustained watering vigilance -- the most drought-sensitive species in the collection. Fall: reduce feeding, allow growth to harden off. Winter: cold-hardy once established, but protect container roots from hard, prolonged freezes.',
  'Two trees in the collection share this profile but are being developed toward different styling directions -- comparative insights between them are especially useful, since consistent divergence in trunk growth or health under similar conditions is meaningful signal.',
  'Native to the region; well-suited to North Bend''s climate overall, with watering discipline being the main thing to get right.'
),
(
  'Silver Fir', 'Silver Fir', 'Abies sp. (exact species unconfirmed, likely Abies amabilis)',
  'For Abies amabilis (Pacific Silver Fir, the likely candidate given PNW sourcing): southeast Alaska through coastal and Cascade ranges of BC, Washington, and Oregon, typically mid-to-high elevation in cool, moist forests.',
  'USDA 5-7 (typical for PNW true firs)',
  'Full sun to light shade; true firs tolerate more shade than pines but ramify better with good light.',
  'Prefers consistently moist, well-drained soil. Not drought-tolerant -- will show needle browning/drop if allowed to dry out repeatedly.',
  'As an early-development tree (~3-5 years), feed regularly through the growing season with a balanced-to-nitrogen-forward fertilizer to build trunk caliper before structural styling begins.',
  'Balsam woolly adelgid (a significant pest of true firs in parts of the range), spider mites, aphids, needle cast fungal disease in overly wet/still air.',
  'Not yet applicable -- tree is in early development; structural wiring is premature until trunk and primary branch structure are established.',
  'Less common in bonsai than pines/junipers, but true firs can develop excellent formal- or informal-upright form with a strong central leader and tiered branching.',
  'Spring: main feeding and growth push. Summer: monitor moisture closely, avoid heat stress. Fall: taper feeding. Winter: dormant and cold-hardy once established; protect container roots from hard freeze.',
  'Species identification is unconfirmed -- treat published hardiness/pest specifics as directional, not definitive, and surface that uncertainty in any AI-generated guidance rather than presenting it as settled fact until confirmed.',
  'Common at mid-to-high elevation regionally; North Bend''s lowland climate is milder than its typical native habitat.'
),
(
  'Dawn Redwood', 'Dawn Redwood', 'Metasequoia glyptostroboides',
  'Native to a small relict area of central China (Hubei/Sichuan/Hunan border region); widely cultivated worldwide since its rediscovery in the 1940s after being known only from fossils.',
  'USDA 5-8 -- notably adaptable and fast-growing across a wide climate range.',
  'Full sun for best growth and form; tolerates light shade but grows more openly with less light.',
  'A streamside/wetland-margin species in the wild -- wants consistently moist soil and tolerates more water than most conifers used in bonsai. Comparatively forgiving of overwatering, but as young developing stock should not be allowed to dry out.',
  'Vigorous grower -- feed generously through the growing season to take advantage of its naturally fast trunk-thickening habit. One of the best species here for rapid "grow and chop" trunk development.',
  'Generally pest-resistant compared to true conifers; watch for spider mites in hot/dry conditions and aphids on soft new growth.',
  'Not yet applicable at this stage (2-4 years, growing freely). When development begins, wires easily on young flexible growth, but branches thicken quickly -- needs more frequent wire monitoring than slower species to avoid scarring.',
  'A deciduous conifer -- unlike the evergreens in this collection, it drops needles in fall and leafs out again in spring, so seasonal bare-tree structure is part of its character. Naturally forms a strong buttressed, fluted trunk with age -- a signature feature to encourage during development.',
  'Spring: leaf-out, main feeding and growth push begins. Summer: vigorous growth, high water demand, good season for trunk-building work. Fall: needles turn russet/bronze before dropping -- normal, not a health issue. Winter: fully deciduous and dormant; bare branches are the expected state, not a red flag.',
  'The only deciduous tree in the collection -- its normal fall needle-drop could otherwise look identical to a health alert if diagnostics aren''t species-aware. Good test case for confirming per-species logic in the daily diagnostic doesn''t false-positive on a healthy deciduous conifer behaving normally. Day length may be a more reliable dormancy trigger for this species than soil temperature alone.',
  'Not native, but performs well in cultivation across the PNW given adequate moisture.'
);

-- ============================================================
-- SEED DATA: trees (Grove Collection -- Kyle Ryan, North Bend, WA)
-- ============================================================
-- soil_moisture_threshold_low/high (2026-08-18 revision): provisional,
-- substrate-aware starting points, not calibrated per-sensor values. The
-- original 32-38% lows assumed conventional soil and were far too high for
-- the coarse conifer bonsai mix Mountain Hemlock and Silver Fir sit in --
-- Ecowitt's frequency-domain sensor reads a substrate-dependent moisture
-- index, not a universal soil-water percentage, and a mix with more air
-- space reads lower at the same usable moisture level than potting soil
-- does. The 99% highs on those two intentionally disable "too wet"
-- warnings until real wet/dry calibration exists (see CHECKLIST.md) --
-- a brief high reading right after watering in a freely-draining mix
-- isn't waterlogging.
INSERT OR IGNORE INTO trees
  (id, name, nickname, species, pot_size_liters, origin_notes, origin_type, acquired_date,
   estimated_age_years_low, estimated_age_years_high, development_stage, notes,
   soil_moisture_threshold_low, soil_moisture_threshold_high, ec_threshold_high, dormancy_soil_temp_c)
VALUES
(
  'mountain-hemlock', 'Mountain Hemlock', 'Sentinel', 'Mountain Hemlock', NULL,
  'Yamadori, collected from Washington State, acquired summer 2026.', 'yamadori', 'Summer 2026',
  50, 80, 'recovery',
  'Flagship tree of the collection. Large aged trunk with significant natural movement and deadwood. Currently in a recovery nursery container after collection. No styling planned until spring 2027.',
  15, 99, 2.3, 5
),
(
  'yellow-cedar-1', 'Alaska Yellow Cedar #1', NULL, 'Alaska Yellow Cedar', NULL,
  'Nursery-grown.', 'nursery', NULL,
  4, 6, 'recovery',
  'Young pre-bonsai being grown for trunk development. Recovery only this season.',
  30, 82, 2.2, 6
),
(
  'yellow-cedar-2', 'Alaska Yellow Cedar #2', NULL, 'Alaska Yellow Cedar', NULL,
  'Nursery-grown.', 'nursery', NULL,
  4, 6, 'recovery',
  'Companion tree to Yellow Cedar #1 with a different future styling direction. No work planned until spring.',
  30, 82, 2.2, 6
),
(
  'silver-fir', 'Silver Fir', 'Tipsoo', 'Silver Fir', NULL,
  'Nursery-grown.', 'nursery', NULL,
  3, 5, 'development',
  'Early development tree. Being established before any structural work. Exact Abies species unconfirmed.',
  12, 99, 2.4, 6
),
(
  'dawn-redwood', 'Dawn Redwood', NULL, 'Dawn Redwood', NULL,
  'Nursery-grown.', 'nursery', NULL,
  2, 4, 'development',
  'Fast-growing deciduous conifer intended for future bonsai development. Will be allowed to grow freely for now.',
  28, 88, 2.5, 7
);

-- v1 single-zone irrigation hardware is assigned to Silver Fir ("Tipsoo")
INSERT OR IGNORE INTO irrigation_zones (tree_id, valve_channel, mode)
VALUES ('silver-fir', 1, 'manual');

-- Edge-triggered current-condition + forecast-based weather alerts
-- (migrations 0006-0007)
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('watch','urgent')),
  message TEXT NOT NULL,
  reading_value REAL,
  source TEXT NOT NULL DEFAULT 'current',
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(alert_type, resolved_at);

-- SMS/MMS consent + compliance data model (migration 0009). See
-- GROVEIQ_TWILIO_SMS_REQUIREMENTS.md section 10 for the full rationale.
CREATE TABLE IF NOT EXISTS phone_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'kyle',
  phone_encrypted TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  country_code TEXT,
  verified_at TEXT,
  verification_provider TEXT,
  verification_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_contacts_hash ON phone_contacts(phone_hash);

CREATE TABLE IF NOT EXISTS sms_consent_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'kyle',
  phone_contact_id TEXT NOT NULL REFERENCES phone_contacts(id),
  program TEXT NOT NULL CHECK (program IN ('operational','marketing')),
  category TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'granted','withdrawn','category_enabled','category_disabled',
    'phone_changed','verification_completed','stop_received',
    'start_received','help_received','admin_suppressed'
  )),
  status_after TEXT NOT NULL CHECK (status_after IN ('pending','active','opted_out','suppressed','revoked')),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL CHECK (source IN ('web','mobile_app','sms_keyword','support','admin','migration')),
  consent_text TEXT,
  consent_text_version TEXT,
  privacy_version TEXT,
  terms_version TEXT,
  ui_surface TEXT,
  ip_address TEXT,
  user_agent TEXT,
  twilio_message_sid TEXT,
  twilio_messaging_service_sid TEXT,
  twilio_opt_out_type TEXT,
  actor_id TEXT,
  request_id TEXT,
  correlation_id TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_consent_events_phone ON sms_consent_events(phone_contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_consent_events_occurred ON sms_consent_events(occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_consent_events_msgsid ON sms_consent_events(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

CREATE TABLE IF NOT EXISTS sms_subscription_state (
  user_id TEXT NOT NULL DEFAULT 'kyle',
  phone_contact_id TEXT NOT NULL REFERENCES phone_contacts(id),
  program TEXT NOT NULL CHECK (program IN ('operational','marketing')),
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','active','opted_out','suppressed','revoked')),
  global_opt_out INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  revoked_at TEXT,
  last_event_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, phone_contact_id, program)
);

CREATE TABLE IF NOT EXISTS sms_category_subscriptions (
  user_id TEXT NOT NULL DEFAULT 'kyle',
  phone_contact_id TEXT NOT NULL REFERENCES phone_contacts(id),
  category TEXT NOT NULL CHECK (category IN ('plant_health','sensor','irrigation','environment_weather','security','account_service')),
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, phone_contact_id, category)
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone ON otp_challenges(phone_hash);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_created ON otp_challenges(created_at);

CREATE TABLE IF NOT EXISTS sms_send_log (
  id TEXT PRIMARY KEY,
  phone_contact_id TEXT,
  program TEXT,
  category TEXT,
  template_version TEXT,
  consent_event_id TEXT,
  twilio_sid TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','blocked')),
  block_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sms_send_log_created ON sms_send_log(created_at);

-- Simple key-value settings for the "Profile & grove" fields in Settings
-- (migration 0011).
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

-- Web Push subscriptions (migration 0012). Single-user app behind
-- Cloudflare Access, so no per-user linkage -- alerts fan out to every
-- subscribed browser/device.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
