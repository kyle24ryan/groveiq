#pragma once

// GPIO pin assignments for the v1 single-zone irrigation controller.
//
// PLACEHOLDER — none of these have been confirmed against the actual ESP32-S3
// DevKitC-1 terminal breakout board's silkscreen labels yet. Reassign once
// the board is in hand and wiring begins; nothing else in the firmware
// depends on specific pin numbers, so this is the only file that needs
// editing.

// DRV8871 H-bridge driver -> Galcon 3652 latching solenoid valve.
// Valve is latching (6-18VDC, 20-100ms pulse), not continuous-hold, so both
// pins are pulsed briefly rather than held high.
#define PIN_VALVE_IN1 4   // pulse to open
#define PIN_VALVE_IN2 5   // pulse to close (reverse polarity)

// GREDIA hall-effect flow sensor. Interrupt-capable pin for pulse counting.
#define PIN_FLOW_SENSOR 6

// APIELE 16mm momentary button + integrated LED ring.
// Harness: yellow=NC, blue=NO, green=common, red=LED+, black=LED-.
// Wire NO + common to PIN_BUTTON (INPUT_PULLUP, reads LOW when pressed).
#define PIN_BUTTON 7
#define PIN_BUTTON_LED 8

// uxcell 5-position rotary switch (2P5T, one pole used). Common wired to
// GND; each position pin reads LOW (INPUT_PULLUP) when selected. v1 only
// has one physical zone, so only position 1 is meaningful today — the rest
// are wired in for the 5-zone scale-up.
#define PIN_ROTARY_POS1 15
#define PIN_ROTARY_POS2 16
#define PIN_ROTARY_POS3 17
#define PIN_ROTARY_POS4 18
#define PIN_ROTARY_POS5 21
