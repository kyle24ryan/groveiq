// GroveIQ Irrigation Controller — v1 single-zone
//
// UNTESTED SKELETON: written against the documented hardware (see
// firmware/irrigation/README.md) but never flashed to a real board. Treat
// pin assignments, timing constants, and the DRV8871 pulse polarity as
// starting points to verify on the bench, not as confirmed-correct.
//
// Safety model (see docs/irrigation-api.md): this firmware enforces every
// safety rule locally and independent of connectivity. The Worker only ever
// requests "water this zone for N seconds" — it cannot force an unsafe
// state. If WiFi is down, if the Worker is unreachable, or if a
// server-requested duration exceeds the local cap, the valve stays closed
// or is cut off, no exceptions.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "pins.h"
#include "secrets.h"

namespace {

constexpr uint32_t kPollIntervalMs = 15000;
constexpr uint32_t kMaxRuntimeSec = 180;          // hard cutoff, overrides any server-requested duration
constexpr uint32_t kFlowCheckGraceMs = 5000;      // time to see first flow pulse before aborting
constexpr uint32_t kValvePulseMs = 50;            // DRV8871 pulse width for the latching solenoid
constexpr uint32_t kDefaultManualDurationSec = 30;
constexpr uint32_t kButtonDebounceMs = 250;
constexpr uint32_t kWifiConnectTimeoutMs = 15000;

volatile uint32_t g_flowPulseCount = 0;
uint32_t g_lastButtonPressMs = 0;

void IRAM_ATTR onFlowPulse() {
  g_flowPulseCount++;
}

void setValveOpen(bool open) {
  // Latching valve: pulse one direction to open, the other to close. Do not
  // hold either pin high beyond the pulse width — this is not a
  // continuous-duty solenoid.
  digitalWrite(open ? PIN_VALVE_IN1 : PIN_VALVE_IN2, HIGH);
  delay(kValvePulseMs);
  digitalWrite(PIN_VALVE_IN1, LOW);
  digitalWrite(PIN_VALVE_IN2, LOW);
}

bool wifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

// Fail-closed: called whenever we're about to skip a loop iteration due to
// no WiFi, a failed request, etc. Guarantees the valve is never left open
// with nothing watching it.
void ensureValveClosed() {
  setValveOpen(false);
  digitalWrite(PIN_BUTTON_LED, LOW);
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

// Returns true if the JSON body was parsed into `doc`.
bool httpGetJson(const String& path, JsonDocument& doc) {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("X-Device-Key", DEVICE_KEY);

  int status = http.GET();
  if (status != 200) {
    http.end();
    return false;
  }
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  return !err;
}

bool httpPostJson(const String& path, const JsonDocument& body, bool withDeviceKey) {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  if (withDeviceKey) http.addHeader("X-Device-Key", DEVICE_KEY);

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

// Executes a watering command with all local safety logic. Never trusts
// `requestedDurationSec` beyond kMaxRuntimeSec.
WaterResult runWatering(uint32_t requestedDurationSec) {
  uint32_t cappedDurationSec = min(requestedDurationSec, kMaxRuntimeSec);
  g_flowPulseCount = 0;

  setValveOpen(true);
  digitalWrite(PIN_BUTTON_LED, HIGH);

  uint32_t startMs = millis();
  bool flowSeen = false;
  const char* abortedReason = nullptr;

  while (millis() - startMs < cappedDurationSec * 1000UL) {
    if (!flowSeen && g_flowPulseCount > 0) {
      flowSeen = true;
    }
    // Flow-sensor cross-check: valve opened but no flow after the grace
    // period means something is wrong upstream (closed supply, stuck
    // valve, etc.) — abort rather than run the full duration dry.
    if (!flowSeen && millis() - startMs > kFlowCheckGraceMs) {
      abortedReason = "no_flow_detected";
      break;
    }
    delay(100);
  }

  uint32_t actualDurationSec = (millis() - startMs) / 1000;
  setValveOpen(false);
  digitalWrite(PIN_BUTTON_LED, LOW);

  return WaterResult{actualDurationSec, flowSeen, abortedReason};
}

void confirmCommand(const String& commandId, const WaterResult& result) {
  JsonDocument body;
  body["command_id"] = commandId;
  body["actual_duration_sec"] = result.actualDurationSec;
  body["flow_confirmed"] = result.flowConfirmed;
  if (result.abortedReason) {
    body["aborted_reason"] = result.abortedReason;
  } else {
    body["aborted_reason"] = nullptr;
  }
  httpPostJson("/confirm", body, /*withDeviceKey=*/true);
}

void pollForCommand() {
  JsonDocument doc;
  if (!httpGetJson("/command", doc)) return;

  const char* action = doc["action"];
  if (!action || strcmp(action, "water") != 0) return;

  String commandId = doc["command_id"].as<String>();
  uint32_t durationSec = doc["duration_sec"] | kDefaultManualDurationSec;

  WaterResult result = runWatering(durationSec);
  confirmCommand(commandId, result);
}

void handleManualButton() {
  if (digitalRead(PIN_BUTTON) != LOW) return; // active-low, not pressed
  if (millis() - g_lastButtonPressMs < kButtonDebounceMs) return;
  g_lastButtonPressMs = millis();

  // Self-initiate a /water request so it's recorded the same way an
  // app-triggered command would be, then execute it immediately rather
  // than waiting for the next poll.
  JsonDocument reqBody;
  // v1 has exactly one physical zone; tree_id is fixed until the 5-zone
  // scale-up gives the rotary switch positions real meaning.
  reqBody["tree_id"] = "silver-fir";
  reqBody["duration_sec"] = kDefaultManualDurationSec;
  reqBody["trigger_source"] = "manual";

  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/water");
  http.addHeader("Content-Type", "application/json");
  String payload;
  serializeJson(reqBody, payload);
  int status = http.POST(payload);

  if (status < 200 || status >= 300) {
    http.end();
    return;
  }

  JsonDocument respDoc;
  deserializeJson(respDoc, http.getStream());
  http.end();

  String commandId = respDoc["command_id"].as<String>();
  WaterResult result = runWatering(kDefaultManualDurationSec);
  confirmCommand(commandId, result);
}

} // namespace

void setup() {
  Serial.begin(115200);

  pinMode(PIN_VALVE_IN1, OUTPUT);
  pinMode(PIN_VALVE_IN2, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_BUTTON_LED, OUTPUT);
  pinMode(PIN_FLOW_SENSOR, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS1, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS2, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS3, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS4, INPUT_PULLUP);
  pinMode(PIN_ROTARY_POS5, INPUT_PULLUP);

  // Fail-closed default: valve stays closed until we successfully connect
  // and start polling. No WiFi, no valid command, or a brownout all resolve
  // to "closed" — never "open."
  ensureValveClosed();

  attachInterrupt(digitalPinToInterrupt(PIN_FLOW_SENSOR), onFlowPulse, RISING);

  if (!connectWifi()) {
    Serial.println("WiFi connect failed at boot — will keep retrying in loop()");
  }
}

void loop() {
  if (!wifiConnected()) {
    ensureValveClosed();
    connectWifi();
    delay(1000);
    return;
  }

  handleManualButton();

  static uint32_t lastPollMs = 0;
  if (millis() - lastPollMs >= kPollIntervalMs) {
    lastPollMs = millis();
    pollForCommand();
  }

  delay(50);
}
