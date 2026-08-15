// Camera-capture task -- ports scripts/camera-capture/capture.mjs's logic
// to firmware, but as ONE always-running task rather than the script's
// three separate modes (one-shot/--all/--watch), since an embedded device
// has no concept of "invoke me differently each time": every poll cycle
// it both checks for an in-app "Capture now" request (capture.mjs's
// --watch) and checks whether it's time for the scheduled daily capture
// (capture.mjs --all --auto).
//
// UNTESTED ON REAL HARDWARE, same caveat as the rest of this firmware --
// the Reolink/Worker call shapes are verified (they matched the ESP32
// bench-test sketch that DID run successfully against real hardware),
// but this specific file, the dual-core task split, and the NTP-based
// daily scheduling have not been flashed and run.
//
// Isolation from irrigation: this task touches no globals from main.cpp
// and is pinned to core 0 via xTaskCreatePinnedToCore, while the
// irrigation loop() stays on core 1 (Arduino's default loopTask core) --
// a slow Reolink or Cloudflare round-trip here cannot delay the
// flow-sensor safety check or the valve command poll. The only shared
// subsystems are Wi-Fi, the heap allocator, and Serial, all of which are
// individually thread-safe in the ESP32 Arduino core; this file creates
// its own HTTPClient/WiFiClientSecure instances rather than sharing any
// with main.cpp.

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

#include "camera_task.h"
#include "secrets.h"
#include "tree_presets.h"

namespace {

constexpr uint32_t kPollIntervalMs = 15000;   // matches capture.mjs's default watchPollMs
constexpr uint32_t kSettleMs = 5000;          // time for the camera to finish a PTZ move
constexpr int kAutoCaptureHour = 10;          // local time, matches the Mac launchd default
constexpr uint32_t kCameraTaskStackBytes = 16384;

int g_lastAutoCaptureYday = -1;  // tm_yday of the last completed auto-capture; -1 = never run

void log(const String& msg) {
  Serial.printf("[camera] %s\n", msg.c_str());
}

// A fresh WiFiClientSecure per call, not shared across calls or tasks.
// setInsecure() skips certificate validation -- acceptable for this
// project today (see the security note in
// scripts/camera-capture/esp32-bench-test/esp32-bench-test.ino.example),
// not a long-term production posture. Proper fix: pin Cloudflare's root
// CA via setCACert() here and in main.cpp's httpGetJson/httpPostJson.
WiFiClientSecure secureClient() {
  WiFiClientSecure client;
  client.setInsecure();
  return client;
}

bool reolinkLogin(String& tokenOut) {
  HTTPClient http;
  http.setTimeout(15000);
  http.begin(String("http://") + CAMERA_IP + "/cgi-bin/api.cgi?cmd=Login");
  http.addHeader("Content-Type", "application/json");
  String body = String("[{\"cmd\":\"Login\",\"action\":0,\"param\":{\"User\":{\"userName\":\"") + CAMERA_USER + "\",\"password\":\"" + CAMERA_PASSWORD + "\"}}}]";
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  if (code != 200) {
    log("Reolink login HTTP " + String(code));
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, resp)) {
    log("Reolink login: bad JSON response");
    return false;
  }
  const char* token = doc[0]["value"]["Token"]["name"];
  if (!token) {
    log("Reolink login: no token in response");
    return false;
  }
  tokenOut = String(token);
  return true;
}

bool movePreset(const String& token, int presetId) {
  log("moving to preset " + String(presetId) + "...");
  HTTPClient http;
  http.setTimeout(15000);
  http.begin(String("http://") + CAMERA_IP + "/cgi-bin/api.cgi?cmd=PtzCtrl&token=" + token);
  http.addHeader("Content-Type", "application/json");
  String body = String("[{\"cmd\":\"PtzCtrl\",\"action\":0,\"param\":{\"channel\":0,\"op\":\"ToPos\",\"id\":") + presetId + ",\"speed\":32}}]";
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  if (code != 200) {
    log("PTZ move HTTP " + String(code));
    return false;
  }
  log("PTZ move response: " + resp);
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return false;
  int resultCode = doc[0]["code"] | -1;
  if (resultCode != 0) log("PTZ move to preset " + String(presetId) + " returned code " + String(resultCode));
  return resultCode == 0;
}

