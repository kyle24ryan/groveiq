# Arduino IDE sketch (generated)

This folder is a flattened copy of `../src/main.cpp` + `../include/*.h`,
restructured for Arduino IDE — which requires the main file to be a `.ino`
matching its containing folder's name, with every other source file sitting
flat beside it (no `src/`/`include/` split like PlatformIO uses).

**Do not edit these files directly except `secrets.h`.** Edit the
originals in `../src/` and `../include/`, then regenerate this folder:

```bash
cd firmware/irrigation
cp include/pins.h arduino_sketch/irrigation/pins.h
cp include/camera_task.h arduino_sketch/irrigation/camera_task.h
cp src/camera_task.cpp arduino_sketch/irrigation/camera_task.cpp
cp include/tree_presets.h arduino_sketch/irrigation/tree_presets.h
cp include/secrets_template.h arduino_sketch/irrigation/secrets_template.h
# main.cpp -> irrigation.ino is a manual copy (different extension);
# ask Claude Code to regenerate it, or copy the file body over yourself.
```

`secrets.h` is gitignored here too (`firmware/**/arduino_sketch/**/secrets.h`)
and is not part of the regeneration — it's per-device, not derived from the
PlatformIO source.

## One-time setup

### 1. Install the ESP32 board package

1. Arduino IDE → **Settings** (macOS: Arduino IDE → Settings, or
   `Cmd+,`) → **Additional Boards Manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
2. **Tools → Board → Boards Manager**, search "esp32", install
   **esp32 by Espressif Systems** (latest stable).

### 2. Install the ArduinoJson library

**Tools → Manage Libraries**, search "ArduinoJson" (by Benoit Blanchon),
install a **7.x** version — this firmware uses ArduinoJson v7's unified
`JsonDocument` API, which is a different (incompatible) API from v6.

### 3. Select the board and its settings

**Tools → Board → esp32 → ESP32S3 Dev Module**, then set every field below
under the **Tools** menu — the ESP32-S3-DevKitC-1 N16R8 module (16MB flash,
8MB octal PSRAM) needs non-default values or the build will target the
wrong flash layout, or PSRAM (used by the camera task's JPEG buffer) won't
initialize at all:

| Setting | Value |
|---|---|
| Flash Size | **16MB (128Mb)** |
| Partition Scheme | Any **"16M Flash"** option (e.g. "16M Flash (3MB APP/9.9MB FATFS)") — this firmware is small, exact split doesn't matter, but it must be a 16M-prefixed scheme to match the flash size above |
| PSRAM | **OPI PSRAM** — the N16R8 uses octal (not quad) PSRAM; picking the wrong one leaves `ps_malloc()` returning null and the camera task's snapshot buffer allocation silently failing |
| Upload Speed | 921600 (drop to 115200 if uploads fail/hang) |
| USB CDC On Boot | **Disabled** if your board has a separate USB-UART bridge chip (silkscreened "UART" next to that port — most DevKitC-1 boards); **Enabled** only if your board has just a single native-USB ("USB-OTG") port and no separate UART chip |

Everything else can stay at its default.

### 4. Fill in secrets and select the port

1. `cp arduino_sketch/irrigation/secrets_template.h
   arduino_sketch/irrigation/secrets.h` and fill in real values (see the
   main `../README.md`'s Setup section for what each one is / where it
   comes from).
2. Plug in the board via USB, then **Tools → Port**, select the port that
   appeared (on macOS, something like `/dev/cu.usbserial-XXXX` or
   `/dev/cu.usbmodemXXXX`).

## Flashing

1. Open `irrigation.ino` in Arduino IDE (open the `.ino` file itself, not
   the folder — Arduino IDE will load the whole sketch folder
   automatically, showing `camera_task.cpp` etc. as additional tabs).
2. Click **Upload** (the right-arrow icon), or **Sketch → Upload**.
3. If it hangs at `Connecting....` — some ESP32-S3 boards need a manual
   bootloader trigger: hold the **BOOT** button, tap **RESET** while still
   holding BOOT, then release BOOT once upload starts.
4. Once uploaded, open **Tools → Serial Monitor**, set the baud rate
   dropdown (bottom-right) to **115200** to match `Serial.begin(115200)` in
   `irrigation.ino` — otherwise you'll see garbled text or nothing.

Expect to see WiFi-connect logs, then `[camera] camera task started on
core 0` once the camera task's `startCameraTask()` call runs. From there,
watch for the irrigation poll cycle and (once NTP syncs) the camera task's
own `[camera] ...` log lines on the same monitor — both tasks share the one
`Serial` port, so their log lines interleave.
