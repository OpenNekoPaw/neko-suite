# VSCode 扩展约束：面板放置 + 设备访问

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md)
>
> **合并自**：`panel-placement.md` · `device-access.md`
>
> 状态：已决策（panel-placement 2026-03-16，device-access 硬件代理方案已实施）

---

## 一、面板放置策略

### 核心原则：按编辑器绑定性分类

```
面板是否绑定特定编辑器实例？
├─ YES → 内嵌 Webview（同一 React 树，直接读 Zustand store）
└─ NO  → VSCode 原生容器（Activity Bar / Panel / Explorer TreeView）
```

### 具体分配

| 面板 | 方案 | 理由 |
|------|------|------|
| neko-cut 属性面板 | **内嵌 Webview** | 绑定选中元素，编辑器实例级状态 |
| neko-sketch 滤镜面板 | **内嵌 Webview** | GPU 实时反馈 + 共享 WebGL 上下文 |
| neko-canvas 属性面板 | **内嵌 Webview** | 与 neko-cut 同理 |
| neko-model 属性面板 | **内嵌 Webview** | 与 neko-cut 同理 |
| Outline 目录树 | **Explorer TreeView** | 轻量数据，VSCode 原生 TreeView 最合适 |
| neko-agent AI 助手 | **Panel 底栏** | 全局功能，跨编辑器共享 |
| neko-assets 资产库 | **Activity Bar 侧栏** | 全局功能，跨编辑器拖拽 |
| neko-live 直播预览 | **Panel 底栏** | 全局功能，独立于文件编辑 |

### 侧边栏方案的冲突清单

将编辑器绑定面板（如属性面板）放在 VSCode 侧边栏会引入以下问题：

| 冲突 | 严重性 | 说明 |
|------|--------|------|
| 幽灵数据 | P0 | 切换 tab 后侧栏显示旧编辑器的数据，用户误编辑 |
| 多同类文件闪烁 | P1 | 同时打开 A.nkv + B.nkv，面板状态依赖最后一次事件 |
| Activity Bar 膨胀 | P1 | 多个扩展各注册一个属性容器，图标堆积 |
| IPC 消息丢失 | P2 | Webview 未 ready 时 postMessage 静默丢失 |
| 状态双写 | P2 | Extension Host + React 各维护一份状态 |

内嵌 Webview 方案：每个编辑器 tab 是独立 Webview 实例，面板状态天然隔离，**无冲突**。

### GPU 耦合场景（neko-sketch）

```
FilterPanel 参数变更
  → Zustand store 更新
  → SketchCanvas requestAnimationFrame
  → FilterPipeline.applyFilters()   ← WebGL2 ping-pong FBO
  → GPU 输出到屏幕（16ms 内）
```

拆到侧边栏需跨进程 postMessage 往返（+30-50ms），拖拽滑块体验不可接受。

### 当前视图注册全景

**Activity Bar**

| Container ID | 所属扩展 | 内含视图 | when 条件 |
|---|---|---|---|
| `neko-asset-manager` | neko-assets | 4 个 TreeView | 无（全局） |
| `neko-properties` | neko-cut | `neko.propertyPanel` | ⚠️ 无（应迁移为内嵌） |

**Panel（底部面板）**

| Container ID | 所属扩展 | 内含视图 | when 条件 |
|---|---|---|---|
| `neko-assistant` | neko-agent | `neko.aiAssistant` | 无（全局，正确） |
| `neko-live` | neko-live | `neko.livePreview` | 无（全局，正确） |

**Explorer**

| View ID | 所属扩展 | when 条件 |
|---|---|---|
| `neko.projectOutline` | neko-cut | `activeCustomEditorId == 'neko.videoEditor'` |
| `neko.canvasOutline` | neko-canvas | `activeCustomEditorId == 'neko.canvasEditor'` |
| `neko.sketchLayerOutline` | neko-sketch | `activeCustomEditorId == 'neko.sketchEditor'` |

**Custom Editors**

