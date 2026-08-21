#pragma once

#include <Arduino.h>

// GPIO pin assignments for the 5-zone irrigation controller.
//
// PLACEHOLDER — none of these have been confirmed against the actual ESP32-S3
// DevKitC-1 terminal breakout board's silkscreen labels yet. Zone 1's valve/
// flow pins carry over the same never-bench-tested values the single-zone
// version used (4/5/6) -- not because they're verified, but because they're
// the existing scaffolding value, not a newly-invented one. Zones 2-5 use
// PIN_TBD deliberately: main.cpp's validatePinConfiguration() refuses to
// pulse any valve or accept a watering command while any zone's pins are
// still PIN_TBD, so an unwired zone fails loudly instead of silently
// actuating whatever GPIO happened to be picked.

constexpr size_t kZoneCount = 5;
constexpr uint8_t PIN_TBD = 0xFF;

struct ZonePins {
  uint8_t valveIn1; // pulse to open
  uint8_t valveIn2; // pulse to close (reverse polarity)
  uint8_t flowSensor; // interrupt-capable pin for pulse counting
};

// DRV8871 H-bridge driver -> Galcon 3652 latching solenoid valve, one pair
// per zone. Valve is latching (6-18VDC, 20-100ms pulse), not continuous-
// hold, so both pins are pulsed briefly rather than held high.
// GREDIA hall-effect flow sensor per zone.
constexpr ZonePins kZonePins[kZoneCount] = {
    {4, 5, 6},                    // Zone 1 -- carried over from the single-zone version, still unconfirmed
    {PIN_TBD, PIN_TBD, PIN_TBD},  // Zone 2
    {PIN_TBD, PIN_TBD, PIN_TBD},  // Zone 3
    {PIN_TBD, PIN_TBD, PIN_TBD},  // Zone 4
    {PIN_TBD, PIN_TBD, PIN_TBD},  // Zone 5
};

// APIELE 16mm momentary button + integrated LED ring.
// Harness: yellow=NC, blue=NO, green=common, red=LED+, black=LED-.
// Wire NO + common to PIN_BUTTON (INPUT_PULLUP, reads LOW when pressed).
#define PIN_BUTTON 7
#define PIN_BUTTON_LED 8

// uxcell 5-position rotary switch (2P5T, one pole used). Common wired to
// GND; each position pin reads LOW (INPUT_PULLUP) when selected. Selects
// which zone the manual button acts on -- see handleManualButton() in
// main.cpp.
#define PIN_ROTARY_POS1 15
#define PIN_ROTARY_POS2 16
#define PIN_ROTARY_POS3 17
#define PIN_ROTARY_POS4 18
#define PIN_ROTARY_POS5 21
