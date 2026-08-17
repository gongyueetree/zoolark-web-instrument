#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "hardware/adc.h"
#include "pico/bootrom.h"
#include "pico/stdlib.h"
#include "tusb.h"
#include "board_pins.h"
#include "jtag_bitbang.h"
#include "kxtj3.h"
#include "logic_capture.h"
#include "wfl_protocol.h"
#include "ws2812_status.h"

#define RX_STAGE_SIZE 4096u
#define TX_FRAME_SIZE 1536u
#define LOGIC_READ_MAX 1024u
#define OSC_SAMPLE_MAX 512u
#define HEARTBEAT_PERIOD_MS 1000u
#define HEARTBEAT_ON_MS 100u

static uint8_t rx_stage[RX_STAGE_SIZE]; static size_t rx_used; static bool enter_bootloader_pending; static bool led_state;
static uint16_t osc_samples[OSC_SAMPLE_MAX]; static uint32_t osc_capture_id; static uint32_t osc_sample_rate_hz=20000u; static uint32_t osc_sample_count=256u;
static uint32_t last_ws_ms;

static inline uint16_t rd16(const uint8_t*p){return(uint16_t)p[0]|((uint16_t)p[1]<<8);} static inline uint32_t rd32(const uint8_t*p){return(uint32_t)p[0]|((uint32_t)p[1]<<8)|((uint32_t)p[2]<<16)|((uint32_t)p[3]<<24);} static inline void wr16(uint8_t*p,uint16_t v){p[0]=(uint8_t)v;p[1]=(uint8_t)(v>>8);} static inline void wr32(uint8_t*p,uint32_t v){p[0]=(uint8_t)v;p[1]=(uint8_t)(v>>8);p[2]=(uint8_t)(v>>16);p[3]=(uint8_t)(v>>24);}
static size_t tlv_text(uint8_t*d,size_t cap,uint8_t type,const char*t){size_t n=strlen(t);if(cap<3+n)return 0;d[0]=type;wr16(d+1,(uint16_t)n);memcpy(d+3,t,n);return 3+n;}

static void usb_send_response(const wfl2_header_t*req,uint16_t status,const uint8_t*payload,uint32_t payload_len){static uint8_t frame[TX_FRAME_SIZE];if(payload_len+WFL2_HEADER_SIZE>sizeof(frame)){status=WFL2_RANGE;payload=NULL;payload_len=0;}wfl2_header_t*h=(wfl2_header_t*)frame;h->magic=WFL2_MAGIC_U32;h->version=WFL2_VERSION;h->type=WFL2_FRAME_RESPONSE;h->opcode=req->opcode;h->sequence=req->sequence;h->payload_length=payload_len;h->flags=0;h->status=status;h->crc32=0;if(payload_len&&payload)memcpy(frame+WFL2_HEADER_SIZE,payload,payload_len);uint32_t crc=wfl2_crc32_init();crc=wfl2_crc32_update(crc,frame,20);crc=wfl2_crc32_update(crc,frame+WFL2_HEADER_SIZE,payload_len);h->crc32=wfl2_crc32_finish(crc);tud_vendor_write(frame,WFL2_HEADER_SIZE+payload_len);tud_vendor_write_flush();}

static void osc_init(void){adc_init();adc_gpio_init(ZL_OSC_ADC_GPIO);adc_select_input(ZL_OSC_ADC_CHANNEL);} static uint32_t osc_capture_now(uint32_t rate,uint32_t count){if(rate<100u)rate=100u;if(rate>500000u)rate=500000u;if(count<16u)count=16u;if(count>OSC_SAMPLE_MAX)count=OSC_SAMPLE_MAX;osc_sample_rate_hz=rate;osc_sample_count=count;adc_select_input(ZL_OSC_ADC_CHANNEL);uint32_t period_us=1000000u/rate;absolute_time_t next=get_absolute_time();for(uint32_t i=0;i<count;++i){osc_samples[i]=adc_read();if(period_us){next=delayed_by_us(next,period_us);sleep_until(next);}}return++osc_capture_id;}

