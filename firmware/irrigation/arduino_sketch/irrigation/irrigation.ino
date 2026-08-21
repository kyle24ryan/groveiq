// GroveIQ Irrigation Controller — 5 zones
//
// GENERATED FILE — this is a copy of firmware/irrigation/src/main.cpp,
// renamed for Arduino IDE (which requires the main file to be a .ino
// matching its containing folder's name, and all files flat in one
// sketch folder rather than split into src/+include/). Edit main.cpp,
// not this file, and regenerate — see ../README.md.
//
// UNTESTED SKELETON: written against the documented hardware (see
// firmware/irrigation/README.md) but never flashed to a real board. Treat
// pin assignments, timing constants, and the DRV8871 pulse polarity as
// starting points to verify on the bench, not as confirmed-correct.
// kValvePulseMs=100 is the one exception -- per bench work, not a guess.
//
// Safety model (see docs/irrigation-api.md): this firmware enforces every
// safety rule locally and independent of connectivity. The Worker only ever
// requests "water this zone for N seconds" — it cannot force an unsafe
// state. If WiFi is down, if the Worker is unreachable, or if a
// server-requested duration exceeds the local cap, the valve stays closed
// or is cut off, no exceptions. At most one zone is ever open at a time.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "camera_task.h"
#include "pins.h"
#include "secrets.h"

namespace {

constexpr uint32_t kPollIntervalMs = 15000;
constexpr uint32_t kMaxRuntimeSec = 180;          // hard cutoff per zone, overrides any server-requested duration
constexpr uint32_t kFlowCheckGraceMs = 5000;      // time to see first flow pulse before aborting
constexpr uint32_t kValvePulseMs = 100;           // DRV8871 pulse width for the latching solenoid -- bench-confirmed
constexpr uint32_t kInterZoneDelayMs = 20;         // gap between sequential valve pulses at boot, lets supply recover
constexpr uint32_t kDefaultManualDurationSec = 30;
constexpr uint32_t kButtonDebounceMs = 250;
constexpr uint32_t kWifiConnectTimeoutMs = 15000;
// GR-5403 starting calibration: F(Hz) = 5.5 * Q(L/min), i.e. ~330 pulses/liter.
// Same starting value for every zone until each installed sensor is
// individually calibrated -- not a fabricated per-zone difference.
constexpr float kDefaultPulsesPerLiter = 330.0f;

constexpr int8_t kNoActiveZone = -1;
int8_t g_activeZone = kNoActiveZone;
volatile uint32_t g_flowPulseCount[kZoneCount] = {};
uint32_t g_lastButtonPressMs = 0;

void IRAM_ATTR onFlowPulse0() { g_flowPulseCount[0]++; }
void IRAM_ATTR onFlowPulse1() { g_flowPulseCount[1]++; }
void IRAM_ATTR onFlowPulse2() { g_flowPulseCount[2]++; }
void IRAM_ATTR onFlowPulse3() { g_flowPulseCount[3]++; }
void IRAM_ATTR onFlowPulse4() { g_flowPulseCount[4]++; }
// attachInterrupt() on this ESP32 Arduino core version doesn't pass a zone
// context through to the handler, so each zone needs its own tiny wrapper
// -- kept minimal (increment only), no logging/JSON/networking/float math
// in an ISR.
void (*const kFlowIsrs[kZoneCount])() = {onFlowPulse0, onFlowPulse1, onFlowPulse2, onFlowPulse3, onFlowPulse4};

// Worker-facing zone identity, derived from array position -- never a
// separately-maintained table. Matches the Worker's own
// 'zone-' + valve_channel convention (migrations/0016_irrigation_zone_identity_and_status.sql).
String zoneIdForIndex(size_t index) {
  return "zone-" + String(index + 1);
}

bool zoneConfigured(size_t index) {
  const ZonePins& p = kZonePins[index];
  return p.valveIn1 != PIN_TBD && p.valveIn2 != PIN_TBD && p.flowSensor != PIN_TBD;
}

// Detects PIN_TBD entries (logged only, not fatal -- that specific zone is
// just refused at watering time) and duplicate GPIO assignments across all
// valve/flow pins (fatal -- a wiring/config bug that could cross-actuate
// zones). Never guesses a working pin map.
bool validatePinConfiguration() {
  bool seen[64] = {};
  bool ok = true;
  for (size_t i = 0; i < kZoneCount; i++) {
    if (!zoneConfigured(i)) {
      Serial.printf("[irrigation] zone %u has an unconfigured (PIN_TBD) pin -- watering refused on this zone until wired\n", i + 1);
      continue;
    }
    const ZonePins& p = kZonePins[i];
    const uint8_t pins[3] = {p.valveIn1, p.valveIn2, p.flowSensor};
    for (uint8_t pin : pins) {
      if (pin >= 64) continue; // out of range for this simple presence table; board doesn't expose that many GPIOs anyway
      if (seen[pin]) {
        Serial.printf("[irrigation] CONFIG FAULT: GPIO %u assigned to more than one zone -- refusing all watering\n", pin);
        ok = false;
      }
      seen[pin] = true;
    }
  }
  return ok;
}

// Returns the selected zone index (0-4), or -1 if no position is
// currently selected (open circuit / switch mid-transition). Common wired
// to GND -- exactly one position pin should read LOW when selected.
int8_t readRotarySwitch() {
  const uint8_t pins[kZoneCount] = {PIN_ROTARY_POS1, PIN_ROTARY_POS2, PIN_ROTARY_POS3, PIN_ROTARY_POS4, PIN_ROTARY_POS5};
  for (size_t i = 0; i < kZoneCount; i++) {
    if (digitalRead(pins[i]) == LOW) return static_cast<int8_t>(i);
  }
  return -1;
}

// Both DRV8871 inputs stay LOW except during a deliberate pulse. No-op if
// the zone's pins aren't configured yet.
void pulseValve(size_t zoneIndex, bool open) {
  if (zoneIndex >= kZoneCount || !zoneConfigured(zoneIndex)) return;
  const ZonePins& p = kZonePins[zoneIndex];
  digitalWrite(open ? p.valveIn1 : p.valveIn2, HIGH);
  delay(kValvePulseMs);
  digitalWrite(p.valveIn1, LOW);
  digitalWrite(p.valveIn2, LOW);
}

// Sequential, never simultaneous -- five DRV8871 boards pulsing together
// could exceed the supply/ground design margin. A short inter-zone delay
// gives the supply time to recover between pulses.
void closeAllValves() {
  for (size_t i = 0; i < kZoneCount; i++) {
    if (!zoneConfigured(i)) continue;
    pulseValve(i, /*open=*/false);
    delay(kInterZoneDelayMs);
  }
  g_activeZone = kNoActiveZone;
}

// Fail-closed: called whenever we're about to skip a loop iteration due to
// no WiFi, a failed request, etc. Guarantees no valve is ever left open
// with nothing watching it.
void ensureAllValvesClosed() {
  closeAllValves();
  digitalWrite(PIN_BUTTON_LED, LOW);
}

bool wifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (!wifiConnected() && millis() - start < kWifiConnectTimeoutMs) {
    delay(200);
  }
  return wifiConnected();
}

