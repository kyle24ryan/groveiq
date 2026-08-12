# GroveIQ Irrigation Controller (v1, single-zone)

ESP32-S3 firmware for the Smart Irrigation Module described in SPEC.md
section 1.12. Talks to the Worker over the API contract in
`docs/irrigation-api.md`.

**Status: untested skeleton.** Written against the documented BOM and API
contract, but never flashed to real hardware. Verify pin assignments,
DRV8871 pulse polarity, and timing constants on the bench before trusting
it near an actual valve.

## Setup

1. Install [PlatformIO](https://platformio.org/) (VS Code extension or CLI).
2. `cp include/secrets_template.h include/secrets.h` and fill in your WiFi
   credentials and the `IRRIGATION_DEVICE_KEY` value (must match the Worker
   secret — ask if you don't have it, or generate a new one and update both
   sides with `wrangler secret put IRRIGATION_DEVICE_KEY`).
3. Confirm `include/pins.h` against the actual ESP32-S3 DevKitC-1 terminal
   breakout board's silkscreen before wiring anything — the pin numbers in
   this repo are placeholders.
4. `pio run -t upload` to flash, `pio device monitor` to watch serial output.

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

## Not yet implemented

- Local command queue / retry-on-reconnect (see above)
- Multi-zone support (rotary switch is wired and read, but v1 only acts on
  one fixed zone/tree)
- `POST /heartbeat` device-online reporting
