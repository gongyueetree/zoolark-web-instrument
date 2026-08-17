# RP2350 firmware scaffold

此目录不是网页构建依赖，只定义 WFL2 与硬件实现边界。

建议使用 Raspberry Pi Pico SDK + TinyUSB：Vendor Bulk interface 负责 WFL2，PIO+DMA 负责 8 通道采样，另一个 PIO state machine 负责 JTAG。

首个真机里程碑：

1. TinyUSB 枚举出 vendor Bulk IN/OUT；
2. `PING` / `GET_DEVICE_INFO`；
3. `LOGIC_CONFIG → ARM → STATUS → READ`；
4. JTAG TAP reset + IDCODE scan；
5. SVF/XSVF executor；
6. 按目标 FPGA 系列增加 BIT/BIN programming plugin。
