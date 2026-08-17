#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  bool present;
  uint8_t address;
  uint8_t who_am_i;
  uint8_t raw[6];
  int16_t x_counts;
  int16_t y_counts;
  int16_t z_counts;
  int16_t x_mg;
  int16_t y_mg;
  int16_t z_mg;
  uint32_t sequence;
  uint32_t timestamp_ms;
  uint32_t error_count;
} kxtj3_state_t;

bool kxtj3_init(void);
bool kxtj3_task(void);
const kxtj3_state_t *kxtj3_get_state(void);