static uint32_t sensor_payload(uint8_t*out,size_t cap){if(cap<32)return 0;const kxtj3_state_t*s=kxtj3_get_state();memset(out,0,32);out[0]=s->present?1:0;out[1]=s->address;out[2]=s->who_am_i;out[3]=0x04;wr32(out+4,s->sequence);wr32(out+8,s->timestamp_ms);wr16(out+12,(uint16_t)s->x_counts);wr16(out+14,(uint16_t)s->y_counts);wr16(out+16,(uint16_t)s->z_counts);wr16(out+18,(uint16_t)s->x_mg);wr16(out+20,(uint16_t)s->y_mg);wr16(out+22,(uint16_t)s->z_mg);memcpy(out+24,s->raw,6);out[30]=ZL_WS2812_COUNT;out[31]=(uint8_t)(s->error_count>255?255:s->error_count);return 32;}

static void handle_command(const wfl2_header_t*req,const uint8_t*payload){uint8_t out[TX_FRAME_SIZE-WFL2_HEADER_SIZE];uint32_t out_len=0;uint16_t status=WFL2_OK;switch((wfl2_opcode_t)req->opcode){
case WFL2_PING:if(req->payload_length>sizeof(out)){status=WFL2_RANGE;break;}memcpy(out,payload,req->payload_length);out_len=req->payload_length;break;
case WFL2_GET_DEVICE_INFO:{size_t off=0,n;n=tlv_text(out+off,sizeof(out)-off,1,"ZooLark RP2350B Web Instrument");off+=n;n=tlv_text(out+off,sizeof(out)-off,2,"0.4.3-kxtj3");off+=n;n=tlv_text(out+off,sizeof(out)-off,3,"ZL-RP2350B-KXTJ3-0001");off+=n;n=tlv_text(out+off,sizeof(out)-off,4,"USB Full-Speed Vendor Bulk");off+=n;n=tlv_text(out+off,sizeof(out)-off,5,"ADC7-GPIO47,KXTJ3-I2C1-GPIO22-23,WS2812-GPIO46,LA2,JTAG");off+=n;out_len=(uint32_t)off;break;}
case WFL2_ENTER_BOOTLOADER:enter_bootloader_pending=true;break;
case WFL2_OSC_CAPTURE:{uint32_t rate=20000u,count=256u;if(req->payload_length>=8u){rate=rd32(payload);count=rd32(payload+4);}uint32_t id=osc_capture_now(rate,count);wr32(out,id);wr32(out+4,osc_sample_rate_hz);wr32(out+8,osc_sample_count);wr16(out+12,ZL_OSC_ADC_GPIO);wr16(out+14,ZL_OSC_ADC_CHANNEL);out_len=16;break;}
case WFL2_OSC_READ:{if(req->payload_length!=12u){status=WFL2_RANGE;break;}uint32_t id=rd32(payload),off=rd32(payload+4),count=rd32(payload+8);if(id!=osc_capture_id||off>=osc_sample_count){status=WFL2_RANGE;break;}uint32_t avail=osc_sample_count-off;if(count>avail)count=avail;uint32_t max=(sizeof(out)-12u)/2u;if(count>max)count=max;wr32(out,id);wr32(out+4,off);wr32(out+8,count);for(uint32_t i=0;i<count;++i)wr16(out+12+i*2,osc_samples[off+i]);out_len=12+count*2;break;}
case WFL2_SENSOR_INFO:case WFL2_SENSOR_READ:out_len=sensor_payload(out,sizeof(out));break;
case WFL2_SENSOR_REINIT:kxtj3_init();out_len=sensor_payload(out,sizeof(out));break;
case WFL2_LOGIC_CONFIG:if(req->payload_length!=sizeof(wfl2_logic_config_t)){status=WFL2_RANGE;break;}if(!logic_capture_configure((const wfl2_logic_config_t*)payload))status=WFL2_RANGE;break;
case WFL2_LOGIC_ARM:{if(!logic_capture_arm()){status=WFL2_ERROR;break;}zl_logic_status_t s=logic_capture_status();wr32(out,s.capture_id);wr32(out+4,s.sample_count);out_len=8;break;}
case WFL2_LOGIC_STATUS:{zl_logic_status_t s=logic_capture_status();out[0]=s.state;out[1]=s.error;wr16(out+2,0);wr32(out+4,s.capture_id);wr32(out+8,s.sample_count);wr32(out+12,s.sample_rate_hz);out_len=16;break;}
case WFL2_LOGIC_READ:{if(req->payload_length!=12){status=WFL2_RANGE;break;}uint32_t id=rd32(payload),off=rd32(payload+4),count=rd32(payload+8);if(count>LOGIC_READ_MAX)count=LOGIC_READ_MAX;uint32_t n=logic_capture_read(id,off,count,out+12,sizeof(out)-12);if(!n&&count){status=WFL2_ERROR;break;}wr32(out,id);wr32(out+4,off);wr32(out+8,n);out_len=12+n;break;}
case WFL2_LOGIC_STOP:logic_capture_stop();break;
case WFL2_JTAG_CONFIG:if(req->payload_length!=8){status=WFL2_RANGE;break;}jtag_configure(rd32(payload),rd16(payload+4));break;case WFL2_JTAG_TAP_RESET:jtag_tap_reset();break;
case WFL2_JTAG_SCAN:{uint32_t ids[8];uint8_t count=jtag_scan_idcodes(ids,8);size_t off=0;out[off++]=count;for(uint8_t i=0;i<count;++i){wr32(out+off,ids[i]);off+=4;out[off++]=0;out[off++]=0;char name[24];snprintf(name,sizeof(name),"JTAG ID 0x%08lx",(unsigned long)ids[i]);size_t len=strlen(name);out[off++]=(uint8_t)len;memcpy(out+off,name,len);off+=len;}out_len=(uint32_t)off;break;}
default:status=WFL2_BAD_COMMAND;break;}usb_send_response(req,status,out,out_len);}

