# ADR: 外部设备访问策略

> VSCode Webview 沙箱对硬件设备访问的限制分析，以及 neko-engine 代理方案。

---

## 问题

Neko Suite 多个模块需要访问硬件设备（麦克风、摄像头、MIDI、手写板等），但 VSCode Webview 运行在沙箱化 iframe 中，大部分设备 API 受限或不可用。

## VSCode Webview 设备 API 支持现状

| API | Webview Desktop | Webview Web | 限制原因 |
|-----|----------------|-------------|---------|
| `getUserMedia`（麦克风/摄像头）| ⚠️ 不可靠 | ❌ | iframe 缺少 `allow="microphone; camera"` 属性 |
| `PointerEvent.pressure`（手写板压感）| ⚠️ 大概率可用 | ✅ | Electron 早期版本不传播 pressure，新版已修复 |
| `requestPointerLock`（指针锁定）| ❌ | ❌ | webview root document 不支持 pointer lock |
| `navigator.getGamepads`（手柄）| ❌ | ❌ | 需要 `Permissions-Policy: gamepad` |
| `navigator.hid`（WebHID）| ❌ | ❌ | 需要 Electron session 级配置 |
| `navigator.usb`（WebUSB）| ❌ | ❌ | 需要 Electron session 级配置 |
| `navigator.requestMIDIAccess`（MIDI）| ❓ 未验证 | ❌ | 可能受 Permissions-Policy 限制 |

