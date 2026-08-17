# WFL 快速入门指南

本指南帮助您快速开始使用RP2350开发WFL固件。

---

## 📋 准备工作

### 硬件需求
- **RP2350开发板** (Raspberry Pi Pico 2或兼容板)
- **USB数据线** (支持数据传输)
- **调试探针** (可选，用于调试)

### 软件需求
- **Pico SDK** (v2.0.0+)
- **CMake** (v3.13+)
- **ARM GCC编译器** (arm-none-eabi-gcc)
- **串口终端** (PuTTY, minicom, screen等)

---

## 🚀 快速开始

### 1. 克隆Pico SDK

```bash
cd ~
git clone https://github.com/raspberrypi/pico-sdk.git
cd pico-sdk
git submodule update --init
export PICO_SDK_PATH=~/pico-sdk
```

### 2. 编译固件

```bash
cd /Users/gongyusu/Desktop/UI/WFL
mkdir build
cd build
cmake ..
make
```

编译成功后会生成：
- `rp2350_wfl.uf2` - 用于拖拽烧录
- `rp2350_wfl.elf` - 用于调试

### 3. 烧录固件

**方法1: UF2烧录 (推荐)**
1. 按住BOOTSEL按钮
2. 插入USB线
3. 释放BOOTSEL，板子会显示为U盘
4. 拖拽`rp2350_wfl.uf2`到U盘
5. 等待自动重启

**方法2: 使用调试器**
```bash
openocd -f interface/cmsis-dap.cfg -f target/rp2040.cfg \
        -c "program rp2350_wfl.elf verify reset exit"
```

### 4. 连接串口

**Linux/macOS:**
```bash
screen /dev/ttyACM0 115200
# 或
minicom -D /dev/ttyACM0 -b 115200
```

**Windows:**
- 使用PuTTY或TeraTerm
- 波特率: 115200
- 数据位: 8, 停止位: 1, 无校验

### 5. 测试通信

启动成功后应该看到：
```
RP2350 WFL Firmware v1.0
ADC DMA initialized
PWM DAC initialized
UART initialized at 115200 baud
Ready for commands...
```

---

## 🧪 测试示例

### Python测试脚本

创建`test_wfl.py`:

