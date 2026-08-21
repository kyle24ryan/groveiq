#pragma once

// Copy this file to secrets.h (gitignored) and fill in real values.
// secrets.h is included by main.cpp and must never be committed.

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Must match the IRRIGATION_DEVICE_KEY secret set on the Worker
// (wrangler secret put IRRIGATION_DEVICE_KEY).
#define DEVICE_KEY "REPLACE_ME"

#define API_BASE_URL "https://api.grove-iq.com/api/v1/irrigation"

// Cloudflare Access Service Token (Zero Trust -> Access -> Service Auth ->
// Service Tokens), scoped to an Access policy covering
// api.grove-iq.com/api/v1/irrigation/* -- same 3-step process as
// scripts/camera-capture/README.md step 4 describes for the camera path,
// just pointed at /api/v1/irrigation/* instead. This project has never
// actually set this up for irrigation (confirmed via that same README) --
// do it before flashing, or /command and /confirm will be blocked at
// Cloudflare's edge before DEVICE_KEY is ever checked. Named distinctly
// from camera_task.cpp's CF_ACCESS_CLIENT_ID/SECRET since both files
// share this one secrets.h and the two services' policies (and possibly
// tokens) are separately scoped -- can point at the same token value if
// you choose to reuse one, or a different one.
#define IRRIGATION_CF_ACCESS_CLIENT_ID "REPLACE_ME"
#define IRRIGATION_CF_ACCESS_CLIENT_SECRET "REPLACE_ME"

// --- Camera capture (runs as a separate FreeRTOS task on core 0 -- see
// camera_task.cpp -- isolated from the irrigation safety loop above,
// which stays on core 1) ---

#define CAMERA_IP "REPLACE_ME"       // e.g. "10.0.0.152", from the Reolink app
#define CAMERA_USER "REPLACE_ME"     // e.g. "admin"
#define CAMERA_PASSWORD "REPLACE_ME"

#define CAPTURE_API_BASE_URL "https://api.grove-iq.com/api/v1/capture"

// Must match the CAMERA_DEVICE_KEY secret set on the Worker
// (wrangler secret put CAMERA_DEVICE_KEY) -- a separate key from
// DEVICE_KEY above, not reused, so the camera and valve controller don't
// share a credential.
#define CAMERA_DEVICE_KEY "REPLACE_ME"

// Cloudflare Access Service Token (Zero Trust -> Access -> Service Auth
// -> Service Tokens), scoped to an Access policy covering
// api.grove-iq.com/api/v1/capture/* -- see
// scripts/camera-capture/README.md step 4 for exactly how these are
// created. This is what actually gates the endpoint at Cloudflare's
// edge; CAMERA_DEVICE_KEY above is a second, Worker-side check, not the
// primary one.
#define CF_ACCESS_CLIENT_ID "REPLACE_ME"
#define CF_ACCESS_CLIENT_SECRET "REPLACE_ME"
