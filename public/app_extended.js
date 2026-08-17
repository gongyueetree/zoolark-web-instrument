// 扩展版全局状态管理
const AppState = {
    currentInstrument: 'oscilloscope',
    isRunning: false,
    isConnected: false,
    channels: {
        ch1: { enabled: true, scale: 5, data: [] },
        ch2: { enabled: true, scale: 2, data: [] }  // 独立刻度
    },
    oscilloscope: {
        averaging: 1,           // 平均次数 (1=关闭)
        averagingBufferCh1: [], // CH1平均缓冲区
        averagingBufferCh2: []  // CH2平均缓冲区
    },
    zoom: 1,  // 缩放级别
    panOffset: 0,  // 平移偏移
    serialConfig: {
        type: 'serial',
        port: '',
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
    },
    waveformGenerator: {
        waveType: 'sine',
        frequency: 1000,  // Hz，最高10MHz
        amplitude: 2.5,   // V (峰值)，最大8Vpp即4V峰值
        offset: 0,        // V，范围-4V到+4V
        dutyCycle: 50,    // PWM占空比 (1-99%)
        outputEnabled: false
    },
    pwmGenerator: {
        frequency: 1000,  // Hz，最高1MHz
        amplitude: 3.3,   // 固定为3.3V
        offset: 0,        // 固定为0V
        dutyCycle: 50,
        outputEnabled: false
    },
    logicAnalyzer: {
        channels: Array(8).fill(true),
        sampleRate: 25e6,
        depth: 8192,
        triggerMode: '边沿触发',
        data: Array(8).fill([]).map(() => []),  // 修复初始化
        cachedData: Array(8).fill([]).map(() => []),  // 缓存的静止数据
        isRunning: true  // 逻辑分析仪独立的运行状态
    },
    spectrumAnalyzer: {
        startFreq: 0,           // Hz，范围0-25MHz
        stopFreq: 100000,       // Hz，范围0-25MHz
        rbw: 10000,
        refLevel: 0,
        averaging: 8,
        peakFreq: 0,
        peakPower: 0,
        cachedBars: [],         // 缓存的频谱数据
        cachedPeakFreq: 0,
        cachedPeakPower: 0,
        averagingBuffer: [],    // 用于平均的历史数据缓冲区
        isRunning: true         // 频谱仪独立的运行状态
    },
    powerSupply: {
        ch1: { enabled: false, voltage: 3.3, current: 0.5, actualV: 0, actualI: 0 },
        ch2: { enabled: false, voltage: 5.0, current: 1.0, actualV: 0, actualI: 0 },
        masterOn: false
    },
    networkAnalyzer: {
        startFreq: 1000,        // Hz，起始频率
        stopFreq: 10000000,     // Hz，终止频率
        sweepType: 'linear',    // 扫频类型：linear或decade
        points: 201,            // 扫描点数
        power: 0,               // dBm，输出功率
        averaging: 8,           // 平均次数
        magnitudeData: [],      // 幅度数据
        phaseData: [],          // 相位数据
        isRunning: false        // 是否正在扫描
    },
    timeBase: 1,
    triggerLevel: 0,
    sampleRate: 45e6,
    aiPanelOpen: false
};

// Expose state for the incremental WebUSB bridge.
if (typeof window !== 'undefined') window.AppState = AppState;

// 初始化（兼容普通 HTML 和 Next.js 客户端加载）
function initializeWFLCore() {
    initializeLoader();
    initializeNavigation();
    initializeControls();
    initializeSerialModal();
    initializeZoomPan();
    initializeAllCanvas();
    initializeAI();
    startSimulation();
}

// 加载动画
function initializeLoader() {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        loader.classList.add('hidden');
    }, 1500);
}

// 导航切换
function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const instrument = btn.dataset.instrument;
            AppState.currentInstrument = instrument;
            switchInstrument(instrument);
        });
    });
}

// 切换仪器面板和显示
function switchInstrument(instrument) {
    // 如果切换到自定义仪表板
    if (instrument === 'custom-dashboard') {
        // 隐藏所有常规控制面板
        const allControls = document.querySelectorAll('.instrument-controls');
        allControls.forEach(ctrl => ctrl.classList.add('hidden'));

        // 隐藏所有常规显示区域
        const allDisplays = document.querySelectorAll('.canvas-container');
        allDisplays.forEach(display => {
            if (display.id !== 'custom-dashboard-display') {
                display.classList.add('hidden');
            }
        });

        // 显示自定义仪表板
        const dashboardDisplay = document.getElementById('custom-dashboard-display');
        if (dashboardDisplay) {
            dashboardDisplay.classList.remove('hidden');
        }

        // 隐藏FFT和display-info
        const fftSection = document.getElementById('fft-section');
        if (fftSection) fftSection.style.display = 'none';

        const displayInfo = document.querySelector('.display-info');
        if (displayInfo) displayInfo.style.display = 'none';

        // 隐藏控制面板和测量面板
        const controlPanel = document.querySelector('.control-panel');
        if (controlPanel) controlPanel.style.display = 'none';

        return;
    }

    // 恢复常规布局（从自定义仪表板切换回来时）
    const controlPanel = document.querySelector('.control-panel');
    if (controlPanel) controlPanel.style.display = 'flex';

    // 切换控制面板
    const allControls = document.querySelectorAll('.instrument-controls');
    allControls.forEach(ctrl => ctrl.classList.add('hidden'));

    const targetControl = document.getElementById(`${instrument}-controls`);
    if (targetControl) {
        targetControl.classList.remove('hidden');
    }

    // 切换显示区域
    const allDisplays = document.querySelectorAll('.canvas-container');
    allDisplays.forEach(display => display.classList.add('hidden'));

    const targetDisplay = document.getElementById(`${instrument}-display`);
    if (targetDisplay) {
        targetDisplay.classList.remove('hidden');
    }

    // 显示/隐藏 FFT 区域 (仅示波器)
    const fftSection = document.getElementById('fft-section');
    if (instrument === 'oscilloscope') {
        fftSection.style.display = 'block';
    } else {
        fftSection.style.display = 'none';
    }

    // 显示/隐藏 display-info (CH1, CH2, 时基信息) - 仅示波器页面显示
    const displayInfo = document.querySelector('.display-info');
    if (displayInfo) {
        if (instrument === 'oscilloscope') {
            displayInfo.style.display = 'flex';
        } else {
            displayInfo.style.display = 'none';
        }
    }

    // 根据不同仪器更新测量信息
    if (instrument === 'pwm-generator') {
        updatePWMMeasurements();
    } else if (instrument === 'oscilloscope' || instrument === 'waveform-generator') {
        updateMeasurements();
    }

    // 触发canvas尺寸重新计算（使用setTimeout确保DOM已更新）
    setTimeout(() => {
        const canvasMap = {
            'oscilloscope': 'waveform-canvas',
            'waveform-generator': 'generator-canvas',
            'pwm-generator': 'pwm-canvas',
            'logic-analyzer': 'logic-canvas',
            'spectrum-analyzer': 'spectrum-canvas',
            'network-analyzer': ['network-magnitude-canvas', 'network-phase-canvas']
        };
        const canvasId = canvasMap[instrument];

        if (Array.isArray(canvasId)) {
            // 处理多个canvas的情况（网络分析仪）
            canvasId.forEach(id => {
                const canvas = document.getElementById(id);
                if (canvas && canvas.parentElement) {
                    canvas.width = canvas.parentElement.clientWidth;
                    canvas.height = canvas.parentElement.clientHeight;
                }
            });
        } else {
            // 处理单个canvas的情况
            const canvas = document.getElementById(canvasId);
            if (canvas && canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }
        }
    }, 10);
}

// 串口配置弹窗
function initializeSerialModal() {
    const modal = document.getElementById('serial-config-modal');
    const connectBtn = document.getElementById('connect-btn');
    const closeModalBtn = document.getElementById('close-serial-modal');
    const cancelBtn = document.getElementById('cancel-connect');
    const connectDeviceBtn = document.getElementById('connect-device');

    // 打开弹窗
    connectBtn.addEventListener('click', () => {
        if (AppState.isConnected) {
            // 如果已连接，直接断开
            toggleConnection();
        } else {
            // 显示配置弹窗
            modal.classList.remove('hidden');
        }
    });

    // 关闭弹窗
    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // 连接类型切换
    const connectionTypeBtns = document.querySelectorAll('.connection-type-btn');
    connectionTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            connectionTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const type = btn.dataset.type;
            AppState.serialConfig.type = type;

            // 切换配置面板
            document.getElementById('serial-config').classList.toggle('hidden', type !== 'serial');
            document.getElementById('usb-config').classList.toggle('hidden', type !== 'usb');
            document.getElementById('wifi-config').classList.toggle('hidden', type !== 'wifi');
        });
    });

    // 扫描串口
    document.getElementById('scan-ports')?.addEventListener('click', async () => {
        if ('serial' in navigator) {
            try {
                const port = await navigator.serial.requestPort();
                alert('已选择串口设备');
            } catch (err) {
                console.log('用户取消了串口选择');
            }
        } else {
            alert('您的浏览器不支持 Web Serial API\\n请使用 Chrome/Edge 浏览器');
        }
    });

    // 扫描USB设备
    document.getElementById('scan-usb')?.addEventListener('click', async () => {
        if ('usb' in navigator) {
            try {
                const device = await navigator.usb.requestDevice({ filters: [] });
                alert('已选择USB设备: ' + device.productName);
            } catch (err) {
                console.log('用户取消了USB设备选择');
            }
        } else {
            alert('您的浏览器不支持 WebUSB API');
        }
    });

    // 测试Wi-Fi连接
    document.getElementById('test-connection')?.addEventListener('click', () => {
        const ip = document.getElementById('wifi-ip').value;
        const port = document.getElementById('wifi-port').value;

        if (!ip) {
            alert('请输入IP地址');
            return;
        }

        const statusText = document.getElementById('connection-status-text');
        statusText.textContent = '正在连接...';

        // 模拟连接测试
        setTimeout(() => {
            statusText.textContent = '连接成功 (模拟)';
            const statusDot = document.querySelector('.connection-status .status-indicator-dot');
            statusDot.classList.add('connected');
        }, 1500);
    });

    // 连接设备
    connectDeviceBtn.addEventListener('click', () => {
        // 保存完整的UART配置
        AppState.serialConfig.port = document.getElementById('serial-port')?.value || '';
        AppState.serialConfig.baudRate = parseInt(document.getElementById('baud-rate')?.value || 115200);
        AppState.serialConfig.dataBits = parseInt(document.getElementById('data-bits')?.value || 8);
        AppState.serialConfig.stopBits = parseFloat(document.getElementById('stop-bits')?.value || 1);
        AppState.serialConfig.parity = document.getElementById('parity')?.value || 'none';
        AppState.serialConfig.flowControl = document.getElementById('flow-control')?.value || 'none';

        // 关闭弹窗并连接
        modal.classList.add('hidden');
        toggleConnection();

        // 在控制台显示配置信息
        console.log('UART配置已保存:', AppState.serialConfig);
    });
}

// 缩放和平移功能
function initializeZoomPan() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    // 可用的时基档位（毫秒/div）
    const timeBaseSteps = [
        0.001,  // 1μs/div
        0.002,  // 2μs/div
        0.005,  // 5μs/div
        0.01,   // 10μs/div
        0.02,   // 20μs/div
        0.05,   // 50μs/div
        0.1,    // 100μs/div
        0.2,    // 200μs/div
        0.5,    // 500μs/div
        1,      // 1ms/div
        2,      // 2ms/div
        5,      // 5ms/div
        10,     // 10ms/div
        20,     // 20ms/div
        50,     // 50ms/div
        100,    // 100ms/div
        200,    // 200ms/div
        500,    // 500ms/div
        1000,   // 1s/div
        2000,   // 2s/div
        5000    // 5s/div
    ];

    // 鼠标滚轮调整时基
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        // 找到当前时基在档位中的位置
        let currentIndex = timeBaseSteps.findIndex(step => Math.abs(step - AppState.timeBase) < 0.0001);
        if (currentIndex === -1) {
            // 如果当前值不在预设档位中，找到最接近的
            currentIndex = timeBaseSteps.reduce((closest, step, index) => {
                return Math.abs(step - AppState.timeBase) < Math.abs(timeBaseSteps[closest] - AppState.timeBase) ? index : closest;
            }, 0);
        }

        // 根据滚轮方向调整档位
        if (e.deltaY > 0) {
            // 向下滚：增大时基（显示更长时间）
            currentIndex = Math.min(currentIndex + 1, timeBaseSteps.length - 1);
        } else {
            // 向上滚：减小时基（显示更短时间）
            currentIndex = Math.max(currentIndex - 1, 0);
        }

        // 更新时基
        AppState.timeBase = timeBaseSteps[currentIndex];

        // 更新时基选择器的值
        const timeBaseSelect = document.getElementById('time-base');
        if (timeBaseSelect) {
            timeBaseSelect.value = formatTimeBaseForSelect(AppState.timeBase);
        }

        // 更新显示信息
        updateDisplayInfo();
    }, { passive: false });

    // 鼠标拖拽平移
    let isDragging = false;
    let lastX = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastX;
        AppState.panOffset += deltaX;
        lastX = e.clientX;
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = 'default';
        }
    });

    // 设置初始光标
    canvas.style.cursor = 'grab';
}

// 初始化所有控制
function initializeControls() {
    initializeOscilloscopeControls();
    initializeWaveformGenerator();
    initializePWMGenerator();
    initializeLogicAnalyzer();
    initializeSpectrumAnalyzer();
    initializePowerSupply();
    initializeNetworkAnalyzer();

    // 通用控制 - 连接按钮在 initializeSerialModal 中处理
    document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
}

