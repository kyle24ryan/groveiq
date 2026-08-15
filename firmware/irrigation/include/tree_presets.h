#pragma once

#include <cstring>

// One row per tree with a Reolink PTZ preset configured -- mirrors
// scripts/camera-capture/config.example.json's treePresets. There's no
// runtime config file on this device, so update this (not config.json)
// when preset numbers change in the Reolink app.
struct TreePreset {
  const char* treeId;
  int presetId;
};

inline const TreePreset kTreePresets[] = {
  {"mountain-hemlock", 1},
  {"yellow-cedar-1", 2},
  {"yellow-cedar-2", 3},
  {"silver-fir", 4},
  {"dawn-redwood", 5},
};
inline constexpr size_t kTreePresetCount = sizeof(kTreePresets) / sizeof(kTreePresets[0]);

// Returns -1 if no preset is configured for this tree.
inline int presetForTree(const char* treeId) {
  for (size_t i = 0; i < kTreePresetCount; i++) {
    if (strcmp(kTreePresets[i].treeId, treeId) == 0) return kTreePresets[i].presetId;
  }
  return -1;
}
