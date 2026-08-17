export const legacyBodyHtml = String.raw`
    <!-- 加载动画 -->
    <div id="loader" class="loader">
        <div class="loader-spinner"></div>
        <p>正在初始化仪器...</p>
    </div>

    <!-- 串口配置弹窗 -->
    <div id="serial-config-modal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h2>设备连接配置</h2>
                <button class="close-btn" id="close-serial-modal">×</button>
            </div>
            <div class="modal-body">
                <div class="config-section">
                    <h3>连接类型</h3>
                    <div class="connection-types">
                        <button class="connection-type-btn active" data-type="serial">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <rect x="2" y="6" width="20" height="12" rx="2" stroke-width="2"/>
                                <line x1="6" y1="10" x2="6" y2="14" stroke-width="2"/>
                                <line x1="10" y1="10" x2="10" y2="14" stroke-width="2"/>
                                <line x1="14" y1="10" x2="14" y2="14" stroke-width="2"/>
                                <line x1="18" y1="10" x2="18" y2="14" stroke-width="2"/>
                            </svg>
                            串口 (Serial)
                        </button>
                        <button class="connection-type-btn" data-type="usb">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M12 2v20M7 7l5-5 5 5M7 17h10" stroke-width="2"/>
                                <circle cx="7" cy="17" r="2"/>
                                <circle cx="17" cy="17" r="2"/>
                            </svg>
                            USB
                        </button>
                        <button class="connection-type-btn" data-type="wifi">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M5 12.55a11 11 0 0 1 14.08 0M8.5 16.5a6 6 0 0 1 7 0M12 20h.01" stroke-width="2"/>
                            </svg>
                            Wi-Fi
                        </button>
                    </div>
                </div>

                <!-- 串口配置 -->
                <div id="serial-config" class="config-panel">
                    <div class="form-group">
                        <label>串口端口</label>
                        <select class="form-control" id="serial-port">
                            <option value="">选择串口...</option>
                            <option value="COM1">COM1</option>
                            <option value="COM2">COM2</option>
                            <option value="COM3">COM3</option>
                            <option value="COM4">COM4</option>
                            <option value="/dev/ttyUSB0">/dev/ttyUSB0</option>
                            <option value="/dev/ttyUSB1">/dev/ttyUSB1</option>
                        </select>
                        <button class="btn-scan" id="scan-ports">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-width="2"/>
                            </svg>
                            扫描
                        </button>
                    </div>

                    <div class="form-group">
                        <label>波特率 (Baud Rate)</label>
                        <select class="form-control" id="baud-rate">
                            <option value="9600">9600</option>
                            <option value="19200">19200</option>
                            <option value="38400">38400</option>
                            <option value="57600">57600</option>
                            <option value="115200" selected>115200</option>
                            <option value="230400">230400</option>
                            <option value="460800">460800</option>
                            <option value="921600">921600</option>
                        </select>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>数据位 (Data Bits)</label>
                            <select class="form-control" id="data-bits">
                                <option value="7">7</option>
                                <option value="8" selected>8</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>停止位 (Stop Bits)</label>
                            <select class="form-control" id="stop-bits">
                                <option value="1" selected>1</option>
                                <option value="1.5">1.5</option>
                                <option value="2">2</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>校验位 (Parity)</label>
                        <select class="form-control" id="parity">
                            <option value="none" selected>None (无)</option>
                            <option value="even">Even (偶校验)</option>
                            <option value="odd">Odd (奇校验)</option>
                            <option value="mark">Mark</option>
                            <option value="space">Space</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>流控制 (Flow Control)</label>
                        <select class="form-control" id="flow-control">
                            <option value="none" selected>None (无)</option>
                            <option value="hardware">Hardware (RTS/CTS)</option>
                            <option value="software">Software (XON/XOFF)</option>
                        </select>
                    </div>
                </div>

                <!-- USB配置 -->
                <div id="usb-config" class="config-panel hidden">
                    <div class="form-group">
                        <label>USB设备</label>
                        <select class="form-control" id="usb-device">
                            <option value="">未检测到设备</option>
                        </select>
                        <button class="btn-scan" id="scan-usb">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-width="2"/>
                            </svg>
                            扫描设备
                        </button>
                    </div>
                    <div class="info-box">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <circle cx="12" cy="12" r="10" stroke-width="2"/>
                            <line x1="12" y1="16" x2="12" y2="12" stroke-width="2"/>
                            <line x1="12" y1="8" x2="12.01" y2="8" stroke-width="2"/>
                        </svg>
                        <span>需要浏览器支持 WebUSB API</span>
                    </div>
                </div>

                <!-- Wi-Fi配置 -->
                <div id="wifi-config" class="config-panel hidden">
                    <div class="form-group">
                        <label>IP地址</label>
                        <input type="text" class="form-control" id="wifi-ip" placeholder="192.168.1.100">
                    </div>
                    <div class="form-group">
                        <label>端口</label>
                        <input type="number" class="form-control" id="wifi-port" placeholder="8080" value="8080">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-secondary" id="test-connection">测试连接</button>
                    </div>
                </div>

                <div class="connection-status">
                    <div class="status-indicator-dot"></div>
                    <span id="connection-status-text">未连接</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancel-connect">取消</button>
                <button class="btn btn-primary" id="connect-device">连接设备</button>
            </div>
        </div>
    </div>

    <!-- 主容器 -->
    <div class="container">
        <!-- 顶部导航栏 -->
        <header class="header">
            <div class="logo">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <path d="M5 20 L10 10 L15 25 L20 15 L25 22 L30 8 L35 20" stroke="#00d4ff" stroke-width="2" fill="none"/>
                    <circle cx="20" cy="20" r="18" stroke="#00d4ff" stroke-width="2" fill="none"/>
                </svg>
                <span class="logo-text">ZooLark View</span>
            </div>
            <nav class="nav-menu">
                <button class="nav-btn active" data-instrument="oscilloscope">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12" stroke-width="2"/>
                    </svg>
                    示波器
                </button>
                <button class="nav-btn" data-instrument="spectrum-analyzer">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="18" width="3" height="3" fill="currentColor"/>
                        <rect x="7" y="14" width="3" height="7" fill="currentColor"/>
                        <rect x="11" y="8" width="3" height="13" fill="currentColor"/>
                        <rect x="15" y="12" width="3" height="9" fill="currentColor"/>
                        <rect x="19" y="6" width="3" height="15" fill="currentColor"/>
                    </svg>
                    频谱分析
                </button>
                <button class="nav-btn" data-instrument="waveform-generator">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 12 Q6 6 9 12 T15 12 Q18 18 21 12" stroke-width="2"/>
                    </svg>
                    信号发生器
                </button>
                <button class="nav-btn" data-instrument="pwm-generator">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 12 L3 4 L9 4 L9 20 L15 20 L15 4 L21 4 L21 12" stroke-width="2"/>
                    </svg>
                    PWM发生器
                </button>
                <button class="nav-btn" data-instrument="logic-analyzer">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="6" width="4" height="12" stroke-width="2"/>
                        <rect x="10" y="3" width="4" height="12" stroke-width="2"/>
                        <rect x="17" y="9" width="4" height="12" stroke-width="2"/>
                    </svg>
                    逻辑分析仪
                </button>
                <button class="nav-btn" data-instrument="power-supply">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke-width="2"/>
                    </svg>
                    电源
                </button>
                <button class="nav-btn" data-instrument="network-analyzer">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 20 Q8 15 12 20 T21 20" stroke-width="2"/>
                        <path d="M3 12 L21 12" stroke-width="1" stroke-dasharray="2,2"/>
                        <path d="M3 15 L6 12 L9 8 L12 10 L15 6 L18 9 L21 7" stroke-width="2"/>
                    </svg>
                    网络分析仪
                </button>
                <button class="nav-btn" data-instrument="custom-dashboard">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="3" width="7" height="7" stroke-width="2"/>
                        <rect x="14" y="3" width="7" height="7" stroke-width="2"/>
                        <rect x="3" y="14" width="7" height="7" stroke-width="2"/>
                        <rect x="14" y="14" width="7" height="7" stroke-width="2"/>
                    </svg>
                    自定义仪表板
                </button>
            </nav>
            <div class="header-actions">
                <button class="icon-btn" id="ai-assistant-btn" title="AI助手">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" stroke-width="2"/>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke-width="2"/>
                    </svg>
                </button>
                <button class="icon-btn" id="settings-btn" title="设置">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="3" stroke-width="2"/>
                        <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" stroke-width="2"/>
                    </svg>
                </button>
                <button class="connect-btn" id="connect-btn">
                    <span class="status-indicator"></span>
                    连接设备
                </button>
            </div>
        </header>

        <!-- 主内容区 -->
        <main class="main-content">
            <!-- 左侧控制面板 -->
            <aside class="control-panel">
                <div class="panel-section">
                    <h3 class="panel-title">控制</h3>

                    <!-- 示波器控制 -->
                    <div class="instrument-controls" id="oscilloscope-controls">
                        <div class="control-group">
                            <label>通道 1</label>
                            <div class="channel-controls">
                                <input type="checkbox" id="ch1-enable" checked>
                                <label for="ch1-enable" class="toggle-label">启用</label>
                                <select class="control-select" id="ch1-scale">
                                    <option>1V/div</option>
                                    <option>2V/div</option>
                                    <option selected>5V/div</option>
                                    <option>10V/div</option>
                                </select>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>通道 2</label>
                            <div class="channel-controls">
                                <input type="checkbox" id="ch2-enable" checked>
                                <label for="ch2-enable" class="toggle-label">启用</label>
                                <select class="control-select" id="ch2-scale">
                                    <option>1V/div</option>
                                    <option selected>2V/div</option>
                                    <option>5V/div</option>
                                    <option>10V/div</option>
                                </select>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>时间基准</label>
                            <select class="control-select" id="time-base">
                                <option>1μs/div</option>
                                <option>2μs/div</option>
                                <option>5μs/div</option>
                                <option>10μs/div</option>
                                <option>20μs/div</option>
                                <option>50μs/div</option>
                                <option>100μs/div</option>
                                <option>200μs/div</option>
                                <option>500μs/div</option>
                                <option selected>1ms/div</option>
                                <option>2ms/div</option>
                                <option>5ms/div</option>
                                <option>10ms/div</option>
                                <option>20ms/div</option>
                                <option>50ms/div</option>
                                <option>100ms/div</option>
                                <option>200ms/div</option>
                                <option>500ms/div</option>
                                <option>1s/div</option>
                                <option>2s/div</option>
                                <option>5s/div</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>触发</label>
                            <select class="control-select" id="trigger-source">
                                <option>通道 1</option>
                                <option>通道 2</option>
                                <option>外部</option>
                            </select>
                            <input type="range" class="control-slider" id="trigger-level" min="-10" max="10" value="0" step="0.1">
                            <span class="value-display" id="trigger-level-value">0.0V</span>
                        </div>

                        <div class="control-group">
                            <label>平均次数</label>
                            <select class="control-select" id="osc-avg">
                                <option value="1" selected>关闭</option>
                                <option value="4">4次</option>
                                <option value="8">8次</option>
                                <option value="16">16次</option>
                                <option value="32">32次</option>
                            </select>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="run-stop-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg>
                                运行
                            </button>
                            <button class="btn btn-secondary" id="single-btn">单次</button>
                            <button class="btn btn-secondary" id="auto-scale-btn">自动缩放</button>
                        </div>
                    </div>

                    <!-- 信号发生器控制 -->
                    <div class="instrument-controls hidden" id="waveform-generator-controls">
                        <div class="control-group">
                            <label>波形类型</label>
                            <div class="waveform-selector">
                                <button class="wave-btn active" data-wave="sine">
                                    <svg width="40" height="20" viewBox="0 0 40 20">
                                        <path d="M0 10 C5 10, 5 0, 10 0 C15 0, 15 10, 20 10 C25 10, 25 20, 30 20 C35 20, 35 10, 40 10" stroke="currentColor" fill="none" stroke-width="1.5"/>
                                    </svg>
                                    正弦波
                                </button>
                                <button class="wave-btn" data-wave="square">
                                    <svg width="40" height="20" viewBox="0 0 40 20">
                                        <path d="M0 10 L0 0 L10 0 L10 20 L20 20 L20 0 L30 0 L30 20 L40 20" stroke="currentColor" fill="none"/>
                                    </svg>
                                    方波
                                </button>
                                <button class="wave-btn" data-wave="triangle">
                                    <svg width="40" height="20" viewBox="0 0 40 20">
                                        <path d="M0 20 L10 0 L20 20 L30 0 L40 20" stroke="currentColor" fill="none"/>
                                    </svg>
                                    三角波
                                </button>
                                <button class="wave-btn" data-wave="sawtooth">
                                    <svg width="40" height="20" viewBox="0 0 40 20">
                                        <path d="M0 20 L10 0 L10 20 L20 0 L20 20 L30 0 L30 20 L40 0" stroke="currentColor" fill="none"/>
                                    </svg>
                                    锯齿波
                                </button>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>频率 (最高10MHz)</label>
                            <input type="number" class="control-input" id="gen-frequency" value="1" min="1" max="10000000">
                            <select class="control-select-inline" id="gen-freq-unit">
                                <option>Hz</option>
                                <option selected>kHz</option>
                                <option>MHz</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>幅度 (最大8Vpp)</label>
                            <input type="range" class="control-slider" id="gen-amplitude" min="0" max="4" value="2.5" step="0.1">
                            <span class="value-display" id="gen-amplitude-value">2.5V</span>
                        </div>

                        <div class="control-group">
                            <label>直流偏移 (-4V到+4V)</label>
                            <input type="range" class="control-slider" id="gen-offset" min="-4" max="4" value="0" step="0.1">
                            <span class="value-display" id="gen-offset-value">0.0V</span>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="gen-output-btn">启动输出</button>
                        </div>
                    </div>

                    <!-- 逻辑分析仪控制 -->
                    <div class="instrument-controls hidden" id="logic-analyzer-controls">
                        <div class="control-group">
                            <label>通道选择</label>
                            <div class="logic-channels">
                                <div class="logic-channel-row">
                                    <input type="checkbox" id="logic-ch0" checked>
                                    <label for="logic-ch0">D0</label>
                                    <input type="checkbox" id="logic-ch1" checked>
                                    <label for="logic-ch1">D1</label>
                                    <input type="checkbox" id="logic-ch2" checked>
                                    <label for="logic-ch2">D2</label>
                                    <input type="checkbox" id="logic-ch3" checked>
                                    <label for="logic-ch3">D3</label>
                                </div>
                                <div class="logic-channel-row">
                                    <input type="checkbox" id="logic-ch4" checked>
                                    <label for="logic-ch4">D4</label>
                                    <input type="checkbox" id="logic-ch5" checked>
                                    <label for="logic-ch5">D5</label>
                                    <input type="checkbox" id="logic-ch6" checked>
                                    <label for="logic-ch6">D6</label>
                                    <input type="checkbox" id="logic-ch7" checked>
                                    <label for="logic-ch7">D7</label>
                                </div>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>采样率</label>
                            <select class="control-select" id="logic-sample-rate">
                                <option>1 MHz</option>
                                <option>10 MHz</option>
                                <option selected>25 MHz</option>
                                <option>50 MHz</option>
                                <option>100 MHz</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>采样深度</label>
                            <select class="control-select" id="logic-depth">
                                <option>1K</option>
                                <option>4K</option>
                                <option selected>8K</option>
                                <option>16K</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>触发模式</label>
                            <select class="control-select" id="logic-trigger">
                                <option>无触发</option>
                                <option selected>边沿触发</option>
                                <option>模式触发</option>
                            </select>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="logic-run-btn">运行</button>
                            <button class="btn btn-secondary" id="logic-single-btn">单次</button>
                        </div>
                    </div>

                    <!-- 频谱分析仪控制 -->
                    <div class="instrument-controls hidden" id="spectrum-analyzer-controls">
                        <div class="control-group">
                            <label>频率范围 (0-25MHz)</label>
                            <div class="frequency-range-row">
                                <div class="frequency-input-group">
                                    <label class="small-label">起始</label>
                                    <input type="number" class="control-input" id="spectrum-start" value="0" min="0" max="25000000">
                                    <select class="control-select-inline" id="spectrum-start-unit">
                                        <option>Hz</option>
                                        <option selected>kHz</option>
                                        <option>MHz</option>
                                    </select>
                                </div>
                                <div class="frequency-input-group">
                                    <label class="small-label">终止</label>
                                    <input type="number" class="control-input" id="spectrum-stop" value="100" min="0" max="25000000">
                                    <select class="control-select-inline" id="spectrum-stop-unit">
                                        <option>Hz</option>
                                        <option selected>kHz</option>
                                        <option>MHz</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>分辨率带宽</label>
                            <select class="control-select" id="spectrum-rbw">
                                <option>100 Hz</option>
                                <option>1 kHz</option>
                                <option selected>10 kHz</option>
                                <option>100 kHz</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>参考电平</label>
                            <input type="range" class="control-slider" id="spectrum-ref-level" min="-100" max="20" value="0" step="1">
                            <span class="value-display" id="spectrum-ref-value">0 dBm</span>
                        </div>

                        <div class="control-group">
                            <label>平均次数</label>
                            <select class="control-select" id="spectrum-avg">
                                <option>关闭</option>
                                <option>4次</option>
                                <option selected>8次</option>
                                <option>16次</option>
                                <option>32次</option>
                            </select>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="spectrum-run-btn">运行</button>
                            <button class="btn btn-secondary" id="spectrum-marker-btn">标记</button>
                        </div>
                    </div>

                    <!-- 电源控制 (DC输出) -->
                    <div class="instrument-controls hidden" id="power-supply-controls">
                        <div class="control-group">
                            <label>DC电压输出</label>
                            <div class="power-controls">
                                <label class="small-label">电压 (V)</label>
                                <input type="range" class="control-slider" id="power-ch1-voltage" min="0" max="5" value="3.3" step="0.1">
                                <span class="value-display" id="power-ch1-voltage-value">3.3V</span>

                                <label class="small-label">电流限制 (A)</label>
                                <input type="range" class="control-slider" id="power-ch1-current" min="0" max="1" value="0.5" step="0.01">
                                <span class="value-display" id="power-ch1-current-value">0.50A</span>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>预设值</label>
                            <div class="power-presets">
                                <button class="preset-btn" data-voltage="0">0V</button>
                                <button class="preset-btn" data-voltage="1.8">1.8V</button>
                                <button class="preset-btn" data-voltage="3.3">3.3V</button>
                                <button class="preset-btn" data-voltage="5">5V</button>
                            </div>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="power-output-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 4px;">
                                    <circle cx="12" cy="12" r="10" stroke-width="2"/>
                                    <line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/>
                                    <line x1="12" y1="16" x2="12" y2="16" stroke-width="2"/>
                                </svg>
                                启动输出
                            </button>
                        </div>
                    </div>

                    <!-- 网络分析仪控制 -->
                    <div class="instrument-controls hidden" id="network-analyzer-controls">
                        <div class="control-group">
                            <label>扫频类型</label>
                            <select class="control-select" id="network-sweep-type">
                                <option value="linear" selected>Linear (线性)</option>
                                <option value="decade">Decade (对数)</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>扫频范围</label>
                            <div class="frequency-range-row">
                                <div class="frequency-input-group">
                                    <label class="small-label">起始</label>
                                    <input type="number" class="control-input" id="network-start" value="1" min="0.001" max="25000000">
                                    <select class="control-select-inline" id="network-start-unit">
                                        <option>Hz</option>
                                        <option selected>kHz</option>
                                        <option>MHz</option>
                                    </select>
                                </div>
                                <div class="frequency-input-group">
                                    <label class="small-label">终止</label>
                                    <input type="number" class="control-input" id="network-stop" value="10" min="0.001" max="25000000">
                                    <select class="control-select-inline" id="network-stop-unit">
                                        <option>Hz</option>
                                        <option>kHz</option>
                                        <option selected>MHz</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="control-group">
                            <label>扫描点数</label>
                            <select class="control-select" id="network-points">
                                <option>51</option>
                                <option>101</option>
                                <option selected>201</option>
                                <option>401</option>
                                <option>801</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>输出功率</label>
                            <input type="range" class="control-slider" id="network-power" min="-20" max="10" value="0" step="1">
                            <span class="value-display" id="network-power-value">0 dBm</span>
                        </div>

                        <div class="control-group">
                            <label>平均次数</label>
                            <select class="control-select" id="network-avg">
                                <option>1</option>
                                <option>4</option>
                                <option selected>8</option>
                                <option>16</option>
                                <option>32</option>
                            </select>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="network-run-btn">开始扫描</button>
                            <button class="btn btn-secondary" id="network-marker-btn">标记</button>
                        </div>
                    </div>

                    <!-- PWM发生器控制 -->
                    <div class="instrument-controls hidden" id="pwm-generator-controls">
                        <div class="control-group">
                            <label>频率 (最高1MHz)</label>
                            <input type="number" class="control-input" id="pwm-frequency" value="1" min="1" max="1000000">
                            <select class="control-select-inline" id="pwm-freq-unit">
                                <option>Hz</option>
                                <option selected>kHz</option>
                                <option>MHz</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>幅度</label>
                            <div class="value-display">3.3V (固定)</div>
                        </div>

                        <div class="control-group">
                            <label>占空比</label>
                            <input type="range" class="control-slider" id="pwm-duty" min="1" max="99" value="50" step="1">
                            <span class="value-display" id="pwm-duty-value">50%</span>
                        </div>

                        <div class="control-actions">
                            <button class="btn btn-primary" id="pwm-output-btn">启动输出</button>
                        </div>
                    </div>
                </div>

                <!-- 测量结果 -->
                <div class="panel-section">
                    <h3 class="panel-title">测量</h3>
                    <div class="measurements">
                        <div class="measurement-item">
                            <span class="measurement-label">频率</span>
                            <span class="measurement-value" id="freq-measure">1.00 kHz</span>
                        </div>
                        <div class="measurement-item">
                            <span class="measurement-label">峰峰值</span>
                            <span class="measurement-value" id="vpp-measure">5.00 V</span>
                        </div>
                        <div class="measurement-item">
                            <span class="measurement-label">RMS</span>
                            <span class="measurement-value" id="rms-measure">1.77 V</span>
                        </div>
                        <div class="measurement-item">
                            <span class="measurement-label">占空比</span>
                            <span class="measurement-value" id="duty-measure">50.0 %</span>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- 中间显示区域 -->
            <section class="display-area">
                <div class="display-header">
                    <div class="display-info">
                        <span class="channel-indicator ch1">CH1: 5.00V/div</span>
                        <span class="channel-indicator ch2">CH2: 2.00V/div</span>
                        <span class="time-indicator">时基: 1ms/div</span>
                    </div>
                    <div class="display-actions">
                        <button class="icon-btn" id="screenshot-btn" title="截图">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/>
                                <circle cx="12" cy="12" r="4" stroke-width="2"/>
                            </svg>
                        </button>
                        <button class="icon-btn" id="export-btn" title="导出数据">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2"/>
                            </svg>
                        </button>
                        <button class="icon-btn" id="fullscreen-btn" title="全屏">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke-width="2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <!-- 示波器显示 -->
                <div class="canvas-container" id="oscilloscope-display">
                    <canvas id="waveform-canvas"></canvas>
                </div>

                <!-- 信号发生器显示 -->
                <div class="canvas-container hidden" id="waveform-generator-display">
                    <canvas id="generator-canvas"></canvas>
                    <div class="generator-info">
                        <div class="info-card">
                            <h4>输出配置</h4>
                            <div class="info-row">
                                <span>波形:</span>
                                <span id="gen-display-wave">正弦波</span>
                            </div>
                            <div class="info-row">
                                <span>频率:</span>
                                <span id="gen-display-freq">1.00 kHz</span>
                            </div>
                            <div class="info-row">
                                <span>幅度:</span>
                                <span id="gen-display-amp">5.0 V</span>
                            </div>
                            <div class="info-row">
                                <span>偏移:</span>
                                <span id="gen-display-offset">0.0 V</span>
                            </div>
                            <div class="info-row">
                                <span>状态:</span>
                                <span id="gen-display-status" class="status-off">输出关闭</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 逻辑分析仪显示 -->
                <div class="canvas-container hidden" id="logic-analyzer-display">
                    <canvas id="logic-canvas"></canvas>
                </div>

                <!-- 频谱分析仪显示 -->
                <div class="canvas-container hidden" id="spectrum-analyzer-display">
                    <canvas id="spectrum-canvas"></canvas>
                    <div class="spectrum-markers">
                        <div class="marker-info">
                            <span>峰值频率:</span>
                            <span id="spectrum-peak-freq">--</span>
                        </div>
                        <div class="marker-info">
                            <span>峰值功率:</span>
                            <span id="spectrum-peak-power">--</span>
                        </div>
                    </div>
                </div>

                <!-- 电源显示 -->
                <div class="canvas-container hidden" id="power-supply-display">
                    <div class="power-display">
                        <div class="power-meter">
                            <h3>DC 电源输出</h3>
                            <div class="meter-group">
                                <div class="meter-item">
                                    <label>设定电压</label>
                                    <div class="meter-value" id="power-ch1-set-v">3.30 V</div>
                                </div>
                                <div class="meter-item">
                                    <label>实际电压</label>
                                    <div class="meter-value highlight" id="power-ch1-actual-v">0.00 V</div>
                                </div>
                                <div class="meter-item">
                                    <label>电流</label>
                                    <div class="meter-value" id="power-ch1-actual-i">0.000 A</div>
                                </div>
                                <div class="meter-item">
                                    <label>功率</label>
                                    <div class="meter-value" id="power-ch1-power">0.00 W</div>
                                </div>
                            </div>
                            <canvas id="power-ch1-graph" class="power-graph"></canvas>
                        </div>
                    </div>
                </div>

                <!-- 网络分析仪显示 -->
                <div class="canvas-container hidden" id="network-analyzer-display">
                    <div class="bode-plot-container">
                        <div class="bode-plot-section">
                            <h4 class="plot-title">幅度 (Magnitude)</h4>
                            <canvas id="network-magnitude-canvas"></canvas>
                        </div>
                        <div class="bode-plot-section">
                            <h4 class="plot-title">相位 (Phase)</h4>
                            <canvas id="network-phase-canvas"></canvas>
                        </div>
                    </div>
                    <div class="network-markers">
                        <div class="marker-info">
                            <span>中心频率:</span>
                            <span id="network-center-freq">--</span>
                        </div>
                        <div class="marker-info">
                            <span>-3dB带宽:</span>
                            <span id="network-bandwidth">--</span>
                        </div>
                    </div>
                </div>

                <!-- PWM发生器显示 -->
                <div class="canvas-container hidden" id="pwm-generator-display">
                    <canvas id="pwm-canvas"></canvas>
                    <div class="generator-info">
                        <div class="info-card">
                            <h4>PWM 输出配置</h4>
                            <div class="info-row">
                                <span>频率:</span>
                                <span id="pwm-display-freq">1.00 kHz</span>
                            </div>
                            <div class="info-row">
                                <span>幅度:</span>
                                <span id="pwm-display-amp">3.3 V</span>
                            </div>
                            <div class="info-row">
                                <span>占空比:</span>
                                <span id="pwm-display-duty">50%</span>
                            </div>
                            <div class="info-row">
                                <span>状态:</span>
                                <span id="pwm-display-status" class="status-off">输出关闭</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FFT 分析 (仅示波器模式) -->
                <div class="fft-container" id="fft-section">
                    <div class="fft-header">
                        <h4>FFT 频谱分析</h4>
                        <label class="toggle-switch">
                            <input type="checkbox" id="fft-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <canvas id="fft-canvas" class="hidden"></canvas>
                </div>

                <!-- 自定义仪表板 -->
                <div class="canvas-container hidden" id="custom-dashboard-display">
                    <div class="dashboard-toolbar">
                        <div class="toolbar-section">
                            <h4>添加仪器</h4>
                            <div class="instrument-buttons">
                                <button class="add-instrument-btn" data-type="oscilloscope" title="示波器">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12" stroke-width="2"/>
                                    </svg>
                                    示波器
                                </button>
                                <button class="add-instrument-btn" data-type="spectrum-analyzer" title="频谱仪">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <rect x="3" y="18" width="3" height="3" fill="currentColor"/>
                                        <rect x="7" y="14" width="3" height="7" fill="currentColor"/>
                                        <rect x="11" y="8" width="3" height="13" fill="currentColor"/>
                                    </svg>
                                    频谱仪
                                </button>
                                <button class="add-instrument-btn" data-type="waveform-generator" title="最多1个">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M3 12 Q6 6 9 12 T15 12" stroke-width="2"/>
                                    </svg>
                                    信号发生器
                                </button>
                                <button class="add-instrument-btn" data-type="pwm-generator" title="最多1个">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M3 12 L3 4 L9 4 L9 20 L15 20 L15 4" stroke-width="2"/>
                                    </svg>
                                    PWM发生器
                                </button>
                                <button class="add-instrument-btn" data-type="power-supply" title="最多1个">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke-width="2"/>
                                    </svg>
                                    电源
                                </button>
                                <button class="add-instrument-btn" data-type="logic-analyzer" title="多个，总通道≤8">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <rect x="3" y="6" width="4" height="12" stroke-width="2"/>
                                        <rect x="10" y="3" width="4" height="12" stroke-width="2"/>
                                    </svg>
                                    逻辑分析仪
                                </button>
                            </div>
                        </div>
                        <div class="toolbar-section">
                            <button class="btn btn-secondary" id="reset-dashboard-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-width="2"/>
                                </svg>
                                重置布局
                            </button>
                            <button class="btn btn-primary" id="save-dashboard-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke-width="2"/>
                                    <path d="M7 3v5h8M17 21v-8H7v8" stroke-width="2"/>
                                </svg>
                                保存配置
                            </button>
                        </div>
                    </div>
                    <div class="dashboard-grid" id="dashboard-grid">
                        <!-- 仪器面板将动态添加到这里 -->
                    </div>
                </div>
            </section>

            <!-- 通道模式选择对话框 -->
            <div class="modal hidden" id="channel-mode-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modal-instrument-title">选择示波器模式</h3>
                        <button class="close-btn" id="close-channel-modal">×</button>
                    </div>
                    <div class="modal-body">
                        <p id="modal-info-text">请选择要添加的通道模式：</p>
                        <div class="channel-options">
                            <button class="channel-option-btn" id="dual-channel-btn" data-mode="dual">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12" stroke-width="2"/>
                                    <path d="M3 14 L6 20 L9 8 L12 17 L15 11 L18 23 L21 14" stroke-width="2" stroke="#00d4ff"/>
                                </svg>
                                <div class="option-text">
                                    <strong>双通道</strong>
                                    <span>显示两条曲线 (最多1个)</span>
                                </div>
                            </button>
                            <button class="channel-option-btn" id="single-channel-btn" data-mode="single">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12" stroke-width="2"/>
                                </svg>
                                <div class="option-text">
                                    <strong>单通道</strong>
                                    <span>显示一条曲线 (最多2个)</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 右侧 AI 助手面板 -->
            <aside class="ai-panel hidden" id="ai-panel">
                <div class="ai-header">
                    <h3>AI 智能助手</h3>
                    <button class="close-btn" id="close-ai-btn">×</button>
                </div>
                <div class="ai-chat">
                    <div class="chat-messages" id="chat-messages">
                        <div class="ai-message">
                            <div class="message-avatar">AI</div>
                            <div class="message-content">
                                <p>你好！我是您的AI助手。我可以帮助您：</p>
                                <ul>
                                    <li>分析波形数据并提供诊断建议</li>
                                    <li>优化测量参数设置</li>
                                    <li>解答仪器使用问题</li>
                                    <li>生成测试报告</li>
                                    <li>识别信号异常</li>
                                </ul>
                                <p>请问有什么可以帮到您的？</p>
                            </div>
                        </div>
                    </div>
                    <div class="ai-suggestions">
                        <button class="suggestion-btn">分析当前波形</button>
                        <button class="suggestion-btn">优化触发设置</button>
                        <button class="suggestion-btn">测量信号质量</button>
                        <button class="suggestion-btn">生成测试报告</button>
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chat-input" placeholder="输入您的问题...">
                        <button class="send-btn" id="send-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>
        </main>

        <!-- 状态栏 -->
        <footer class="status-bar">
            <div class="status-item">
                <span class="status-label">采样率:</span>
                <span class="status-value">45.00 MS/s</span>
            </div>
            <div class="status-item">
                <span class="status-label">存储深度:</span>
                <span class="status-value">1024 samples</span>
            </div>
            <div class="status-item">
                <span class="status-label">模拟带宽:</span>
                <span class="status-value">5 MHz</span>
            </div>
            <div class="status-item">
                <span class="status-label">连接状态:</span>
                <span class="status-value" id="connection-status">未连接</span>
            </div>
        </footer>
    </div>
`;