// 示波器控制
function initializeOscilloscopeControls() {
    document.getElementById('ch1-enable').addEventListener('change', (e) => {
        AppState.channels.ch1.enabled = e.target.checked;
    });

    document.getElementById('ch2-enable').addEventListener('change', (e) => {
        AppState.channels.ch2.enabled = e.target.checked;
    });

    // 通道刻度独立控制
    document.getElementById('ch1-scale').addEventListener('change', (e) => {
        const value = parseFloat(e.target.value.replace('V/div', ''));
        AppState.channels.ch1.scale = value;
        updateDisplayInfo();
    });

    document.getElementById('ch2-scale').addEventListener('change', (e) => {
        const value = parseFloat(e.target.value.replace('V/div', ''));
        AppState.channels.ch2.scale = value;
        updateDisplayInfo();
    });

    // 时间基准 - 实际改变波形显示
    document.getElementById('time-base').addEventListener('change', (e) => {
        const value = e.target.value;
        AppState.timeBase = parseTimeBase(value);
        updateDisplayInfo();
    });

    const triggerLevel = document.getElementById('trigger-level');
    const triggerLevelValue = document.getElementById('trigger-level-value');
    triggerLevel.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.triggerLevel = value;
        triggerLevelValue.textContent = value.toFixed(1) + 'V';
    });

    const runStopBtn = document.getElementById('run-stop-btn');
    runStopBtn.addEventListener('click', () => {
        AppState.isRunning = !AppState.isRunning;
        runStopBtn.innerHTML = AppState.isRunning ?
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>停止' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>运行';
    });

    document.getElementById('single-btn').addEventListener('click', () => {
        captureWaveform();
    });

    document.getElementById('auto-scale-btn').addEventListener('click', () => {
        autoScale();
    });

    document.getElementById('fft-toggle').addEventListener('change', (e) => {
        const fftCanvas = document.getElementById('fft-canvas');
        fftCanvas.classList.toggle('hidden', !e.target.checked);
    });

    // 平均次数控制
    const oscAvgSelect = document.getElementById('osc-avg');
    oscAvgSelect?.addEventListener('change', (e) => {
        const value = parseInt(e.target.value);
        AppState.oscilloscope.averaging = value;
        // 清空缓冲区以重新开始平均
        AppState.oscilloscope.averagingBufferCh1 = [];
        AppState.oscilloscope.averagingBufferCh2 = [];
    });
}

// 更新显示信息
function updateDisplayInfo() {
    const ch1Indicator = document.querySelector('.channel-indicator.ch1');
    const ch2Indicator = document.querySelector('.channel-indicator.ch2');
    const timeIndicator = document.querySelector('.time-indicator');

    if (ch1Indicator) {
        ch1Indicator.textContent = `CH1: ${AppState.channels.ch1.scale.toFixed(2)}V/div`;
    }

    if (ch2Indicator) {
        ch2Indicator.textContent = `CH2: ${AppState.channels.ch2.scale.toFixed(2)}V/div`;
    }

    if (timeIndicator) {
        timeIndicator.textContent = `时基: ${formatTimeBase(AppState.timeBase)}`;
    }
}

function parseTimeBase(value) {
    const match = value.match(/(\d+(?:\.\d+)?)(μs|ms|s)/);
    if (!match) return 1;

    const num = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
        case 'μs': return num / 1000;
        case 'ms': return num;
        case 's': return num * 1000;
        default: return 1;
    }
}

function formatTimeBase(ms) {
    if (ms >= 1000) {
        return (ms / 1000).toFixed(1) + 's/div';
    } else if (ms >= 1) {
        return ms.toFixed(1) + 'ms/div';
    } else {
        return (ms * 1000).toFixed(1) + 'μs/div';
    }
}

function formatTimeBaseForSelect(ms) {
    // 将时基值格式化为选择器中的选项值格式
    if (ms >= 1000) {
        const val = ms / 1000;
        return val % 1 === 0 ? val + 's/div' : val.toFixed(1) + 's/div';
    } else if (ms >= 1) {
        return ms % 1 === 0 ? ms + 'ms/div' : ms.toFixed(1) + 'ms/div';
    } else {
        const val = ms * 1000;
        return val % 1 === 0 ? val + 'μs/div' : val.toFixed(1) + 'μs/div';
    }
}

// 信号发生器控制
function initializeWaveformGenerator() {
    const waveButtons = document.querySelectorAll('.wave-btn');

    waveButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            waveButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.waveformGenerator.waveType = btn.dataset.wave;
            updateGeneratorDisplay();
        });
    });

    const genFreqInput = document.getElementById('gen-frequency');
    const genFreqUnit = document.getElementById('gen-freq-unit');

    // 频率输入变化
    genFreqInput.addEventListener('input', (e) => {
        updateFrequencyFromInput();
    });

    // 单位变化
    genFreqUnit.addEventListener('change', (e) => {
        updateFrequencyFromInput();
    });

    function updateFrequencyFromInput() {
        let value = parseFloat(genFreqInput.value);
        const unit = genFreqUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制最大值为10MHz = 10,000,000 Hz
        if (freqInHz > 10000000) {
            freqInHz = 10000000;
            // 反向计算输入框应显示的值
            switch(unit) {
                case 'Hz':
                    genFreqInput.value = 10000000;
                    break;
                case 'kHz':
                    genFreqInput.value = 10000;
                    break;
                case 'MHz':
                    genFreqInput.value = 10;
                    break;
            }
        }

        AppState.waveformGenerator.frequency = freqInHz;
        updateGeneratorDisplay();
    }

    const genAmplitude = document.getElementById('gen-amplitude');
    const genAmplitudeValue = document.getElementById('gen-amplitude-value');
    genAmplitude.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.waveformGenerator.amplitude = value;
        genAmplitudeValue.textContent = value.toFixed(1) + 'V';
        updateGeneratorDisplay();
    });

    const genOffset = document.getElementById('gen-offset');
    const genOffsetValue = document.getElementById('gen-offset-value');
    genOffset.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.waveformGenerator.offset = value;
        genOffsetValue.textContent = value.toFixed(1) + 'V';
        updateGeneratorDisplay();
    });

    const genOutputBtn = document.getElementById('gen-output-btn');
    genOutputBtn.addEventListener('click', () => {
        AppState.waveformGenerator.outputEnabled = !AppState.waveformGenerator.outputEnabled;

        // 更新按钮视觉状态
        if (AppState.waveformGenerator.outputEnabled) {
            genOutputBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            genOutputBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
                    <circle cx="12" cy="12" r="10" stroke-width="2"/>
                </svg>
                输出开启
            `;
        } else {
            genOutputBtn.style.background = '';
            genOutputBtn.textContent = '启动输出';
        }

        updateGeneratorDisplay();
    });
}

// 更新发生器显示信息
function updateGeneratorDisplay() {
    const waveNames = {
        'sine': '正弦波',
        'square': '方波',
        'triangle': '三角波',
        'sawtooth': '锯齿波',
        'pwm': 'PWM波'
    };

    document.getElementById('gen-display-wave').textContent = waveNames[AppState.waveformGenerator.waveType];
    document.getElementById('gen-display-freq').textContent = formatFrequency(AppState.waveformGenerator.frequency);
    document.getElementById('gen-display-amp').textContent = AppState.waveformGenerator.amplitude.toFixed(1) + ' V';
    document.getElementById('gen-display-offset').textContent = AppState.waveformGenerator.offset.toFixed(1) + ' V';

    const statusEl = document.getElementById('gen-display-status');
    if (AppState.waveformGenerator.outputEnabled) {
        statusEl.textContent = '输出开启';
        statusEl.classList.remove('status-off');
        statusEl.classList.add('status-on');
    } else {
        statusEl.textContent = '输出关闭';
        statusEl.classList.remove('status-on');
        statusEl.classList.add('status-off');
    }
}

// PWM发生器控制
function initializePWMGenerator() {
    const pwmFreqInput = document.getElementById('pwm-frequency');
    const pwmFreqUnit = document.getElementById('pwm-freq-unit');

    // 频率输入变化
    pwmFreqInput?.addEventListener('input', (e) => {
        updatePWMFrequencyFromInput();
    });

    // 单位变化
    pwmFreqUnit?.addEventListener('change', (e) => {
        updatePWMFrequencyFromInput();
    });

    function updatePWMFrequencyFromInput() {
        let value = parseFloat(pwmFreqInput.value);
        const unit = pwmFreqUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制最大值为1MHz = 1,000,000 Hz
        if (freqInHz > 1000000) {
            freqInHz = 1000000;
            // 反向计算输入框应显示的值
            switch(unit) {
                case 'Hz':
                    pwmFreqInput.value = 1000000;
                    break;
                case 'kHz':
                    pwmFreqInput.value = 1000;
                    break;
                case 'MHz':
                    pwmFreqInput.value = 1;
                    break;
            }
        }

        AppState.pwmGenerator.frequency = freqInHz;
        updatePWMDisplay();
    }

    const pwmDuty = document.getElementById('pwm-duty');
    const pwmDutyValue = document.getElementById('pwm-duty-value');
    pwmDuty?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.pwmGenerator.dutyCycle = value;
        pwmDutyValue.textContent = value.toFixed(0) + '%';
        updatePWMDisplay();
    });

    const pwmOutputBtn = document.getElementById('pwm-output-btn');
    pwmOutputBtn?.addEventListener('click', () => {
        AppState.pwmGenerator.outputEnabled = !AppState.pwmGenerator.outputEnabled;

        // 更新按钮视觉状态
        if (AppState.pwmGenerator.outputEnabled) {
            pwmOutputBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            pwmOutputBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
                    <circle cx="12" cy="12" r="10" stroke-width="2"/>
                </svg>
                输出开启
            `;
        } else {
            pwmOutputBtn.style.background = '';
            pwmOutputBtn.textContent = '启动输出';
        }

        updatePWMDisplay();
    });

    // 初始化时更新一次显示
    updatePWMDisplay();
}

// 更新PWM显示信息
function updatePWMDisplay() {
    document.getElementById('pwm-display-freq').textContent = formatFrequency(AppState.pwmGenerator.frequency);
    document.getElementById('pwm-display-amp').textContent = '3.3 V';  // 固定显示3.3V
    document.getElementById('pwm-display-duty').textContent = AppState.pwmGenerator.dutyCycle.toFixed(0) + '%';

    const statusEl = document.getElementById('pwm-display-status');
    if (AppState.pwmGenerator.outputEnabled) {
        statusEl.textContent = '输出开启';
        statusEl.classList.remove('status-off');
        statusEl.classList.add('status-on');
    } else {
        statusEl.textContent = '输出关闭';
        statusEl.classList.remove('status-on');
        statusEl.classList.add('status-off');
    }

    // 同时更新左侧测量面板的信息
    updatePWMMeasurements();
}

// 更新PWM测量信息
function updatePWMMeasurements() {
    // 更新频率
    document.getElementById('freq-measure').textContent = formatFrequency(AppState.pwmGenerator.frequency);

    // 峰峰值：0V到3.3V
    const vpp = AppState.pwmGenerator.amplitude;
    document.getElementById('vpp-measure').textContent = vpp.toFixed(2) + ' V';

    // RMS值：对于0V到3.3V的PWM信号，RMS = 3.3 * sqrt(占空比)
    const dutyCycleRatio = AppState.pwmGenerator.dutyCycle / 100;
    const rms = AppState.pwmGenerator.amplitude * Math.sqrt(dutyCycleRatio);
    document.getElementById('rms-measure').textContent = rms.toFixed(2) + ' V';

    // 占空比
    document.getElementById('duty-measure').textContent = AppState.pwmGenerator.dutyCycle.toFixed(1) + ' %';
}

