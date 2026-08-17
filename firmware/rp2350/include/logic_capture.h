#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "wfl_protocol.h"

#define ZL_LOGIC_MAX_SAMPLES (128u * 1024u)

typedef struct {
  uint8_t state;  // 0 idle, 1 armed/running, 2 done, 3 error
  uint8_t error;
  uint16_t reserved;
  uint32_t capture_id;
  uint32_t sample_count;
  uint32_t sample_rate_hz;
} zl_logic_status_t;

void logic_capture_init(void);
bool logic_capture_configure(const wfl2_logic_config_t *cfg);
bool logic_capture_arm(void);
void logic_capture_stop(void);
zl_logic_status_t logic_capture_status(void);
uint32_t logic_capture_read(uint32_t capture_id, uint32_t offset, uint32_t count, uint8_t *dst, uint32_t dst_cap);
