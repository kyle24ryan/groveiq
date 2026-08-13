-- Migration 0007: distinguish current-condition alerts (evaluated every
-- 5-minute Ecowitt poll) from forecast-based alerts (evaluated once daily
-- from NWS) so the UI can label them accordingly.

ALTER TABLE alerts ADD COLUMN source TEXT NOT NULL DEFAULT 'current';