// 逻辑分析仪控制
function initializeLogicAnalyzer() {
    for (let i = 0; i < 8; i++) {
        const checkbox = document.getElementById(`logic-ch${i}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                AppState.logicAnalyzer.channels[i] = e.target.checked;
            });
        }
    }

    const logicRunBtn = document.getElementById('logic-run-btn');
    logicRunBtn?.addEventListener('click', () => {
        AppState.logicAnalyzer.isRunning = !AppState.logicAnalyzer.isRunning;

        // 如果停止运行,保存当前数据
        if (!AppState.logicAnalyzer.isRunning) {
            AppState.logicAnalyzer.cachedData = AppState.logicAnalyzer.data.map(arr => [...arr]);
        }

        logicRunBtn.innerHTML = AppState.logicAnalyzer.isRunning ?
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>停止' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>运行';
    });

    document.getElementById('logic-single-btn')?.addEventListener('click', () => {
        captureLogicData();
    });
}

// 频谱分析仪控制
function initializeSpectrumAnalyzer() {
    // 起始频率控制
    const spectrumStartInput = document.getElementById('spectrum-start');
    const spectrumStartUnit = document.getElementById('spectrum-start-unit');

    spectrumStartInput?.addEventListener('input', (e) => {
        updateSpectrumStartFrequency();
    });

    spectrumStartUnit?.addEventListener('change', (e) => {
        updateSpectrumStartFrequency();
    });

    function updateSpectrumStartFrequency() {
        let value = parseFloat(spectrumStartInput.value);
        const unit = spectrumStartUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制范围为0-25MHz
        if (freqInHz > 25000000) {
            freqInHz = 25000000;
            switch(unit) {
                case 'Hz':
                    spectrumStartInput.value = 25000000;
                    break;
                case 'kHz':
                    spectrumStartInput.value = 25000;
                    break;
                case 'MHz':
                    spectrumStartInput.value = 25;
                    break;
            }
        }
        if (freqInHz < 0) {
            freqInHz = 0;
            spectrumStartInput.value = 0;
        }

        AppState.spectrumAnalyzer.startFreq = freqInHz;
    }

    // 终止频率控制
    const spectrumStopInput = document.getElementById('spectrum-stop');
    const spectrumStopUnit = document.getElementById('spectrum-stop-unit');

    spectrumStopInput?.addEventListener('input', (e) => {
        updateSpectrumStopFrequency();
    });

    spectrumStopUnit?.addEventListener('change', (e) => {
        updateSpectrumStopFrequency();
    });

    function updateSpectrumStopFrequency() {
        let value = parseFloat(spectrumStopInput.value);
        const unit = spectrumStopUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制范围为0-25MHz
        if (freqInHz > 25000000) {
            freqInHz = 25000000;
            switch(unit) {
                case 'Hz':
                    spectrumStopInput.value = 25000000;
                    break;
                case 'kHz':
                    spectrumStopInput.value = 25000;
                    break;
                case 'MHz':
                    spectrumStopInput.value = 25;
                    break;
            }
        }
        if (freqInHz < 0) {
            freqInHz = 0;
            spectrumStopInput.value = 0;
        }

        AppState.spectrumAnalyzer.stopFreq = freqInHz;
    }

    const refLevel = document.getElementById('spectrum-ref-level');
    const refValue = document.getElementById('spectrum-ref-value');
    refLevel?.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        AppState.spectrumAnalyzer.refLevel = value;
        refValue.textContent = value + ' dBm';
    });

    // RBW (分辨率带宽) 控制
    const rbwSelect = document.getElementById('spectrum-rbw');
    rbwSelect?.addEventListener('change', (e) => {
        const value = e.target.value;
        // 解析RBW值，例如 "10 kHz" -> 10000 Hz
        let rbwValue = parseFloat(value);
        if (value.includes('kHz')) {
            rbwValue = rbwValue * 1000;
        } else if (value.includes('MHz')) {
            rbwValue = rbwValue * 1000000;
        }
        AppState.spectrumAnalyzer.rbw = rbwValue;
    });

    // 平均次数控制
    const avgSelect = document.getElementById('spectrum-avg');
    avgSelect?.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === '关闭') {
            AppState.spectrumAnalyzer.averaging = 1;
        } else {
            // 解析 "8次" -> 8
            AppState.spectrumAnalyzer.averaging = parseInt(value);
        }
    });

    const spectrumRunBtn = document.getElementById('spectrum-run-btn');
    spectrumRunBtn?.addEventListener('click', () => {
        const wasRunning = AppState.spectrumAnalyzer.isRunning;
        AppState.spectrumAnalyzer.isRunning = !AppState.spectrumAnalyzer.isRunning;

        // 如果停止运行,保存当前数据
        if (wasRunning && !AppState.spectrumAnalyzer.isRunning) {
            // 缓存数据会在draw循环中自动保存
        }

        spectrumRunBtn.innerHTML = AppState.spectrumAnalyzer.isRunning ?
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>停止' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>运行';
    });
}

// 电源控制
function initializePowerSupply() {
    // DC 输出
    const ch1Voltage = document.getElementById('power-ch1-voltage');
    const ch1VoltageValue = document.getElementById('power-ch1-voltage-value');
    ch1Voltage?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.powerSupply.ch1.voltage = value;
        ch1VoltageValue.textContent = value.toFixed(1) + 'V';
        updatePowerDisplay();
    });

    const ch1Current = document.getElementById('power-ch1-current');
    const ch1CurrentValue = document.getElementById('power-ch1-current-value');
    ch1Current?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        AppState.powerSupply.ch1.current = value;
        ch1CurrentValue.textContent = value.toFixed(2) + 'A';
    });

    // 预设值
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const voltage = parseFloat(e.target.dataset.voltage);
            AppState.powerSupply.ch1.voltage = voltage;
            document.getElementById('power-ch1-voltage').value = voltage;
            document.getElementById('power-ch1-voltage-value').textContent = voltage.toFixed(1) + 'V';
            updatePowerDisplay();
        });
    });

    // 输出开关
    const outputBtn = document.getElementById('power-output-btn');
    outputBtn?.addEventListener('click', () => {
        AppState.powerSupply.masterOn = !AppState.powerSupply.masterOn;

        // 更新按钮视觉状态
        if (AppState.powerSupply.masterOn) {
            outputBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            outputBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 4px;">
                    <circle cx="12" cy="12" r="10" stroke-width="2" fill="currentColor" fill-opacity="0.2"/>
                    <line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/>
                    <line x1="12" y1="16" x2="12" y2="16" stroke-width="2"/>
                </svg>
                输出开启
            `;
        } else {
            outputBtn.style.background = '';
            outputBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 4px;">
                    <circle cx="12" cy="12" r="10" stroke-width="2"/>
                    <line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/>
                    <line x1="12" y1="16" x2="12" y2="16" stroke-width="2"/>
                </svg>
                启动输出
            `;
        }

        updatePowerDisplay();
    });
}

// 更新电源显示
function updatePowerDisplay() {
    const ch1 = AppState.powerSupply.ch1;

    // 模拟实际输出 - 只有masterOn开启时才输出
    ch1.actualV = AppState.powerSupply.masterOn ? ch1.voltage : 0;
    ch1.actualI = AppState.powerSupply.masterOn ? Math.random() * ch1.current * 0.8 : 0;

    document.getElementById('power-ch1-set-v').textContent = ch1.voltage.toFixed(2) + ' V';
    document.getElementById('power-ch1-actual-v').textContent = ch1.actualV.toFixed(2) + ' V';
    document.getElementById('power-ch1-actual-i').textContent = ch1.actualI.toFixed(3) + ' A';
    document.getElementById('power-ch1-power').textContent = (ch1.actualV * ch1.actualI).toFixed(2) + ' W';
}

// 网络分析仪控制
function initializeNetworkAnalyzer() {
    // 起始频率控制
    const networkStartInput = document.getElementById('network-start');
    const networkStartUnit = document.getElementById('network-start-unit');

    networkStartInput?.addEventListener('input', () => {
        updateNetworkStartFrequency();
    });

    networkStartUnit?.addEventListener('change', () => {
        updateNetworkStartFrequency();
    });

    function updateNetworkStartFrequency() {
        let value = parseFloat(networkStartInput.value);
        const unit = networkStartUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制范围为0.001Hz-25MHz
        if (freqInHz > 25000000) {
            freqInHz = 25000000;
            switch(unit) {
                case 'Hz':
                    networkStartInput.value = 25000000;
                    break;
                case 'kHz':
                    networkStartInput.value = 25000;
                    break;
                case 'MHz':
                    networkStartInput.value = 25;
                    break;
            }
        }
        if (freqInHz < 0.001) {
            freqInHz = 0.001;
            networkStartInput.value = 0.001;
        }

        AppState.networkAnalyzer.startFreq = freqInHz;
    }

    // 终止频率控制
    const networkStopInput = document.getElementById('network-stop');
    const networkStopUnit = document.getElementById('network-stop-unit');

    networkStopInput?.addEventListener('input', () => {
        updateNetworkStopFrequency();
    });

    networkStopUnit?.addEventListener('change', () => {
        updateNetworkStopFrequency();
    });

    function updateNetworkStopFrequency() {
        let value = parseFloat(networkStopInput.value);
        const unit = networkStopUnit.value;

        // 转换为Hz
        let freqInHz = value;
        switch(unit) {
            case 'Hz':
                freqInHz = value;
                break;
            case 'kHz':
                freqInHz = value * 1000;
                break;
            case 'MHz':
                freqInHz = value * 1000000;
                break;
        }

        // 限制范围为0.001Hz-25MHz
        if (freqInHz > 25000000) {
            freqInHz = 25000000;
            switch(unit) {
                case 'Hz':
                    networkStopInput.value = 25000000;
                    break;
                case 'kHz':
                    networkStopInput.value = 25000;
                    break;
                case 'MHz':
                    networkStopInput.value = 25;
                    break;
            }
        }
        if (freqInHz < 0.001) {
            freqInHz = 0.001;
            networkStopInput.value = 0.001;
        }

        AppState.networkAnalyzer.stopFreq = freqInHz;
    }

    // 扫频类型控制
    const networkSweepType = document.getElementById('network-sweep-type');
    networkSweepType?.addEventListener('change', (e) => {
        AppState.networkAnalyzer.sweepType = e.target.value;
    });

    // 扫描点数控制
    const networkPoints = document.getElementById('network-points');
    networkPoints?.addEventListener('change', (e) => {
        AppState.networkAnalyzer.points = parseInt(e.target.value);
    });

    // 输出功率控制
    const networkPower = document.getElementById('network-power');
    const networkPowerValue = document.getElementById('network-power-value');
    networkPower?.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        AppState.networkAnalyzer.power = value;
        networkPowerValue.textContent = value + ' dBm';
    });

    // 平均次数控制
    const networkAvg = document.getElementById('network-avg');
    networkAvg?.addEventListener('change', (e) => {
        AppState.networkAnalyzer.averaging = parseInt(e.target.value);
    });

    // 运行按钮
    const networkRunBtn = document.getElementById('network-run-btn');
    networkRunBtn?.addEventListener('click', () => {
        AppState.networkAnalyzer.isRunning = !AppState.networkAnalyzer.isRunning;

        if (AppState.networkAnalyzer.isRunning) {
            // 开始扫描，生成模拟数据
            generateNetworkAnalyzerData();
        }

        networkRunBtn.innerHTML = AppState.networkAnalyzer.isRunning ?
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>停止' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>运行';
    });

    // 标记按钮
    document.getElementById('network-marker-btn')?.addEventListener('click', () => {
        // 标记功能：显示中心频率和-3dB带宽
        updateNetworkMarkers();
    });
}

// 生成网络分析仪数据（模拟）
function generateNetworkAnalyzerData() {
    const { startFreq, stopFreq, sweepType, points, averaging } = AppState.networkAnalyzer;

    const magnitudeData = [];
    const phaseData = [];

    // 模拟一个带通滤波器的频率响应
    const centerFreq = Math.sqrt(startFreq * stopFreq); // 几何中心频率
    const Q = 10; // 品质因数

    for (let i = 0; i < points; i++) {
        let freq;

        // 根据扫频类型计算频率点
        if (sweepType === 'linear') {
            // 线性频率分布
            freq = startFreq + (stopFreq - startFreq) * i / (points - 1);
        } else {
            // 对数频率分布 (decade)
            const logStart = Math.log10(startFreq);
            const logStop = Math.log10(stopFreq);
            freq = Math.pow(10, logStart + (logStop - logStart) * i / (points - 1));
        }

        // 计算幅度响应（dB）- 模拟带通滤波器
        const normalizedFreq = freq / centerFreq;
        const magnitudeDB = -10 * Math.log10(1 + Math.pow(Q * (normalizedFreq - 1/normalizedFreq), 2));

        // 添加一些噪声
        const noise = (Math.random() - 0.5) * 0.5;
        magnitudeData.push(magnitudeDB + noise);

        // 计算相位响应（度）
        const phaseRad = -Math.atan(Q * (normalizedFreq - 1/normalizedFreq));
        const phaseDeg = phaseRad * 180 / Math.PI;
        phaseData.push(phaseDeg + noise * 2);
    }

    AppState.networkAnalyzer.magnitudeData = magnitudeData;
    AppState.networkAnalyzer.phaseData = phaseData;

    updateNetworkMarkers();
}

// 更新网络分析仪标记信息
function updateNetworkMarkers() {
    const { startFreq, stopFreq, sweepType, magnitudeData } = AppState.networkAnalyzer;

    if (magnitudeData.length === 0) {
        document.getElementById('network-center-freq').textContent = '--';
        document.getElementById('network-bandwidth').textContent = '--';
        return;
    }

    // 找到峰值
    let peakIndex = 0;
    let peakValue = -Infinity;
    for (let i = 0; i < magnitudeData.length; i++) {
        if (magnitudeData[i] > peakValue) {
            peakValue = magnitudeData[i];
            peakIndex = i;
        }
    }

    // 计算中心频率（根据扫频类型）
    const points = magnitudeData.length;
    let centerFreq;

    if (sweepType === 'linear') {
        centerFreq = startFreq + (stopFreq - startFreq) * peakIndex / (points - 1);
    } else {
        const logStart = Math.log10(startFreq);
        const logStop = Math.log10(stopFreq);
        centerFreq = Math.pow(10, logStart + (logStop - logStart) * peakIndex / (points - 1));
    }

    // 查找-3dB点
    const target3dB = peakValue - 3;
    let lowIndex = peakIndex;
    let highIndex = peakIndex;

    // 向下查找
    for (let i = peakIndex; i >= 0; i--) {
        if (magnitudeData[i] <= target3dB) {
            lowIndex = i;
            break;
        }
    }

    // 向上查找
    for (let i = peakIndex; i < magnitudeData.length; i++) {
        if (magnitudeData[i] <= target3dB) {
            highIndex = i;
            break;
        }
    }

    // 计算-3dB频率（根据扫频类型）
    let lowFreq, highFreq;

    if (sweepType === 'linear') {
        lowFreq = startFreq + (stopFreq - startFreq) * lowIndex / (points - 1);
        highFreq = startFreq + (stopFreq - startFreq) * highIndex / (points - 1);
    } else {
        const logStart = Math.log10(startFreq);
        const logStop = Math.log10(stopFreq);
        lowFreq = Math.pow(10, logStart + (logStop - logStart) * lowIndex / (points - 1));
        highFreq = Math.pow(10, logStart + (logStop - logStart) * highIndex / (points - 1));
    }

    const bandwidth = highFreq - lowFreq;

    document.getElementById('network-center-freq').textContent = formatFrequency(centerFreq);
    document.getElementById('network-bandwidth').textContent = formatFrequency(bandwidth);
}

// 初始化所有Canvas
function initializeAllCanvas() {
    initializeOscilloscopeCanvas();
    initializeGeneratorCanvas();
    initializePWMCanvas();
    initializeLogicCanvas();
    initializeSpectrumCanvas();
    initializePowerCanvas();
    initializeNetworkAnalyzerCanvas();
}

// 示波器Canvas
function initializeOscilloscopeCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    const container = canvas.parentElement;

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'oscilloscope') {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        if (AppState.isRunning || AppState.channels.ch1.data.length > 0) {
            if (AppState.isRunning) {
                generateWaveformData();
            }

            if (AppState.channels.ch1.enabled) {
                drawChannel(ctx, AppState.channels.ch1.data, '#ffc107', width, height, 1);
            }

            if (AppState.channels.ch2.enabled) {
                drawChannel(ctx, AppState.channels.ch2.data, '#00d4ff', width, height, 2);
            }
        }

        drawTriggerLine(ctx, width, height);
        requestAnimationFrame(draw);
    }

    draw();
}

// 信号发生器Canvas
function initializeGeneratorCanvas() {
    const canvas = document.getElementById('generator-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'waveform-generator') {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        // 绘制生成的波形
        const data = generatePreviewWaveform();
        drawChannel(ctx, data, '#00d4ff', width, height, 1);

        requestAnimationFrame(draw);
    }

    draw();
}

// PWM发生器Canvas
function initializePWMCanvas() {
    const canvas = document.getElementById('pwm-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'pwm-generator') {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        // 绘制PWM波形预览（固定2个周期）
        const data = generatePWMPreviewWaveform();
        drawChannel(ctx, data, '#00d4ff', width, height, 1);

        requestAnimationFrame(draw);
    }

    draw();
}

// 生成PWM预览波形（固定显示2个周期）
function generatePWMPreviewWaveform() {
    const samples = 1000;
    const { frequency, amplitude, offset, dutyCycle } = AppState.pwmGenerator;
    const data = [];

    // 计算采样时间：固定显示2个周期
    const totalTime = 2 / frequency;  // 显示2个周期
    const dt = totalTime / samples;   // 每个采样点的时间间隔

    for (let i = 0; i < samples; i++) {
        const t = i * dt;  // 实际时间(秒)
        const angle = 2 * Math.PI * frequency * t;  // 正确的角度计算
        const phase = (angle / (2 * Math.PI)) % 1;

        // PWM波形：在0V和3.3V之间切换
        // 高电平时为3.3V，低电平时为0V
        const value = phase < (dutyCycle / 100) ? amplitude : 0;
        data.push(value);
    }

    return data;
}

// 生成预览波形
function generatePreviewWaveform() {
    const samples = 1000;
    const { waveType, frequency, amplitude, offset, dutyCycle } = AppState.waveformGenerator;
    const data = [];

    // 计算采样时间：固定显示10个周期
    const totalTime = 10 / frequency;  // 显示10个周期
    const dt = totalTime / samples;    // 每个采样点的时间间隔

    for (let i = 0; i < samples; i++) {
        const t = i * dt;  // 实际时间(秒)
        const angle = 2 * Math.PI * frequency * t;  // 正确的角度计算

        let value;

        switch (waveType) {
            case 'sine':
                value = amplitude * Math.sin(angle) + offset;
                break;
            case 'square':
                value = amplitude * (Math.sin(angle) > 0 ? 1 : -1) + offset;
                break;
            case 'triangle':
                value = amplitude * (2 / Math.PI * Math.asin(Math.sin(angle))) + offset;
                break;
            case 'sawtooth':
                value = amplitude * (2 * (angle / (2 * Math.PI) - Math.floor(angle / (2 * Math.PI) + 0.5))) + offset;
                break;
            case 'pwm':
                // PWM: 根据占空比生成脉冲
                const phase = (angle / (2 * Math.PI)) % 1;
                value = amplitude * (phase < (dutyCycle / 100) ? 1 : -1) + offset;
                break;
            default:
                value = amplitude * Math.sin(angle) + offset;
        }

        data.push(value);
    }

    return data;
}

// 逻辑分析仪Canvas
function initializeLogicCanvas() {
    const canvas = document.getElementById('logic-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'logic-analyzer') {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // 绘制数字信号
        const channelHeight = height / 8;
        const colors = ['#00d4ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

        AppState.logicAnalyzer.channels.forEach((enabled, index) => {
            if (!enabled) return;

            const y = index * channelHeight + channelHeight / 2;

            // 标签
            ctx.fillStyle = colors[index];
            ctx.font = '14px monospace';
            ctx.fillText(`D${index}`, 10, y - channelHeight / 4);

            // 信号线
            ctx.strokeStyle = colors[index];
            ctx.lineWidth = 2;
            ctx.beginPath();

            const samples = 200;
            // 决定使用运行数据还是缓存数据
            const dataSource = AppState.logicAnalyzer.isRunning ? null : AppState.logicAnalyzer.cachedData[index];

            for (let i = 0; i < samples; i++) {
                const x = (i / samples) * width;

                // 运行时生成随机数据，停止时使用缓存数据
                let value;
                if (AppState.logicAnalyzer.isRunning) {
                    value = Math.random() > 0.5 ? 1 : 0;
                    // 保存到数据数组中
                    if (!AppState.logicAnalyzer.data[index]) {
                        AppState.logicAnalyzer.data[index] = [];
                    }
                    AppState.logicAnalyzer.data[index][i] = value;
                } else {
                    // 使用缓存数据
                    value = dataSource && dataSource[i] !== undefined ? dataSource[i] : 0;
                }

                const signalY = y + (value ? -channelHeight / 3 : channelHeight / 3);

                if (i === 0) {
                    ctx.moveTo(x, signalY);
                } else {
                    ctx.lineTo(x, signalY);
                }
            }

            ctx.stroke();
        });

        requestAnimationFrame(draw);
    }

    draw();
}

// 简单FFT实现（使用信号发生器的数据）
function simpleFFT(data) {
    const N = data.length;
    const spectrum = [];

    // 对每个频率分量计算幅度
    for (let k = 0; k < N / 2; k++) {
        let real = 0;
        let imag = 0;

        for (let n = 0; n < N; n++) {
            const angle = -2 * Math.PI * k * n / N;
            real += data[n] * Math.cos(angle);
            imag += data[n] * Math.sin(angle);
        }

        // 计算幅度
        const magnitude = Math.sqrt(real * real + imag * imag) / N;
        spectrum.push(magnitude * 2); // 归一化
    }

    return spectrum;
}

// 频谱分析仪Canvas
function initializeSpectrumCanvas() {
    const canvas = document.getElementById('spectrum-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;

    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'spectrum-analyzer') {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        // 绘制频谱
        const bars = 400;  // 增加频谱柱数量以提高分辨率
        const barWidth = width / bars;

        // 运行时生成新数据，停止时使用缓存数据
        if (AppState.spectrumAnalyzer.isRunning) {
            // 使用信号发生器的数据进行FFT变换
            const signalData = AppState.channels.ch1.data;

            if (signalData && signalData.length > 0) {
                // 执行FFT
                let fftResult = simpleFFT(signalData);

                // 计算频率分辨率
                const sampleRate = AppState.sampleRate;
                const freqResolution = sampleRate / signalData.length;

                // 应用RBW (分辨率带宽) 效果 - 频率域平滑
                const rbw = AppState.spectrumAnalyzer.rbw;
                // RBW越小,平滑窗口越大,显示越平滑
                const smoothBins = Math.max(1, Math.floor(rbw / freqResolution));

                const smoothedFFT = [];
                for (let i = 0; i < fftResult.length; i++) {
                    let sum = 0;
                    let count = 0;
                    const halfWindow = Math.floor(smoothBins / 2);

                    for (let j = Math.max(0, i - halfWindow); j <= Math.min(fftResult.length - 1, i + halfWindow); j++) {
                        sum += fftResult[j];
                        count++;
                    }
                    smoothedFFT.push(sum / count);
                }
                fftResult = smoothedFFT;

                // 应用平均功能 - 时域平均(多帧平均)
                const averagingCount = AppState.spectrumAnalyzer.averaging;
                if (averagingCount > 1) {
                    // 添加当前帧到缓冲区
                    AppState.spectrumAnalyzer.averagingBuffer.push([...fftResult]);

                    // 保持缓冲区大小等于平均次数
                    if (AppState.spectrumAnalyzer.averagingBuffer.length > averagingCount) {
                        AppState.spectrumAnalyzer.averagingBuffer.shift();
                    }

                    // 计算平均FFT (降噪效果)
                    if (AppState.spectrumAnalyzer.averagingBuffer.length > 1) {
                        const averagedFFT = [];
                        for (let i = 0; i < fftResult.length; i++) {
                            let sum = 0;
                            for (let frame of AppState.spectrumAnalyzer.averagingBuffer) {
                                sum += frame[i];
                            }
                            averagedFFT.push(sum / AppState.spectrumAnalyzer.averagingBuffer.length);
                        }
                        fftResult = averagedFFT;
                    }
                } else {
                    // 如果平均关闭，清空缓冲区
                    AppState.spectrumAnalyzer.averagingBuffer = [];
                }

                // 获取用户设定的频率范围
                const startFreq = AppState.spectrumAnalyzer.startFreq;
                const stopFreq = AppState.spectrumAnalyzer.stopFreq;

                // 计算在频率范围内的FFT索引范围
                const startIndex = Math.max(0, Math.floor(startFreq / freqResolution));
                const stopIndex = Math.min(fftResult.length - 1, Math.ceil(stopFreq / freqResolution));

                // 查找峰值
                let peakMagnitude = 0;
                let peakFreqIndex = startIndex;

                for (let i = startIndex; i <= stopIndex; i++) {
                    if (fftResult[i] > peakMagnitude) {
                        peakMagnitude = fftResult[i];
                        peakFreqIndex = i;
                    }
                }

                // 计算实际峰值频率
                const peakFreq = peakFreqIndex * freqResolution;
                AppState.spectrumAnalyzer.cachedPeakFreq = peakFreq;

                // 计算峰值功率（dBm） - 基于实际幅度
                const peakPowerDB = 20 * Math.log10(Math.max(peakMagnitude, 1e-10));
                AppState.spectrumAnalyzer.cachedPeakPower = peakPowerDB.toFixed(1);

                // 生成显示数据并缓存
                AppState.spectrumAnalyzer.cachedBars = [];

                // 在指定频率范围内绘制，让频谱占满横轴
                for (let i = 0; i < bars; i++) {
                    // 将横轴映射到频率范围
                    const fftIndex = startIndex + Math.floor((i / bars) * (stopIndex - startIndex));

                    if (fftIndex < fftResult.length) {
                        // 转换为对数刻度显示（dB）
                        const magnitudeDB = 20 * Math.log10(Math.max(fftResult[fftIndex], 1e-10));

                        // 归一化到显示范围 (假设-80dB到0dB的显示范围)
                        const refLevel = AppState.spectrumAnalyzer.refLevel;
                        const displayRange = 80; // 显示动态范围 80dB
                        const normalizedMag = (magnitudeDB - (refLevel - displayRange)) / displayRange;
                        const magnitude = Math.max(0, Math.min(1, normalizedMag)) * height * 0.9;

                        // 保存到缓存
                        AppState.spectrumAnalyzer.cachedBars.push({magnitude, fftIndex, freqResolution});

                        // 绘制频谱柱
                        const gradient = ctx.createLinearGradient(0, height - magnitude, 0, height);
                        gradient.addColorStop(0, '#00d4ff');
                        gradient.addColorStop(0.5, '#0099cc');
                        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.2)');

                        ctx.fillStyle = gradient;
                        ctx.fillRect(i * barWidth, height - magnitude, Math.max(1, barWidth - 1), magnitude);
                    } else {
                        AppState.spectrumAnalyzer.cachedBars.push({magnitude: 0, fftIndex, freqResolution: 0});
                    }
                }
            }
        } else {
            // 使用缓存数据绘制
            for (let i = 0; i < AppState.spectrumAnalyzer.cachedBars.length && i < bars; i++) {
                const {magnitude} = AppState.spectrumAnalyzer.cachedBars[i];

                const gradient = ctx.createLinearGradient(0, height - magnitude, 0, height);
                gradient.addColorStop(0, '#00d4ff');
                gradient.addColorStop(0.5, '#0099cc');
                gradient.addColorStop(1, 'rgba(0, 212, 255, 0.2)');

                ctx.fillStyle = gradient;
                ctx.fillRect(i * barWidth, height - magnitude, Math.max(1, barWidth - 1), magnitude);
            }
        }

        // 更新峰值信息显示
        document.getElementById('spectrum-peak-freq').textContent = formatFrequency(AppState.spectrumAnalyzer.cachedPeakFreq);
        document.getElementById('spectrum-peak-power').textContent = AppState.spectrumAnalyzer.cachedPeakPower + ' dBm';

        requestAnimationFrame(draw);
    }

    draw();
}

// 电源Canvas (趋势图)
function initializePowerCanvas() {
    const canvas1 = document.getElementById('power-ch1-graph');
    const canvas2 = document.getElementById('power-ch2-graph');

    [canvas1, canvas2].forEach((canvas, chIndex) => {
        if (!canvas) return;

        canvas.width = canvas.parentElement.clientWidth - 48;
        canvas.height = 150;

        function draw() {
            if (AppState.currentInstrument !== 'power-supply') {
                requestAnimationFrame(draw);
                return;
            }

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            // 绘制电压趋势
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i < width; i++) {
                const voltage = chIndex === 0 ? AppState.powerSupply.ch1.actualV : AppState.powerSupply.ch2.actualV;
                const maxV = chIndex === 0 ? 5 : 12;
                const y = height - (voltage / maxV) * height * 0.9;

                if (i === 0) {
                    ctx.moveTo(i, y);
                } else {
                    ctx.lineTo(i, y);
                }
            }

            ctx.stroke();

            requestAnimationFrame(draw);
        }

        draw();
    });
}

// 网络分析仪Canvas
function initializeNetworkAnalyzerCanvas() {
    const magnitudeCanvas = document.getElementById('network-magnitude-canvas');
    const phaseCanvas = document.getElementById('network-phase-canvas');

    if (!magnitudeCanvas || !phaseCanvas) return;

    function resizeCanvas() {
        if (magnitudeCanvas.parentElement) {
            magnitudeCanvas.width = magnitudeCanvas.parentElement.clientWidth;
            magnitudeCanvas.height = magnitudeCanvas.parentElement.clientHeight;
        }
        if (phaseCanvas.parentElement) {
            phaseCanvas.width = phaseCanvas.parentElement.clientWidth;
            phaseCanvas.height = phaseCanvas.parentElement.clientHeight;
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
        if (AppState.currentInstrument !== 'network-analyzer') {
            requestAnimationFrame(draw);
            return;
        }

        drawMagnitudePlot(magnitudeCanvas);
        drawPhasePlot(phaseCanvas);

        requestAnimationFrame(draw);
    }

    draw();
}

// 绘制幅度图
function drawMagnitudePlot(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 绘制网格和坐标轴
    drawBodePlotGrid(ctx, width, height, 'magnitude');

    const { startFreq, stopFreq, magnitudeData } = AppState.networkAnalyzer;

    if (magnitudeData.length === 0) return;

    // 绘制幅度曲线
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#00d4ff';
    ctx.beginPath();

    const points = magnitudeData.length;
    const logStart = Math.log10(startFreq);
    const logStop = Math.log10(stopFreq);

    for (let i = 0; i < points; i++) {
        // X轴：对数刻度
        const freq = Math.pow(10, logStart + (logStop - logStart) * i / (points - 1));
        const x = (Math.log10(freq) - logStart) / (logStop - logStart) * width;

        // Y轴：幅度范围 -60dB 到 0dB
        const magnitude = magnitudeData[i];
        const y = height - ((magnitude + 60) / 60) * height * 0.9;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
}

// 绘制相位图
function drawPhasePlot(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 绘制网格和坐标轴
    drawBodePlotGrid(ctx, width, height, 'phase');

    const { startFreq, stopFreq, phaseData } = AppState.networkAnalyzer;

    if (phaseData.length === 0) return;

    // 绘制相位曲线
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#10b981';
    ctx.beginPath();

    const points = phaseData.length;
    const logStart = Math.log10(startFreq);
    const logStop = Math.log10(stopFreq);

    for (let i = 0; i < points; i++) {
        // X轴：对数刻度
        const freq = Math.pow(10, logStart + (logStop - logStart) * i / (points - 1));
        const x = (Math.log10(freq) - logStart) / (logStop - logStart) * width;

        // Y轴：相位范围 -180° 到 +180°
        const phase = phaseData[i];
        const y = height / 2 - (phase / 180) * height * 0.45;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
}

// 绘制Bode图网格
function drawBodePlotGrid(ctx, width, height, type) {
    // 绘制网格
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    const divisions = 10;
    const stepX = width / divisions;
    const stepY = height / divisions;

    for (let i = 0; i <= divisions; i++) {
        ctx.beginPath();
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * stepY);
        ctx.lineTo(width, i * stepY);
        ctx.stroke();
    }

    // 绘制中心线
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (type === 'magnitude') {
        // 幅度图：0dB线（假设显示范围是-60到0dB，0dB在顶部）
        ctx.moveTo(0, height * 0.1);
        ctx.lineTo(width, height * 0.1);
    } else {
        // 相位图：0°线在中间
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
    }

    ctx.stroke();

    // 绘制刻度标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';

    // Y轴标签
    if (type === 'magnitude') {
        for (let i = 0; i <= 6; i++) {
            const db = -i * 10;
            const y = height * 0.1 + (i / 6) * height * 0.9;
            ctx.fillText(db + 'dB', 5, y + 3);
        }
    } else {
        const phases = [180, 90, 0, -90, -180];
        for (let i = 0; i < phases.length; i++) {
            const y = height * 0.05 + (i / 4) * height * 0.9;
            ctx.fillText(phases[i] + '°', 5, y + 3);
        }
    }
}

// 通用绘图函数
function drawGrid(ctx, width, height) {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    const divisions = 10;
    const stepX = width / divisions;
    const stepY = height / divisions;

    for (let i = 0; i <= divisions; i++) {
        ctx.beginPath();
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * stepY);
        ctx.lineTo(width, i * stepY);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}

function drawChannel(ctx, data, color, width, height, channelNum) {
    if (data.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;

    ctx.beginPath();

    // 应用平移
    const panOffset = AppState.panOffset || 0;

    // 根据通道号选择对应的刻度
    const scale = channelNum === 1 ? AppState.channels.ch1.scale : AppState.channels.ch2.scale;

    // 计算显示范围（支持平移）
    const panRatio = panOffset / width;
    const startIndex = Math.max(0, Math.floor(-panRatio * data.length));
    const endIndex = Math.min(data.length, data.length + startIndex);

    // 计算步长，使波形填满整个宽度
    const step = width / data.length;

    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        const x = i * step + panOffset;

        // 只绘制在可见区域内的点
        if (x < -step || x > width + step) continue;

        // 根据通道独立刻度计算Y坐标
        const pixelsPerDiv = height / 10;
        const pixelsPerVolt = pixelsPerDiv / scale;
        const y = height / 2 - (value * pixelsPerVolt);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawTriggerLine(ctx, width, height) {
    const y = height / 2 - (AppState.triggerLevel * height / 20);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.setLineDash([]);
}

// 数据生成
function generateWaveformData() {
    const samples = 1000;
    const frequency = AppState.waveformGenerator.frequency;  // 已经是Hz
    const amplitude = AppState.waveformGenerator.amplitude;  // 峰值电压
    const offset = AppState.waveformGenerator.offset;
    const waveType = AppState.waveformGenerator.waveType;
    const dutyCycle = AppState.waveformGenerator.dutyCycle;

    const ch1Data = [];
    const ch2Data = [];

    // 计算采样时间：根据时间基准显示波形
    const sampleRate = AppState.sampleRate;  // 45 MHz
    const timeBase = AppState.timeBase;  // 时间基准（毫秒/div）
    const totalTime = (timeBase * 10) / 1000;  // 总时间窗口（秒）= 时基 * 10格 / 1000(转换为秒)
    const dt = totalTime / samples;  // 每个采样点的时间间隔

    for (let i = 0; i < samples; i++) {
        const t = i * dt;  // 实际时间(秒)
        const angle = 2 * Math.PI * frequency * t;  // 正确的角度计算

        let value1;
        switch (waveType) {
            case 'sine':
                value1 = amplitude * Math.sin(angle) + offset;
                break;
            case 'square':
                value1 = amplitude * (Math.sin(angle) > 0 ? 1 : -1) + offset;
                break;
            case 'triangle':
                value1 = amplitude * (2 / Math.PI * Math.asin(Math.sin(angle))) + offset;
                break;
            case 'sawtooth':
                value1 = amplitude * (2 * (angle / (2 * Math.PI) - Math.floor(angle / (2 * Math.PI) + 0.5))) + offset;
                break;
            case 'pwm':
                const phase = (angle / (2 * Math.PI)) % 1;
                value1 = amplitude * (phase < (dutyCycle / 100) ? 1 : -1) + offset;
                break;
            default:
                value1 = amplitude * Math.sin(angle) + offset;
        }

        value1 += (Math.random() - 0.5) * 0.01;  // 减小噪声
        const value2 = (amplitude * 0.6) * Math.sin(angle + Math.PI / 4) + offset + (Math.random() - 0.5) * 0.01;

        ch1Data.push(value1);
        ch2Data.push(value2);
    }

    // 应用平均功能（如果启用）
    const averagingCount = AppState.oscilloscope.averaging;
    let finalCh1Data = ch1Data;
    let finalCh2Data = ch2Data;

    if (averagingCount > 1) {
        // 添加当前帧到缓冲区
        AppState.oscilloscope.averagingBufferCh1.push([...ch1Data]);
        AppState.oscilloscope.averagingBufferCh2.push([...ch2Data]);

        // 限制缓冲区大小
        if (AppState.oscilloscope.averagingBufferCh1.length > averagingCount) {
            AppState.oscilloscope.averagingBufferCh1.shift();
        }
        if (AppState.oscilloscope.averagingBufferCh2.length > averagingCount) {
            AppState.oscilloscope.averagingBufferCh2.shift();
        }

        // 计算平均值
        if (AppState.oscilloscope.averagingBufferCh1.length > 1) {
            finalCh1Data = [];
            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let frame of AppState.oscilloscope.averagingBufferCh1) {
                    sum += frame[i];
                }
                finalCh1Data.push(sum / AppState.oscilloscope.averagingBufferCh1.length);
            }
        }

        if (AppState.oscilloscope.averagingBufferCh2.length > 1) {
            finalCh2Data = [];
            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let frame of AppState.oscilloscope.averagingBufferCh2) {
                    sum += frame[i];
                }
                finalCh2Data.push(sum / AppState.oscilloscope.averagingBufferCh2.length);
            }
        }
    }

    AppState.channels.ch1.data = finalCh1Data;
    AppState.channels.ch2.data = finalCh2Data;

    updateMeasurements();
}

function updateMeasurements() {
    const ch1Data = AppState.channels.ch1.data;
    if (ch1Data.length === 0) return;

    const frequency = AppState.waveformGenerator.frequency;
    document.getElementById('freq-measure').textContent = formatFrequency(frequency);

    const max = Math.max(...ch1Data);
    const min = Math.min(...ch1Data);
    const vpp = max - min;
    document.getElementById('vpp-measure').textContent = vpp.toFixed(2) + ' V';

    const sum = ch1Data.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / ch1Data.length);
    document.getElementById('rms-measure').textContent = rms.toFixed(2) + ' V';

    const positive = ch1Data.filter(v => v > 0).length;
    const dutyCycle = (positive / ch1Data.length) * 100;
    document.getElementById('duty-measure').textContent = dutyCycle.toFixed(1) + ' %';
}

function captureWaveform() {
    AppState.isRunning = false;
    generateWaveformData();
}

function captureLogicData() {
    // 生成逻辑数据
    for (let i = 0; i < 8; i++) {
        if (AppState.logicAnalyzer.channels[i]) {
            const data = [];
            for (let j = 0; j < 200; j++) {
                data.push(Math.random() > 0.5 ? 1 : 0);
            }
            AppState.logicAnalyzer.data[i] = data;
        }
    }
}

function autoScale() {
    const ch1Data = AppState.channels.ch1.data;
    if (ch1Data.length === 0) return;

    const max = Math.max(...ch1Data);
    const min = Math.min(...ch1Data);
    const range = max - min;

    const scales = [1, 2, 5, 10];
    const optimalScale = scales.find(s => range <= s * 8) || 10;

    AppState.channels.ch1.scale = optimalScale;
    document.getElementById('ch1-scale').value = optimalScale + 'V/div';
}

function toggleConnection() {
    AppState.isConnected = !AppState.isConnected;
    const statusDot = document.querySelector('.connection-status .status-indicator-dot');
    const connectionStatusText = document.getElementById('connection-status-text');
    const connectBtn = document.getElementById('connect-btn');

    if (AppState.isConnected) {
        if (statusDot) statusDot.classList.add('connected');
        if (connectionStatusText) connectionStatusText.textContent = `已连接 (${AppState.serialConfig.type})`;
        if (connectBtn) connectBtn.textContent = '断开连接';
        AppState.isRunning = true;
        console.log('已连接到设备，配置:', AppState.serialConfig);
    } else {
        if (statusDot) statusDot.classList.remove('connected');
        if (connectionStatusText) connectionStatusText.textContent = '未连接';
        if (connectBtn) connectBtn.textContent = '连接设备';
        AppState.isRunning = false;
        console.log('已断开设备连接');
    }
}

// AI功能 (从原app.js复制)
function initializeAI() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiPanel = document.getElementById('ai-panel');
    const closeAiBtn = document.getElementById('close-ai-btn');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    aiBtn.addEventListener('click', () => {
        aiPanel.classList.toggle('hidden');
        AppState.aiPanelOpen = !AppState.aiPanelOpen;
    });

    closeAiBtn.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        AppState.aiPanelOpen = false;
    });

    function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        addUserMessage(message);
        chatInput.value = '';

        setTimeout(() => {
            const response = generateAIResponse(message);
            addAIMessage(response);
        }, 1000);
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.textContent;
            sendMessage();
        });
    });
}

function addUserMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'user-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">你</div>
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAIMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function generateAIResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('分析') && lowerMessage.includes('波形')) {
        return `我已分析当前波形数据：

• 信号类型：${getWaveformName(AppState.waveformGenerator.waveType)}
• 频率：${formatFrequency(AppState.waveformGenerator.frequency)}
• 幅度：${AppState.waveformGenerator.amplitude.toFixed(2)}V
• 信号质量：良好，噪声水平较低
• 建议：当前设置适合大多数测量场景`;
    } else if (lowerMessage.includes('优化') && lowerMessage.includes('触发')) {
        return `触发优化建议：

• 当前触发电平：${AppState.triggerLevel.toFixed(1)}V
• 建议设置：${(AppState.waveformGenerator.amplitude * 0.5).toFixed(1)}V（信号幅度的50%）
• 触发模式：边沿触发
• 触发源：通道1

这样可以获得稳定的波形显示。`;
    } else if (lowerMessage.includes('信号质量') || lowerMessage.includes('测量')) {
        return `信号质量评估报告：

✓ 频率稳定性：优秀
✓ 幅度精度：±0.1V
✓ 谐波失真：<1%
✓ 信噪比：>60dB
✓ 上升时间：良好

总体评价：信号质量良好，适合精密测量。`;
    } else if (lowerMessage.includes('报告')) {
        return `测试报告已生成：

=== 测量摘要 ===
• 频率：${formatFrequency(AppState.waveformGenerator.frequency)}
• 峰峰值：${AppState.waveformGenerator.amplitude * 2}V
• RMS值：${(AppState.waveformGenerator.amplitude / Math.sqrt(2)).toFixed(2)}V
• 波形类型：${getWaveformName(AppState.waveformGenerator.waveType)}

您可以点击"导出数据"按钮保存完整报告。`;
    } else {
        return `我理解您的问题。作为AI助手，我可以帮您：

• 实时分析波形特征
• 推荐最佳测量参数
• 诊断信号异常
• 生成专业测试报告

请告诉我具体需要什么帮助？`;
    }
}

// 工具函数
function formatFrequency(freq) {
    if (freq >= 1000000) {
        return (freq / 1000000).toFixed(2) + ' MHz';
    } else if (freq >= 1000) {
        return (freq / 1000).toFixed(2) + ' kHz';
    } else {
        return freq.toFixed(2) + ' Hz';
    }
}

function getWaveformName(type) {
    const names = {
        'sine': '正弦波',
        'square': '方波',
        'triangle': '三角波',
        'sawtooth': '锯齿波',
        'pwm': 'PWM波'
    };
    return names[type] || type;
}

function takeScreenshot() {
    const canvasMap = {
        'oscilloscope': 'waveform-canvas',
        'waveform-generator': 'generator-canvas',
        'pwm-generator': 'pwm-canvas',
        'logic-analyzer': 'logic-canvas',
        'spectrum-analyzer': 'spectrum-canvas',
        'network-analyzer': 'network-magnitude-canvas'
    };

    const canvasId = canvasMap[AppState.currentInstrument];
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${AppState.currentInstrument}_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
}

function exportData() {
    let csvContent = '';
    const timestamp = new Date().toISOString();
    const instrument = AppState.currentInstrument;

    // 添加CSV头部信息
    csvContent += `# Exported from ZooLark View\n`;
    csvContent += `# Timestamp: ${timestamp}\n`;
    csvContent += `# Instrument: ${instrument}\n`;
    csvContent += `#\n`;

    // 根据当前仪器类型导出相应数据
    switch (instrument) {
        case 'oscilloscope':
            csvContent += '# Oscilloscope Data\n';
            csvContent += `# Time Base: ${formatTimeBase(AppState.timeBase)}\n`;
            csvContent += `# CH1 Scale: ${AppState.channels.ch1.scale}V/div\n`;
            csvContent += `# CH2 Scale: ${AppState.channels.ch2.scale}V/div\n`;
            csvContent += `#\n`;
            csvContent += 'Index,Time(s),CH1(V),CH2(V)\n';

            const ch1Data = AppState.channels.ch1.data;
            const ch2Data = AppState.channels.ch2.data;
            const samples = ch1Data.length;
            const totalTime = (AppState.timeBase * 10) / 1000; // 秒
            const dt = totalTime / samples;

            for (let i = 0; i < samples; i++) {
                const time = i * dt;
                const ch1 = ch1Data[i] || 0;
                const ch2 = ch2Data[i] || 0;
                csvContent += `${i},${time.toExponential(6)},${ch1.toFixed(6)},${ch2.toFixed(6)}\n`;
            }
            break;

        case 'spectrum-analyzer':
            csvContent += '# Spectrum Analyzer Data\n';
            csvContent += `# Start Frequency: ${formatFrequency(AppState.spectrumAnalyzer.startFreq)}\n`;
            csvContent += `# Stop Frequency: ${formatFrequency(AppState.spectrumAnalyzer.stopFreq)}\n`;
            csvContent += '#\n';
            csvContent += 'Index,Frequency(Hz),Power(dBm)\n';

            // 使用缓存的频谱数据
            const bars = AppState.spectrumAnalyzer.cachedBars || [];
            for (let i = 0; i < bars.length; i++) {
                csvContent += `${i},${bars[i].freq.toFixed(2)},${bars[i].power.toFixed(2)}\n`;
            }
            break;

        case 'logic-analyzer':
            csvContent += '# Logic Analyzer Data\n';
            csvContent += `# Sample Rate: ${AppState.logicAnalyzer.sampleRate / 1e6} MHz\n`;
            csvContent += `#\n`;
            csvContent += 'Index';
            for (let ch = 0; ch < 8; ch++) {
                if (AppState.logicAnalyzer.channels[ch]) {
                    csvContent += `,D${ch}`;
                }
            }
            csvContent += '\n';

            const logicLength = AppState.logicAnalyzer.data[0]?.length || 0;
            for (let i = 0; i < logicLength; i++) {
                csvContent += `${i}`;
                for (let ch = 0; ch < 8; ch++) {
                    if (AppState.logicAnalyzer.channels[ch]) {
                        const value = AppState.logicAnalyzer.data[ch][i] || 0;
                        csvContent += `,${value}`;
                    }
                }
                csvContent += '\n';
            }
            break;

        case 'network-analyzer':
            csvContent += '# Network Analyzer Data\n';
            csvContent += `# Start Frequency: ${formatFrequency(AppState.networkAnalyzer.startFreq)}\n`;
            csvContent += `# Stop Frequency: ${formatFrequency(AppState.networkAnalyzer.stopFreq)}\n`;
            csvContent += `# Sweep Type: ${AppState.networkAnalyzer.sweepType}\n`;
            csvContent += `# Points: ${AppState.networkAnalyzer.points}\n`;
            csvContent += '#\n';
            csvContent += 'Index,Frequency(Hz),Magnitude(dB),Phase(deg)\n';

            const magData = AppState.networkAnalyzer.magnitudeData;
            const phaseData = AppState.networkAnalyzer.phaseData;
            const points = magData.length;
            const { startFreq, stopFreq, sweepType } = AppState.networkAnalyzer;

            for (let i = 0; i < points; i++) {
                let freq;
                if (sweepType === 'linear') {
                    freq = startFreq + (stopFreq - startFreq) * i / (points - 1);
                } else {
                    const logStart = Math.log10(startFreq);
                    const logStop = Math.log10(stopFreq);
                    freq = Math.pow(10, logStart + (logStop - logStart) * i / (points - 1));
                }
                csvContent += `${i},${freq.toFixed(2)},${magData[i].toFixed(2)},${phaseData[i].toFixed(2)}\n`;
            }
            break;

        default:
            csvContent += 'No data available for export\n';
    }

    // 创建并下载CSV文件
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `${instrument}_data_${Date.now()}.csv`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
}

function toggleFullscreen() {
    const displayArea = document.querySelector('.display-area');

    if (!document.fullscreenElement) {
        displayArea.requestFullscreen().catch(err => {
            console.error('无法进入全屏模式:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function startSimulation() {
    AppState.isRunning = true;
    generateWaveformData();

    setInterval(() => {
        if (AppState.isRunning) {
            generateWaveformData();
        }

        if (AppState.powerSupply.masterOn) {
            updatePowerDisplay();
        }
    }, 100);
}

// 设置功能
function openSettings() {
    // 创建设置弹窗
    const settingsModal = document.createElement('div');
    settingsModal.className = 'modal';
    settingsModal.id = 'settings-modal';
    settingsModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>系统设置</h2>
                <button class="close-btn" onclick="closeSettings()">×</button>
            </div>
            <div class="modal-body">
                <div class="config-section">
                    <h3>显示设置</h3>
                    <div class="form-group">
                        <label>网格透明度</label>
                        <input type="range" class="control-slider" id="grid-opacity" min="0" max="100" value="30">
                        <span class="value-display" id="grid-opacity-value">30%</span>
                    </div>
                    <div class="form-group">
                        <label>波形线宽</label>
                        <input type="range" class="control-slider" id="line-width" min="1" max="5" value="2">
                        <span class="value-display" id="line-width-value">2px</span>
                    </div>
                </div>

                <div class="config-section">
                    <h3>采样设置</h3>
                    <div class="form-group">
                        <label>默认采样率</label>
                        <select class="form-control" id="default-sample-rate">
                            <option value="6.25e6">6.25 MS/s</option>
                            <option value="12.5e6">12.5 MS/s</option>
                            <option value="25e6">25 MS/s</option>
                            <option value="45e6" selected>45 MS/s</option>
                            <option value="50e6">50 MS/s</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>内存深度</label>
                        <select class="form-control" id="default-memory-depth">
                            <option value="1024" selected>1024 samples</option>
                            <option value="2048">2048 samples</option>
                            <option value="4096">4096 samples</option>
                            <option value="8192">8192 samples</option>
                        </select>
                    </div>
                </div>

                <div class="config-section">
                    <h3>性能设置</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="enable-antialiasing" checked>
                            启用抗锯齿
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="enable-glow" checked>
                            启用波形发光效果
                        </label>
                    </div>
                </div>

                <div class="config-section">
                    <h3>关于</h3>
                    <p style="color: rgba(255,255,255,0.7); margin: 10px 0;">
                        <strong>ZooLark View</strong> - 多功能仪器平台<br>
                        版本: 2.0 Extended<br>
                        最后更新: 2025-01-16
                    </p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeSettings()">取消</button>
                <button class="btn btn-primary" onclick="saveSettings()">保存设置</button>
            </div>
        </div>
    `;

    document.body.appendChild(settingsModal);

    // 设置当前采样率为选中状态
    const sampleRateSelect = document.getElementById('default-sample-rate');
    if (sampleRateSelect) {
        sampleRateSelect.value = AppState.sampleRate.toString();
    }

    // 添加事件监听
    const gridOpacity = document.getElementById('grid-opacity');
    const gridOpacityValue = document.getElementById('grid-opacity-value');
    gridOpacity.addEventListener('input', (e) => {
        gridOpacityValue.textContent = e.target.value + '%';
    });

    const lineWidth = document.getElementById('line-width');
    const lineWidthValue = document.getElementById('line-width-value');
    lineWidth.addEventListener('input', (e) => {
        lineWidthValue.textContent = e.target.value + 'px';
    });

    // 点击背景关闭
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
}

function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.remove();
    }
}

function saveSettings() {
    // 读取采样率设置
    const sampleRateSelect = document.getElementById('default-sample-rate');
    if (sampleRateSelect) {
        const newSampleRate = parseFloat(sampleRateSelect.value);
        AppState.sampleRate = newSampleRate;
    }

    // 读取内存深度设置
    const memoryDepthSelect = document.getElementById('default-memory-depth');
    if (memoryDepthSelect) {
        const newMemoryDepth = parseInt(memoryDepthSelect.value);
        // 可以将内存深度保存到AppState中
    }

    // 更新状态栏显示
    updateStatusBar();

    // 可以保存设置到localStorage
    try {
        localStorage.setItem('sampleRate', AppState.sampleRate);
        alert('设置已保存');
    } catch (e) {
        alert('设置已应用');
    }

    closeSettings();
}

// 更新状态栏显示
function updateStatusBar() {
    // 更新采样率显示
    const sampleRateElement = document.querySelector('.status-bar .status-item:first-child .status-value');
    if (sampleRateElement) {
        const sampleRateMs = AppState.sampleRate / 1e6;
        sampleRateElement.textContent = `${sampleRateMs.toFixed(2)} MS/s`;
    }
}

// ============================================
// 自定义仪表板功能
// ============================================

// 仪表板状态管理
const DashboardState = {
    panels: [], // 存储所有面板
    nextId: 1,  // 下一个面板ID
    instruments: {
        'oscilloscope': {
            count: 0,
            max: 2,
            name: '示波器',
            icon: 'M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12',
            totalChannels: 0,  // 总通道数（单通道=1，双通道=2）
            maxChannels: 2     // 最多2个通道
        },
        'spectrum-analyzer': {
            count: 0,
            max: 2,
            name: '频谱分析仪',
            icon: 'M3 18h3v3H3zM7 14h3v7H7zM11 8h3v13h-3z',
            totalChannels: 0,  // 总通道数（单通道=1，双通道=2）
            maxChannels: 2     // 最多2个通道
        },
        'waveform-generator': { count: 0, max: 1, name: '信号发生器', icon: 'M3 12 Q6 6 9 12 T15 12' },
        'pwm-generator': { count: 0, max: 1, name: 'PWM发生器', icon: 'M3 12 L3 4 L9 4 L9 20 L15 20 L15 4' },
        'power-supply': { count: 0, max: 1, name: '电源', icon: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z' },
        'logic-analyzer': { count: 0, max: 999, name: '逻辑分析仪', icon: 'M3 6h4v12H3zM10 3h4v12h-4z', totalChannels: 0, maxChannels: 8 }
    },
    draggedPanel: null,
    dragOverPanel: null,
    currentInstrumentType: null  // 当前正在添加的仪器类型（用于模态框）
};

// 初始化自定义仪表板
function initializeCustomDashboard() {
    const addButtons = document.querySelectorAll('.add-instrument-btn');
    addButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;

            // 对于示波器和频谱仪，显示通道选择对话框
            if (type === 'oscilloscope' || type === 'spectrum-analyzer') {
                showChannelModeDialog(type);
            } else {
                // 其他仪器直接添加
                addInstrumentPanel(type, null);
            }
        });
    });

    document.getElementById('reset-dashboard-btn')?.addEventListener('click', resetDashboard);
    document.getElementById('save-dashboard-btn')?.addEventListener('click', saveDashboardConfig);

    // 初始化通道模式对话框
    initChannelModeDialog();

    // 显示空状态
    showEmptyState();

    // 从localStorage加载配置
    loadDashboardConfig();
}

// 初始化通道模式对话框
function initChannelModeDialog() {
    const modal = document.getElementById('channel-mode-modal');
    const closeBtn = document.getElementById('close-channel-modal');
    const dualBtn = document.getElementById('dual-channel-btn');
    const singleBtn = document.getElementById('single-channel-btn');

    // 关闭对话框
    closeBtn?.addEventListener('click', closeChannelModeDialog);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeChannelModeDialog();
        }
    });

    // 选择双通道
    dualBtn?.addEventListener('click', () => {
        if (!dualBtn.disabled && DashboardState.currentInstrumentType) {
            addInstrumentPanel(DashboardState.currentInstrumentType, 'dual');
            closeChannelModeDialog();
        }
    });

    // 选择单通道
    singleBtn?.addEventListener('click', () => {
        if (!singleBtn.disabled && DashboardState.currentInstrumentType) {
            addInstrumentPanel(DashboardState.currentInstrumentType, 'single');
            closeChannelModeDialog();
        }
    });
}

// 显示通道模式选择对话框
function showChannelModeDialog(instrumentType) {
    DashboardState.currentInstrumentType = instrumentType;
    const modal = document.getElementById('channel-mode-modal');
    const title = document.getElementById('modal-instrument-title');
    const dualBtn = document.getElementById('dual-channel-btn');
    const singleBtn = document.getElementById('single-channel-btn');
    const infoText = document.getElementById('modal-info-text');

    const instrument = DashboardState.instruments[instrumentType];
    const currentChannels = instrument.totalChannels;

    // 更新标题
    const instrumentName = instrumentType === 'oscilloscope' ? '示波器' : '频谱分析仪';
    title.textContent = `选择${instrumentName}模式`;

    // 更新提示信息
    infoText.textContent = `当前已使用 ${currentChannels}/2 个通道，请选择要添加的模式：`;

    // 根据已有通道数决定可用选项
    // 双通道需要2个通道
    const canAddDual = (currentChannels + 2) <= instrument.maxChannels;
    // 单通道需要1个通道
    const canAddSingle = (currentChannels + 1) <= instrument.maxChannels;

    dualBtn.disabled = !canAddDual;
    singleBtn.disabled = !canAddSingle;

    // 显示对话框
    modal?.classList.remove('hidden');
}

// 关闭通道模式选择对话框
function closeChannelModeDialog() {
    const modal = document.getElementById('channel-mode-modal');
    modal?.classList.add('hidden');
    DashboardState.currentInstrumentType = null;
}

// 检查是否可以添加仪器
function canAddInstrument(type, channelMode = null) {
    const instrument = DashboardState.instruments[type];

    // 逻辑分析仪、示波器、频谱仪使用通道数限制
    if (type === 'logic-analyzer' || type === 'oscilloscope' || type === 'spectrum-analyzer') {
        if (channelMode) {
            // 双通道需要2个通道，单通道需要1个通道
            const requiredChannels = channelMode === 'dual' ? 2 : 1;
            return (instrument.totalChannels + requiredChannels) <= instrument.maxChannels;
        }
        // 如果没有指定通道模式，检查是否还有剩余通道
        return instrument.totalChannels < instrument.maxChannels;
    }

    // 其他仪器使用实例数限制
    return instrument.count < instrument.max;
}

// 更新添加按钮状态
function updateAddButtonStates() {
    const buttons = document.querySelectorAll('.add-instrument-btn');
    buttons.forEach(btn => {
        const type = btn.dataset.type;
        const canAdd = canAddInstrument(type);
        btn.disabled = !canAdd;

        // 更新提示文本
        const instrument = DashboardState.instruments[type];
        if (type === 'logic-analyzer' || type === 'oscilloscope' || type === 'spectrum-analyzer') {
            btn.title = `${instrument.name} - 已用通道: ${instrument.totalChannels}/${instrument.maxChannels}`;
        } else {
            btn.title = `${instrument.name} - 已添加: ${instrument.count}/${instrument.max}`;
        }
    });
}

// 添加仪器面板
function addInstrumentPanel(type, channelMode = null) {
    if (!canAddInstrument(type, channelMode)) {
        const instrument = DashboardState.instruments[type];
        if (type === 'logic-analyzer' || type === 'oscilloscope' || type === 'spectrum-analyzer') {
            alert(`${instrument.name}通道数不能超过 ${instrument.maxChannels} 个`);
        } else {
            alert(`${instrument.name}最多只能添加 ${instrument.max} 个`);
        }
        return;
    }

    const panelId = DashboardState.nextId++;
    const instrument = DashboardState.instruments[type];

    // 创建面板对象
    const panel = {
        id: panelId,
        type: type,
        size: (type === 'oscilloscope' || type === 'spectrum-analyzer') ? 'large' : 'normal',
        channels: type === 'logic-analyzer' ? 4 : null, // 默认4通道
        channelMode: channelMode // 存储通道模式 (dual/single)
    };

    DashboardState.panels.push(panel);
    instrument.count++;

    // 更新通道数
    if (type === 'logic-analyzer') {
        instrument.totalChannels += panel.channels;
    } else if ((type === 'oscilloscope' || type === 'spectrum-analyzer') && channelMode) {
        // 双通道占用2个通道，单通道占用1个通道
        const channelsUsed = channelMode === 'dual' ? 2 : 1;
        instrument.totalChannels += channelsUsed;
    }

    // 渲染面板
    renderDashboard();
    updateAddButtonStates();
}

// 删除仪器面板
function removeInstrumentPanel(panelId) {
    const panelIndex = DashboardState.panels.findIndex(p => p.id === panelId);
    if (panelIndex === -1) return;

    const panel = DashboardState.panels[panelIndex];
    const instrument = DashboardState.instruments[panel.type];

    instrument.count--;

    // 更新通道数
    if (panel.type === 'logic-analyzer') {
        instrument.totalChannels -= panel.channels;
    } else if ((panel.type === 'oscilloscope' || panel.type === 'spectrum-analyzer') && panel.channelMode) {
        // 双通道释放2个通道，单通道释放1个通道
        const channelsUsed = panel.channelMode === 'dual' ? 2 : 1;
        instrument.totalChannels -= channelsUsed;
    }

    DashboardState.panels.splice(panelIndex, 1);

    renderDashboard();
    updateAddButtonStates();
}

// 切换面板大小
function togglePanelSize(panelId) {
    const panel = DashboardState.panels.find(p => p.id === panelId);
    if (!panel) return;

    // 只有示波器和频谱仪可以调整大小
    if (panel.type !== 'oscilloscope' && panel.type !== 'spectrum-analyzer') {
        return;
    }

    panel.size = panel.size === 'large' ? 'normal' : 'large';
    renderDashboard();
}

// 渲染仪表板
function renderDashboard() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    if (DashboardState.panels.length === 0) {
        showEmptyState();
        return;
    }

    grid.innerHTML = '';

    DashboardState.panels.forEach(panel => {
        const panelElement = createPanelElement(panel);
        grid.appendChild(panelElement);
    });
}

// 创建面板元素
function createPanelElement(panel) {
    const instrument = DashboardState.instruments[panel.type];
    const div = document.createElement('div');
    div.className = `instrument-panel ${panel.size === 'large' ? 'large' : ''}`;
    div.dataset.panelId = panel.id;
    div.draggable = true;

    // 添加拖拽事件
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);

    div.innerHTML = `
        <div class="panel-header">
            <div class="panel-title-section">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="${instrument.icon}" stroke-width="2"/>
                </svg>
                <h3>${instrument.name}<span class="panel-id">#${panel.id}</span></h3>
            </div>
            <div class="panel-actions">
                ${(panel.type === 'oscilloscope' || panel.type === 'spectrum-analyzer') ?
                    `<button class="panel-btn resize-panel-btn" title="调整大小">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-width="2"/>
                        </svg>
                    </button>` : ''}
                <button class="panel-btn close-btn" title="删除">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <line x1="18" y1="6" x2="6" y2="18" stroke-width="2"/>
                        <line x1="6" y1="6" x2="18" y2="18" stroke-width="2"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="panel-content">
            ${createPanelContent(panel)}
        </div>
    `;

    // 添加按钮事件
    const resizeBtn = div.querySelector('.resize-panel-btn');
    if (resizeBtn) {
        resizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanelSize(panel.id);
        });
    }

    const closeBtn = div.querySelector('.close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除这个${instrument.name}吗？`)) {
            removeInstrumentPanel(panel.id);
        }
    });

    // 添加双击事件 - 跳转到对应仪器页面
    div.addEventListener('dblclick', (e) => {
        // 如果双击的是按钮或控件，不触发跳转
        if (e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' ||
            e.target.closest('button') ||
            e.target.closest('.panel-actions')) {
            return;
        }

        // 跳转到对应的仪器页面
        const instrumentType = panel.type;

        // 更新导航按钮状态
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.instrument === instrumentType) {
                btn.classList.add('active');
            }
        });

        // 切换到对应仪器
        AppState.currentInstrument = instrumentType;
        switchInstrument(instrumentType);
    });

    // 添加鼠标悬停提示
    div.title = `双击打开${instrument.name}完整页面`;

    // 初始化canvas
    setTimeout(() => {
        const canvas = div.querySelector('.panel-canvas');
        if (canvas) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;

            // 根据类型初始化绘图
            initPanelCanvas(panel, canvas);
        }
    }, 100);

    return div;
}

