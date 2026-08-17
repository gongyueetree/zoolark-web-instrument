#pragma once
#include <stdbool.h>
#include <stdint.h>

void jtag_init(void);
void jtag_configure(uint32_t tck_hz, uint16_t io_voltage_mv);
void jtag_tap_reset(void);
// Returns number of detected IDCODEs (max max_devices). This simple test scanner assumes IDCODE on reset.
uint8_t jtag_scan_idcodes(uint32_t *idcodes, uint8_t max_devices);
