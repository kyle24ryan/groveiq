-- Migration 0004: capture Ecowitt device-health/battery data (already in
-- the API response's "battery" group, not persisted until now).

ALTER TABLE conditions_readings ADD COLUMN battery_sensor_array_code REAL;
ALTER TABLE conditions_readings ADD COLUMN battery_pm25_ch1_code REAL;
ALTER TABLE conditions_readings ADD COLUMN battery_bgt_voltage_v REAL;
