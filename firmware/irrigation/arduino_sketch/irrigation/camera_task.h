#pragma once

// Spawns the camera-capture FreeRTOS task pinned to core 0, isolated
// from the irrigation safety loop (main.cpp's loop(), core 1). Call once
// from setup(), after Wi-Fi connect is attempted -- the task itself
// tolerates not having a connection yet and just retries.
void startCameraTask();