// A fresh WiFiClientSecure per call. setInsecure() skips certificate
// validation -- a stopgap, not a long-term production posture; proper fix
// is pinning Cloudflare's root CA via setCACert() here and in
// camera_task.cpp, same open item noted there.
WiFiClientSecure secureClient() {
  WiFiClientSecure client;
  client.setInsecure();
  return client;
}

// Both irrigation.ts's device-facing endpoints and capture.ts's sit behind
// a Cloudflare Access Service Token policy, not just their own app-level
// key -- camera_task.cpp already sends both CF-Access-Client-Id/Secret and
// X-Camera-Key; these calls need the same two-layer auth. Uses its own
// IRRIGATION_CF_ACCESS_* macros, distinct from camera_task.cpp's
// CF_ACCESS_CLIENT_ID/SECRET -- both files share one secrets.h compiled
// into the same image, and the two services' Access policies (and
// possibly Service Tokens) are separately scoped, same reasoning
// DEVICE_KEY and CAMERA_DEVICE_KEY are already kept separate.
void addAuthHeaders(HTTPClient& http) {
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.addHeader("CF-Access-Client-Id", IRRIGATION_CF_ACCESS_CLIENT_ID);
  http.addHeader("CF-Access-Client-Secret", IRRIGATION_CF_ACCESS_CLIENT_SECRET);
}

bool httpGetJson(const String& path, JsonDocument& doc) {
  WiFiClientSecure client = secureClient();
  HTTPClient http;
  http.begin(client, String(API_BASE_URL) + path);
  addAuthHeaders(http);

  int status = http.GET();
  if (status != 200) {
    http.end();
    return false;
  }
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  return !err;
}

