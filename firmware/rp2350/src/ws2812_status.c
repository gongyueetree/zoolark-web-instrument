#include "ws2812_status.h"
#include "board_pins.h"
#include "hardware/clocks.h"
#include "hardware/pio.h"
#include "pico/stdlib.h"
#include "ws2812_status.pio.h"

static PIO pio = pio1;
static uint sm;
static uint offset;
static bool ready;

static uint8_t clamp255(int32_t v) { if (v < 0) return 0; if (v > 255) return 255; return (uint8_t)v; }
static int32_t iabs32(int32_t v) { return v < 0 ? -v : v; }
static uint32_t grb(uint8_t r, uint8_t g, uint8_t b) { return ((uint32_t)g << 16) | ((uint32_t)r << 8) | b; }
static void put(uint32_t pixel) { pio_sm_put_blocking(pio, sm, pixel << 8u); }

void ws2812_status_init(void) {
  // RP2350B PIO1 must use GPIO base 16 to reach GPIO46.
  pio_set_gpio_base(pio, 16u);
  offset = pio_add_program(pio, &ws2812_status_program);
  sm = pio_claim_unused_sm(pio, true);
  pio_gpio_init(pio, ZL_WS2812_PIN);
  pio_sm_config c = ws2812_status_program_get_default_config(offset);
  sm_config_set_sideset_pins(&c, ZL_WS2812_PIN);
  sm_config_set_out_shift(&c, false, true, 24);
  sm_config_set_fifo_join(&c, PIO_FIFO_JOIN_TX);
  float div = (float)clock_get_hz(clk_sys) / (800000.0f * 10.0f);
  sm_config_set_clkdiv(&c, div);
  pio_sm_set_consecutive_pindirs(pio, sm, ZL_WS2812_PIN, 1, true);
  pio_sm_init(pio, sm, offset, &c);
  pio_sm_set_enabled(pio, sm, true);
  ready = true;
  ws2812_status_off();
}

void ws2812_status_off(void) {
  if (!ready) return;
  for (uint i = 0; i < ZL_WS2812_COUNT; ++i) put(0);
  sleep_us(80);
}

void ws2812_status_update(int16_t x_mg, int16_t y_mg, int16_t z_mg) {
  if (!ready) return;
  // D1: orientation. +X red, -X blue, |Y| contributes green.
  uint8_t r1 = clamp255((x_mg > 0 ? x_mg : 0) * 255 / 1000);
  uint8_t b1 = clamp255((x_mg < 0 ? -x_mg : 0) * 255 / 1000);
  uint8_t g1 = clamp255(iabs32(y_mg) * 180 / 1000);
  if (r1 < 6 && g1 < 6 && b1 < 6) { r1 = 4; g1 = 4; b1 = 8; }

  // D2: motion magnitude relative to static 1g. green -> yellow -> red.
  int32_t activity = iabs32(x_mg) + iabs32(y_mg) + iabs32(iabs32(z_mg) - 1000);
  uint8_t r2 = 0, g2 = 0, b2 = 0;
  if (activity < 180) { g2 = 28; b2 = 3; }
  else if (activity < 500) { r2 = 38; g2 = 24; }
  else { r2 = clamp255(40 + (activity - 500) / 8); g2 = 2; }

  put(grb(r1, g1, b1));
  put(grb(r2, g2, b2));
  sleep_us(80);
}
