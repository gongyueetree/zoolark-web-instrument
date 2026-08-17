#pragma once

// ZooLark v0.4.4-dual-adc pin map for RP2350B/QFN-80.
// Oscilloscope: CH1 = GPIO47/ADC7, CH2 = GPIO45/ADC5.
#define ZL_OSC_CH1_ADC_GPIO     47u
#define ZL_OSC_CH1_ADC_CHANNEL   7u
#define ZL_OSC_CH2_ADC_GPIO     45u
#define ZL_OSC_CH2_ADC_CHANNEL   5u

// Backward-compatible aliases used by older code paths.
#define ZL_OSC_ADC_GPIO       ZL_OSC_CH1_ADC_GPIO
#define ZL_OSC_ADC_CHANNEL    ZL_OSC_CH1_ADC_CHANNEL

// KXTJ3-1057 bus from the board schematic.
#define ZL_SENSOR_SDA_PIN      22u
#define ZL_SENSOR_SCL_PIN      23u
#define ZL_SENSOR_ADDR_GND   0x0Eu
#define ZL_SENSOR_ADDR_VDD   0x0Fu

// Logic analyzer observes the same I2C pads without owning the GPIO mux.
#define ZL_LOGIC_PIN_BASE      22u
#define ZL_LOGIC_PIN_COUNT      2u
#define ZL_LOGIC_ENABLED_MASK 0x03u

// Two daisy-chained WS2812B-2020 pixels, DIN from GPIO46.
#define ZL_WS2812_PIN          46u
#define ZL_WS2812_COUNT         2u
#define ZL_WS2812_BRIGHTNESS_PERCENT 20u

#define ZL_JTAG_TCK_PIN        10u
#define ZL_JTAG_TMS_PIN        11u
#define ZL_JTAG_TDI_PIN        12u
#define ZL_JTAG_TDO_PIN        13u

#define ZL_STATUS_LED_PIN      25u