```python
import serial
import struct
import time

class WFL:
    def __init__(self, port='/dev/ttyACM0', baudrate=115200):
        self.ser = serial.Serial(port, baudrate, timeout=1)
        time.sleep(2)  # 等待复位

    def send_packet(self, cmd_id, payload=b''):
        header = 0x55AA
        length = len(payload)

        # 构建数据包
        packet = struct.pack('<HHB', header, length, cmd_id)
        packet += payload

        # 计算校验和
        checksum = 0
        for byte in packet:
            checksum ^= byte
        packet += bytes([checksum])

        # 添加尾部
        packet += struct.pack('<H', 0xAA55)

        # 发送
        self.ser.write(packet)
        print(f"Sent CMD 0x{cmd_id:02X}, {len(packet)} bytes")

    def receive_packet(self, timeout=2.0):
        start_time = time.time()
        buffer = b''

        while time.time() - start_time < timeout:
            if self.ser.in_waiting > 0:
                buffer += self.ser.read(self.ser.in_waiting)

                # 查找包头
                if len(buffer) >= 2:
                    if struct.unpack('<H', buffer[:2])[0] == 0x55AA:
                        if len(buffer) >= 4:
                            length = struct.unpack('<H', buffer[2:4])[0]
                            total_len = 2 + 2 + 1 + length + 1 + 2

                            if len(buffer) >= total_len:
                                # 完整数据包
                                return buffer[:total_len]

            time.sleep(0.01)

        return None

    def get_device_info(self):
        print("\n=== 获取设备信息 ===")
        self.send_packet(0x01)  # CMD_GET_DEVICE_INFO

        response = self.receive_packet()
        if response:
            print(f"收到响应: {len(response)} bytes")
            print("原始数据:", response.hex())

            # 解析
            header = struct.unpack('<H', response[0:2])[0]
            length = struct.unpack('<H', response[2:4])[0]
            cmd_id = response[4]

            print(f"Header: 0x{header:04X}")
            print(f"Length: {length}")
            print(f"CMD_ID: 0x{cmd_id:02X}")

            if cmd_id == 0x02 and length >= 32:
                payload = response[5:5+length]
                device_name = payload[0:16].decode('ascii').rstrip('\x00')
                fw_version = struct.unpack('<H', payload[16:18])[0]
                serial_num = struct.unpack('<I', payload[18:22])[0]

                print(f"\n设备名称: {device_name}")
                print(f"固件版本: v{(fw_version >> 8)}.{(fw_version & 0xFF)}")
                print(f"序列号: 0x{serial_num:08X}")
        else:
            print("未收到响应")

    def start_oscilloscope(self):
        print("\n=== 启动示波器 ===")

        # 配置示波器
        config = struct.pack('<BBBBHHI HBBB h',
            1,      # CH1启用
            1,      # CH2启用
            0,      # CH1 DC耦合
            0,      # CH2 DC耦合
            5000,   # CH1刻度 5V/div
            2000,   # CH2刻度 2V/div
            200000, # 采样率 200kHz
            1024,   # 采样深度
            0,      # 触发源 CH1
            0,      # 上升沿
            0       # 触发电平 0mV
        )
        self.send_packet(0x10, config)  # CMD_OSC_SET_CONFIG
        time.sleep(0.1)

        # 启动采集
        self.send_packet(0x04, b'\x01')  # CMD_START_ACQUISITION, 仪器=示波器
        time.sleep(0.1)

        # 接收数据
        print("等待示波器数据...")
        for i in range(3):
            response = self.receive_packet(timeout=5.0)
            if response:
                cmd_id = response[4]
                if cmd_id == 0x12:  # OSC_DATA_STREAM
                    length = struct.unpack('<H', response[2:4])[0]
                    print(f"收到示波器数据 #{i+1}: {length} bytes")
            else:
                print(f"第{i+1}次未收到数据")

        # 停止采集
        self.send_packet(0x05)  # CMD_STOP_ACQUISITION

    def start_generator(self, wave_type=0, frequency=1000, amplitude=3300):
        print(f"\n=== 启动信号发生器 ===")
        print(f"波形: {wave_type}, 频率: {frequency}Hz, 幅度: {amplitude}mV")

        # 配置信号发生器
        config = struct.pack('<BI Hh BB B',
            wave_type,   # 0=正弦波
            frequency,   # 频率
            amplitude,   # 幅度
            0,           # 偏置
            50,          # 占空比(无效)
            0, 0, 0      # 保留
        )
        self.send_packet(0x20, config)  # CMD_GEN_SET_WAVEFORM
        time.sleep(0.1)

        # 启动输出
        self.send_packet(0x21)  # CMD_GEN_START_OUTPUT
        print("信号发生器已启动")

    def stop_generator(self):
        print("\n=== 停止信号发生器 ===")
        self.send_packet(0x22)  # CMD_GEN_STOP_OUTPUT

    def close(self):
        self.ser.close()


# 使用示例
if __name__ == '__main__':
    # 根据你的系统修改串口
    # Windows: 'COM3'
    # Linux: '/dev/ttyACM0'
    # macOS: '/dev/tty.usbmodem*'

    wfl = WFL(port='/dev/ttyACM0')

    try:
        # 1. 获取设备信息
        wfl.get_device_info()
        time.sleep(1)

        # 2. 测试示波器
        wfl.start_oscilloscope()
        time.sleep(1)

        # 3. 测试信号发生器 - 1kHz正弦波
        wfl.start_generator(wave_type=0, frequency=1000, amplitude=3300)
        time.sleep(3)

        # 4. 方波
        wfl.start_generator(wave_type=1, frequency=500, amplitude=3300)
        time.sleep(3)

        # 5. 停止
        wfl.stop_generator()

        print("\n测试完成!")

    finally:
        wfl.close()
```

