#include "wfl_protocol.h"

uint32_t wfl2_crc32_init(void) {
    return 0xFFFFFFFFu;
}

uint32_t wfl2_crc32_update(uint32_t state, const uint8_t *data, size_t len) {
    uint32_t c = state;
    for (size_t i = 0; i < len; ++i) {
        c ^= data[i];
        for (unsigned b = 0; b < 8; ++b) {
            c = (c & 1u) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        }
    }
    return c;
}

uint32_t wfl2_crc32_finish(uint32_t state) {
    return state ^ 0xFFFFFFFFu;
}

int wfl2_validate_header(const wfl2_header_t *h, size_t received_bytes) {
    if (!h || received_bytes < WFL2_HEADER_SIZE) return -1;
    if (h->magic != WFL2_MAGIC_U32) return -2;
    if (h->version != WFL2_VERSION) return -3;
    if (h->payload_length > (16u * 1024u * 1024u)) return -4;
    return 0;
}