// 创建面板内容
function createPanelContent(panel) {
    const canvasId = `panel-canvas-${panel.id}`;

    // 根据仪器类型创建不同的控制面板
    let controls = '';

    switch(panel.type) {
        case 'oscilloscope':
            if (panel.channelMode === 'dual') {
                // 双通道模式：显示两个通道的控制
                controls = `
                    <div class="control-group">
                        <label>通道 1 刻度</label>
                        <select class="control-select" data-control="ch1-scale" data-panel-id="${panel.id}">
                            <option value="1">1V/div</option>
                            <option value="2">2V/div</option>
                            <option value="5" selected>5V/div</option>
                            <option value="10">10V/div</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label>通道 2 刻度</label>
                        <select class="control-select" data-control="ch2-scale" data-panel-id="${panel.id}">
                            <option value="1">1V/div</option>
                            <option value="2" selected>2V/div</option>
                            <option value="5">5V/div</option>
                            <option value="10">10V/div</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label>频率 (Hz)</label>
                        <input type="number" class="control-input" value="1000" min="1" max="10000" data-control="frequency" data-panel-id="${panel.id}">
                    </div>
                `;
            } else {
                // 单通道模式：只显示一个通道的控制
                controls = `
                    <div class="control-group">
                        <label>通道刻度</label>
                        <select class="control-select" data-control="ch1-scale" data-panel-id="${panel.id}">
                            <option value="1">1V/div</option>
                            <option value="2">2V/div</option>
                            <option value="5" selected>5V/div</option>
                            <option value="10">10V/div</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label>频率 (Hz)</label>
                        <input type="number" class="control-input" value="1000" min="1" max="10000" data-control="frequency" data-panel-id="${panel.id}">
                    </div>
                `;
            }
            break;

        case 'spectrum-analyzer':
            if (panel.channelMode === 'dual') {
                // 双通道模式：显示通道标识和控制
                controls = `
                    <div class="control-group">
                        <label>频率范围 (kHz)</label>
                        <input type="number" class="control-input" value="100" min="10" max="25000" data-control="freq-range" data-panel-id="${panel.id}">
                    </div>
                    <div class="control-group">
                        <label>条数/通道</label>
                        <input type="number" class="control-input" value="50" min="20" max="100" data-control="bar-count" data-panel-id="${panel.id}">
                    </div>
                    <div class="control-group">
                        <label>平滑度</label>
                        <input type="range" class="control-slider" min="0" max="1" value="0.3" step="0.1" data-control="smoothness" data-panel-id="${panel.id}">
                        <span class="value-display">0.3</span>
                    </div>
                    <div class="control-group">
                        <span style="color: #ffc107;">■</span> CH1
                        <span style="color: #00d4ff; margin-left: 12px;">■</span> CH2
                    </div>
                `;
            } else {
                // 单通道模式
                controls = `
                    <div class="control-group">
                        <label>频率范围 (kHz)</label>
                        <input type="number" class="control-input" value="100" min="10" max="25000" data-control="freq-range" data-panel-id="${panel.id}">
                    </div>
                    <div class="control-group">
                        <label>条数</label>
                        <input type="number" class="control-input" value="50" min="20" max="100" data-control="bar-count" data-panel-id="${panel.id}">
                    </div>
                    <div class="control-group">
                        <label>平滑度</label>
                        <input type="range" class="control-slider" min="0" max="1" value="0.3" step="0.1" data-control="smoothness" data-panel-id="${panel.id}">
                        <span class="value-display">0.3</span>
                    </div>
                `;
            }
            break;

        case 'waveform-generator':
            controls = `
                <div class="control-group">
                    <label>波形类型</label>
                    <select class="control-select" data-control="wave-type" data-panel-id="${panel.id}">
                        <option value="sine">正弦波</option>
                        <option value="square">方波</option>
                        <option value="triangle">三角波</option>
                        <option value="sawtooth">锯齿波</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>频率 (Hz)</label>
                    <input type="number" class="control-input" value="1000" min="1" max="10000" data-control="gen-frequency" data-panel-id="${panel.id}">
                </div>
                <div class="control-group">
                    <label>幅度</label>
                    <input type="range" class="control-slider" min="0.1" max="1" value="0.8" step="0.1" data-control="amplitude" data-panel-id="${panel.id}">
                    <span class="value-display">0.8</span>
                </div>
            `;
            break;

        case 'pwm-generator':
            controls = `
                <div class="control-group">
                    <label>频率 (Hz)</label>
                    <input type="number" class="control-input" value="1000" min="1" max="10000" data-control="pwm-frequency" data-panel-id="${panel.id}">
                </div>
                <div class="control-group">
                    <label>占空比 (%)</label>
                    <input type="range" class="control-slider" min="1" max="99" value="50" step="1" data-control="duty" data-panel-id="${panel.id}">
                    <span class="value-display">50%</span>
                </div>
            `;
            break;

        case 'power-supply':
            controls = `
                <div class="control-group">
                    <label>电压 (V)</label>
                    <input type="range" class="control-slider" min="0" max="5" value="3.3" step="0.1" data-control="voltage" data-panel-id="${panel.id}">
                    <span class="value-display">3.3V</span>
                </div>
                <div class="control-group">
                    <label>波动 (%)</label>
                    <input type="range" class="control-slider" min="0" max="10" value="1" step="0.5" data-control="ripple" data-panel-id="${panel.id}">
                    <span class="value-display">1%</span>
                </div>
            `;
            break;

        case 'logic-analyzer':
            controls = `
                <div class="control-group">
                    <label>通道数</label>
                    <select class="control-select" data-control="channel-count" data-panel-id="${panel.id}">
                        <option value="2">2通道</option>
                        <option value="4" selected>4通道</option>
                        <option value="8">8通道</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>脉冲宽度</label>
                    <input type="range" class="control-slider" min="20" max="100" value="40" step="10" data-control="pulse-width" data-panel-id="${panel.id}">
                    <span class="value-display">40</span>
                </div>
            `;
            break;
    }

    return `
        <div class="panel-display">
            <canvas class="panel-canvas" id="${canvasId}"></canvas>
        </div>
        <div class="panel-controls">
            ${controls}
        </div>
    `;
}

