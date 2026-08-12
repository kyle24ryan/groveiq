# Worker ↔ ESP32 Irrigation API Contract

Closes the open item from SPEC.md section 1.12: "command/confirmation API
contract between Worker and ESP32 (endpoints, payload shape) — not yet
designed."

## Design principles

- **The ESP32 polls; the Worker never pushes.** The controller sits behind
  home WiFi/NAT with no public IP, so it must be the one initiating
  connections. It calls `GET /command` on an interval (default 15s) to pick
  up pending work.
- **The Worker decides *when* and *how long*; the ESP32 decides *whether it's
  safe*.** All local-first safety logic (max runtime cutoff, fail-closed on
  WiFi loss or brownout, flow-sensor cross-check, local command queue) lives
  entirely in firmware and runs independent of connectivity. The Worker's
  commands are requests, not overrides — firmware can and should abort a
  command and report why.
- **Every command is durable.** Issuing a command creates an `irrigation_events`
  row immediately (`flow_confirmed = NULL`). The ESP32's `/confirm` call
  updates that same row rather than creating a new one, so a watering
  request is never silently lost even if the device never checks in.

## Auth

Single shared secret per device, sent as a header:

```
X-Device-Key: <secret>
```

Stored as a Worker secret (`wrangler secret put IRRIGATION_DEVICE_KEY`) and
burned into firmware as a build-time constant via `platformio.ini`
`build_flags` (not committed to git — see `firmware/README.md`). Sufficient
for a single-zone v1 with one controller; revisit (per-device keys) if the
5-zone scale-up in SPEC.md 1.12 happens.

## Endpoints

All under `https://api.grove-iq.com/api/v1/irrigation/`.

### `GET /command`

Polled by the ESP32. Returns the oldest unconfirmed command for this device,
or `{"action":"none"}` if the queue is empty.

Response (pending command):

```json
{
  "action": "water",
  "command_id": "9f2c1e3a-...",
  "tree_id": "mountain-hemlock",
  "valve_channel": 1,
  "duration_sec": 45,
  "issued_at": "2026-08-11T20:14:00Z"
}
```

Response (nothing pending):

```json
{ "action": "none" }
```

Firmware caches the last successfully-fetched command locally, so a brief
connectivity drop mid-cycle doesn't stop a zone that's already running —
this is the "local command queue" from SPEC.md 1.12, and it lives on-device,
not server-side.

### `POST /confirm`

Called by the ESP32 after a command finishes (or aborts). Updates the
matching `irrigation_events` row and `irrigation_zones.last_watered_at` /
`last_duration_sec`.

Request:

```json
{
  "command_id": "9f2c1e3a-...",
  "actual_duration_sec": 44,
  "flow_confirmed": true,
  "aborted_reason": null
}
```

`aborted_reason` is one of `null`, `"no_flow_detected"`, `"max_runtime_cutoff"`,
`"wifi_lost"`, or `"manual_stop"`. A non-null `aborted_reason` with
`flow_confirmed: false` triggers an `urgent` alert per SPEC.md 1.5 (valve
opened but no flow — matches the flow-sensor cross-check requirement).

Response: `{"ok": true}` or `4xx` with `{"ok": false, "error": "..."}`.

### `POST /water`

Called by the app (manual button) or the AI watering-decision path — creates
a new pending command for the ESP32 to pick up on its next poll.

Request:

```json
{ "tree_id": "mountain-hemlock", "duration_sec": 45, "trigger_source": "manual" }
```

`trigger_source` is one of `manual | scheduled | sensor | ai`, matching the
`irrigation_events.trigger_source` CHECK constraint already in `schema.sql`.

Response: `{"command_id": "9f2c1e3a-...", "queued": true}`.

### `POST /heartbeat` (optional, not required for v1)

Periodic check-in with no command attached, so the app can show device
online/offline status and last-seen time. Deferred until device-health UI
exists in Settings; not required to close the v1 loop.

## Open items carried forward

- Device provisioning: how the shared secret gets onto the ESP32 the first
  time (manual flash-time constant for v1; consider a claim/pairing flow if
  the 5-zone scale-up happens).
- Multi-zone: `valve_channel` is already in the `/command` response and in
  `irrigation_zones.valve_channel`, so scale-up shouldn't require an API
  shape change — just more rows and a device that knows which zones it owns.
