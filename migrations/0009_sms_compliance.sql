-- Migration 0009: SMS/MMS consent and compliance data model, per
-- GROVEIQ_TWILIO_SMS_REQUIREMENTS.md section 10. Append-only consent
-- events + materialized current state; phone numbers stored encrypted
-- (AES-GCM, app-level via Web Crypto) with a separate keyed-hash column
-- for lookup, since encryption is non-deterministic and can't be queried
-- directly.
--
-- user_id is a fixed single-user app today, but the column is kept (not
-- hardcoded elsewhere) so a future multi-user migration doesn't require
-- reshaping this table.

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

-- Append-only. Never UPDATE or DELETE a row here outside of the retention
-- policy in section 10.4 -- current state is derived from this table into
-- sms_subscription_state, not stored only as a mutable boolean.
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
  WHERE twilio_message_sid IS NOT NULL; -- webhook idempotency by MessageSid (section 11.2.3)

-- Materialized current state, derived from sms_consent_events.
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

-- Category toggles, all default off (section 8).
CREATE TABLE IF NOT EXISTS sms_category_subscriptions (
  user_id TEXT NOT NULL DEFAULT 'kyle',
  phone_contact_id TEXT NOT NULL REFERENCES phone_contacts(id),
  category TEXT NOT NULL CHECK (category IN ('plant_health','sensor','irrigation','environment_weather','security','account_service')),
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, phone_contact_id, category)
);

-- OTP challenges (section 7). Code stored hashed, never plaintext.
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

-- Outbound send audit trail (section 11.3). Message bodies intentionally
-- not stored here (may contain sensitive plant/account data, section
-- 11.3's logging guidance).
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
