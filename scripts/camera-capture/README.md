# GroveIQ Camera Capture

Node script that captures a photo from the Reolink E1 Outdoor Pro (via its
local network API) and uploads it through GroveIQ's existing vision-analysis
pipeline — the same one the app's manual "Upload photo" button uses.

**Status: written against Reolink's documented local HTTP CGI API
(`cmd=Login`/`Snap`/`PtzCtrl`), never run against a real camera** — the
camera is ordered but not installed yet (see CHECKLIST.md). Verify every
step below manually against your actual unit before trusting the schedule
or leaving `--watch` running unattended.

## Why a local script at all

Both the camera and this Mac sit on your home network with no public IP —
same situation as the ESP32 irrigation controller. Cloudflare Workers can't
reach in and pull a snapshot directly, so this script does the opposite:
it reaches *out* to the camera, then *out* to the Worker. See
`docs/irrigation-api.md` for the fuller version of this reasoning; it's the
same one here.

## Three ways to run it

```bash
node capture.mjs mountain-hemlock         # one tree, right now
node capture.mjs --all                    # every configured tree, right now
node capture.mjs --all --auto             # same, tagged source=scheduled (for the daily launchd job)
node capture.mjs --watch                  # long-running: services the app's "Capture now" button
```

`--watch` is a separate, continuously-running process from the other three
— it polls the Worker every `watchPollMs` (default 15s) for pending
in-app capture requests and services them as they arrive. It needs to
actually be running for the "Capture now" button in Tree Detail to do
anything; otherwise the app just waits and eventually times out.

## One-time setup

1. **Enable local API access on the camera.** In the Reolink app: Device
   Settings → Network → Advanced → make sure LAN/local access isn't
   restricted. Note the camera's local IP (same screen, or check your
   router's DHCP client list).
2. **Set PTZ presets**, one per tree, in the Reolink app — point the
   camera at each tree and save a numbered preset. Note which preset
   number is which tree.
3. **Add a `CAMERA_DEVICE_KEY` Worker secret**, from the repo root:
   ```bash
   openssl rand -hex 32 | npx wrangler secret put CAMERA_DEVICE_KEY
   ```
   Keep the generated value — it goes in `config.json` too.
4. **Add a Cloudflare Access "Bypass" policy** for
   `api.grove-iq.com/api/v1/capture/command` and
   `api.grove-iq.com/api/v1/capture/upload/*` and
   `api.grove-iq.com/api/v1/capture/fail/*` — same as the existing
   bypasses for `/privacy`, `/terms`, and the Twilio webhook. Without
   this, Access intercepts the request before the Worker's own
   `X-Camera-Key` check ever runs. This is a Zero Trust dashboard change,
   not something doable from code. *(Note: this project has never
   actually confirmed the irrigation ESP32's endpoints have an equivalent
   bypass either — worth checking that at the same time, since it'll hit
   the identical problem once that firmware is flashed.)*
5. `cp config.example.json config.json` and fill in the camera IP,
   credentials, the device key from step 3, and the tree→preset mapping
   from step 2. `config.json` is gitignored — never commit your filled-in
   copy.
6. **Test the camera connection directly** before trusting the script:
   ```bash
   curl -X POST "http://<camera-ip>/cgi-bin/api.cgi?cmd=Login" \
     -d '[{"cmd":"Login","action":0,"param":{"User":{"userName":"<user>","password":"<password>"}}}]'
   ```
   Should return JSON containing a `Token`. If this fails, local API access
   likely isn't enabled yet (step 1) — fix that before debugging the script
   itself.
7. Dry-run one tree by hand: `node capture.mjs <tree-id>` and confirm a new
   photo shows up in that tree's Imagery section in the app.

## Auto-capture on a schedule

Copy `com.groveiq.capture-daily.plist.example` to
`~/Library/LaunchAgents/com.groveiq.capture-daily.plist`, edit the
`/REPLACE/WITH/...` paths inside (run `which node` for the first one),
then:

```bash
launchctl load ~/Library/LaunchAgents/com.groveiq.capture-daily.plist
```

Defaults to once daily at 10:00 AM — edit the `Hour`/`Minute` values to
change it. Logs land in `capture-daily.log`/`.err` next to the script.

## In-app "Capture now" button

Copy `com.groveiq.capture-watch.plist.example` to
`~/Library/LaunchAgents/com.groveiq.capture-watch.plist`, same path edits,
then:

```bash
launchctl load ~/Library/LaunchAgents/com.groveiq.capture-watch.plist
```

This one runs continuously (`RunAtLoad` + `KeepAlive`) rather than on a
schedule — it's what makes Tree Detail's "Capture now" button actually
reach the camera. If it's not running, the button will just spin and
eventually show a "no response from the camera script" error.

To check it's alive: `launchctl list | grep groveiq`, or watch
`capture-watch.log` while clicking the button in the app.

## Moving off this Mac later

Both plists just run `node capture.mjs` with different arguments — moving
to a Raspberry Pi or similar is copying this directory over and setting up
the equivalent systemd units (or cron for the daily one, and a systemd
service with `Restart=always` for the watch loop). Nothing here is
Mac-specific except the launchd plists themselves.
