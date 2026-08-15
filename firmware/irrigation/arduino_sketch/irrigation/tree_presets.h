#pragma once

#include <cstring>

// One row per tree with a Reolink PTZ preset configured -- mirrors
// scripts/camera-capture/config.example.json's treePresets. There's no
// runtime config file on this device, so update this (not config.json)
// when preset numbers change in the Reolink app.
//
// IMPORTANT: presetId is the raw PtzCtrl "id" sent over the CGI API, which
// is 0-INDEXED -- confirmed live 2026-08-15 (the app's "preset 1" only
// moved the camera when called with id: 0, not id: 1). If the Reolink
// app's own UI shows presets as 1-based slots, subtract 1 from whatever
// slot number it displays before writing it here.
struct TreePreset {
  const char* treeId;
  int presetId;
};

inline const TreePreset kTreePresets[] = {
  {"yellow-cedar-1", 0},
  {"yellow-cedar-2", 1},
  {"silver-fir", 2},
  {"dawn-redwood", 3},
  {"mountain-hemlock", 4}
};
inline constexpr size_t kTreePresetCount = sizeof(kTreePresets) / sizeof(kTreePresets[0]);

// Returns -1 if no preset is configured for this tree.
inline int presetForTree(const char* treeId) {
  for (size_t i = 0; i < kTreePresetCount; i++) {
    if (strcmp(kTreePresets[i].treeId, treeId) == 0) return kTreePresets[i].presetId;
  }
  return -1;
}
