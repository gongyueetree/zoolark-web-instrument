#include "wfl_protocol.h"
#include <stdint.h>
#include <stddef.h>

/*
 * Integration example only. Wire these hooks to your TinyUSB vendor RX/TX,
 * logic_capture.c and jtag_engine.c. The browser owns high-level commands;
 * RP2350 owns timing-sensitive capture/JTAG execution.
 */

typedef struct {
    wfl2_logic_config_t logic_cfg;
    uint32_t capture_id;
    uint32_t capture_samples;
    uint32_t capture_rate_hz;
    uint8_t capture_state; /* 0 idle, 1 armed/running, 2 done, 3 error */
} wfl_runtime_t;

static wfl_runtime_t g_wfl;

int wfl_dispatch_command(uint16_t opcode, const uint8_t *payload, size_t payload_len) {
    switch ((wfl2_opcode_t)opcode) {
        case WFL2_PING:
        case WFL2_GET_DEVICE_INFO:
            return WFL2_OK;

        case WFL2_LOGIC_CONFIG:
            if (payload_len != sizeof(wfl2_logic_config_t)) return WFL2_RANGE;
            g_wfl.logic_cfg = *(const wfl2_logic_config_t *)payload;
            return WFL2_OK;

        case WFL2_LOGIC_ARM:
            /* logic_capture_arm(&g_wfl.logic_cfg); */
            g_wfl.capture_state = 1;
            return WFL2_OK;

        case WFL2_LOGIC_STATUS:
        case WFL2_LOGIC_READ:
        case WFL2_LOGIC_STOP:
            return WFL2_OK;

        case WFL2_JTAG_CONFIG:
        case WFL2_JTAG_SCAN:
        case WFL2_JTAG_TAP_RESET:
            /* Execute through local PIO/TAP state machine. */
            return WFL2_OK;

        case WFL2_FPGA_PROGRAM_BEGIN:
        case WFL2_FPGA_PROGRAM_CHUNK:
        case WFL2_FPGA_PROGRAM_END:
        case WFL2_FPGA_PROGRAM_ABORT:
            /* Feed local programmer/SVF-XSVF executor. */
            return WFL2_OK;

        default:
            return WFL2_BAD_COMMAND;
    }
}
