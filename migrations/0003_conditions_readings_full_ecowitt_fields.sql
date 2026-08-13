-- Migration 0003: capture the rest of what ecowitt.ts already computes but
-- doesn't persist yet (wind direction, pressure, solar, UV, WBGT).

ALTER TABLE conditions_readings ADD COLUMN wind_dir_deg REAL;
ALTER TABLE conditions_readings ADD COLUMN pressure_hpa REAL;
ALTER TABLE conditions_readings ADD COLUMN solar_wm2 REAL;
ALTER TABLE conditions_readings ADD COLUMN uvi REAL;
ALTER TABLE conditions_readings ADD COLUMN wbgt_c REAL;