static void parse_rx(void){while(rx_used>=WFL2_HEADER_SIZE){size_t start=0;while(start+4<=rx_used&&rd32(rx_stage+start)!=WFL2_MAGIC_U32)start++;if(start){memmove(rx_stage,rx_stage+start,rx_used-start);rx_used-=start;}if(rx_used<WFL2_HEADER_SIZE)return;const wfl2_header_t*h=(const wfl2_header_t*)rx_stage;if(h->payload_length>RX_STAGE_SIZE-WFL2_HEADER_SIZE){rx_used=0;return;}size_t total=WFL2_HEADER_SIZE+h->payload_length;if(rx_used<total)return;uint32_t crc=wfl2_crc32_init();crc=wfl2_crc32_update(crc,rx_stage,20);crc=wfl2_crc32_update(crc,rx_stage+WFL2_HEADER_SIZE,h->payload_length);crc=wfl2_crc32_finish(crc);if(h->magic==WFL2_MAGIC_U32&&h->version==WFL2_VERSION&&h->type==WFL2_FRAME_COMMAND&&crc==h->crc32)handle_command(h,rx_stage+WFL2_HEADER_SIZE);else usb_send_response(h,WFL2_BAD_CRC,NULL,0);memmove(rx_stage,rx_stage+total,rx_used-total);rx_used-=total;}}
void tud_vendor_rx_cb(uint8_t itf,uint8_t const*buffer,uint16_t bufsize){(void)itf;(void)buffer;(void)bufsize;while(tud_vendor_available()){if(rx_used==sizeof(rx_stage))rx_used=0;uint32_t n=tud_vendor_read(rx_stage+rx_used,sizeof(rx_stage)-rx_used);rx_used+=n;parse_rx();}}
bool tud_vendor_control_xfer_cb(uint8_t rhport,uint8_t stage,tusb_control_request_t const*request){(void)rhport;(void)stage;(void)request;return false;}
static void led_task(void){uint32_t now=to_ms_since_boot(get_absolute_time());bool next=(now%HEARTBEAT_PERIOD_MS)<HEARTBEAT_ON_MS;if(next!=led_state){led_state=next;gpio_put(ZL_STATUS_LED_PIN,led_state);}}

int main(void){stdio_init_all();gpio_init(ZL_STATUS_LED_PIN);gpio_set_dir(ZL_STATUS_LED_PIN,GPIO_OUT);gpio_put(ZL_STATUS_LED_PIN,0);osc_init();logic_capture_init();kxtj3_init();jtag_init();ws2812_status_init();tusb_init();while(true){tud_task();led_task();if(kxtj3_task()){const kxtj3_state_t*s=kxtj3_get_state();uint32_t now=to_ms_since_boot(get_absolute_time());if((uint32_t)(now-last_ws_ms)>=50u){last_ws_ms=now;ws2812_status_update(s->x_mg,s->y_mg,s->z_mg);}}if(enter_bootloader_pending){ws2812_status_off();sleep_ms(120);reset_usb_boot(0,0);}}}