bool httpPostJson(const String& path, const JsonDocument& body) {
  WiFiClientSecure client = secureClient();
  HTTPClient http;
  http.begin(client, String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  addAuthHeaders(http);

  String payload;
  serializeJson(body, payload);
  int status = http.POST(payload);
  http.end();
  return status >= 200 && status < 300;
}

struct WaterResult {
  uint32_t actualDurationSec;
  bool flowConfirmed;
  const char* abortedReason; // nullptr if not aborted
};

// Executes a watering command on one zone with all local safety logic.
// Never trusts `requestedDurationSec` beyond kMaxRuntimeSec. Refuses to
// run at all on an unconfigured zone or while another zone is already
// active -- the single blocking loop() already makes concurrent zones
// impossible in practice, but this is the explicit arbitration point the
// scaling brief calls for, not just an accident of the current control
// flow.
WaterResult runWatering(size_t zoneIndex, uint32_t requestedDurationSec) {
  if (zoneIndex >= kZoneCount || !zoneConfigured(zoneIndex) || g_activeZone != kNoActiveZone) {
    return WaterResult{0, false, "configuration_fault"};
  }

  g_activeZone = static_cast<int8_t>(zoneIndex);
  uint32_t cappedDurationSec = min(requestedDurationSec, kMaxRuntimeSec);
  g_flowPulseCount[zoneIndex] = 0;

  pulseValve(zoneIndex, /*open=*/true);
  digitalWrite(PIN_BUTTON_LED, HIGH);

  uint32_t startMs = millis();
  bool flowSeen = false;
  const char* abortedReason = nullptr;

  while (static_cast<uint32_t>(millis() - startMs) < cappedDurationSec * 1000UL) {
    if (!flowSeen && g_flowPulseCount[zoneIndex] > 0) {
      flowSeen = true;
    }
    // Flow-sensor cross-check: valve opened but no flow after the grace
    // period means something is wrong upstream (closed supply, stuck
    // valve, etc.) — abort rather than run the full duration dry.
    if (!flowSeen && static_cast<uint32_t>(millis() - startMs) > kFlowCheckGraceMs) {
      abortedReason = "no_flow_detected";
      break;
    }
    delay(100);
  }

  uint32_t actualDurationSec = static_cast<uint32_t>(millis() - startMs) / 1000;
  pulseValve(zoneIndex, /*open=*/false);
  digitalWrite(PIN_BUTTON_LED, LOW);
  g_activeZone = kNoActiveZone;

  return WaterResult{actualDurationSec, flowSeen, abortedReason};
}

void confirmCommand(const String& commandId, const WaterResult& result) {
  JsonDocument body;
  body["command_id"] = commandId;
  body["actual_duration_sec"] = result.actualDurationSec;
  body["flow_confirmed"] = result.flowConfirmed;
  body["aborted_reason"] = result.abortedReason ? result.abortedReason : nullptr;
  httpPostJson("/confirm", body);
}

void pollForCommand() {
  JsonDocument doc;
  if (!httpGetJson("/command", doc)) return;

  const char* action = doc["action"];
  if (!action || strcmp(action, "water") != 0) return;

  String commandId = doc["command_id"].as<String>();
  uint32_t valveChannel = doc["valve_channel"] | 0;
  uint32_t durationSec = doc["duration_sec"] | kDefaultManualDurationSec;

  if (valveChannel < 1 || valveChannel > kZoneCount) {
    Serial.printf("[irrigation] command %s has out-of-range valve_channel %u -- ignoring\n", commandId.c_str(), valveChannel);
    return;
  }

  WaterResult result = runWatering(valveChannel - 1, durationSec);
  confirmCommand(commandId, result);
}

// Physical button press: locally-initiated, not something the device asks
// the Worker's permission for -- the button *is* local authority, matching
// docs/irrigation-api.md's safety model. Runs immediately, then reports
// what happened via /manual (device-facing, X-Device-Key auth) rather than
// pretending it went through the async request/poll queue it never used.
void handleManualButton() {
  if (digitalRead(PIN_BUTTON) != LOW) return; // active-low, not pressed
  if (millis() - g_lastButtonPressMs < kButtonDebounceMs) return;
  g_lastButtonPressMs = millis();

  int8_t zoneIndex = readRotarySwitch();
  if (zoneIndex < 0) {
    Serial.println("[irrigation] manual button pressed but rotary switch is between positions -- ignoring");
    return;
  }
  if (!zoneConfigured(static_cast<size_t>(zoneIndex))) {
    Serial.printf("[irrigation] manual button pressed for zone %d, but that zone's pins aren't configured yet -- ignoring\n", zoneIndex + 1);
    return;
  }

  WaterResult result = runWatering(static_cast<size_t>(zoneIndex), kDefaultManualDurationSec);

  JsonDocument body;
  body["zone_id"] = zoneIdForIndex(static_cast<size_t>(zoneIndex));
  body["requested_duration_sec"] = kDefaultManualDurationSec;
  body["actual_duration_sec"] = result.actualDurationSec;
  body["flow_confirmed"] = result.flowConfirmed;
  body["aborted_reason"] = result.abortedReason ? result.abortedReason : nullptr;
  httpPostJson("/manual", body);
}

} // namespace

