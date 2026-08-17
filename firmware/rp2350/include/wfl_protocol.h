#pragma once
#include <stdint.h>
#include <stddef.h>
#define WFL2_VERSION 1u
#define WFL2_HEADER_SIZE 24u
#define WFL2_MAGIC_U32 0x324c4657u

typedef enum { WFL2_FRAME_COMMAND=0, WFL2_FRAME_RESPONSE=1, WFL2_FRAME_EVENT=2, WFL2_FRAME_DATA=3 } wfl2_frame_type_t;
typedef enum { WFL2_OK=0, WFL2_ERROR=1, WFL2_BAD_CRC=2, WFL2_BAD_COMMAND=3, WFL2_BUSY=4, WFL2_TIMEOUT=5, WFL2_RANGE=6 } wfl2_status_t;
typedef enum {
  WFL2_PING=0x0001, WFL2_GET_DEVICE_INFO=0x0002, WFL2_ENTER_BOOTLOADER=0x0003,
  WFL2_OSC_CAPTURE=0x0101, WFL2_OSC_READ=0x0102,
  WFL2_LOGIC_CONFIG=0x1001, WFL2_LOGIC_ARM=0x1002, WFL2_LOGIC_STATUS=0x1003, WFL2_LOGIC_READ=0x1004, WFL2_LOGIC_STOP=0x1005,
  WFL2_SENSOR_INFO=0x1201, WFL2_SENSOR_READ=0x1202, WFL2_SENSOR_REINIT=0x1203,
  WFL2_JTAG_CONFIG=0x2001, WFL2_JTAG_SCAN=0x2002, WFL2_JTAG_TAP_RESET=0x2003,
  WFL2_FPGA_PROGRAM_BEGIN=0x2101, WFL2_FPGA_PROGRAM_CHUNK=0x2102, WFL2_FPGA_PROGRAM_END=0x2103, WFL2_FPGA_PROGRAM_ABORT=0x2104,
} wfl2_opcode_t;
#pragma pack(push,1)
typedef struct { uint32_t magic; uint8_t version; uint8_t type; uint16_t opcode; uint32_t sequence; uint32_t payload_length; uint16_t flags; uint16_t status; uint32_t crc32; } wfl2_header_t;
typedef struct { uint32_t sample_rate_hz; uint32_t sample_count; uint8_t enabled_mask; uint8_t trigger_channel; uint8_t trigger_edge; uint8_t reserved0; uint16_t pretrigger_permille; uint16_t threshold_mv; uint32_t flags; } wfl2_logic_config_t;
#pragma pack(pop)
uint32_t wfl2_crc32_init(void); uint32_t wfl2_crc32_update(uint32_t state,const uint8_t *data,size_t len); uint32_t wfl2_crc32_finish(uint32_t state); int wfl2_validate_header(const wfl2_header_t *h,size_t received_bytes);
