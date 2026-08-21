# Worker ↔ ESP32 Irrigation API Contract

Closes the open item from SPEC.md section 1.12: "command/confirmation API
contract between Worker and ESP32 (endpoints, payload shape) — not yet
designed." Updated for the 5-zone scale-up (2026-08-21) — one ESP32-S3
controller, up to 5 independent zones (one DRV8871 + Galcon latching valve
+ GR-5403 flow sensor per zone), not 5 separate devices.

## Design principles

- **The ESP32 polls; the Worker never pushes.** The controller sits behind
  home WiFi/NAT with no public IP, so it must be the one initiating
  connections. It calls `GET /command` on an interval (default 15s) to pick
  up pending work.
- **The Worker decides *when*, *which zone*, and *how long*; the ESP32
  decides *whether it's safe*.** All local-first safety logic (max runtime
  cutoff, fail-closed on WiFi loss or brownout, flow-sensor cross-check,
  one-zone-at-a-time arbitration, configuration-fault refusal) lives
  entirely in firmware and runs independent of connectivity. The Worker's
  commands are requests, not overrides — firmware can and should abort a
  command and report why.
- **Every command is durable.** Issuing a command creates an
  `irrigation_events` row immediately (`status = 'pending'`). The ESP32's
  `/confirm` call updates that same row rather than creating a new one, so
  a watering request is never silently lost even if the device never
  checks in.
- **Zone identity is stable, not derived from GPIO.** `zone_id` (`'zone-1'`
  .. `'zone-5'`) is the identity a command routes on. It's a fixed
  `'zone-' + valve_channel` convention on both sides — the Worker never
  needs a separate lookup table, and the firmware derives it from its own
  pin-table array position. Which tree a given zone waters is a separate,
  independently-changeable mapping (`irrigation_zones.tree_id`), confirmed
  against physical wiring once installed — not fabricated ahead of that.

## Auth

Two layers, matching the camera-capture path's already-established split:

- **Cloudflare Access Service Token** (edge-level, gates the request before
  it reaches the Worker at all) — `CF-Access-Client-Id`/
  `CF-Access-Client-Secret` headers, validated by an Access policy scoped
  to `api.grove-iq.com/api/v1/irrigation/*`. Created the same 3-step way
  `scripts/camera-capture/README.md` step 4 describes for the camera path.
  **This project has never actually set this up for irrigation** — do it
  before flashing real firmware, or every device-facing call below is
  blocked at Cloudflare's edge regardless of the device key.
- **`X-Device-Key` header** (Worker-level, second layer) — a single shared
  secret per controller, stored as a Worker secret
  (`wrangler secret put IRRIGATION_DEVICE_KEY`) and burned into firmware as
  a build-time constant via `secrets.h` (not committed to git — see
  `firmware/irrigation/README.md`). Sufficient for one controller driving
  all 5 zones; revisit (per-device keys) only if a second physical
  controller is ever added.

Browser-facing endpoints (`/api/v1/trees/*`) are unrelated to the above —
they rely on the same default Cloudflare Access session protection every
other browser-facing route already has, since a human logging into the app
can do the interactive SSO flow a device can't.

## Device-facing endpoints

All under `https://api.grove-iq.com/api/v1/irrigation/`.

### `GET /command`

Polled by the ESP32. Returns the oldest pending command across all zones,
or `{"action":"none"}` if the queue is empty or someone else claimed it
first (see "Claiming" below).

Response (pending command):

```json
{
  "action": "water",
  "command_id": "9",
  "tree_id": "silver-fir",
  "zone_id": "zone-1",
  "valve_channel": 1,
  "duration_sec": 45,
  "issued_at": "2026-08-21T20:14:00Z"
}
```

`command_id` is the `irrigation_events` row's D1 autoincrement integer,
stringified — not a UUID (an earlier version of this doc described a UUID;
that was never actually implemented). `valve_channel` is the firmware's own
pin-table index (1-5); `zone_id` is the stable identity echoed back in
`/confirm` and used for zone-scoped lookups.

Response (nothing pending):

```json
{ "action": "none" }
```

**Claiming**: the Worker atomically transitions the oldest `'pending'` row
to `'claimed'` (`UPDATE ... WHERE status = 'pending'`, checked via
`meta.changes`) before returning it — closes the race a plain
SELECT-then-return poll can't: two overlapping polls (or a retry) would
otherwise both be handed the same `command_id`. If the claim loses the
race, this returns `{"action":"none"}` for that poll; the device just
tries again next cycle.