void setup() {
  Serial.begin(115200);
  delay(500);  // give the USB CDC host time to attach before the first print
  Serial.println("GroveIQ irrigation controller booting...");

  bool pinConfigOk = validatePinConfiguration();

  for (size_t i = 0; i < kZoneCount; i++) {
    if (!zoneConfigured(i)) continue;
    pinMode(kZonePins[i].valveIn1, OUTPUT);
    pinMode(kZonePins[i].valveIn2, OUTPUT);
    digitalWrite(kZonePins[i].valveIn1, LOW);
    digitalWrite(kZonePins[i].valveIn2, LOW);
    pinMode(kZonePins[i].flowSensor, INPUT); // external voltage divider -- INPUT, not INPUT_PULLUP
  }
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_BUTTON_LED, OUTPUT);
  pinMode(PIN_ROTARY_POS1, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS2, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS3, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS4, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS5, INPUT_PULLUP);

  if (!pinConfigOk) {
    // Configuration fault (duplicate GPIO assignment) -- refuse to operate
    // any valve at all rather than risk cross-actuating zones. Camera
    // still starts below; irrigation just never accepts watering.
    Serial.println("[irrigation] CONFIG FAULT at boot -- all watering refused until pins.h is fixed");
  } else {
    for (size_t i = 0; i < kZoneCount; i++) {
      if (!zoneConfigured(i)) continue;
      attachInterrupt(digitalPinToInterrupt(kZonePins[i].flowSensor), kFlowIsrs[i], RISING);
    }
  }

  // Sequential boot close-all: a latching valve can remain open across a
  // reset/power interruption (setting GPIOs LOW only removes coil power,
  // it doesn't send a CLOSE pulse). This restores a known closed state
  // whenever the controller starts successfully -- it cannot help if the
  // controller loses ALL power while a valve is open, since it can't issue
  // a CLOSE pulse without power. That's a hardware/power-strategy problem
  // (backup energy, a supervised shutdown circuit, etc.), not something
  // firmware can solve after the fact.
  closeAllValves();

  if (connectWifi()) {
    Serial.print("WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connect failed at boot — will keep retrying in loop()");
  }

  // Runs on core 0, entirely separate from this loop()'s irrigation safety
  // logic (core 1) — see camera_task.h for the isolation rationale. Camera
  // health is never a prerequisite for irrigation safety, in either
  // direction.
  startCameraTask();

  // Only accept remote/manual watering commands once the full close-all
  // sequence above has completed and every zone is confirmed logically
  // closed.
  Serial.println("Setup complete, entering loop()");
}

void loop() {
  if (!wifiConnected()) {
    ensureAllValvesClosed();
    Serial.println("WiFi disconnected, reconnecting...");
    if (connectWifi()) {
      Serial.print("WiFi reconnected, IP: ");
      Serial.println(WiFi.localIP());
    }
    delay(1000);
    return;
  }

  handleManualButton();

  static uint32_t lastPollMs = 0;
  if (static_cast<uint32_t>(millis() - lastPollMs) >= kPollIntervalMs) {
    lastPollMs = millis();
    pollForCommand();
  }

  // Heartbeat so it's visible on the serial monitor that loop() is alive
  // even when nothing else has happened yet (no button press, no pending
  // server command) -- otherwise the last line ever printed can be from
  // setup(), which looks identical to a hang.
  static uint32_t lastHeartbeatMs = 0;
  if (static_cast<uint32_t>(millis() - lastHeartbeatMs) >= 60000) {
    lastHeartbeatMs = millis();
    Serial.println("[irrigation] loop alive, WiFi connected");
  }

  delay(50);
}