// Returns nullptr on failure. Caller owns the returned buffer (PSRAM) and
// must free() it.
uint8_t* snapshot(const String& token, size_t& sizeOut) {
  HTTPClient http;
  http.setTimeout(30000);
  String url = String("http://") + CAMERA_IP + "/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=" + String(millis()) + "&token=" + token;
  if (!http.begin(url)) return nullptr;
  int code = http.GET();
  if (code != 200) {
    log("Snapshot HTTP " + String(code));
    http.end();
    return nullptr;
  }
  int contentLength = http.getSize();
  if (contentLength <= 0) {
    log("Snapshot: no Content-Length reported");
    http.end();
    return nullptr;
  }

  uint8_t* buffer = (uint8_t*)ps_malloc(contentLength);
  if (!buffer) {
    log("Snapshot: PSRAM allocation failed");
    http.end();
    return nullptr;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t total = 0;
  while (http.connected() && total < (size_t)contentLength) {
    int available = stream->available();
    if (available > 0) {
      size_t toRead = min((size_t)available, (size_t)contentLength - total);
      int readCount = stream->readBytes(buffer + total, toRead);
      if (readCount > 0) total += readCount;
    } else {
      vTaskDelay(1);
    }
  }
  http.end();

  if (total != (size_t)contentLength) {
    log("Snapshot: expected " + String(contentLength) + " bytes, got " + String((unsigned)total));
    free(buffer);
    return nullptr;
  }
  sizeOut = total;
  return buffer;
}

bool uploadToGroveIQ(const char* treeId, uint8_t* buffer, size_t size, const char* source, const char* requestId) {
  WiFiClientSecure client = secureClient();
  String url = String(CAPTURE_API_BASE_URL) + "/upload/" + treeId + "?source=" + source;
  if (requestId) url += String("&request_id=") + requestId;

  HTTPClient http;
  http.setTimeout(60000);  // vision analysis takes longer than a plain upload
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Camera-Key", CAMERA_DEVICE_KEY);
  http.addHeader("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
  http.addHeader("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);

  int code = http.POST(buffer, size);
  String resp = http.getString();
  http.end();

  log(String(treeId) + " upload: HTTP " + String(code) + " - " + resp);
  return code == 200;
}

// Best-effort -- if this also fails, the app-side request just times out
// client-side (TreeDetail.tsx gives up after a few minutes), matching
// capture.mjs's own fallback behavior.
void reportFailure(const String& requestId, const String& errorMsg) {
  WiFiClientSecure client = secureClient();
  HTTPClient http;
  if (!http.begin(client, String(CAPTURE_API_BASE_URL) + "/fail/" + requestId)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Camera-Key", CAMERA_DEVICE_KEY);
  http.addHeader("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
  http.addHeader("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);
  JsonDocument doc;
  doc["error"] = errorMsg;
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

// PTZ move, settle, snapshot, upload -- one tree, start to finish.
bool captureTree(const char* treeId, int presetId, const char* source, const char* requestId) {
  String token;
  if (!reolinkLogin(token)) return false;
  if (!movePreset(token, presetId)) return false;
  vTaskDelay(pdMS_TO_TICKS(kSettleMs));

  size_t size = 0;
  uint8_t* buffer = snapshot(token, size);
  if (!buffer) return false;

  bool ok = uploadToGroveIQ(treeId, buffer, size, source, requestId);
  free(buffer);
  return ok;
}

// Polls for an in-app "Capture now" request (spec: src/routes/capture.ts's
// GET /command) and services it if one's pending.
void checkForCommand() {
  WiFiClientSecure client = secureClient();
  HTTPClient http;
  if (!http.begin(client, String(CAPTURE_API_BASE_URL) + "/command")) return;
  http.addHeader("X-Camera-Key", CAMERA_DEVICE_KEY);
  http.addHeader("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
  http.addHeader("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }
  String resp = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, resp)) return;
  const char* action = doc["action"];
  if (!action || strcmp(action, "capture") != 0) return;

  String requestId = doc["request_id"].as<String>();
  String treeId = doc["tree_id"].as<String>();

  int presetId = presetForTree(treeId.c_str());
  if (presetId < 0) {
    log("no preset configured for " + treeId);
    reportFailure(requestId, "no preset configured for this tree on the device");
    return;
  }

  log("servicing capture request " + requestId + " for " + treeId);
  if (!captureTree(treeId.c_str(), presetId, "manual", requestId.c_str())) {
    reportFailure(requestId, "capture failed on device — see device serial log");
  }
}

// Runs the full-collection capture once per day at kAutoCaptureHour local
// time. Needs NTP (see cameraTaskLoop) -- until that syncs, time(nullptr)
// stays near the epoch and this deliberately no-ops rather than firing
// at the wrong time.
void checkForAutoCapture() {
  time_t now = time(nullptr);
  if (now < 100000) return;  // NTP hasn't synced yet

  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  if (timeinfo.tm_hour != kAutoCaptureHour) return;
  if (timeinfo.tm_yday == g_lastAutoCaptureYday) return;  // already ran today

  log("running scheduled auto-capture for all configured trees...");
  for (size_t i = 0; i < kTreePresetCount; i++) {
    captureTree(kTreePresets[i].treeId, kTreePresets[i].presetId, "scheduled", nullptr);
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
  g_lastAutoCaptureYday = timeinfo.tm_yday;
  log("auto-capture cycle complete");
}

void cameraTaskLoop(void*) {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  log("camera task started on core " + String(xPortGetCoreID()));

  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      checkForCommand();
      checkForAutoCapture();
    }
    vTaskDelay(pdMS_TO_TICKS(kPollIntervalMs));
  }
}

}  // namespace

void startCameraTask() {
  xTaskCreatePinnedToCore(cameraTaskLoop, "camera_task", kCameraTaskStackBytes, nullptr, 1, nullptr, 0);
}
