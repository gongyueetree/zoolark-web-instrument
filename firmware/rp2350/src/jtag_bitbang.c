#include "jtag_bitbang.h"
#include "board_pins.h"
#include "hardware/gpio.h"
#include "pico/stdlib.h"

static uint32_t g_half_period_us = 1;

static inline void pulse_tck(void) {
  gpio_put(ZL_JTAG_TCK_PIN, 0);
  sleep_us(g_half_period_us);
  gpio_put(ZL_JTAG_TCK_PIN, 1);
  sleep_us(g_half_period_us);
}

static inline bool shift_bit(bool tms, bool tdi) {
  gpio_put(ZL_JTAG_TMS_PIN, tms);
  gpio_put(ZL_JTAG_TDI_PIN, tdi);
  gpio_put(ZL_JTAG_TCK_PIN, 0);
  sleep_us(g_half_period_us);
  bool tdo = gpio_get(ZL_JTAG_TDO_PIN);
  gpio_put(ZL_JTAG_TCK_PIN, 1);
  sleep_us(g_half_period_us);
  return tdo;
}

void jtag_init(void) {
  gpio_init(ZL_JTAG_TCK_PIN); gpio_set_dir(ZL_JTAG_TCK_PIN, GPIO_OUT); gpio_put(ZL_JTAG_TCK_PIN, 1);
  gpio_init(ZL_JTAG_TMS_PIN); gpio_set_dir(ZL_JTAG_TMS_PIN, GPIO_OUT); gpio_put(ZL_JTAG_TMS_PIN, 1);
  gpio_init(ZL_JTAG_TDI_PIN); gpio_set_dir(ZL_JTAG_TDI_PIN, GPIO_OUT); gpio_put(ZL_JTAG_TDI_PIN, 0);
  gpio_init(ZL_JTAG_TDO_PIN); gpio_set_dir(ZL_JTAG_TDO_PIN, GPIO_IN); gpio_pull_up(ZL_JTAG_TDO_PIN);
}

void jtag_configure(uint32_t tck_hz, uint16_t io_voltage_mv) {
  (void)io_voltage_mv;
  if (tck_hz == 0) tck_hz = 1000000;
  // Bit-bang is intentionally capped for the first hardware bring-up build.
  if (tck_hz > 1000000u) tck_hz = 1000000u;
  g_half_period_us = 500000u / tck_hz;
  if (g_half_period_us < 1u) g_half_period_us = 1u;
}

void jtag_tap_reset(void) {
  gpio_put(ZL_JTAG_TMS_PIN, 1);
  for (int i = 0; i < 6; ++i) pulse_tck();
}

uint8_t jtag_scan_idcodes(uint32_t *idcodes, uint8_t max_devices) {
  if (!idcodes || max_devices == 0) return 0;
  jtag_tap_reset();
  // Reset -> Run-Test/Idle -> Select-DR -> Capture-DR -> Shift-DR
  shift_bit(0, 0);
  shift_bit(1, 0);
  shift_bit(0, 0);
  shift_bit(0, 0);

  uint8_t count = 0;
  for (; count < max_devices; ++count) {
    uint32_t v = 0;
    for (uint8_t bit = 0; bit < 32; ++bit) {
      bool tdo = shift_bit(false, true);
      if (tdo) v |= (1u << bit);
    }
    if (v == 0x00000000u || v == 0xffffffffu) break;
    idcodes[count] = v;
  }
  // Exit Shift-DR -> Update-DR -> Idle
  shift_bit(true, true);
  shift_bit(true, true);
  shift_bit(false, true);
  return count;
}
