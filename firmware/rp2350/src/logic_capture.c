#include "logic_capture.h"
#include "board_pins.h"
#include "hardware/clocks.h"
#include "hardware/dma.h"
#include "hardware/pio.h"
#include "logic_capture.pio.h"
#include <string.h>

static PIO pio = pio0;
static int sm = 0;
static uint offset;
static int dma_chan = -1;
static uint8_t capture_buf[ZL_LOGIC_MAX_SAMPLES];
static wfl2_logic_config_t g_cfg;
static zl_logic_status_t g_status;
static uint32_t g_capture_id = 1;

void logic_capture_init(void) {
  memset(&g_cfg, 0, sizeof(g_cfg));
  memset(&g_status, 0, sizeof(g_status));
  offset = pio_add_program(pio, &logic_capture_8_program);
  sm = pio_claim_unused_sm(pio, true);
  dma_chan = dma_claim_unused_channel(true);

  for (uint i = 0; i < ZL_LOGIC_PIN_COUNT; ++i) {
    pio_gpio_init(pio, ZL_LOGIC_PIN_BASE + i);
    gpio_pull_down(ZL_LOGIC_PIN_BASE + i);
  }

  pio_sm_config c = logic_capture_8_program_get_default_config(offset);
  sm_config_set_in_pins(&c, ZL_LOGIC_PIN_BASE);
  sm_config_set_in_shift(&c, false, true, 8);
  sm_config_set_fifo_join(&c, PIO_FIFO_JOIN_RX);
  pio_sm_set_consecutive_pindirs(pio, sm, ZL_LOGIC_PIN_BASE, ZL_LOGIC_PIN_COUNT, false);
  pio_sm_init(pio, sm, offset, &c);
  pio_sm_set_enabled(pio, sm, false);
}

bool logic_capture_configure(const wfl2_logic_config_t *cfg) {
  if (!cfg || cfg->sample_rate_hz < 1000u || cfg->sample_rate_hz > 50000000u) return false;
  if (!cfg->sample_count || cfg->sample_count > ZL_LOGIC_MAX_SAMPLES) return false;
  if (cfg->trigger_channel >= 8u) return false;
  g_cfg = *cfg;
  return true;
}

bool logic_capture_arm(void) {
  if (!g_cfg.sample_count || !g_cfg.sample_rate_hz) return false;
  if (dma_channel_is_busy(dma_chan)) dma_channel_abort(dma_chan);

  pio_sm_set_enabled(pio, sm, false);
  pio_sm_clear_fifos(pio, sm);
  pio_sm_restart(pio, sm);

  pio_sm_config c = logic_capture_8_program_get_default_config(offset);
  sm_config_set_in_pins(&c, ZL_LOGIC_PIN_BASE);
  sm_config_set_in_shift(&c, false, true, 8);
  sm_config_set_fifo_join(&c, PIO_FIFO_JOIN_RX);
  float div = (float)clock_get_hz(clk_sys) / (float)g_cfg.sample_rate_hz;
  if (div < 1.0f) div = 1.0f;
  sm_config_set_clkdiv(&c, div);
  pio_sm_init(pio, sm, offset, &c);

  dma_channel_config dc = dma_channel_get_default_config(dma_chan);
  channel_config_set_transfer_data_size(&dc, DMA_SIZE_8);
  channel_config_set_read_increment(&dc, false);
  channel_config_set_write_increment(&dc, true);
  channel_config_set_dreq(&dc, pio_get_dreq(pio, sm, false));
  dma_channel_configure(dma_chan, &dc, capture_buf, &pio->rxf[sm], g_cfg.sample_count, false);

  g_status.state = 1;
  g_status.error = 0;
  g_status.capture_id = g_capture_id++;
  g_status.sample_count = g_cfg.sample_count;
  g_status.sample_rate_hz = g_cfg.sample_rate_hz;

  dma_start_channel_mask(1u << dma_chan);
  pio_sm_set_enabled(pio, sm, true);
  return true;
}

void logic_capture_stop(void) {
  pio_sm_set_enabled(pio, sm, false);
  if (dma_channel_is_busy(dma_chan)) dma_channel_abort(dma_chan);
  g_status.state = 0;
}

zl_logic_status_t logic_capture_status(void) {
  if (g_status.state == 1 && !dma_channel_is_busy(dma_chan)) {
    pio_sm_set_enabled(pio, sm, false);
    g_status.state = 2;
  }
  return g_status;
}

uint32_t logic_capture_read(uint32_t capture_id, uint32_t offset_bytes, uint32_t count, uint8_t *dst, uint32_t dst_cap) {
  zl_logic_status_t s = logic_capture_status();
  if (s.state != 2 || capture_id != s.capture_id || !dst) return 0;
  if (offset_bytes >= s.sample_count) return 0;
  uint32_t n = count;
  if (n > dst_cap) n = dst_cap;
  if (offset_bytes + n > s.sample_count) n = s.sample_count - offset_bytes;
  memcpy(dst, capture_buf + offset_bytes, n);
  return n;
}