Firmware caches the last successfully-fetched command locally, so a brief
connectivity drop mid-cycle doesn't stop a zone that's already running —
this is the "local command queue" from SPEC.md 1.12, and it lives
on-device, not server-side. (Not yet implemented in the current firmware
skeleton — see `firmware/irrigation/README.md`'s "Not yet implemented".)

### `POST /confirm`

Called by the ESP32 after a command finishes (or aborts). Updates the
matching `irrigation_events` row (`status` becomes `'completed'` or
`'aborted'`) and `irrigation_zones.last_watered_at` / `last_duration_sec`.

Request:

```json
{
  "command_id": "9",
  "actual_duration_sec": 44,
  "flow_confirmed": true,
  "aborted_reason": null
}
```

`aborted_reason` is one of `null`, `"no_flow_detected"`,
`"max_runtime_cutoff"`, `"wifi_lost"`, `"manual_stop"`,
`"device_unresponsive"` (set by the Worker's own staleness sweep, never by
firmware directly), or `"configuration_fault"` (an unconfigured or
duplicate-GPIO zone refused entirely — see firmware README). A non-null
`aborted_reason` of `"no_flow_detected"`, `"max_runtime_cutoff"`, or
`"configuration_fault"` raises an `urgent` alert (`src/alerts.ts`'s
`raiseIrrigationFaultAlert`) — a discrete, self-resolving notification, not
a persistent "active" banner, since the event already finished by the time
it's reported.

Response: `{"ok": true}` or `4xx` with `{"ok": false, "error": "..."}`.

### `POST /manual`

Called by the ESP32 after a **physical button press** — unlike the two
endpoints above, a manual button press is locally-initiated, not something
the device asks the Worker's permission for first (the button *is* local
authority, per this doc's own safety-model principle). The device runs the
watering immediately using the rotary switch's selected zone, then reports
what happened afterward, rather than pretending it went through the async
request/poll queue it never actually used.

Request:

```json
{
  "zone_id": "zone-3",
  "requested_duration_sec": 30,
  "actual_duration_sec": 30,
  "flow_confirmed": true,
  "aborted_reason": null
}
```

Creates a new `irrigation_events` row directly in a terminal state
(`'completed'` or `'aborted'`) — there's no pending/claimed stage, since
the watering already happened by the time this call is made. Same zone
update and fault-alert behavior as `/confirm`.

Response: `{"ok": true}` or `4xx` with `{"ok": false, "error": "..."}`.

## Browser-facing endpoints

Under `https://api.grove-iq.com/api/v1/trees/:treeId/`, same Access
protection as every other browser-facing route.

### `POST /water-request`

The app's "Water now" button. Resolves `treeId` to its zone (404 if none
configured yet — most trees don't have one until wiring is confirmed),
de-dupes against an already-pending/claimed request for that zone, and
queues a new `'pending'` `irrigation_events` row otherwise.

Request: `{ "duration_sec": 30, "trigger_source": "manual" }`

Response: `{"ok": true, "request_id": "9", "already_pending": false}`

### `GET /water-request/latest`

Polled by the frontend after `POST /water-request`, same shape as the
camera-capture path's `capture-request/latest`. Returns the newest
`irrigation_events` row for the tree, or `{"request": null}` if none
exists yet.

### `GET /irrigation`

Zone config (`zone_id`, `last_watered_at`, `last_duration_sec`) plus the
last 20 completed/aborted events for the tree — feeds the frontend's
shared `useTreeInsights` hook (last-watered display, recent-events list,
Timeline markers) so screens can't disagree about "when was this last
watered." Returns `{"zone": null, "events": []}` for a tree with no zone
configured yet, not an error.

## Staleness sweep (Worker-internal, not an endpoint)

Runs every `*/5 * * * *` alongside the weather-condition alert checks
(`src/alerts.ts`'s `sweepStaleIrrigationCommands`). A command that's been
`'claimed'` for longer than its `requested_duration_sec` plus a 60s grace
period with no `/confirm` ever arriving is the scenario this whole safety
model can't otherwise catch: the valve *might still be open* and nobody
would know. The sweep marks it `'aborted'` (`aborted_reason:
"device_unresponsive"`) and raises an `urgent` alert. Unlike the
no-flow/max-runtime case, this one isn't self-resolving on insert — it
clears on the *next* sweep once the stale row is no longer `'claimed'`.

## Open items carried forward

- Device provisioning: how the shared secret and Access Service Token get
  onto the ESP32 the first time (manual flash-time constants; consider a
  claim/pairing flow if a second physical controller is ever added).
- Local command queue / retry-on-reconnect (see `GET /command` above).
- `POST /heartbeat`, deferred until device-health UI exists in Settings.
- Zones 2-5 have no `irrigation_zones` row yet — deliberately not seeded
  with a guessed tree mapping ahead of physical installation (same
  reasoning `src/soilChannels.ts`'s real channel map waited for the soil
  sensors' physical install).