运行测试：
```bash
python3 test_wfl.py
```

---

## 🔧 硬件连接

### 示波器测试

```
┌─────────────────────────────────┐
│  信号源 → GPIO26 (ADC0/CH1)     │
│  信号源 → GPIO27 (ADC1/CH2)     │
│  GND    → GND                    │
└─────────────────────────────────┘
```

**测试信号源**:
- 手机音频输出 (配合3.5mm转杜邦线)
- 函数发生器
- 另一个PWM引脚输出

### 信号发生器输出

```
┌─────────────────────────────────┐
│  GPIO0 (PWM DAC) → 示波器探头    │
│  GND             → 示波器地线    │
└─────────────────────────────────┘
```

**注意**: GPIO0输出为0-3.3V PWM信号，建议外接RC滤波器：
```
GPIO0 ──[1kΩ]──┬──[输出]
               │
              [10μF]
               │
              GND
```

### PWM输出

```
┌─────────────────────────────────┐
│  GPIO1 (PWM) → LED/逻辑分析仪    │
│  GND         → GND               │
└─────────────────────────────────┘
```

### 逻辑分析仪

```
┌─────────────────────────────────┐
│  数字信号 → GPIO2-9 (D0-D7)     │
│  GND      → GND                  │
└─────────────────────────────────┘
```

---

## 📊 Web应用使用

### 1. 打开Web应用

在浏览器中打开：
```
file:///Users/gongyusu/Desktop/UI/WFL/index.html
```

或启动本地服务器：
```bash
cd /Users/gongyusu/Desktop/UI/WFL
python3 -m http.server 8080
# 访问 http://localhost:8080
```

### 2. 连接设备

1. 点击右上角"连接设备"按钮
2. 选择"USB"连接类型
3. 点击"扫描设备"
4. 选择RP2350设备
5. 点击"连接设备"

### 3. 使用仪器

- **示波器**: 实时查看波形
- **信号发生器**: 输出各种波形
- **自定义仪表板**: 组合多个仪器

---

## 🐛 故障排查

### 问题1: 设备未识别

**解决方案:**
- 检查USB线是否支持数据传输
- 尝试更换USB端口
- 确认驱动程序已安装 (Windows)

### 问题2: 编译失败

**解决方案:**
```bash
# 确认SDK路径
echo $PICO_SDK_PATH

# 清理重新编译
rm -rf build
mkdir build
cd build
cmake ..
make
```

### 问题3: 串口无输出

**解决方案:**
- 检查波特率是否为115200
- 尝试其他串口软件
- 确认USB线缆质量

### 问题4: Web应用无法连接

**解决方案:**
- 使用Chrome/Edge浏览器 (支持Web Serial API)
- 检查浏览器权限设置
- 在串口终端中验证设备是否正常响应

---

## 📚 进阶话题

### 自定义采样率

修改`rp2350_example.c`:
```c
// 在oscilloscope_task()中
adc_set_clkdiv(48000000 / device_state.osc_config.sample_rate - 1);
```

### 添加新仪器

1. 在协议中定义新命令ID
2. 添加配置结构体
3. 实现硬件初始化
4. 实现任务函数
5. 在`process_packet()`中处理命令

### 性能优化

- 使用DMA减少CPU占用
- 使用PIO实现高速逻辑分析
- 双缓冲提高数据吞吐量
- 压缩数据减少传输时间

---

## 📖 相关资源

- [RP2350数据手册](https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf)
- [Pico SDK文档](https://www.raspberrypi.com/documentation/pico-sdk/)
- [WFL设计文档](./DESIGN_DOCUMENT.md)

---

**祝您使用愉快！** 🎉
