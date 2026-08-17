#pragma once

// ZooLark v0.4.2-live-io pin map for the RP2350B/QFN-80 test board.

// Oscilloscope CH1: GPIO47 is ADC7 on RP2350B.
#define ZL_OSC_ADC_GPIO       47u
#define ZL_OSC_ADC_CHANNEL     7u

// Logic analyzer: D0/D1 observe an external motion sensor bus.
// PIO still packs 8 pad bits per sample; only bit0/bit1 are enabled/presented.
#define ZL_LOGIC_PIN_BASE     22u
#define ZL_LOGIC_PIN_COUNT     2u
#define ZL_LOGIC_ENABLED_MASK  0x03u

// JTAG test header
#define ZL_JTAG_TCK_PIN       10u
#define ZL_JTAG_TMS_PIN       11u
#define ZL_JTAG_TDI_PIN       12u
#define ZL_JTAG_TDO_PIN       13u

// External heartbeat LED: active-high, short pulse once per second.
#define ZL_STATUS_LED_PIN     25u
