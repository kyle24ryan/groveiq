#!/usr/bin/env node
// GroveIQ camera capture script — see README.md for setup.
//
// STATUS: written against Reolink's documented local HTTP CGI API
// (cmd=Login/Snap/PtzCtrl), but never run against a real camera — the
// Reolink E1 Outdoor Pro is ordered, not installed yet (CHECKLIST.md).
// Verify each step manually (README's "test the camera connection" step)
// before trusting this on a schedule or leaving --watch running unattended.
//
// Three ways to run it, all sharing the same capture logic:
//   node capture.mjs <tree-id> [<tree-id> ...]   one-shot, specific trees, source=manual
//   node capture.mjs --all [--auto]              one-shot, every configured tree
//                                                 (--auto tags it source=scheduled, for launchd)
//   node capture.mjs --watch                     long-running: polls the Worker for
//                                                 in-app "Capture now" requests and
//                                                 services them as they arrive

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));

const WATCH_POLL_MS = config.watchPollMs ?? 15000;
const SETTLE_MS = config.settleMs ?? 2500;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Auth for every request to the Worker's device-facing /api/v1/capture/*
// endpoints: a Cloudflare Access Service Token (CF-Access-Client-Id/
// -Secret) gates the request at Cloudflare's edge before the Worker ever
// runs -- requests without a valid token never reach the Worker at all.
// X-Camera-Key is kept as a second, Worker-side check (defense in depth,
// costs nothing since it was already built) but the Service Token is the
// real gate now, not a bypass. See README.md's Cloudflare Access setup
// step for how the token/policy are created -- that's a Zero Trust
// dashboard change, not something this script can do for itself.
function deviceHeaders(extra = {}) {
  return {
    'X-Camera-Key': config.cameraDeviceKey,
    'CF-Access-Client-Id': config.cfAccessClientId,
    'CF-Access-Client-Secret': config.cfAccessClientSecret,
    ...extra,
  };
}

async function reolinkLogin() {
  const res = await fetch(`http://${config.cameraIp}/cgi-bin/api.cgi?cmd=Login`, {
    method: 'POST',
    body: JSON.stringify([{ cmd: 'Login', action: 0, param: { User: { userName: config.cameraUser, password: config.cameraPassword } } }]),
  });
  const data = await res.json();
  const token = data?.[0]?.value?.Token?.name;
  if (!token) throw new Error(`Reolink login failed: ${JSON.stringify(data)}`);
  return token;
}

async function movePreset(token, presetId) {
  const res = await fetch(`http://${config.cameraIp}/cgi-bin/api.cgi?cmd=PtzCtrl&token=${token}`, {
    method: 'POST',
    body: JSON.stringify([{ cmd: 'PtzCtrl', action: 0, param: { channel: 0, op: 'ToPos', id: presetId, speed: 32 } }]),
  });
  const data = await res.json();
  if (data?.[0]?.code !== 0) throw new Error(`PTZ move to preset ${presetId} failed: ${JSON.stringify(data)}`);
}

async function snapshot(token) {
  const res = await fetch(`http://${config.cameraIp}/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=${Date.now()}&token=${token}`);
  if (!res.ok) throw new Error(`Snapshot request failed: HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

async function uploadToGroveIQ(treeId, bytes, contentType, source, requestId) {
  const qs = new URLSearchParams({ source });
  if (requestId) qs.set('request_id', requestId);
  const res = await fetch(`${config.workerBaseUrl}/api/v1/capture/upload/${treeId}?${qs}`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': contentType }),
    body: bytes,
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Upload for ${treeId} failed: ${JSON.stringify(data)}`);
  return data;
}

// Captures one tree (PTZ to its preset, snapshot, upload) and returns the
// analysis result. Throws on any step's failure — callers decide how to
// report that (CLI exit code vs. logging and continuing the watch loop).
async function captureTree(token, treeId, source, requestId) {
  const presetId = config.treePresets[treeId];
  if (presetId === undefined) throw new Error(`no preset configured for "${treeId}" in config.json`);

  log(`[${treeId}] moving to preset ${presetId}...`);
  await movePreset(token, presetId);
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  log(`[${treeId}] capturing snapshot...`);
  const { bytes, contentType } = await snapshot(token);

  log(`[${treeId}] uploading (${(bytes.byteLength / 1024).toFixed(0)}KB)...`);
  const result = await uploadToGroveIQ(treeId, bytes, contentType, source, requestId);
  log(`[${treeId}] done — status: ${result.status}, summary: ${result.summary}`);
  return result;
}

async function runOneShot(targets, source) {
  const token = await reolinkLogin();
  const failures = [];
  for (const treeId of targets) {
    try {
      await captureTree(token, treeId, source, null);
    } catch (err) {
      console.error(`[${treeId}] FAILED: ${err.message}`);
      failures.push(treeId);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length}/${targets.length} captures failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

// Polls /api/v1/capture/command for in-app "Capture now" requests and
// services them one at a time. Runs until killed (launchd KeepAlive, or
// Ctrl+C in a terminal) — this is the process that makes the app's button
// actually do something, since the Worker has no way to reach this script
// on its own (no public IP on the home network, same as the ESP32).
async function runWatch() {
  log('watching for capture requests (Ctrl+C to stop)...');
  for (;;) {
    try {
      const res = await fetch(`${config.workerBaseUrl}/api/v1/capture/command`, {
        headers: deviceHeaders(),
      });
      const data = await res.json();
      if (data.action === 'capture') {
        log(`request ${data.request_id} for ${data.tree_id} — capturing...`);
        try {
          const token = await reolinkLogin();
          await captureTree(token, data.tree_id, 'manual', data.request_id);
        } catch (err) {
          console.error(`request ${data.request_id} FAILED: ${err.message}`);
          // Still tell the Worker so the app stops showing "waiting"
          // instead of leaving the request pending until it times out
          // client-side.
          try {
            await fetch(`${config.workerBaseUrl}/api/v1/capture/fail/${data.request_id}`, {
              method: 'POST',
              headers: deviceHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ error: err.message }),
            });
          } catch {
            // Best-effort — if this also fails, the request just times out
            // client-side (TreeDetail.tsx gives up after a few minutes).
          }
        }
      }
    } catch (err) {
      console.error(`poll failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, WATCH_POLL_MS));
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--watch')) {
    await runWatch();
    return;
  }

  const source = args.includes('--auto') ? 'scheduled' : 'manual';
  const targets = args.includes('--all') ? Object.keys(config.treePresets) : args.filter((a) => !a.startsWith('--'));

  if (targets.length === 0) {
    console.error('Usage: node capture.mjs <tree-id> [<tree-id> ...] | --all [--auto] | --watch');
    process.exit(1);
  }

  await runOneShot(targets, source);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
