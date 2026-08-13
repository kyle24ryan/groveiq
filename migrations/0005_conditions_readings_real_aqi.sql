-- Migration 0005: capture the real EPA AQI Ecowitt already computes
-- (real_time_aqi, 24_hours_aqi) instead of only the raw PM2.5 concentration.

ALTER TABLE conditions_readings ADD COLUMN pm25_aqi REAL;
ALTER TABLE conditions_readings ADD COLUMN pm25_aqi_24h REAL;
