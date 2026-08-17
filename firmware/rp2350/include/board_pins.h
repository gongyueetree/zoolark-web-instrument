#pragma once

// ZooLark v0.4-test pin map for Raspberry Pi Pico 2 / RP2350-class boards.
// 8-channel logic analyzer uses eight consecutive pins for efficient PIO sampling.
#define ZL_LOGIC_PIN_BASE   0u
#define ZL_LOGIC_PIN_COUNT  8u

// JTAG test header
#define ZL_JTAG_TCK_PIN    10u
#define ZL_JTAG_TMS_PIN    11u
#define ZL_JTAG_TDI_PIN    12u
#define ZL_JTAG_TDO_PIN    13u

// Pico/Pico 2 on-board LED. If your carrier uses a different LED, change this only.
#define ZL_STATUS_LED_PIN  25u
