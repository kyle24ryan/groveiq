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

   **The Reolink CGI API's preset `id` is 0-indexed** — confirmed live
   2026-08-15 by testing directly with curl. If the app shows a preset as
   slot "1", `config.json`'s `treePresets` (and `tree_presets.h` on the
   ESP32) need `0`, not `1` — subtract 1 from whatever number the app
   displays.
3. **Add a `CAMERA_DEVICE_KEY` Worker secret**, from the repo root:
   ```bash
   openssl rand -hex 32 | npx wrangler secret put CAMERA_DEVICE_KEY
   ```
   Keep the generated value — it goes in `config.json` too.
4. **Add a Cloudflare Access Service Token**, not a bypass — a Service
   Token still requires Access to authenticate every request at
   Cloudflare's edge (checking a client ID/secret pair), rather than
   opening the path up and relying solely on the Worker's own
   `X-Camera-Key` check. This is a Zero Trust dashboard change; the steps
   below can't be done from code or by me on your behalf:
   1. **Zero Trust dashboard → Access → Service Auth → Service Tokens →
      Create Service Token.** Name it something like `groveiq-camera`.
      Cloudflare shows the **Client ID** and **Client Secret** exactly
      once — copy both immediately, they go in `config.json` in step 5.
   2. **Access → Applications** — create (or reuse, if one already
      covers `api.grove-iq.com`) a self-hosted Access Application whose
      path covers `api.grove-iq.com/api/v1/capture/*`.
   3. Add a policy to that application: **Action: Service Auth**,
      **Include: Valid Service Token** → select the token from step 1.
   Once this is live, a request to that path with a valid
   `CF-Access-Client-Id`/`CF-Access-Client-Secret` pair reaches the
   Worker as normal; anything else gets Access's standard block page —
   the endpoint is never actually open. *(Note: this project has never
   confirmed the irrigation ESP32's endpoints have equivalent protection
   either — worth setting up the same way before that firmware gets
   flashed, since it hits the identical problem.)*
5. `cp config.example.json config.json` and fill in the camera IP,
   credentials, the device key from step 3, the Service Token client
   ID/secret from step 4, and the tree→preset mapping from step 2.
   `config.json` is gitignored — never commit your filled-in copy.
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
