# GroveIQ Irrigation Controller (v1, single-zone)

ESP32-S3 firmware for the Smart Irrigation Module described in SPEC.md
section 1.12. Talks to the Worker over the API contract in
`docs/irrigation-api.md`.

**Status: untested skeleton.** Written against the documented BOM and API
contract, but never flashed to real hardware. Verify pin assignments,
DRV8871 pulse polarity, and timing constants on the bench before trusting
it near an actual valve.

This board also runs the camera-capture task (see below) — same physical
ESP32-S3, isolated onto its own FreeRTOS task on core 0 so a slow camera or
network call can never delay the irrigation safety loop on core 1. The
camera-relay call shapes were proven live against real hardware via a
separate bench-test sketch (`scripts/camera-capture/esp32-bench-test/`);
`camera_task.cpp` itself, running as part of this firmware, has not yet
been flashed or tested.

## Setup

1. Install [PlatformIO](https://platformio.org/) (VS Code extension or CLI).
2. `cp include/secrets_template.h include/secrets.h` and fill in:
   - WiFi credentials
   - `IRRIGATION_DEVICE_KEY` (must match the Worker secret — ask if you
     don't have it, or generate a new one and update both sides with
     `wrangler secret put IRRIGATION_DEVICE_KEY`)
   - Camera-task values: `CAMERA_IP`/`CAMERA_USER`/`CAMERA_PASSWORD` (the
     Reolink E1 Outdoor Pro's local login), `CAMERA_DEVICE_KEY` (Worker
     secret, separate from `IRRIGATION_DEVICE_KEY` on purpose), and
     `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` — a Cloudflare Access
     Service Token scoped to `api.grove-iq.com/api/v1/capture/*`, created
     the same way as `scripts/camera-capture/README.md` step 4 describes.
     This service token is what actually gates the endpoint at Cloudflare's
     edge; `CAMERA_DEVICE_KEY` is a second, Worker-side check.
3. Confirm `include/pins.h` against the actual ESP32-S3 DevKitC-1 terminal
   breakout board's silkscreen before wiring anything — the pin numbers in
   this repo are placeholders.
4. In the Reolink app, set one PTZ preset per tree and make sure the preset
   numbers match `include/tree_presets.h` (there's no runtime config file
   on-device — edit that header directly if preset numbers change).
5. `pio run -t upload` to flash, `pio device monitor` to watch serial output.

## Safety model

All of this lives in firmware, not the Worker, and runs regardless of
connectivity (see docs/irrigation-api.md):

- **Max runtime cutoff** — `kMaxRuntimeSec` in `main.cpp` hard-caps any
  watering command regardless of what the server requested.
- **Fail-closed default** — no WiFi, no valid command, or a brownout all
  resolve to "valve closed." `ensureValveClosed()` runs at boot and any time
  the WiFi connection drops.
- **Flow-sensor cross-check** — if the valve opens but no flow pulses arrive
  within `kFlowCheckGraceMs`, the watering aborts and reports
  `aborted_reason: "no_flow_detected"` rather than running the full
  requested duration dry.
- **Local command queue** — not yet implemented in this skeleton. Today a
  dropped connection mid-cycle just means the in-progress watering finishes
  on its own local timer (which is already safe), but a command fetched and
  then lost before starting isn't retried. Worth adding if brief drops turn
  out to be common in practice.

## Camera capture task

`camera_task.cpp` runs as a FreeRTOS task pinned to core 0
(`startCameraTask()`, called once from `setup()`), separate from the
irrigation `loop()` on core 1. It shares no mutable state with irrigation —
only WiFi, the heap allocator, and `Serial`, all individually thread-safe on
the ESP32 Arduino core — and creates its own `HTTPClient`/`WiFiClientSecure`
instances rather than reusing irrigation's.

Every ~15s poll cycle it does two things:

- **In-app "Capture now"** — polls `GET /api/v1/capture/command`; if a
  request is pending, moves the camera to that tree's preset, snapshots,
  and uploads. Mirrors `scripts/camera-capture/capture.mjs --watch`.
- **Scheduled daily capture** — once NTP has synced (`configTime()` at task
  start), captures every tree in `kTreePresets` once per day at
  `kAutoCaptureHour` local time (default 10:00, matching the Mac launchd
  schedule), deduped by `tm_yday`. Mirrors `capture.mjs --all --auto`.

TLS currently uses `WiFiClientSecure::setInsecure()` (skips certificate
validation) rather than pinning Cloudflare's root CA — a known stopgap, not
a long-term posture. Same caveat applies to irrigation's own
`httpGetJson`/`httpPostJson` in `main.cpp`.

## Not yet implemented

- Local command queue / retry-on-reconnect (see above)
- Multi-zone support (rotary switch is wired and read, but v1 only acts on
  one fixed zone/tree)
- `POST /heartbeat` device-online reporting
- TLS certificate pinning (`setCACert()`) in place of `setInsecure()`,
  for both irrigation and camera-task HTTP calls
