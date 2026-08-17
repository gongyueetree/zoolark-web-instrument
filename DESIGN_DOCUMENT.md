# WFL (Waveforms Live) 设计文档

**版本**: 1.0
**日期**: 2025-10-21
**目标平台**: RP2350 (Raspberry Pi Pico 2)
**通信接口**: USB CDC / UART / Wi-Fi

---

## 目录

1. [系统架构](#1-系统架构)
2. [通信协议规范](#2-通信协议规范)
3. [数据包格式定义](#3-数据包格式定义)
4. [仪器命令集](#4-仪器命令集)
5. [数据传输示例](#5-数据传输示例)
6. [RP2350实现指南](#6-rp2350实现指南)
7. [错误处理](#7-错误处理)
8. [性能要求](#8-性能要求)

---

## 1. 系统架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Web应用 (WFL)                             │
│  ┌──────────────┬──────────────┬──────────────┬──────────┐  │
│  │   示波器     │  频谱分析仪   │  信号发生器   │  逻辑分析 │  │
│  └──────────────┴──────────────┴──────────────┴──────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           通信管理器 (Serial/USB/WiFi)                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↕
                    Serial Protocol (UART/USB CDC)
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                   RP2350 微控制器                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            协议处理器 (Protocol Handler)                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │   ADC    │   DAC    │   PWM    │   PIO    │  GPIO   │   │
│  │(示波器)  │(信号发生器)│(PWM输出) │(逻辑分析) │(电源控制)│   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 支持的仪器

| 仪器名称       | 功能描述                 | RP2350硬件资源          |
|---------------|-------------------------|------------------------|
| 示波器        | 2通道模拟信号采集         | ADC0, ADC1             |
| 频谱分析仪     | FFT频谱分析              | ADC + 软件FFT           |
| 信号发生器     | 任意波形输出             | PWM + DAC (可选)        |
| PWM发生器     | 可调占空比PWM            | PWM硬件                |
| 逻辑分析仪     | 8通道数字信号采集         | PIO + GPIO             |
| 电源          | 可调电压输出             | PWM + 电源管理IC        |
| 网络分析仪     | 扫频特性分析             | DAC + ADC + 软件处理    |

---

## 2. 通信协议规范

### 2.1 协议层次

```
┌─────────────────────────────────────┐
│      应用层 (Application Layer)      │  仪器特定命令
├─────────────────────────────────────┤
│      传输层 (Transport Layer)        │  数据包封装/校验
├─────────────────────────────────────┤
│      物理层 (Physical Layer)         │  UART/USB CDC/WiFi
└─────────────────────────────────────┘
```

### 2.2 通信参数

#### UART配置
```
波特率:    115200 bps (默认) / 230400 / 460800 / 921600
数据位:    8 bits
停止位:    1 bit
校验位:    None
流控制:    None (可选RTS/CTS)
```

#### USB CDC配置
```
接口类:    CDC ACM (0x02)
端点:      IN/OUT Bulk endpoints
缓冲区:    64/512 bytes
```

### 2.3 字节序

- **小端序 (Little Endian)**: 所有多字节数据使用小端序传输
- 示例: `0x1234` → `[0x34, 0x12]`

---

## 3. 数据包格式定义

### 3.1 通用数据包结构

```
┌────────┬────────┬────────┬────────────┬──────────┬────────┐
│ Header │ Length │ CMD_ID │  Payload   │ Checksum │  Tail  │
├────────┼────────┼────────┼────────────┼──────────┼────────┤
│ 2 bytes│ 2 bytes│ 1 byte │  N bytes   │  1 byte  │ 2 bytes│
└────────┴────────┴────────┴────────────┴──────────┴────────┘
```

#### 字段说明

| 字段       | 大小    | 值/说明                              |
|-----------|---------|-------------------------------------|
| Header    | 2 bytes | 固定值: `0xAA55`                     |
| Length    | 2 bytes | Payload长度 (不含Header/Tail/Checksum)|
| CMD_ID    | 1 byte  | 命令/响应ID (见命令集)                |
| Payload   | N bytes | 命令参数或数据                       |
| Checksum  | 1 byte  | XOR校验: Header到Payload所有字节异或  |
| Tail      | 2 bytes | 固定值: `0x55AA`                     |

### 3.2 校验算法

```c
uint8_t calculate_checksum(uint8_t *data, uint16_t len) {
    uint8_t checksum = 0;
    for (uint16_t i = 0; i < len; i++) {
        checksum ^= data[i];
    }
    return checksum;
}
```

### 3.3 数据包示例

**查询设备信息请求**:
```
AA 55 00 00 01 01 55 AA
│  │  │  │  │  │  │  │
│  │  │  │  │  │  │  └─ Tail (0x55AA)
│  │  │  │  │  │  └──── Checksum (0xAA^0x55^0x00^0x00^0x01)
│  │  │  │  │  └─────── CMD_ID (0x01 = GET_DEVICE_INFO)
│  │  │  │  └────────── Length高字节 (0x0000 = 0长度)
│  │  │  └───────────── Length低字节
│  │  └──────────────── Header高字节
│  └─────────────────── Header低字节
```

---

## 4. 仪器命令集

### 4.1 系统命令 (0x01 - 0x0F)

| CMD_ID | 命令名称              | 方向    | Payload                    |
|--------|-----------------------|---------|---------------------------|
| 0x01   | GET_DEVICE_INFO       | PC→MCU  | 无                         |
| 0x02   | DEVICE_INFO_RESPONSE  | MCU→PC  | 设备信息结构体              |
| 0x03   | SET_SAMPLE_RATE       | PC→MCU  | 4 bytes (采样率 Hz)         |
| 0x04   | START_ACQUISITION     | PC→MCU  | 1 byte (仪器类型)           |
| 0x05   | STOP_ACQUISITION      | PC→MCU  | 无                         |
| 0x06   | RESET_DEVICE          | PC→MCU  | 无                         |
| 0x07   | GET_STATUS            | PC→MCU  | 无                         |
| 0x08   | STATUS_RESPONSE       | MCU→PC  | 状态数据                    |
| 0x0F   | ERROR_RESPONSE        | MCU→PC  | 错误码                      |

### 4.2 示波器命令 (0x10 - 0x1F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x10   | OSC_SET_CONFIG        | PC→MCU  | 见配置结构体                |
| 0x11   | OSC_GET_DATA          | PC→MCU  | 无                         |
| 0x12   | OSC_DATA_STREAM       | MCU→PC  | 见数据结构体                |
| 0x13   | OSC_SET_TRIGGER       | PC→MCU  | 触发配置                    |
| 0x14   | OSC_SINGLE_CAPTURE    | PC→MCU  | 无                         |

#### 示波器配置结构 (0x10)
```c
typedef struct {
    uint8_t  ch1_enabled;      // 0=禁用, 1=启用
    uint8_t  ch2_enabled;
    uint8_t  ch1_coupling;     // 0=DC, 1=AC
    uint8_t  ch2_coupling;
    uint16_t ch1_scale_mv;     // 每格刻度 (mV)
    uint16_t ch2_scale_mv;
    uint32_t sample_rate;      // 采样率 (Hz)
    uint16_t sample_depth;     // 采样深度 (样本数)
    uint8_t  trigger_source;   // 0=CH1, 1=CH2, 2=外部
    uint8_t  trigger_edge;     // 0=上升沿, 1=下降沿
    int16_t  trigger_level_mv; // 触发电平 (mV)
} __attribute__((packed)) OscConfig;
```

#### 示波器数据包 (0x12)
```c
typedef struct {
    uint16_t sequence_num;     // 序列号
    uint16_t sample_count;     // 本包样本数
    uint8_t  channel_mask;     // bit0=CH1, bit1=CH2
    uint8_t  flags;            // bit0=触发标志
    // 后跟样本数据
    // int16_t samples[];      // CH1样本, CH2样本交织
} __attribute__((packed)) OscDataPacket;
```

### 4.3 信号发生器命令 (0x20 - 0x2F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x20   | GEN_SET_WAVEFORM      | PC→MCU  | 波形配置                    |
| 0x21   | GEN_START_OUTPUT      | PC→MCU  | 无                         |
| 0x22   | GEN_STOP_OUTPUT       | PC→MCU  | 无                         |
| 0x23   | GEN_SET_FREQUENCY     | PC→MCU  | 4 bytes (频率 Hz)           |
| 0x24   | GEN_SET_AMPLITUDE     | PC→MCU  | 2 bytes (幅度 mV)           |

#### 信号发生器配置 (0x20)
```c
typedef struct {
    uint8_t  wave_type;        // 0=正弦, 1=方波, 2=三角, 3=锯齿
    uint32_t frequency;        // 频率 (Hz)
    uint16_t amplitude_mv;     // 幅度 (mV峰峰值)
    int16_t  offset_mv;        // 直流偏置 (mV)
    uint8_t  duty_cycle;       // 占空比 (1-99%), 仅方波有效
    uint8_t  reserved[3];      // 保留, 对齐
} __attribute__((packed)) GenConfig;
```

### 4.4 PWM发生器命令 (0x30 - 0x3F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x30   | PWM_SET_CONFIG        | PC→MCU  | PWM配置                    |
| 0x31   | PWM_START             | PC→MCU  | 无                         |
| 0x32   | PWM_STOP              | PC→MCU  | 无                         |
| 0x33   | PWM_SET_DUTY          | PC→MCU  | 1 byte (占空比 0-100)       |

#### PWM配置 (0x30)
```c
typedef struct {
    uint32_t frequency;        // 频率 (Hz)
    uint8_t  duty_cycle;       // 占空比 (0-100)
    uint8_t  output_pin;       // 输出引脚
    uint8_t  reserved[2];
} __attribute__((packed)) PwmConfig;
```

### 4.5 逻辑分析仪命令 (0x40 - 0x4F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x40   | LA_SET_CONFIG         | PC→MCU  | 逻辑分析仪配置              |
| 0x41   | LA_START_CAPTURE      | PC→MCU  | 无                         |
| 0x42   | LA_DATA_STREAM        | MCU→PC  | 数据流                      |
| 0x43   | LA_SET_TRIGGER        | PC→MCU  | 触发配置                    |

#### 逻辑分析仪配置 (0x40)
```c
typedef struct {
    uint8_t  channel_mask;     // bit0-7对应CH0-CH7
    uint32_t sample_rate;      // 采样率 (Hz)
    uint16_t sample_depth;     // 采样深度
    uint8_t  trigger_mode;     // 0=无, 1=边沿, 2=模式
    uint8_t  trigger_channel;  // 触发通道
    uint8_t  trigger_edge;     // 0=上升沿, 1=下降沿
    uint8_t  reserved[3];
} __attribute__((packed)) LaConfig;
```

#### 逻辑分析仪数据包 (0x42)
```c
typedef struct {
    uint16_t sequence_num;
    uint16_t sample_count;     // 样本数
    uint8_t  channel_mask;     // 启用的通道
    // 后跟数据: 每8个样本打包为1字节
    // uint8_t data[];
} __attribute__((packed)) LaDataPacket;
```

### 4.6 频谱分析仪命令 (0x50 - 0x5F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x50   | SPEC_SET_CONFIG       | PC→MCU  | 频谱配置                    |
| 0x51   | SPEC_START_SCAN       | PC→MCU  | 无                         |
| 0x52   | SPEC_DATA_RESPONSE    | MCU→PC  | 频谱数据                    |

#### 频谱分析仪配置 (0x50)
```c
typedef struct {
    uint32_t start_freq;       // 起始频率 (Hz)
    uint32_t stop_freq;        // 终止频率 (Hz)
    uint16_t rbw;              // 分辨率带宽 (Hz)
    uint8_t  averaging;        // 平均次数
    uint8_t  reserved;
} __attribute__((packed)) SpecConfig;
```

### 4.7 电源控制命令 (0x60 - 0x6F)

| CMD_ID | 命令名称              | 方向    | Payload格式                |
|--------|-----------------------|---------|---------------------------|
| 0x60   | POWER_SET_VOLTAGE     | PC→MCU  | 电压电流配置                |
| 0x61   | POWER_ENABLE          | PC→MCU  | 1 byte (0=关, 1=开)         |
| 0x62   | POWER_GET_STATUS      | PC→MCU  | 无                         |
| 0x63   | POWER_STATUS_RESPONSE | MCU→PC  | 电压电流测量值              |

#### 电源配置 (0x60)
```c
typedef struct {
    uint16_t voltage_mv;       // 设定电压 (mV)
    uint16_t current_limit_ma; // 电流限制 (mA)
} __attribute__((packed)) PowerConfig;
```

#### 电源状态响应 (0x63)
```c
typedef struct {
    uint16_t actual_voltage_mv;    // 实际输出电压
    uint16_t actual_current_ma;    // 实际输出电流
    uint8_t  is_enabled;            // 输出状态
    uint8_t  is_current_limited;    // 是否处于限流
    uint16_t power_mw;              // 输出功率 (mW)
} __attribute__((packed)) PowerStatus;
```

---

## 5. 数据传输示例

### 5.1 完整通信流程

#### 场景: 配置示波器并采集数据

**步骤1: PC查询设备信息**
```
PC → MCU: AA 55 00 00 01 FF 55 AA
```

**步骤2: MCU响应设备信息**
```
MCU → PC: AA 55 20 00 02 [设备信息32字节] CS 55 AA
```

设备信息Payload:
```c
typedef struct {
    char     device_name[16];  // "RP2350-WFL"
    uint16_t firmware_version; // 0x0100 = v1.0
    uint32_t serial_number;
    uint8_t  supported_instruments; // bit mask
    uint8_t  max_sample_rate_mhz;
    uint8_t  adc_resolution;   // 12
    uint8_t  reserved[5];
} __attribute__((packed)) DeviceInfo;
```

**步骤3: PC配置示波器**
```
PC → MCU: AA 55 10 00 10 [OscConfig 16字节] CS 55 AA
```

OscConfig示例数据:
```
01        // CH1启用
01        // CH2启用
00        // CH1 DC耦合
00        // CH2 DC耦合
88 13     // CH1刻度 5000mV (5V)
D0 07     // CH2刻度 2000mV (2V)
80 84 1E 00  // 采样率 2MHz
00 04     // 采样深度 1024
00        // 触发源 CH1
00        // 上升沿触发
00 00     // 触发电平 0mV
```

**步骤4: PC启动采集**
```
PC → MCU: AA 55 00 00 04 01 FF 55 AA
                       │  └─ 仪器类型: 0x01=示波器
                       └──── CMD_ID: 0x04=START_ACQUISITION
```

**步骤5: MCU流式传输数据**
```
MCU → PC: AA 55 [LEN] 12 [数据包头+样本] CS 55 AA
          (重复发送多个数据包直到采集完成)
```

数据包示例:
```
00 00     // 序列号 0
00 04     // 1024个样本
03        // CH1+CH2都启用
01        // 触发标志
[2048字节] // 1024个CH1样本(int16) + 1024个CH2样本(int16)
```

### 5.2 信号发生器输出正弦波

**配置1kHz正弦波, 幅度3.3V**:
```
PC → MCU: AA 55 0C 00 20 [GenConfig] CS 55 AA
```

GenConfig:
```
00           // 波形类型: 0=正弦波
E8 03 00 00  // 频率: 1000 Hz
E2 0C        // 幅度: 3300 mV (3.3V)
00 00        // 偏置: 0 mV
32           // 占空比: 50% (此处无效)
00 00 00     // 保留
```

**启动输出**:
```
PC → MCU: AA 55 00 00 21 21 55 AA
```

---

## 6. RP2350实现指南

### 6.1 硬件连接

```
RP2350 引脚分配建议:
┌─────────────────────────────────────────┐
│ 功能          │ 引脚    │ 说明           │
├─────────────────────────────────────────┤
│ ADC CH1       │ GPIO26  │ ADC0          │
│ ADC CH2       │ GPIO27  │ ADC1          │
│ DAC输出       │ GPIO0   │ PWM0_A        │
│ PWM输出       │ GPIO1   │ PWM0_B        │
│ 逻辑分析CH0-7 │ GPIO2-9 │ PIO采集       │
│ UART TX       │ GPIO0   │ 串口发送       │
│ UART RX       │ GPIO1   │ 串口接收       │
│ LED指示       │ GPIO25  │ 状态指示       │
└─────────────────────────────────────────┘
```

### 6.2 C语言实现框架

#### 主程序结构
```c
#include "pico/stdlib.h"
#include "hardware/adc.h"
#include "hardware/pwm.h"
#include "hardware/dma.h"
#include "hardware/pio.h"

// 协议定义
#define HEADER_MAGIC     0x55AA
#define TAIL_MAGIC       0xAA55
#define MAX_PAYLOAD_SIZE 4096

// 命令ID
typedef enum {
    CMD_GET_DEVICE_INFO = 0x01,
    CMD_DEVICE_INFO_RSP = 0x02,
    CMD_START_ACQ       = 0x04,
    CMD_STOP_ACQ        = 0x05,
    // ... 其他命令
} CommandID;

// 数据包结构
typedef struct {
    uint16_t header;
    uint16_t length;
    uint8_t  cmd_id;
    uint8_t  payload[MAX_PAYLOAD_SIZE];
    uint8_t  checksum;
    uint16_t tail;
} __attribute__((packed)) Packet;

// 全局状态
static struct {
    bool osc_running;
    bool gen_running;
    OscConfig osc_config;
    GenConfig gen_config;
} device_state;

int main() {
    stdio_init_all();

    // 初始化硬件
    init_adc();
    init_pwm();
    init_pio();

    // 主循环
    while (1) {
        if (packet_available()) {
            Packet pkt;
            if (receive_packet(&pkt)) {
                process_packet(&pkt);
            }
        }

        // 定期任务
        if (device_state.osc_running) {
            oscilloscope_task();
        }
        if (device_state.gen_running) {
            generator_task();
        }
    }
}
```

#### 数据包收发实现
```c
// 发送数据包
void send_packet(uint8_t cmd_id, void *payload, uint16_t len) {
    Packet pkt;
    pkt.header = HEADER_MAGIC;
    pkt.length = len;
    pkt.cmd_id = cmd_id;

    if (len > 0) {
        memcpy(pkt.payload, payload, len);
    }

    // 计算校验和
    uint8_t checksum = 0;
    checksum ^= (pkt.header >> 8) & 0xFF;
    checksum ^= pkt.header & 0xFF;
    checksum ^= (pkt.length >> 8) & 0xFF;
    checksum ^= pkt.length & 0xFF;
    checksum ^= pkt.cmd_id;
    for (int i = 0; i < len; i++) {
        checksum ^= pkt.payload[i];
    }
    pkt.checksum = checksum;
    pkt.tail = TAIL_MAGIC;

    // 发送到串口
    uart_write_blocking(uart0, (uint8_t*)&pkt.header, 2);
    uart_write_blocking(uart0, (uint8_t*)&pkt.length, 2);
    uart_write_blocking(uart0, &pkt.cmd_id, 1);
    if (len > 0) {
        uart_write_blocking(uart0, pkt.payload, len);
    }
    uart_write_blocking(uart0, &pkt.checksum, 1);
    uart_write_blocking(uart0, (uint8_t*)&pkt.tail, 2);
}

// 接收数据包
bool receive_packet(Packet *pkt) {
    static enum {WAIT_HEADER, READ_LENGTH, READ_CMD,
                 READ_PAYLOAD, READ_CHECKSUM, READ_TAIL} state = WAIT_HEADER;
    static uint16_t bytes_read = 0;

    // 实现状态机接收
    // ... (略)

    return true; // 成功接收完整数据包
}
```

#### 示波器实现
```c
#define ADC_BUFFER_SIZE 1024

static uint16_t adc_buffer_ch1[ADC_BUFFER_SIZE];
static uint16_t adc_buffer_ch2[ADC_BUFFER_SIZE];

void init_oscilloscope() {
    // 初始化ADC
    adc_init();
    adc_gpio_init(26); // CH1
    adc_gpio_init(27); // CH2

    // 配置DMA for ADC
    uint dma_chan = dma_claim_unused_channel(true);
    dma_channel_config cfg = dma_channel_get_default_config(dma_chan);
    channel_config_set_transfer_data_size(&cfg, DMA_SIZE_16);
    channel_config_set_read_increment(&cfg, false);
    channel_config_set_write_increment(&cfg, true);
    channel_config_set_dreq(&cfg, DREQ_ADC);
}

void oscilloscope_task() {
    // 触发ADC采集
    adc_select_input(0); // CH1
    for (int i = 0; i < ADC_BUFFER_SIZE; i++) {
        adc_buffer_ch1[i] = adc_read();
    }

    adc_select_input(1); // CH2
    for (int i = 0; i < ADC_BUFFER_SIZE; i++) {
        adc_buffer_ch2[i] = adc_read();
    }

    // 发送数据包
    OscDataPacket data_pkt;
    data_pkt.sequence_num = 0;
    data_pkt.sample_count = ADC_BUFFER_SIZE;
    data_pkt.channel_mask = 0x03; // CH1+CH2
    data_pkt.flags = 0;

    // 构造payload: 头部 + 交织的样本数据
    uint8_t payload[8 + ADC_BUFFER_SIZE * 4];
    memcpy(payload, &data_pkt, 6);

    // 交织CH1和CH2数据
    int16_t *samples = (int16_t*)(payload + 6);
    for (int i = 0; i < ADC_BUFFER_SIZE; i++) {
        samples[i * 2] = adc_buffer_ch1[i] - 2048; // 转换为有符号
        samples[i * 2 + 1] = adc_buffer_ch2[i] - 2048;
    }

    send_packet(CMD_OSC_DATA_STREAM, payload, sizeof(payload));
}
```

#### 信号发生器实现
```c
void init_generator() {
    // 配置PWM作为DAC
    gpio_set_function(0, GPIO_FUNC_PWM);
    uint slice_num = pwm_gpio_to_slice_num(0);

    pwm_config config = pwm_get_default_config();
    pwm_config_set_clkdiv(&config, 1.0f);
    pwm_config_set_wrap(&config, 255); // 8-bit分辨率
    pwm_init(slice_num, &config, true);
}

// 波形查找表
static const uint8_t sine_table[256] = {
    128, 131, 134, 137, ... // 256个正弦波采样点
};

void generator_task() {
    static uint32_t phase = 0;
    static uint32_t last_update = 0;

    uint32_t now = time_us_32();
    uint32_t phase_increment = (device_state.gen_config.frequency * 256) /
                               (1000000 / (now - last_update));

    phase += phase_increment;
    uint8_t index = (phase >> 8) & 0xFF;

    uint8_t sample;
    switch (device_state.gen_config.wave_type) {
        case 0: // 正弦波
            sample = sine_table[index];
            break;
        case 1: // 方波
            sample = (index < 128) ? 255 : 0;
            break;
        // ... 其他波形
    }

    // 应用幅度和偏置
    sample = (sample * device_state.gen_config.amplitude_mv) / 3300;

    pwm_set_gpio_level(0, sample);
    last_update = now;
}
```

### 6.3 命令处理
```c
void process_packet(Packet *pkt) {
    switch (pkt->cmd_id) {
        case CMD_GET_DEVICE_INFO: {
            DeviceInfo info;
            strcpy(info.device_name, "RP2350-WFL");
            info.firmware_version = 0x0100;
            info.serial_number = 0x12345678;
            info.supported_instruments = 0x7F; // 所有仪器
            info.max_sample_rate_mhz = 2;
            info.adc_resolution = 12;

            send_packet(CMD_DEVICE_INFO_RSP, &info, sizeof(info));
            break;
        }

        case CMD_OSC_SET_CONFIG: {
            memcpy(&device_state.osc_config, pkt->payload, sizeof(OscConfig));
            // 应用配置
            apply_osc_config();
            break;
        }

        case CMD_START_ACQ: {
            uint8_t instrument = pkt->payload[0];
            if (instrument == 0x01) { // 示波器
                device_state.osc_running = true;
            }
            break;
        }

        case CMD_GEN_SET_WAVEFORM: {
            memcpy(&device_state.gen_config, pkt->payload, sizeof(GenConfig));
            break;
        }

        case CMD_GEN_START_OUTPUT: {
            device_state.gen_running = true;
            break;
        }

        // ... 其他命令
    }
}
```

---

## 7. 错误处理

### 7.1 错误码定义

```c
typedef enum {
    ERR_NONE            = 0x00,
    ERR_INVALID_HEADER  = 0x01,
    ERR_INVALID_TAIL    = 0x02,
    ERR_CHECKSUM_FAIL   = 0x03,
    ERR_UNKNOWN_CMD     = 0x04,
    ERR_INVALID_PARAM   = 0x05,
    ERR_BUFFER_OVERFLOW = 0x06,
    ERR_NOT_READY       = 0x07,
    ERR_TIMEOUT         = 0x08,
    ERR_HARDWARE_FAULT  = 0x09,
} ErrorCode;
```

### 7.2 错误响应

```c
typedef struct {
    uint8_t error_code;
    uint8_t failed_cmd_id;
    char    description[32];
} __attribute__((packed)) ErrorResponse;
```

发送错误:
```c
void send_error(uint8_t error_code, uint8_t failed_cmd, const char *desc) {
    ErrorResponse err;
    err.error_code = error_code;
    err.failed_cmd_id = failed_cmd;
    strncpy(err.description, desc, 32);

    send_packet(CMD_ERROR_RESPONSE, &err, sizeof(err));
}
```

---

## 8. 性能要求

### 8.1 实时性指标

| 指标                | 要求值              |
|--------------------|---------------------|
| 命令响应时间        | < 10ms              |
| 示波器采样率        | 最高 2 MSPS         |
| 数据流延迟          | < 50ms              |
| 信号发生器频率范围   | 1 Hz - 10 MHz       |
| PWM分辨率          | 1% - 99%            |
| 逻辑分析仪采样率    | 最高 100 MSPS       |

### 8.2 缓冲区管理

```c
// 推荐缓冲区大小
#define RX_BUFFER_SIZE  1024   // 接收缓冲
#define TX_BUFFER_SIZE  4096   // 发送缓冲
#define ADC_BUFFER_SIZE 1024   // ADC采样缓冲
#define LA_BUFFER_SIZE  2048   // 逻辑分析缓冲
```

### 8.3 数据压缩 (可选)

对于高速数据流，可实现简单的游程编码:
```c
// RLE压缩: [count, value, count, value, ...]
uint16_t compress_samples(uint16_t *input, uint16_t len,
                         uint8_t *output) {
    // 实现游程编码
    // ...
}
```

---

## 9. Web应用集成

### 9.1 JavaScript串口通信

```javascript
// Web Serial API
async function connectDevice() {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    const reader = port.readable.getReader();
    const writer = port.writable.getWriter();

    // 读取数据
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        processPacket(value);
    }
}

// 发送命令
async function sendCommand(cmdId, payload) {
    const packet = buildPacket(cmdId, payload);
    await writer.write(packet);
}

// 解析数据包
function processPacket(data) {
    const view = new DataView(data.buffer);
    const header = view.getUint16(0, true);

    if (header !== 0x55AA) return;

    const length = view.getUint16(2, true);
    const cmdId = view.getUint8(4);

    switch (cmdId) {
        case 0x12: // 示波器数据
            updateOscilloscope(data);
            break;
        // ... 其他命令
    }
}
```

---

## 10. 测试与调试

### 10.1 测试工具

**Python测试脚本**:
```python
import serial
import struct

class WFL_Protocol:
    def __init__(self, port, baudrate=115200):
        self.ser = serial.Serial(port, baudrate)

    def send_packet(self, cmd_id, payload=b''):
        header = 0x55AA
        length = len(payload)

        packet = struct.pack('<HHB', header, length, cmd_id)
        packet += payload

        checksum = 0
        for byte in packet:
            checksum ^= byte

        packet += bytes([checksum])
        packet += struct.pack('<H', 0xAA55)

        self.ser.write(packet)

    def receive_packet(self, timeout=1.0):
        # 实现接收逻辑
        pass

    def get_device_info(self):
        self.send_packet(0x01)
        return self.receive_packet()

# 使用示例
wfl = WFL_Protocol('/dev/ttyACM0')
info = wfl.get_device_info()
print(f"Device: {info}")
```

### 10.2 调试技巧

1. **串口监控**: 使用逻辑分析仪监控UART信号
2. **LED指示**: 用LED显示通信状态
3. **日志输出**: 通过第二个UART输出调试信息
4. **单元测试**: 为每个命令编写测试用例

---

## 附录A: 完整示例代码

参见GitHub仓库: `rp2350-wfl-firmware/`

## 附录B: 常见问题

**Q: 如何提高数据传输速率?**
A: 可以提升波特率到921600或使用USB CDC高速模式

**Q: 是否支持WiFi?**
A: 可通过ESP8266/ESP32模块实现WiFi透传

**Q: 如何实现多通道同步采样?**
A: 使用DMA + 定时器触发，确保通道间相位一致

---

**文档版本历史**:
- v1.0 (2025-10-21): 初始版本