**关键参考**：
- [VSCode #113916](https://github.com/microsoft/vscode/issues/113916) — getUserMedia 不弹权限请求
- [VSCode #116761](https://github.com/microsoft/vscode/issues/116761) — 请求暴露 WebUSB
- [VSCode #119127](https://github.com/microsoft/vscode/issues/119127) — Notebook 请求媒体设备访问
- [VSCode #221593](https://github.com/microsoft/vscode/issues/221593) — requestPointerLock 不工作

## 决策：neko-engine 代理设备访问

**核心思路**：neko-engine 是独立的 Rust sidecar 进程，拥有完整的 OS 级权限，不受 webview 沙箱约束。通过已有的 HTTP/WebSocket 通信通道代理设备 I/O。

```
硬件设备
  │ OS API（cpal / nokhwa / midir / gilrs）
  ▼
neko-engine (Rust sidecar, 完整 OS 权限)
  │ axum HTTP/WebSocket（复用已有端口和协议）
  ▼
Extension Host (EngineClient HTTP dispatch)
  │ postMessage / WebSocket URL
  ▼
Webview (React) — 仅 UI 渲染
```

### 为什么选择 Engine 代理

| 维度 | Webview getUserMedia | 外部浏览器页 | Engine 代理 |
|------|---------------------|-------------|-------------|
| 可靠性 | ⚠️ 平台相关 | ✅ | ✅ |
| 用户体验 | ✅ 无跳转 | ❌ 弹出浏览器 | ✅ 无跳转 |
| 延迟 | <5ms | >100ms | <10ms |
| 格式灵活性 | 受限（WebM/WAV）| 受限 | ✅ 任意格式 |
| 复用已有基础设施 | 无 | 无 | ✅ WebSocket 流 + 编解码 |
| VSCode Web 支持 | ❌ | ✅ | ❌（需本地 engine）|

**与架构原则一致**：「Rust 引擎是计算和数据的唯一权威来源」——设备 I/O 也应归引擎管理。

### 不需要代理的情况

- **手写板压感**：`PointerEvent.pressure` 是标准 DOM 事件，webview 内直接可用，不需要绕道 engine
- **键盘/鼠标**：标准 DOM 事件，完全可用

---

## 各设备实现方案

### 1. 麦克风录制（P1，替代不可靠的 webview getUserMedia）

**Rust crate**：[`cpal`](https://crates.io/crates/cpal)（跨平台音频 I/O）

**数据流**：
```
cpal::Stream::build_input_stream()
  → PCM f32le chunks
  → WebSocket /v1/streams/{id}（复用已有音频流协议）
  → Webview AudioStreamClient 做电平表/波形预览

录制完成 → engine 端直接写入文件（无需 base64 传输）
         → FFmpeg 转码为任意格式
```

**新增 Engine Action**（~300 行 Rust）：
```
audios:list_input_devices → Vec<{ id, name, sample_rate, channels }>
audios:record_start { device_id, sample_rate, output_path } → { stream_id }
audios:record_stop { stream_id } → { path, duration, size }
```

**对 neko-audio 的影响**：RecordingPanel 改为 `editor:engineRecord` 消息 → Extension 调用 EngineClient。

### 2. 摄像头捕获（P2，neko-live Phase 5 前置）

**Rust crate**：[`nokhwa`](https://crates.io/crates/nokhwa) 或 FFmpeg avdevice

**数据流**：
```
V4L2 / AVFoundation / DSHOW 捕获
  → H.264 编码（复用已有 GPU 编码管线）
  → WebSocket /v1/streams/{id}
  → Webview H264StreamClient 显示（零新增前端代码）
  → MediaPipe WASM 推理（面部/姿态检测）
```

**新增 Engine Action**（~500 行 Rust）：
```
cameras:list_devices → Vec<{ id, name, resolution, fps }>
cameras:capture_start { device_id, resolution, fps } → { stream_id }
cameras:capture_stop { stream_id }
```

### 3. MIDI 输入（P3，neko-audio 增强）

**Rust crate**：[`midir`](https://crates.io/crates/midir)（跨平台 MIDI I/O）

**数据流**：
```
MIDI IN → Note/CC/PitchBend 事件
  → WebSocket JSON 事件流 /v1/midi/{port_id}
  → Webview 钢琴卷帘 / 参数映射
```

**新增 Engine Action**（~150 行 Rust）：
```
midi:list_ports → Vec<{ id, name, type }>
midi:connect { port_id } → { stream_url }
midi:disconnect { port_id }
```

### 4. Gamepad（P3，neko-model 3D 操控）

**Rust crate**：[`gilrs`](https://crates.io/crates/gilrs)（跨平台 gamepad）

**数据流**：
```
gilrs 事件循环 → 轴/按钮状态
  → WebSocket JSON 事件流 /v1/gamepad/{id}
  → Webview 3D 视口操控
```

---

## 手写板压感（Webview 内直接可用）

手写板压感通过标准 `PointerEvent` API 在 webview 内可用，不需要 engine 代理：

```typescript
canvas.addEventListener('pointerdown', (e) => {
  console.log(e.pointerType); // 'pen' | 'touch' | 'mouse'
  console.log(e.pressure);    // 0.0 - 1.0
  console.log(e.tiltX);       // -90 to 90
  console.log(e.tiltY);       // -90 to 90
});
```

**已知问题**：
- Windows Ink 与 Wacom 驱动冲突（需用户在 Wacom 设置中关闭 Windows Ink）
- `requestPointerLock()` 在 webview 中不工作（影响画布工具的指针捕获）

---

## 性能与延迟分析

Engine 代理引入了额外的 IPC 环节（Rust → WebSocket → Webview），需要评估各场景的端到端延迟。

### 延迟链路总览

| 场景 | Engine 代理延迟 | Webview 直连延迟 | 差异 | 是否可接受 |
|------|----------------|-----------------|------|-----------|
| 麦克风录制保存 | 更快（engine 直接写文件） | 慢（base64 → postMessage → fs） | ✅ Engine 优 | ✅ |
| 麦克风实时监听 | ⚠️ +500ms（AudioStreamClient prebuffer）| ~5ms | ❌ 需专用方案 | 需优化 |
| 摄像头预览 | ~30-55ms | ~30-50ms（不可用） | ≈ 持平 | ✅ |
| MIDI 事件 | ~3-5ms | N/A（不可用） | — | ✅ |
| Gamepad 事件 | ~3-5ms | N/A（不可用） | — | ✅ |

### 麦克风：延迟分解

```
Engine cpal 代理链路：
OS 音频驱动 → cpal callback (~2-5ms)
  → PCM f32le 打包 + WebSocket 传输 (~2-5ms)
  → AudioStreamClient prebuffer (500ms 首次 / 150ms 后续)  ← ⚠️ 瓶颈
  → Web Audio API 播放

Webview getUserMedia 链路（对比）：
OS 音频驱动 → Chromium AudioInput (~2-3ms)
  → MediaRecorder 录制 / AnalyserNode 监听 (~0ms，同进程)
```

**关键问题**：`AudioStreamClient.PREBUFFER_DURATION = 500ms`（[AudioStreamClient.ts:103](../../packages/neko-client/src/AudioStreamClient.ts#L103)）是为播放场景设计的。录制监听不应有此延迟。

**解决方案：电平值推送（推荐）**

录制实时监听只需要**电平值**，不需要回放完整 PCM 流。Engine 端在 `cpal` 采集回调中直接计算 RMS/Peak，通过独立 WebSocket 以 ~60fps 推送 JSON：

```
Engine cpal callback → 计算 RMS/Peak (~0.1ms)
  → WebSocket JSON { rms: 0.72, peak: 0.85 } (~2ms)
  → Webview 渲染电平表

端到端: <5ms，零 prebuffer
```

```
新增 Engine 端点：
WebSocket /v1/monitor/{stream_id}
  → 推送 { rms: number, peak: number, clipping: boolean }
  → 频率: 60fps（~16ms 间隔）
```

录制的 PCM 数据直接在 Engine 端写入文件，不经过 WebSocket/Webview 传输。

### 摄像头：延迟分解

```
Engine 代理链路（逐环节）：
OS 驱动 → 帧到达         10-30ms  (硬件固有，不可优化)
FFmpeg avdevice 采集       ~5ms
H.264 硬件编码            8-11ms   (VideoToolbox/NVENC/VAAPI)
WebSocket 本地回环传输     ~2ms
WebCodecs VideoDecoder    3-5ms    (GPU 加速)
────────────────────────────────
总计                      28-53ms
```

对比 getUserMedia 直连（如果可用）的 30-50ms，**延迟基本持平**。

**高帧率优化**：30fps 帧间隔 = 33ms，H.264 编码 8-11ms 占 1/3。对于 neko-live 60fps 动捕场景（16.7ms 间隔），编码将成为瓶颈。

| 策略 | 适用场景 | 编码延迟 | 总延迟 |
|------|---------|---------|--------|
| H.264 硬件编码 | 录制/推流 | 8-11ms | ~35-55ms |
| MJPEG（跳过编解码）| 仅预览 | ~2ms | ~20-35ms |
| Raw RGBA over WS | 低分辨率预览 | 0ms | ~15-25ms |

推荐：预览用 MJPEG，录制用 H.264，两路并行。

### MIDI / Gamepad：延迟分解

```
midir callback (<1ms) → JSON 序列化 (~0.1ms) → WebSocket (~2ms)
总计: ~3-5ms
```

专业 MIDI 控制器 USB 轮询延迟 ~1ms，加上传输总计 <6ms，远低于人类感知阈值（~10ms for touch, ~20ms for audio）。**无性能风险**。

### 多路并发

多路流同时运行时（音频流 + 视频流 + MIDI 事件流）：
- 每路流使用独立 WebSocket 连接（已有设计：`/v1/streams/{id}`）
- axum tokio 异步运行时天然支持多路并发
- 本地回环 WebSocket 吞吐远大于所需带宽（1080p@30fps H.264 ~4-8Mbps + PCM ~1.5Mbps + MIDI ~10Kbps）
- **无共享瓶颈**

### 设计约束总结

| 约束 | 影响 | 应对措施 |
|------|------|---------|
| AudioStreamClient prebuffer 500ms | 录制监听延迟不可接受 | 新增 `/v1/monitor/{id}` 电平值推送端点 |
| H.264 编码 8-11ms | 60fps 摄像头预览帧率受限 | 预览用 MJPEG，录制用 H.264 |
| WebSocket 本地回环 ~2ms | 对比同进程多 2ms | 可接受，远低于感知阈值 |
| cpal callback 线程 | 不能阻塞音频线程 | 使用 ring buffer + tokio spawn 异步写入 |

---

## 实现状态

| 设备 | 状态 | Rust crate | 关键文件 |
|------|------|-----------|---------|
| **麦克风** | ✅ 完整 | `cpal` + `hound` | `engine-kernel/src/audio/mic_capture.rs` + `host-http/src/routes/monitor.rs` |
| **摄像头** | ⚠️ 框架 | FFmpeg avdevice | `engine-kernel/src/services/impls/camera.rs`（capture TODO） |
| **MIDI** | ✅ 完整 | `midir` | `engine-kernel/src/services/impls/midi.rs` |
| **Gamepad** | ✅ 完整 | `gilrs` | `engine-kernel/src/services/impls/gamepad.rs` |
| **手写板** | ✅ 无需代理 | — | webview `PointerEvent.pressure` |

**TS 层**：`EngineClient` 新增 15 个方法（5 录制 + 3 camera + 3 MIDI + 3 gamepad + 1 monitor），类型定义在 `@neko/neko-client/engine/types.ts`。

**待完成**：
- 摄像头 capture 实现（FFmpeg avdevice → H.264 → WebSocket，属 neko-live Phase 5 前置）

---

## 受影响模块

| 模块 | 设备需求 | 方案 | 状态 |
|------|---------|------|------|
| **neko-audio** | 麦克风录制 | Engine `cpal` 代理 + `/v1/monitor` 电平 | ✅ 完整 |
| **neko-sketch** | 手写板压感 | Webview `PointerEvent.pressure` 直接使用 | ✅ 可用 |
| **neko-live** | 摄像头 | Engine FFmpeg/avdevice → H264StreamClient | ⚠️ 框架 |
| **neko-audio** | MIDI 控制器 | Engine `midir` → broadcast → `/v1/midi/{id}` WS | ✅ 完整 |
| **neko-model** | Gamepad/VR 手柄 | Engine `gilrs` → broadcast → `/v1/gamepad/{id}` WS | ✅ 完整 |
