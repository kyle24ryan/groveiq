-- Migration 0010: add the AirNow forecast discussion text -- switched
-- airnow.ts from the observation endpoint (no physical monitor near North
-- Bend) to the forecast endpoint, which comes with a human-written
-- discussion of expected smoke/AQI conditions, genuinely useful context.

ALTER TABLE regional_air_quality ADD COLUMN discussion TEXT;