| ViewType | 扩展 | 文件类型 | Priority |
|---|---|---|---|
| `neko.videoEditor` | neko-cut | `*.nkv` | default |
| `neko.canvasEditor` | neko-canvas | `*.nkc` | default |
| `neko.sketchEditor` | neko-sketch | `*.nks` | default |
| `neko.modelEditor` | neko-model | `*.gltf/*.glb/*.vrm` | default |
| `neko.videoPreview` | neko-preview | 视频文件 | default |
| `neko.audioPreview` | neko-preview | 音频文件 | default |
| `neko.mediaDiff` | neko-tools | 多媒体文件 | option |
| `neko.assetVariantDiff` | neko-tools | `*.asset-diff` | default |

### 迁移计划

**neko-cut PropertyPanel 侧边栏 → 内嵌**：

1. 将 `PropertyPanel.tsx` 集成到主编辑器 Webview 的 React 树中
2. 用 Zustand store 替代 postMessage IPC
3. 删除 `PropertyPanelViewProvider.ts`、`PropertyPanelStandalone.tsx`、`propertyPanel.html`
4. 从 `package.json` 移除 `neko-properties` viewsContainer
5. 从 Vite 配置移除 `propertyPanel` 入口，从 `extension.ts` 移除 EventEmitter 桥接代码

neko-canvas、neko-model 如需属性面板，直接采用内嵌方案。

---

## 二、外部设备访问策略

### Webview 设备 API 支持现状

| API | Webview Desktop | Webview Web | 限制原因 |
|-----|----------------|-------------|---------|
| `getUserMedia`（麦克风/摄像头）| ⚠️ 不可靠 | ❌ | iframe 缺少 `allow="microphone; camera"` 属性 |
| `PointerEvent.pressure`（手写板压感）| ⚠️ 大概率可用 | ✅ | Electron 早期版本不传播 pressure，新版已修复 |
| `requestPointerLock`（指针锁定）| ❌ | ❌ | webview root document 不支持 pointer lock |
| `navigator.getGamepads`（手柄）| ❌ | ❌ | 需要 `Permissions-Policy: gamepad` |
| `navigator.hid`（WebHID）| ❌ | ❌ | 需要 Electron session 级配置 |
| `navigator.requestMIDIAccess`（MIDI）| ❓ | ❌ | 可能受 Permissions-Policy 限制 |

### 决策：neko-engine 代理设备访问

neko-engine 是独立的 Rust sidecar 进程，拥有完整的 OS 级权限，不受 webview 沙箱约束。

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

与架构原则一致：「Rust 引擎是计算和数据的唯一权威来源」——设备 I/O 也应归引擎管理。

**不需要代理的情况**：
- **手写板压感**：`PointerEvent.pressure` 是标准 DOM 事件，webview 内直接可用
- **键盘/鼠标**：标准 DOM 事件，完全可用

### 各设备实现方案

**1. 麦克风录制（P1）**