// 初始化面板canvas绘图
function initPanelCanvas(panel, canvas) {
    const ctx = canvas.getContext('2d');

    // 初始化面板参数
    if (!panel.params) {
        panel.params = {
            // 示波器
            ch1Scale: 5,
            ch2Scale: 2,
            frequency: 1000,
            // 频谱仪
            freqRange: 100,
            barCount: 50,
            smoothness: 0.3,
            // 信号发生器
            waveType: 'sine',
            amplitude: 0.8,
            genFrequency: 1000,  // 信号发生器独立频率
            // PWM
            duty: 50,
            pwmFrequency: 1000,  // PWM发生器独立频率
            // 电源
            voltage: 3.3,
            ripple: 1,
            // 逻辑分析仪
            channelCount: 4,
            pulseWidth: 40
        };
    }

    // 绘制网格
    function drawGrid() {
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
        ctx.lineWidth = 1;

        const gridSize = 40;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    // 根据类型绘制示例波形
    function animate() {
        ctx.fillStyle = '#060a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawGrid();

        const centerY = canvas.height / 2;
        const time = Date.now() / 1000;

        ctx.strokeStyle = '#ffc107';
        ctx.lineWidth = 2;
        ctx.beginPath();

        switch(panel.type) {
            case 'oscilloscope':
                const freq1 = panel.params.frequency / 1000;

                if (panel.channelMode === 'dual') {
                    // 双通道模式：绘制两条不同颜色的曲线
                    // 绘制通道1 (黄色)
                    ctx.strokeStyle = '#ffc107';
                    ctx.beginPath();
                    const amp1 = panel.params.ch1Scale * 8;
                    for (let x = 0; x < canvas.width; x++) {
                        const t = x / canvas.width * Math.PI * 4 * freq1 + time;
                        const y = centerY + Math.sin(t) * amp1;
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();

                    // 绘制通道2 (青色)
                    ctx.strokeStyle = '#00d4ff';
                    ctx.beginPath();
                    const amp2 = panel.params.ch2Scale * 8;
                    for (let x = 0; x < canvas.width; x++) {
                        const t = x / canvas.width * Math.PI * 4 * freq1 + time + Math.PI/2;
                        const y = centerY + Math.sin(t) * amp2;
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                } else {
                    // 单通道模式：只绘制一条曲线
                    ctx.strokeStyle = '#ffc107';
                    ctx.beginPath();
                    const amp = panel.params.ch1Scale * 8;
                    for (let x = 0; x < canvas.width; x++) {
                        const t = x / canvas.width * Math.PI * 4 * freq1 + time;
                        const y = centerY + Math.sin(t) * amp;
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
                break;

            case 'spectrum-analyzer':
                const barCount = panel.params.barCount;
                const smoothness = panel.params.smoothness;

                if (panel.channelMode === 'dual') {
                    // 双通道模式：绘制两组不同颜色的频谱条（错开排列）
                    const barWidth = canvas.width / (barCount * 2);

                    for (let i = 0; i < barCount; i++) {
                        // 通道1 (黄色系)
                        const baseHeight1 = Math.random() * canvas.height * 0.5;
                        const wave1 = Math.sin(time + i * 0.5) * 30 * smoothness;
                        const height1 = baseHeight1 + wave1;
                        ctx.fillStyle = `hsl(${45 + i * (40/barCount)}, 80%, 50%)`;
                        ctx.fillRect(i * barWidth * 2, canvas.height - height1, barWidth - 1, height1);

                        // 通道2 (青色系)
                        const baseHeight2 = Math.random() * canvas.height * 0.5;
                        const wave2 = Math.sin(time + i * 0.5 + 1) * 30 * smoothness;
                        const height2 = baseHeight2 + wave2;
                        ctx.fillStyle = `hsl(${180 + i * (60/barCount)}, 80%, 50%)`;
                        ctx.fillRect(i * barWidth * 2 + barWidth, canvas.height - height2, barWidth - 1, height2);
                    }
                } else {
                    // 单通道模式：只绘制一组频谱条
                    const barWidth = canvas.width / barCount;

                    for (let i = 0; i < barCount; i++) {
                        const baseHeight = Math.random() * canvas.height * 0.6;
                        const wave = Math.sin(time + i * 0.5) * 30 * smoothness;
                        const height = baseHeight + wave;
                        ctx.fillStyle = `hsl(${180 + i * (300/barCount)}, 70%, 50%)`;
                        ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
                    }
                }
                break;

            case 'waveform-generator':
                // 绘制生成的波形（固定显示5个周期）
                const waveType = panel.params.waveType;
                const amplitude = panel.params.amplitude;
                // 频率参数仅用于显示，不影响画布上的周期数

                for (let x = 0; x < canvas.width; x++) {
                    // 固定显示5个周期：5个周期 = 10π
                    const t = x / canvas.width * Math.PI * 10 + time;
                    let y;

                    switch(waveType) {
                        case 'sine':
                            y = centerY + Math.sin(t) * 100 * amplitude;
                            break;
                        case 'square':
                            y = centerY + (Math.sin(t) > 0 ? 100 : -100) * amplitude;
                            break;
                        case 'triangle':
                            y = centerY + (2 * Math.asin(Math.sin(t)) / Math.PI) * 100 * amplitude;
                            break;
                        case 'sawtooth':
                            y = centerY + ((t % (2 * Math.PI)) / Math.PI - 1) * 100 * amplitude;
                            break;
                    }

                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                break;

            case 'pwm-generator':
                // 绘制PWM波形（固定显示5个周期）
                // 频率参数仅用于显示，不影响画布上的周期数
                const cycles = 5; // 固定显示5个周期
                const period = canvas.width / cycles;
                const duty = panel.params.duty / 100;

                for (let i = 0; i < cycles; i++) {
                    const x1 = i * period;
                    const x2 = x1 + period * duty;
                    const x3 = (i + 1) * period;

                    ctx.moveTo(x1, centerY + 60);
                    ctx.lineTo(x1, centerY - 60);
                    ctx.lineTo(x2, centerY - 60);
                    ctx.lineTo(x2, centerY + 60);
                    ctx.lineTo(x3, centerY + 60);
                }
                ctx.stroke();
                break;

            case 'power-supply':
                // 绘制电压趋势
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3;
                ctx.beginPath();
                const voltage = panel.params.voltage;
                const ripple = panel.params.ripple;
                const baseY = centerY - (voltage / 5) * centerY * 0.8;

                for (let x = 0; x < canvas.width; x++) {
                    const noise = (Math.random() - 0.5) * ripple * 2;
                    const y = baseY + noise;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                break;

            case 'logic-analyzer':
                // 绘制数字信号
                const channels = panel.params.channelCount;
                const channelHeight = canvas.height / (channels + 1);
                const pulseWidth = panel.params.pulseWidth;

                for (let ch = 0; ch < channels; ch++) {
                    ctx.strokeStyle = `hsl(${ch * 60}, 70%, 60%)`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();

                    const y1 = (ch + 1) * channelHeight - 30;
                    const y2 = (ch + 1) * channelHeight + 30;
                    let currentY = y2;

                    for (let x = 0; x < canvas.width; x += pulseWidth) {
                        ctx.lineTo(x, currentY);
                        currentY = currentY === y1 ? y2 : y1;
                        ctx.lineTo(x, currentY);
                    }
                    ctx.stroke();
                }
                break;
        }

        requestAnimationFrame(animate);
    }

    animate();

    // 添加控件事件监听器
    setupPanelControls(panel);
}

// 设置面板控件事件监听器
function setupPanelControls(panel) {
    setTimeout(() => {
        const panelElement = document.querySelector(`[data-panel-id="${panel.id}"]`);
        if (!panelElement) return;

        const controls = panelElement.parentElement.querySelectorAll('[data-control]');

        controls.forEach(control => {
            const controlType = control.dataset.control;

            // 滑块实时更新显示值
            if (control.type === 'range') {
                const updateDisplay = () => {
                    const valueDisplay = control.nextElementSibling;
                    if (valueDisplay && valueDisplay.classList.contains('value-display')) {
                        let displayValue = control.value;
                        if (controlType === 'duty') {
                            displayValue = control.value + '%';
                        } else if (controlType === 'voltage') {
                            displayValue = parseFloat(control.value).toFixed(1) + 'V';
                        } else if (controlType === 'ripple') {
                            displayValue = parseFloat(control.value).toFixed(1) + '%';
                        }
                        valueDisplay.textContent = displayValue;
                    }
                };

                control.addEventListener('input', updateDisplay);
            }

            // 所有控件更新参数
            control.addEventListener('change', () => {
                const value = control.type === 'range' || control.type === 'number' ?
                    parseFloat(control.value) : control.value;

                switch(controlType) {
                    case 'ch1-scale':
                        panel.params.ch1Scale = value;
                        break;
                    case 'ch2-scale':
                        panel.params.ch2Scale = value;
                        break;
                    case 'frequency':
                        panel.params.frequency = value;
                        break;
                    case 'gen-frequency':
                        panel.params.genFrequency = value;
                        break;
                    case 'pwm-frequency':
                        panel.params.pwmFrequency = value;
                        break;
                    case 'freq-range':
                        panel.params.freqRange = value;
                        break;
                    case 'bar-count':
                        panel.params.barCount = value;
                        break;
                    case 'smoothness':
                        panel.params.smoothness = value;
                        break;
                    case 'wave-type':
                        panel.params.waveType = value;
                        break;
                    case 'amplitude':
                        panel.params.amplitude = value;
                        break;
                    case 'duty':
                        panel.params.duty = value;
                        break;
                    case 'voltage':
                        panel.params.voltage = value;
                        break;
                    case 'ripple':
                        panel.params.ripple = value;
                        break;
                    case 'channel-count':
                        panel.params.channelCount = parseInt(value);
                        break;
                    case 'pulse-width':
                        panel.params.pulseWidth = value;
                        break;
                }
            });

            // input事件用于实时响应（滑块和数字输入）
            if (control.type === 'range' || control.type === 'number') {
                control.addEventListener('input', () => {
                    const value = parseFloat(control.value);

                    switch(controlType) {
                        case 'ch1-scale':
                            panel.params.ch1Scale = value;
                            break;
                        case 'ch2-scale':
                            panel.params.ch2Scale = value;
                            break;
                        case 'frequency':
                            panel.params.frequency = value;
                            break;
                        case 'gen-frequency':
                            panel.params.genFrequency = value;
                            break;
                        case 'pwm-frequency':
                            panel.params.pwmFrequency = value;
                            break;
                        case 'amplitude':
                            panel.params.amplitude = value;
                            break;
                        case 'duty':
                            panel.params.duty = value;
                            break;
                        case 'voltage':
                            panel.params.voltage = value;
                            break;
                        case 'ripple':
                            panel.params.ripple = value;
                            break;
                        case 'smoothness':
                            panel.params.smoothness = value;
                            break;
                        case 'pulse-width':
                            panel.params.pulseWidth = value;
                            break;
                        case 'bar-count':
                            panel.params.barCount = value;
                            break;
                    }
                });
            }
        });
    }, 150);
}

// 拖拽处理
function handleDragStart(e) {
    DashboardState.draggedPanel = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    if (this !== DashboardState.draggedPanel) {
        DashboardState.dragOverPanel = this;
    }

    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (DashboardState.draggedPanel && DashboardState.dragOverPanel) {
        const draggedId = parseInt(DashboardState.draggedPanel.dataset.panelId);
        const targetId = parseInt(DashboardState.dragOverPanel.dataset.panelId);

        const draggedIndex = DashboardState.panels.findIndex(p => p.id === draggedId);
        const targetIndex = DashboardState.panels.findIndex(p => p.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            // 交换位置
            [DashboardState.panels[draggedIndex], DashboardState.panels[targetIndex]] =
            [DashboardState.panels[targetIndex], DashboardState.panels[draggedIndex]];

            renderDashboard();
        }
    }

    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    DashboardState.draggedPanel = null;
    DashboardState.dragOverPanel = null;
}

// 显示空状态
function showEmptyState() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    grid.innerHTML = `
        <div class="dashboard-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="7" height="7" stroke-width="2"/>
                <rect x="14" y="3" width="7" height="7" stroke-width="2"/>
                <rect x="3" y="14" width="7" height="7" stroke-width="2"/>
                <rect x="14" y="14" width="7" height="7" stroke-width="2"/>
            </svg>
            <h3>欢迎使用自定义仪表板</h3>
            <p>点击上方按钮添加仪器，您可以在一个页面上组合多个仪器，自由调整布局和大小</p>
        </div>
    `;
}

// 重置仪表板
function resetDashboard() {
    if (!confirm('确定要清空所有仪器吗？此操作不可恢复。')) {
        return;
    }

    DashboardState.panels = [];
    DashboardState.nextId = 1;

    // 重置计数
    Object.keys(DashboardState.instruments).forEach(key => {
        DashboardState.instruments[key].count = 0;
        if (key === 'logic-analyzer') {
            DashboardState.instruments[key].totalChannels = 0;
        }
    });

    showEmptyState();
    updateAddButtonStates();
}

// 保存仪表板配置
function saveDashboardConfig() {
    try {
        const config = {
            panels: DashboardState.panels,
            nextId: DashboardState.nextId,
            instruments: DashboardState.instruments
        };

        localStorage.setItem('wfl_dashboard_config', JSON.stringify(config));
        alert('仪表板配置已保存');
    } catch (e) {
        console.error('保存配置失败:', e);
        alert('保存配置失败');
    }
}

// 加载仪表板配置
function loadDashboardConfig() {
    try {
        const saved = localStorage.getItem('wfl_dashboard_config');
        if (saved) {
            const config = JSON.parse(saved);
            DashboardState.panels = config.panels || [];
            DashboardState.nextId = config.nextId || 1;

            // 恢复计数
            if (config.instruments) {
                Object.keys(config.instruments).forEach(key => {
                    if (DashboardState.instruments[key]) {
                        DashboardState.instruments[key].count = config.instruments[key].count || 0;
                        if (key === 'logic-analyzer') {
                            DashboardState.instruments[key].totalChannels = config.instruments[key].totalChannels || 0;
                        }
                    }
                });
            }

            if (DashboardState.panels.length > 0) {
                renderDashboard();
            }

            updateAddButtonStates();
        }
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}

// 自定义仪表板初始化 + Next.js/普通HTML统一启动入口
function initializeWFLDashboardIfPresent() {
    if (document.getElementById('custom-dashboard-display')) {
        initializeCustomDashboard();
    }
}

function bootWFL() {
    if (window.__WFL_BOOTED__) return;
    window.__WFL_BOOTED__ = true;
    initializeWFLCore();
    initializeWFLDashboardIfPresent();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWFL, { once: true });
} else {
    bootWFL();
}
