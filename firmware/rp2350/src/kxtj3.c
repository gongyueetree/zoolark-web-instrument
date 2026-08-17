#include "kxtj3.h"
#include "board_pins.h"
#include "hardware/gpio.h"
#include "hardware/i2c.h"
#include "pico/stdlib.h"
#include <string.h>

#define KXTJ3_WHO_AM_I       0x0Fu
#define KXTJ3_XOUT_L         0x06u
#define KXTJ3_CTRL_REG1      0x1Bu
#define KXTJ3_DATA_CTRL_REG  0x21u
#define KXTJ3_WHO_VALUE      0x35u
#define KXTJ3_ODR_200HZ      0x04u
#define KXTJ3_CTRL_HR_2G     0xC0u
#define KXTJ3_POLL_MS        5u

static kxtj3_state_t g;
static uint32_t last_poll_ms;
static uint32_t last_probe_ms;

static bool write_reg(uint8_t reg, uint8_t value) {
  uint8_t b[2] = {reg, value};
  return i2c_write_blocking(i2c1, g.address, b, 2, false) == 2;
}

static bool read_regs(uint8_t reg, uint8_t *dst, size_t n) {
  if (i2c_write_blocking(i2c1, g.address, &reg, 1, true) != 1) return false;
  return i2c_read_blocking(i2c1, g.address, dst, n, false) == (int)n;
}

static bool probe_addr(uint8_t addr, uint8_t *who) {
  uint8_t reg = KXTJ3_WHO_AM_I, v = 0;
  if (i2c_write_blocking(i2c1, addr, &reg, 1, true) != 1) return false;
  if (i2c_read_blocking(i2c1, addr, &v, 1, false) != 1) return false;
  *who = v;
  return v == KXTJ3_WHO_VALUE;
}

static int16_t decode12(uint8_t low, uint8_t high) {
  int16_t v = (int16_t)(((uint16_t)high << 8) | low);
  return (int16_t)(v >> 4);
}

bool kxtj3_init(void) {
  memset(&g, 0, sizeof(g));
  i2c_init(i2c1, 100000u);
  gpio_set_function(ZL_SENSOR_SDA_PIN, GPIO_FUNC_I2C);
  gpio_set_function(ZL_SENSOR_SCL_PIN, GPIO_FUNC_I2C);
  // Weak internal pulls are only a fallback. The production PCB should use external I2C pull-ups.
  gpio_pull_up(ZL_SENSOR_SDA_PIN);
  gpio_pull_up(ZL_SENSOR_SCL_PIN);
  sleep_ms(30);

  uint8_t who = 0;
  const uint8_t candidates[2] = {ZL_SENSOR_ADDR_GND, ZL_SENSOR_ADDR_VDD};
  for (uint i = 0; i < 2; ++i) {
    if (probe_addr(candidates[i], &who)) {
      g.address = candidates[i];
      g.who_am_i = who;
      g.present = true;
      break;
    }
  }
  last_probe_ms = to_ms_since_boot(get_absolute_time());
  if (!g.present) return false;

  // Datasheet requires PC1=0 before changing CTRL/DATA registers.
  if (!write_reg(KXTJ3_CTRL_REG1, 0x00u)) { g.present = false; return false; }
  if (!write_reg(KXTJ3_DATA_CTRL_REG, KXTJ3_ODR_200HZ)) { g.present = false; return false; }
  if (!write_reg(KXTJ3_CTRL_REG1, KXTJ3_CTRL_HR_2G)) { g.present = false; return false; }
  sleep_ms(6);
  last_poll_ms = 0;
  return true;
}

bool kxtj3_task(void) {
  uint32_t now = to_ms_since_boot(get_absolute_time());
  if (!g.present) {
    if ((uint32_t)(now - last_probe_ms) >= 1000u) kxtj3_init();
    return false;
  }
  if ((uint32_t)(now - last_poll_ms) < KXTJ3_POLL_MS) return false;
  last_poll_ms = now;

  uint8_t raw[6];
  if (!read_regs(KXTJ3_XOUT_L, raw, sizeof(raw))) {
    if (++g.error_count >= 8u) g.present = false;
    return false;
  }
  g.error_count = 0;
  memcpy(g.raw, raw, sizeof(raw));
  g.x_counts = decode12(raw[0], raw[1]);
  g.y_counts = decode12(raw[2], raw[3]);
  g.z_counts = decode12(raw[4], raw[5]);
  // ±2g, 12-bit High Resolution = 1024 counts/g.
  g.x_mg = (int16_t)(((int32_t)g.x_counts * 1000) / 1024);
  g.y_mg = (int16_t)(((int32_t)g.y_counts * 1000) / 1024);
  g.z_mg = (int16_t)(((int32_t)g.z_counts * 1000) / 1024);
  g.timestamp_ms = now;
  ++g.sequence;
  return true;
}

const kxtj3_state_t *kxtj3_get_state(void) { return &g; }
