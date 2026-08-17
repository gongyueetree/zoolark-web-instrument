# WFL 文档索引

欢迎使用WFL (Waveforms Live) - 基于Web的多功能虚拟仪器平台！

---

## 📚 文档列表

### 1. **DESIGN_DOCUMENT.md** - 完整设计文档
**适用人群**: 固件开发者、协议实现者

**内容概要**:
- ✅ 系统架构详解
- ✅ 完整通信协议规范 (UART/USB CDC)
- ✅ 数据包格式定义 (Header, Payload, Checksum, Tail)
- ✅ 所有仪器命令集 (0x01-0x6F)
- ✅ 数据结构定义 (C语言结构体)
- ✅ 错误处理机制
- ✅ 性能要求与优化建议

**快速跳转**:
- [协议层次](DESIGN_DOCUMENT.md#21-协议层次)
- [数据包格式](DESIGN_DOCUMENT.md#3-数据包格式定义)
- [命令集](DESIGN_DOCUMENT.md#4-仪器命令集)

---

### 2. **rp2350_example.c** - RP2350固件示例
**适用人群**: 嵌入式开发者

**内容概要**:
- ✅ 完整的C语言实现 (2500+ 行)
- ✅ 协议收发处理
- ✅ ADC示波器实现
- ✅ PWM信号发生器
- ✅ 逻辑分析仪框架
- ✅ DMA优化示例

**主要函数**:
```c
send_packet()      // 发送数据包
receive_packet()   // 接收数据包
process_packet()   // 命令分发
oscilloscope_task() // 示波器任务
generator_task()   // 信号发生器任务
```

---

### 3. **QUICKSTART.md** - 快速入门指南
**适用人群**: 新手用户

**内容概要**:
- ✅ 环境搭建步骤
- ✅ 固件编译烧录
- ✅ Python测试脚本
- ✅ 硬件连接指南
- ✅ Web应用使用教程
- ✅ 故障排查方案

**快速上手**:
```bash
# 1. 编译固件
mkdir build && cd build
cmake .. && make

# 2. 烧录固件
# 拖拽 rp2350_wfl.uf2 到 RPI-RP2 U盘

# 3. 测试
python3 test_wfl.py
```

---

### 4. **CMakeLists.txt** - 编译配置
**适用人群**: 构建系统维护者

**内容**:
- Pico SDK集成
- 编译选项配置
- 库依赖管理
- UF2输出生成

---

## 🎯 快速导航

### 我想...

#### 📖 **了解协议格式**
→ [DESIGN_DOCUMENT.md - 第3章](DESIGN_DOCUMENT.md#3-数据包格式定义)

**示例数据包**:
```
AA 55 00 00 01 01 55 AA
│  │  │  │  │  │  │  └─ Tail
│  │  │  │  │  │  └──── Checksum
│  │  │  │  │  └─────── CMD_ID (0x01)
│  │  │  │  └────────── Length (0x0000)
│  │  └──────────────── Header (0xAA55)
└──────────────────────
```

#### 🔧 **实现新仪器**
→ [DESIGN_DOCUMENT.md - 第4章](DESIGN_DOCUMENT.md#4-仪器命令集)

**步骤**:
1. 定义命令ID (0x70-0x7F可用)
2. 创建配置结构体
3. 实现硬件初始化
4. 添加任务函数
5. 处理命令

#### 🚀 **快速编译运行**
→ [QUICKSTART.md](QUICKSTART.md#-快速开始)

#### 🐛 **调试通信问题**
→ [QUICKSTART.md - 故障排查](QUICKSTART.md#-故障排查)

#### 🧪 **测试协议**
→ [QUICKSTART.md - Python测试](QUICKSTART.md#python测试脚本)

---

## 📊 协议概览

### 支持的仪器

| 仪器         | CMD范围    | 主要功能                   |
|-------------|-----------|---------------------------|
| 示波器       | 0x10-0x1F | 双通道ADC采样、触发、FFT    |
| 信号发生器    | 0x20-0x2F | 4种波形、频率/幅度可调      |
| PWM发生器    | 0x30-0x3F | 可调频率、占空比           |
| 逻辑分析仪    | 0x40-0x4F | 8通道数字信号、边沿触发     |
| 频谱分析仪    | 0x50-0x5F | 扫频分析、RBW可调          |
| 电源控制     | 0x60-0x6F | 可调电压/电流、状态监控     |

### 通信参数

```
波特率:  115200 / 230400 / 460800 / 921600
数据位:  8 bits
停止位:  1 bit
校验:    None
流控:    None (可选RTS/CTS)
```

### 数据包结构

```
[Header 2B][Length 2B][CMD 1B][Payload NB][Checksum 1B][Tail 2B]
```

---

## 🔬 实现示例

### 发送查询设备信息

**Web应用 (JavaScript)**:
```javascript
const packet = new Uint8Array([
    0xAA, 0x55,        // Header
    0x00, 0x00,        // Length = 0
    0x01,              // CMD_GET_DEVICE_INFO
    0x01,              // Checksum
    0x55, 0xAA         // Tail
]);
await writer.write(packet);
```

**RP2350 (C)**:
```c
send_packet(CMD_GET_DEVICE_INFO, NULL, 0);
```

### 启动示波器采集

**Web应用**:
```javascript
const config = {
    ch1_enabled: 1,
    ch2_enabled: 1,
    sample_rate: 200000,
    sample_depth: 1024
};
const buffer = serializeOscConfig(config);
sendPacket(0x10, buffer);
sendPacket(0x04, new Uint8Array([0x01])); // 启动
```

**RP2350**:
```c
// 配置已在process_packet中接收
device_state.osc_running = true;
// oscilloscope_task()会自动开始采集
```

---

## 🛠️ 开发工具链

### 必需工具
```bash
# Pico SDK
export PICO_SDK_PATH=~/pico-sdk

# 编译器
arm-none-eabi-gcc --version

# CMake
cmake --version  # 需要 >= 3.13

# Python (测试)
python3 --version
pip3 install pyserial
```

### 推荐工具
- **逻辑分析仪**: Saleae Logic, PulseView
- **串口调试**: minicom, PuTTY, CoolTerm
- **十六进制编辑器**: hexdump, HxD
- **示波器**: 用于验证DAC输出

---

## 📈 性能指标

| 指标              | 典型值        | 最大值        |
|------------------|--------------|--------------|
| 示波器采样率      | 200 kSPS     | 2 MSPS       |
| 信号发生器频率    | 100 Hz       | 10 MHz       |
| PWM频率          | 1 kHz        | 1 MHz        |
| 逻辑分析仪采样率   | 10 MSPS      | 100 MSPS     |
| 数据传输延迟      | 20 ms        | 50 ms        |
| 命令响应时间      | 5 ms         | 10 ms        |

---

## 🔐 数据完整性

### 校验算法
```c
uint8_t checksum = 0;
for (int i = 0; i < packet_length; i++) {
    checksum ^= packet[i];  // XOR校验
}
```

### 错误处理
- `0x01`: 无效Header
- `0x02`: 无效Tail
- `0x03`: 校验和错误
- `0x04`: 未知命令
- `0x05`: 参数错误

---

## 📞 技术支持

### 常见问题

**Q: 采样率太低怎么办？**
A: 使用DMA减少CPU占用，参考`DESIGN_DOCUMENT.md#62`

**Q: 如何实现更多通道？**
A: 使用ADC复用或外接多路复用器

**Q: WiFi如何连接？**
A: 添加ESP8266/ESP32模块，透传串口数据

### 调试技巧

1. **使用LED指示通信状态**
```c
gpio_put(LED_PIN, packet_received);
```

2. **输出调试日志**
```c
printf("RX: CMD=0x%02X, Len=%d\n", cmd_id, length);
```

3. **逻辑分析仪监控UART**
- TX/RX引脚接逻辑分析仪
- 添加协议解析器

---

## 🎓 学习路径

### 初级 (1-2天)
1. ✅ 阅读 QUICKSTART.md
2. ✅ 编译并烧录示例固件
3. ✅ 运行Python测试脚本
4. ✅ 使用Web应用连接设备

### 中级 (3-5天)
1. ✅ 研究 DESIGN_DOCUMENT.md 协议部分
2. ✅ 理解 rp2350_example.c 代码
3. ✅ 修改采样率和缓冲区大小
4. ✅ 添加自定义测量功能

### 高级 (1-2周)
1. ✅ 实现DMA高速采集
2. ✅ 使用PIO实现逻辑分析
3. ✅ 添加新仪器类型
4. ✅ 优化数据压缩传输
5. ✅ 实现WiFi无线连接

---

## 📝 版本历史

- **v1.0** (2025-10-21)
  - 初始版本
  - 完整协议定义
  - RP2350示例实现
  - Web应用集成

---

## 🙏 致谢

- Raspberry Pi Foundation - Pico SDK
- Digilent - WaveForms Live 启发
- 开源社区

---

## 📄 许可证

本项目采用 MIT 许可证。

---

**开始你的虚拟仪器之旅！** 🚀

有问题? 查看文档或提交Issue。
