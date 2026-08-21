-- Migration 0016: zone-based identity for irrigation, plus a real status
-- lifecycle on irrigation_events.
--
-- Scaling from 1 to 5 physical zones (one ESP32-S3, 5 valves) means
-- `irrigation_zones.tree_id` can no longer be the primary key -- the
-- stable identity a Worker command routes on has to be the zone itself,
-- decoupled from which GPIO/array-position the firmware happens to wire
-- it to (same principle already applied to `soilChannels.ts`'s channel
-- map). SQLite can't ALTER a PRIMARY KEY in place, so this rebuilds the
-- table: create the new shape, copy the existing single row over, drop
-- the old table, rename.
--
-- `irrigation_events` gains `zone_id` (so /confirm isn't ambiguous once a
-- tree could theoretically have more than one zone) and `status`
-- (pending/claimed/completed/aborted) -- today's schema only had
-- flow_confirmed/aborted_reason as an implicit, un-atomic "is this
-- resolved" signal; `status` lets GET /command claim a row atomically
-- (UPDATE ... WHERE status='pending', checked via meta.changes) instead
-- of two concurrent polls being able to read the same unclaimed row.
--
-- Zones 2-5 are deliberately NOT seeded here -- which physical valve ends
-- up plumbed to which tree's pot isn't known until the irrigation lines
-- are actually installed (same reasoning soilChannels.ts's real channel
-- map waited for physical install before being filled in). Only the
-- existing real zone (silver-fir, valve_channel 1) is migrated, renamed
-- to the stable id 'zone-1'.

CREATE TABLE irrigation_zones_new (
  zone_id TEXT PRIMARY KEY,           -- stable identity, e.g. 'zone-1'..'zone-5' -- decoupled from GPIO/array position
  tree_id TEXT NOT NULL REFERENCES trees(id),
  valve_channel INTEGER NOT NULL,     -- hardware-facing: pin-table index / rotary switch position
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','scheduled','sensor','ai')),
  last_watered_at TEXT,
  last_duration_sec INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO irrigation_zones_new (zone_id, tree_id, valve_channel, mode, last_watered_at, last_duration_sec, updated_at)
  SELECT 'zone-' || valve_channel, tree_id, valve_channel, mode, last_watered_at, last_duration_sec, updated_at
  FROM irrigation_zones;

DROP TABLE irrigation_zones;
ALTER TABLE irrigation_zones_new RENAME TO irrigation_zones;

-- 1:1 tree<->zone for now (matches every zone having exactly one tree
-- today); relax this if a future zone ever needs to serve multiple trees.
CREATE UNIQUE INDEX IF NOT EXISTS idx_irrigation_zones_tree ON irrigation_zones(tree_id);

ALTER TABLE irrigation_events ADD COLUMN zone_id TEXT REFERENCES irrigation_zones(zone_id);
ALTER TABLE irrigation_events ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','completed','aborted'));
-- `ts` is set at row creation (queued), not when a device actually claims
-- it -- a command can sit pending for a while if the device is offline.
-- The staleness sweep (src/alerts.ts) needs to measure "how long has this
-- been claimed without a confirm", so it needs its own timestamp, not `ts`.
ALTER TABLE irrigation_events ADD COLUMN claimed_at TEXT;

-- Backfill zone_id for any pre-existing rows (there are none in practice --
-- irrigation has never actually been triggered in production -- but this
-- keeps the migration correct if that ever changes before this ships).
UPDATE irrigation_events
  SET zone_id = (SELECT zone_id FROM irrigation_zones WHERE irrigation_zones.tree_id = irrigation_events.tree_id)
  WHERE zone_id IS NULL;

-- Backfill status for any pre-existing rows from the old implicit state.
UPDATE irrigation_events
  SET status = CASE
    WHEN flow_confirmed IS NOT NULL OR aborted_reason IS NOT NULL THEN
      CASE WHEN aborted_reason IS NOT NULL THEN 'aborted' ELSE 'completed' END
    ELSE 'pending'
  END
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_irrigation_events_status ON irrigation_events(status, ts);
