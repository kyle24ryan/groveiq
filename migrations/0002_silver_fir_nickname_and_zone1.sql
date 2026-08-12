-- Migration 0002: Silver Fir nickname + assign it as the v1 single-zone
-- irrigation tree (the physical valve/drip hardware has arrived).

UPDATE trees SET nickname = 'Tipsoo' WHERE id = 'silver-fir';

INSERT OR IGNORE INTO irrigation_zones (tree_id, valve_channel, mode)
VALUES ('silver-fir', 1, 'manual');
