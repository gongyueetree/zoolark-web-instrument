#pragma once
#include <stdint.h>
void ws2812_status_init(void);
void ws2812_status_update(int16_t x_mg, int16_t y_mg, int16_t z_mg);
void ws2812_status_off(void);
