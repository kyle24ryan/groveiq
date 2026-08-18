-- Migration 0014: record which calendar date an AirNow PM2.5 forecast
-- value is actually valid for, separate from `ts` (when GroveIQ fetched
-- it). Closes a real gap: airnow.ts previously discarded the AirNow
-- response's DateForecast field once it picked a row, so if the "today"
-- match missed and the code fell back to whatever forecast row came back
-- first, the UI had no way to tell the fallback pick may be for a
-- different day than "now" -- it just showed "Regional as of {ts}" (fetch
-- time), silently implying the AQI number was for today.

ALTER TABLE regional_air_quality ADD COLUMN forecast_date TEXT;
