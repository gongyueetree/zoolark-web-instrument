#include "tusb.h"
#include <string.h>

// TEST VID/PID only. 0xCAFE is commonly used by TinyUSB examples.
// Replace with the project's assigned production VID/PID before shipping.
#define ZL_USB_VID 0xCAFE
#define ZL_USB_PID 0x401F
#define ZL_USB_BCD 0x0400

enum { ITF_NUM_VENDOR = 0, ITF_NUM_TOTAL };
#define EPNUM_VENDOR_OUT 0x01
#define EPNUM_VENDOR_IN  0x81
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + TUD_VENDOR_DESC_LEN)

static tusb_desc_device_t const desc_device = {
  .bLength = sizeof(tusb_desc_device_t),
  .bDescriptorType = TUSB_DESC_DEVICE,
  .bcdUSB = 0x0200,
  .bDeviceClass = 0x00,
  .bDeviceSubClass = 0x00,
  .bDeviceProtocol = 0x00,
  .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
  .idVendor = ZL_USB_VID,
  .idProduct = ZL_USB_PID,
  .bcdDevice = ZL_USB_BCD,
  .iManufacturer = 0x01,
  .iProduct = 0x02,
  .iSerialNumber = 0x03,
  .bNumConfigurations = 0x01,
};

uint8_t const *tud_descriptor_device_cb(void) { return (uint8_t const *)&desc_device; }

static uint8_t const desc_configuration[] = {
  TUD_CONFIG_DESCRIPTOR(1, ITF_NUM_TOTAL, 0, CONFIG_TOTAL_LEN, 0x00, 100),
  TUD_VENDOR_DESCRIPTOR(ITF_NUM_VENDOR, 4, EPNUM_VENDOR_OUT, EPNUM_VENDOR_IN, 64),
};

uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
  (void)index;
  return desc_configuration;
}

static char const *string_desc_arr[] = {
  (const char[]){0x09, 0x04},
  "EETree / ZooLark",
  "ZooLark RP2350 Web Instrument",
  "ZL-RP2350-TEST-0001",
  "ZooLark WFL2 WebUSB",
};

static uint16_t _desc_str[64];
uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
  (void)langid;
  size_t chr_count;
  if (index == 0) {
    memcpy(&_desc_str[1], string_desc_arr[0], 2);
    chr_count = 1;
  } else {
    if (index >= sizeof(string_desc_arr)/sizeof(string_desc_arr[0])) return NULL;
    const char *str = string_desc_arr[index];
    chr_count = strlen(str);
    if (chr_count > 63) chr_count = 63;
    for (size_t i = 0; i < chr_count; ++i) _desc_str[1+i] = (uint16_t)str[i];
  }
  _desc_str[0] = (uint16_t)((TUSB_DESC_STRING << 8) | (2 * chr_count + 2));
  return _desc_str;
}
