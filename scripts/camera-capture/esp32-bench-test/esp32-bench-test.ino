// GroveIQ ESP32 camera-capture bench test — snapshot from the Reolink,
// upload it through the real Worker pipeline, print the vision-analysis
// result. This is a ONE-OFF VALIDATION SKETCH, not the production capture
// path (that's scripts/camera-capture/capture.mjs, run from a Mac) —
// see the architecture discussion in this session for why: this same
// firmware would need real safety-logic isolation (a separate FreeRTOS
// task) before it'd be appropriate to merge into the irrigation
// controller, which this sketch does not attempt.
//
// Extends the snapshot-only test that already proved the ESP32-S3 can
// pull a full-size Reolink JPEG (488KB in 1.3s, 8.3MB PSRAM free after) —
// same camera leg, now also uploads to GroveIQ and prints what came back.
//
// SECURITY NOTE: uses WiFiClientSecure::setInsecure() to skip TLS
// certificate validation, because this project's existing irrigation
// firmware (firmware/irrigation/src/main.cpp) calls HTTPClient::begin()
// on an https:// URL with no certificate handling at all -- untested,
// and very likely to fail the TLS handshake once actually flashed,
// independent of anything here. setInsecure() is a fine shortcut for a
// bench test typed in by hand; it is NOT what unattended production
// firmware talking to a real backend should do long-term (a
// man-in-the-middle on the WiFi network could intercept requests).
// Proper fix for both this sketch and the irrigation firmware: pin
// Cloudflare's root CA via WiFiClientSecure::setCACert(). Flagging this
// rather than quietly "fixing" it by pinning a cert I can't verify
// against your actual TLS chain from here.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// --- WiFi ---
const char* WIFI_SSID = "Ryan Household";
const char* WIFI_PASSWORD = "REPLACE_ME";  // re-enter -- not saving your real password in a file I write

// --- Reolink camera (local network, plain HTTP) ---
const char* CAMERA_IP = "10.0.0.152";
const char* CAMERA_USER = "admin";
const char* CAMERA_PASSWORD = "REPLACE_ME";  // re-enter -- see note above

// --- GroveIQ Worker (public internet, HTTPS) ---
const char* WORKER_BASE_URL = "https://api.grove-iq.com";
const char* TREE_ID = "mountain-hemlock";  // change to whichever tree you're testing against

// Matches the CAMERA_DEVICE_KEY Worker secret (already set — see
// CHECKLIST.md "camera capture" section for this exact value).
const char* CAMERA_DEVICE_KEY = "565c4c2e25db813d1da2aafc10e288f6d6731ed122a9c8d5551073f6cb7266aa";

// From Cloudflare Zero Trust -> Access -> Service Auth -> Service
// Tokens. Leave as REPLACE_ME until you've created the token and its
// Access policy for api.grove-iq.com/api/v1/capture/* (README.md step
// 4) -- until then the upload will get Access's block page, not the
// Worker, same as the curl test earlier in this session showed.
const char* CF_ACCESS_CLIENT_ID = "REPLACE_ME";
const char* CF_ACCESS_CLIENT_SECRET = "REPLACE_ME";

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n=== GroveIQ ESP32 Bench Test: camera -> Worker -> vision analysis ===");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi connected, ESP32 IP: " + WiFi.localIP().toString());

  // --- Step 1: snapshot from the Reolink (same as the earlier test) ---
  String snapUrl = String("http://") + CAMERA_IP +
    "/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=groveiq"
    "&user=" + CAMERA_USER + "&password=" + CAMERA_PASSWORD;

  HTTPClient camHttp;
  camHttp.setTimeout(30000);
  Serial.println("Requesting Reolink snapshot...");
  if (!camHttp.begin(snapUrl)) {
    Serial.println("FAIL: camHttp.begin()");
    return;
  }
  int camCode = camHttp.GET();
  Serial.printf("Snapshot HTTP status: %d\n", camCode);
  if (camCode != 200) {
    Serial.println("FAIL: camera did not return HTTP 200");
    camHttp.end();
    return;
  }

  int contentLength = camHttp.getSize();
  if (contentLength <= 0) {
    Serial.println("FAIL: camera didn't report a Content-Length, can't size the buffer");
    camHttp.end();
    return;
  }

  uint8_t* buffer = (uint8_t*)ps_malloc(contentLength);
  if (buffer == nullptr) {
    Serial.println("FAIL: could not allocate PSRAM buffer");
    camHttp.end();
    return;
  }

  WiFiClient* camStream = camHttp.getStreamPtr();
  size_t totalBytes = 0;
  unsigned long snapStart = millis();
  while (camHttp.connected() && totalBytes < (size_t)contentLength) {
    int available = camStream->available();
    if (available > 0) {
      size_t toRead = min((size_t)available, (size_t)contentLength - totalBytes);
      int readCount = camStream->readBytes(buffer + totalBytes, toRead);
      if (readCount > 0) totalBytes += readCount;
    } else {
      delay(1);
    }
  }
  camHttp.end();

  if (totalBytes != (size_t)contentLength) {
    Serial.printf("FAIL: expected %d bytes, got %u\n", contentLength, (unsigned)totalBytes);
    free(buffer);
    return;
  }
  Serial.printf("Snapshot OK: %u bytes in %.2fs\n", (unsigned)totalBytes, (millis() - snapStart) / 1000.0);

  // --- Step 2: upload to GroveIQ (public HTTPS, cert validation skipped -- see header note) ---
  WiFiClientSecure secureClient;
  secureClient.setInsecure();

  String uploadUrl = String(WORKER_BASE_URL) + "/api/v1/capture/upload/" + TREE_ID + "?source=manual";
  HTTPClient uploadHttp;
  uploadHttp.setTimeout(60000);  // vision analysis takes longer than a snapshot fetch

  Serial.println("Uploading to " + uploadUrl + " ...");
  if (!uploadHttp.begin(secureClient, uploadUrl)) {
    Serial.println("FAIL: uploadHttp.begin()");
    free(buffer);
    return;
  }
  uploadHttp.addHeader("Content-Type", "image/jpeg");
  uploadHttp.addHeader("X-Camera-Key", CAMERA_DEVICE_KEY);
  uploadHttp.addHeader("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
  uploadHttp.addHeader("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);

  unsigned long uploadStart = millis();
  int uploadCode = uploadHttp.POST(buffer, totalBytes);
  String responseBody = uploadHttp.getString();
  uploadHttp.end();
  free(buffer);

  Serial.printf("Upload HTTP status: %d (%.2fs)\n", uploadCode, (millis() - uploadStart) / 1000.0);
  Serial.println("Response body:");
  Serial.println(responseBody);

  Serial.println();
  if (uploadCode == 200) {
    Serial.println("=== SUCCESS: full pipeline verified (camera -> ESP32 -> Worker -> Claude vision) ===");
  } else if (uploadCode == 302 || uploadCode == 401 || uploadCode == 403) {
    Serial.println("=== BLOCKED: check the CF_ACCESS_CLIENT_ID/SECRET above -- Access is rejecting this request before the Worker sees it ===");
  } else {
    Serial.println("=== FAIL: see response body above ===");
  }
}

void loop() {
  delay(1000);
}
