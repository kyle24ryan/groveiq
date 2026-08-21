-- Migration 0017: settings toggles to disable the camera and irrigation
-- app/device flows without touching hardware. No schema change --
-- app_settings is already a generic key-value store (migration 0011);
-- this just seeds two new keys, defaulted 'true' so existing behavior is
-- unchanged until someone flips one off.
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('camera_enabled', 'true'),
  ('irrigation_enabled', 'true');
