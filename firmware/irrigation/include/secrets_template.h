#pragma once

// Copy this file to secrets.h (gitignored) and fill in real values.
// secrets.h is included by main.cpp and must never be committed.

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Must match the IRRIGATION_DEVICE_KEY secret set on the Worker
// (wrangler secret put IRRIGATION_DEVICE_KEY).
#define DEVICE_KEY "REPLACE_ME"

#define API_BASE_URL "https://api.grove-iq.com/api/v1/irrigation"