Rust crate：[`cpal`](https://crates.io/crates/cpal)

```
cpal::Stream::build_input_stream() → PCM f32le chunks
  → WebSocket /v1/streams/{id}（复用已有音频流协议）
  → Webview AudioStreamClient 做电平表/波形预览
录制完成 → engine 端直接写入文件 → FFmpeg 转码
```

Engine Actions：`audios:list_input_devices` / `audios:record_start { device_id, sample_rate, output_path } → { stream_id }` / `audios:record_stop { stream_id } → { path, duration, size }`

**2. 摄像头捕获（P2，neko-live Phase 5 前置）**

Rust crate：[`nokhwa`](https://crates.io/crates/nokhwa) 或 FFmpeg avdevice

```
V4L2 / AVFoundation / DSHOW → H.264 编码（复用已有 GPU 编码管线）
  → WebSocket /v1/streams/{id}
  → Webview H264StreamClient（零新增前端代码）
```

Engine Actions：`cameras:list_devices` / `cameras:capture_start { device_id, resolution, fps } → { stream_id }` / `cameras:capture_stop { stream_id }`

**3. MIDI 输入（P3）**

Rust crate：[`midir`](https://crates.io/crates/midir)

```
MIDI IN → Note/CC/PitchBend 事件 → WebSocket JSON 事件流 /v1/midi/{port_id}
```

Engine Actions：`midi:list_ports` / `midi:connect { port_id } → { stream_url }` / `midi:disconnect { port_id }`

**4. Gamepad（P3，neko-model 3D 操控）**

Rust crate：[`gilrs`](https://crates.io/crates/gilrs)

```
gilrs 事件循环 → 轴/按钮状态 → WebSocket JSON 事件流 /v1/gamepad/{id}
```

### 手写板压感（Webview 内直接可用）

```typescript
canvas.addEventListener('pointerdown', (e) => {
  console.log(e.pointerType); // 'pen' | 'touch' | 'mouse'
  console.log(e.pressure);    // 0.0 - 1.0
  console.log(e.tiltX);       // -90 to 90
});
```

已知问题：Windows Ink 与 Wacom 驱动冲突（需用户在 Wacom 设置中关闭 Windows Ink）；`requestPointerLock()` 在 webview 中不工作。

### 性能与延迟分析

| 场景 | 延迟 | 备注 |
|------|------|------|
| 麦克风录制保存 | 更快（engine 直接写文件） | 优于 base64→postMessage→fs |
| 麦克风实时监听 | ⚠️ +500ms（AudioStreamClient prebuffer） | 需专用方案 |
| 摄像头预览 | ~30-55ms | 与 getUserMedia 直连基本持平 |
| MIDI 事件 | ~3-5ms | 远低于人类感知阈值 |
| Gamepad 事件 | ~3-5ms | 远低于人类感知阈值 |

**麦克风监听优化（电平值推送）**：录制实时监听只需电平值，不需要回放完整 PCM。Engine 端在 `cpal` 采集回调中计算 RMS/Peak，通过独立 WebSocket 以 ~60fps 推送 JSON：

```
Engine cpal callback → 计算 RMS/Peak (~0.1ms)
  → WebSocket /v1/monitor/{stream_id} JSON { rms, peak, clipping } (~2ms)
  → Webview 渲染电平表
端到端: <5ms，零 prebuffer
```

**摄像头预览策略**：预览用 MJPEG（编码 ~2ms，总延迟 ~20-35ms），录制用 H.264（编码 8-11ms，总延迟 ~35-55ms），两路并行。

**多路并发**：每路流使用独立 WebSocket 连接，axum tokio 异步运行时天然支持；本地回环 WebSocket 吞吐远大于所需带宽（1080p@30fps H.264 ~4-8Mbps + PCM ~1.5Mbps + MIDI ~10Kbps）。

### 实现状态

| 设备 | 状态 | Rust crate | 关键文件 |
|------|------|-----------|---------|
| **麦克风** | ✅ 完整 | `cpal` + `hound` | `engine-kernel/src/audio/mic_capture.rs` + `host-http/src/routes/monitor.rs` |
| **摄像头** | ⚠️ 框架 | FFmpeg avdevice | `engine-kernel/src/services/impls/camera.rs`（capture TODO） |
| **MIDI** | ✅ 完整 | `midir` | `engine-kernel/src/services/impls/midi.rs` |
| **Gamepad** | ✅ 完整 | `gilrs` | `engine-kernel/src/services/impls/gamepad.rs` |
| **手写板** | ✅ 无需代理 | — | webview `PointerEvent.pressure` |

TS 层：`EngineClient` 新增 15 个方法（5 录制 + 3 camera + 3 MIDI + 3 gamepad + 1 monitor），类型定义在 `@neko/neko-client/engine/types.ts`。

### 受影响模块

| 模块 | 设备需求 | 方案 | 状态 |
|------|---------|------|------|
| **neko-audio** | 麦克风录制 | Engine `cpal` 代理 + `/v1/monitor` 电平 | ✅ 完整 |
| **neko-sketch** | 手写板压感 | Webview `PointerEvent.pressure` 直接使用 | ✅ 可用 |
| **neko-live** | 摄像头 | Engine FFmpeg/avdevice → H264StreamClient | ⚠️ 框架 |
| **neko-audio** | MIDI 控制器 | Engine `midir` → `/v1/midi/{id}` WS | ✅ 完整 |
| **neko-model** | Gamepad/VR 手柄 | Engine `gilrs` → `/v1/gamepad/{id}` WS | ✅ 完整 |
